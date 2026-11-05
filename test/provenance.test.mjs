import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProvenance, attachProvenance } from '../src/provenance.ts';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

const input = (source) => ({ rootPath: '/skills', skillPath: '/skills/example/SKILL.md', name: 'example', installSource: { owner: 'org', name: 'repo', ref: 'main', subdirectory: '', path: 'skills/example', id: 'x', commit: null, ...source } });

test('install identity keeps actual host and never invents a GitHub link', async () => {
  const a = await resolveProvenance(input({ url: 'https://gitlab.com/org/repo.git' }), null);
  const b = await resolveProvenance(input({ url: 'https://github.com/org/repo' }), null);
  assert.equal(a.url, 'https://gitlab.com/org/repo');
  assert.notEqual(a.identity, b.identity);
});

test('unproven suffix is not a source', async () => {
  const result = await resolveProvenance({ rootPath: '/skills', skillPath: '/skills/example__hub/SKILL.md', name: 'example__hub' }, null);
  assert.equal(result.kind, 'root');
  assert.equal(result.identity, null);
  assert.equal(result.url, null);
});

test('subscription path is removed in full before deriving category', async () => {
  const result = await resolveProvenance(input({ subdirectory: 'skills/engineering', path: 'skills/engineering/code-review' }), null);
  assert.equal(result.category, null);
});

test('invalid install source falls through to valid lock', async () => {
  const result = await resolveProvenance(input({ owner: '', name: '', url: undefined }), { entries: { example: { source: 'org/good', sourceType: 'github', skillPath: 'skills/example' } } });
  assert.equal(result.kind, 'lock');
  assert.equal(result.url, 'https://github.com/org/good');
});

test('local repository identity is retained without a link', async () => {
  const result = await resolveProvenance(input({ url: 'C:/repo/org/repo' }), null);
  assert.equal(result.kind, 'install');
  assert.equal(result.identity, 'C:/repo/org/repo');
  assert.equal(result.url, null);
});

test('HTTP repository keeps identity but is not linked', async () => {
  const result = await resolveProvenance(input({ url: 'http://git.local/org/repo.git' }), null);
  assert.equal(result.identity, 'http://git.local/org/repo');
  assert.equal(result.url, null);
});

test('untyped shorthand lock is not assumed to be GitHub', async () => {
  const result = await resolveProvenance({rootPath: '/skills', skillPath: '/skills/example/SKILL.md', name: 'example'}, {entries: {example: {source: 'org/repo'}}});
  assert.notEqual(result.url, 'https://github.com/org/repo');
});

test('non-GitHub lock sources do not become GitHub links', async () => {
  const result = await resolveProvenance({rootPath: '/skills', skillPath: '/skills/example/SKILL.md', name: 'example'}, {entries: {example: {sourceType: 'gitlab', source: 'org/repo'}}});
  assert.notEqual(result.url, 'https://github.com/org/repo');
});

test('bad lock or oversized metadata degrades while another skill resolves', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'provenance-test-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  await mkdir(join(root, 'bad')); await mkdir(join(root, 'good'));
  await writeFile(join(root, '.skills-lock.json'), '{broken');
  await writeFile(join(root, 'bad', '_meta.json'), 'x'.repeat(1048577));
  await writeFile(join(root, 'good', '_meta.json'), JSON.stringify({source:'https://gitlab.com/a/b'}));
  const snapshot = { roots: [{path:root, skills:['bad','good'].map(name => ({name, path:join(root,name,'SKILL.md')}))}] };
  await attachProvenance(snapshot);
  assert.equal(snapshot.roots[0].skills[0].provenance.kind, 'root');
  assert.equal(snapshot.roots[0].skills[1].provenance.url, 'https://gitlab.com/a/b');
});

test('warm refresh reuses unchanged parsed provenance files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'provenance-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'one'));
  await writeFile(join(root, '.skills-lock.json'), '{}');
  await writeFile(join(root, 'one', '_meta.json'), JSON.stringify({source: 'https://example.com/a/b'}));
  const snapshot = { roots: [{ path: root, skills: [{name: 'one', path: join(root, 'one', 'SKILL.md')}] }] };
  const original = fs.open;
  let opens = 0;
  fs.open = async (...args) => { opens++; return original(...args); };
  syncBuiltinESMExports();
  t.after(() => { fs.open = original; syncBuiltinESMExports(); });
  await attachProvenance(snapshot);
  assert.equal(snapshot.roots[0].skills[0].provenance.kind, 'meta');
  const cold = opens;
  assert.ok(cold > 0);
  await attachProvenance(snapshot);
  assert.equal(opens, cold, 'unchanged files should not be reopened');
});

test('refresh invalidates changed, deleted, and newly created lock and metadata', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'provenance-invalidate-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'one'));
  const meta = join(root, 'one', '_meta.json');
  const lock = join(root, '.skills-lock.json');
  const snapshot = {roots: [{path: root, skills: [{name: 'one', path: join(root, 'one', 'SKILL.md')}]}]};
  const refresh = async () => { await attachProvenance(snapshot); return snapshot.roots[0].skills[0].provenance; };
  assert.equal((await refresh()).kind, 'root');
  await writeFile(meta, JSON.stringify({source:'https://example.com/a/b'}));
  assert.equal((await refresh()).url, 'https://example.com/a/b');
  await writeFile(meta, JSON.stringify({source:'https://example.com/longer/repo'}));
  assert.equal((await refresh()).url, 'https://example.com/longer/repo');
  await writeFile(lock, JSON.stringify({one:{sourceType:'github', source:'org/locked'}}));
  assert.equal((await refresh()).url, 'https://github.com/org/locked');
  await writeFile(lock, JSON.stringify({one:{sourceType:'github', source:'org/changed-lock'}}));
  assert.equal((await refresh()).url, 'https://github.com/org/changed-lock');
  await rm(lock);
  assert.equal((await refresh()).url, 'https://example.com/longer/repo');
  await rm(meta);
  assert.equal((await refresh()).kind, 'root');
});

test('JSON size limit accepts one MiB and rejects larger files even after caching', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'provenance-size-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const sub = join(root, 'one');
  await mkdir(sub);
  const meta = join(sub, '_meta.json');
  const input = {rootPath: root, skillPath: join(sub, 'SKILL.md'), name:'one'};
  const prefix = '{"source":"https://example.com/a/b","padding":"';
  const contents = prefix + 'x'.repeat(1024 * 1024 - Buffer.byteLength(prefix) - 2) + '"}';
  assert.equal(Buffer.byteLength(contents), 1024 * 1024);
  await writeFile(meta, contents);
  assert.equal((await resolveProvenance(input, null)).kind, 'meta');
  await writeFile(meta, contents + ' ');
  assert.equal((await resolveProvenance(input, null)).kind, 'root');
});

test('flat skills in root directory do not claim root level _meta.json', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'provenance-flat-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(join(root, '_meta.json'), JSON.stringify({source: 'https://example.com/root/repo'}));
  const input = {rootPath: root, skillPath: join(root, 'alpha.md'), name: 'alpha'};
  const res = await resolveProvenance(input, null);
  assert.equal(res.kind, 'root', '平铺在根目录的技能不应继承根目录的 _meta.json');
  assert.equal(res.repo, null);
});

test('cache evicts old entries when its byte budget is exceeded', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'provenance-budget-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const prefix = '{"source":"https://example.com/a/b","padding":"';
  const contents = prefix + 'x'.repeat(1024 * 1024 - Buffer.byteLength(prefix) - 2) + '"}';
  const inputs = [];
  for (let i = 0; i < 9; i++) {
    const dir = join(root, String(i));
    await mkdir(dir);
    await writeFile(join(dir, '_skillhub_meta.json'), contents);
    inputs.push({rootPath: root, skillPath: join(dir, 'SKILL.md'), name: String(i)});
  }
  const original = fs.open;
  let opens = 0;
  fs.open = async (...args) => { opens++; return original(...args); };
  syncBuiltinESMExports();
  t.after(() => { fs.open = original; syncBuiltinESMExports(); });
  for (const input of inputs) assert.equal((await resolveProvenance(input, null)).kind, 'meta');
  const cold = opens;
  await resolveProvenance(inputs[8], null);
  assert.equal(opens, cold, 'most recent entry remains cached');
  await resolveProvenance(inputs[0], null);
  assert.equal(opens, cold + 1, 'oldest entry is evicted');
});

test('cold and warm refreshes bound concurrent probes for unrecorded skills', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'provenance-list-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const skills = Array.from({length: 80}, (_, i) => ({name: String(i), path: join(root, String(i), 'SKILL.md')}));
  const snapshot = {roots: [{path: root, skills}]};
  const original = fs.stat;
  let active = 0, peak = 0, calls = 0;
  fs.stat = async (...args) => {
    active++; calls++; peak = Math.max(peak, active);
    try { await new Promise(resolve => setTimeout(resolve, 2)); return await original(...args); }
    finally { active--; }
  };
  syncBuiltinESMExports();
  t.after(() => { fs.stat = original; syncBuiltinESMExports(); });
  for (let i = 0; i < 2; i++) {
    peak = 0; calls = 0;
    await attachProvenance(snapshot);
    assert.ok(peak > 1 && peak <= 16, `parallel probes should be bounded, got ${peak}`);
    assert.equal(calls, 161);
    assert.ok(skills.every(skill => skill.provenance.kind === 'root'));
  }
});
