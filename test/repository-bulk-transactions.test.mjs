import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const sandbox = await fs.mkdtemp(join(tmpdir(), 'dssm-bulk-'));
process.env.DSH_HOME = join(sandbox, 'home');
process.env.USERPROFILE = join(sandbox, 'user');
const { createRepositoryManager, parseRepositoryInput } = await import('../lib/repositories.js');
const { createRepositoryUpdater, signature, fileIndex } = await import('../lib/repository-updates.js');
const { listTrash, trashRootPath, deleteSkill, isSafeDeleteFailure } = await import('../lib/core.js');
const doc = (name, version) => `---\nname: ${name}\ndescription: test\n---\n${version}\n`;
let version = 'old';
const manager = createRepositoryManager({ gitFetch: async (_repo, dest) => {
  for (const name of ['alpha', 'beta']) {
    const file = join(dest, name, 'SKILL.md');
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, doc(name, version));
  }
  return { commit: (version === 'old' ? 'a' : 'b').repeat(40) };
}});
const repo = await manager.add({ url: 'example/bulk' });
await manager.refresh({ id: repo.id });
const req = name => ({ id: repo.id, path: name });
const statePath = join(process.env.DSH_HOME, 'skills-manager', 'repositories.json');
const state = async () => JSON.parse(await fs.readFile(statePath, 'utf8'));
const file = name => join(process.env.DSH_HOME, 'skills', name, 'SKILL.md');

test('batch install confirmation failure retains recoverable intent and reports installState', async () => {
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === statePath) {
      const data = JSON.parse(await fs.readFile(from, 'utf8'));
      if (data.installs.some(x => x.name === 'alpha' && x.complete)) throw new Error('injected confirmation failure');
    }
    return rename(from, to);
  };
  try { await assert.rejects(manager.installMany({ items: [req('alpha'), req('beta')] }), e => e.code === 'error.repo.installState'); }
  finally { fs.rename = rename; }
  assert.ok((await state()).installs.every(x => !x.complete));
  assert.equal(await fs.readFile(file('alpha'), 'utf8'), doc('alpha', 'old'));
  await manager.list();
  assert.ok((await state()).installs.every(x => x.complete));
});

test('batch update write failure cannot leak failed record into next success', async () => {
  version = 'new'; await manager.refresh({ id: repo.id });
  const preview = await manager.previewMany({ items: [req('alpha'), req('beta')] });
  let writes = 0;
  const updater = createRepositoryUpdater({ read: state, write: async data => {
    if (++writes === 1) throw new Error('injected write failure');
    await fs.writeFile(statePath, JSON.stringify(data));
  }, repository: (data, id) => data.repositories.find(x => x.id === id),
  download: async (_repo, path) => ({ [`${path}/SKILL.md`]: Buffer.from(doc(path, 'new')) }),
  serialize: fn => fn(), parseRepositoryInput });
  const result = await updater.updateMany({ items: preview.results.map(x => ({ ...req(x.path), token: x.token })) });
  assert.deepEqual(result.results.map(x => x.ok), [false, true]);
  assert.equal(await fs.readFile(file('alpha'), 'utf8'), doc('alpha', 'old'));
  assert.equal(await fs.readFile(file('beta'), 'utf8'), doc('beta', 'new'));
  const saved = await state();
  assert.equal(saved.installs.find(x => x.name === 'alpha').commit, 'a'.repeat(40));
  assert.equal(saved.installs.find(x => x.name === 'beta').commit, 'b'.repeat(40));
});

test('failed bulk move preserves a concurrent edit and restores source tracking', async () => {
  const rename = fs.rename;
  const edited = doc('beta', 'user edit');
  let injected = false;
  fs.rename = async (from, to) => {
    if (from === dirname(file('alpha'))) await fs.writeFile(file('beta'), edited);
    if (from === dirname(file('beta'))) {
      injected = true;
      throw Object.assign(new Error('injected move failure'), { code: 'EIO' });
    }
    return rename(from, to);
  };
  try {
    const result = await manager.uninstallMany({ items: [req('alpha'), req('beta')] });
    assert.equal(injected, true);
    assert.deepEqual(result.results.map(x => x.ok), [true, false]);
    assert.equal(await fs.readFile(file('beta'), 'utf8'), edited);
    const before = (await state()).installs.find(x => x.name === 'beta' && x.complete);
    if (before.trashId) {
      await assert.rejects(fs.lstat(join(trashRootPath(), before.trashId)), { code: 'ENOENT' });
      await assert.rejects(fs.lstat(join(trashRootPath(), `.stage-${before.trashId}`)), { code: 'ENOENT' });
    }
    await manager.list();
    const saved = (await state()).installs.find(x => x.name === 'beta' && x.complete);
    assert.equal(saved.trashId, undefined);
    assert.equal(saved.id, repo.id);
    assert.equal(saved.path, 'beta');
  } finally {
    fs.rename = rename;
    await fs.writeFile(file('beta'), doc('beta', 'new'));
    await manager.list();
    version = 'old'; await manager.refresh({ id: repo.id });
    await manager.install(req('alpha'));
  }
});

test('batch uninstall journals only the current item before moving', async () => {
  const rename = fs.rename; let snapshot;
  fs.rename = async (from, to) => {
    if (!snapshot && from === dirname(file('alpha'))) snapshot = await state();
    return rename(from, to);
  };
  let result;
  try { result = await manager.uninstallMany({ items: [req('alpha'), req('beta')] }); }
  finally { fs.rename = rename; }
  assert.deepEqual(result.results.map(x => x.ok), [true, true]);
  assert.ok(snapshot.installs.find(x => x.name === 'alpha').trashId);
  assert.equal(snapshot.installs.find(x => x.name === 'beta').trashId, undefined);
});

async function checkReinstallPreservesTrash(name, expectedVersion, install) {
  const before = (await listTrash()).find(x => x.name === name);
  assert.ok(before, `missing original trash for ${name}`);
  const provenance = (await state()).installs.find(x => x.trashId === before.id);
  assert.ok(provenance, `missing original provenance for ${name}`);
  const contentPath = join(trashRootPath(), before.id, name, 'SKILL.md');
  const content = await fs.readFile(contentPath, 'utf8');
  assert.equal(content, doc(name, expectedVersion));
  version = expectedVersion; await manager.refresh({ id: repo.id });
  await install();
  assert.deepEqual((await listTrash()).find(x => x.id === before.id), before);
  assert.equal(await fs.readFile(contentPath, 'utf8'), content);
  const saved = await state();
  assert.deepEqual(saved.installs.find(x => x.trashId === before.id), provenance);
  assert.ok(saved.installs.some(x => x.name === name && x.complete && !x.trashId));
  assert.equal(await fs.readFile(file(name), 'utf8'), content);
}

test('single reinstall retains matching trash content and provenance', async () => {
  await checkReinstallPreservesTrash('alpha', 'old', () => manager.install(req('alpha')));
});

test('bulk reinstall retains matching trash content and provenance', async () => {
  await checkReinstallPreservesTrash('beta', 'new', async () => {
    const result = await manager.installMany({ items: [req('beta')] });
    assert.equal(result.results[0].ok, true);
  });
});


test('interrupted uninstall recovers only intact source with no staged or published move', async () => {
  const data = await state();
  const record = data.installs.find(x => x.name === 'alpha' && !x.trashId);
  const id = '123456789-12345678-1234-1234-1234-123456789abc';
  record.trashId = id;
  record.uninstallFingerprint = signature(fileIndex({ 'SKILL.md': await fs.readFile(file('alpha')) }));
  await fs.writeFile(statePath, JSON.stringify(data));
  const stage = join(trashRootPath(), `.stage-${id}`);
  await fs.mkdir(stage, { recursive: true });
  await manager.list();
  assert.ok((await state()).installs.some(x => x.trashId === id));
  await fs.rm(stage, { recursive: true });
  const published = join(trashRootPath(), id);
  await fs.mkdir(published, { recursive: true });
  await manager.list();
  assert.ok((await state()).installs.some(x => x.trashId === id));
  await fs.rm(published, { recursive: true });
  const source = dirname(file('alpha'));
  const held = `${source}-held`;
  await fs.rename(source, held);
  try {
    await manager.list();
    assert.ok((await state()).installs.some(x => x.trashId === id));
  } finally { await fs.rename(held, source); }
  await fs.writeFile(file('alpha'), 'partial or changed');
  await manager.list();
  assert.ok((await state()).installs.some(x => x.trashId === id));
  await fs.writeFile(file('alpha'), doc('alpha', 'old'));
  await manager.list();
  const recovered = (await state()).installs.find(x => x.name === 'alpha' && !x.trashId);
  assert.ok(recovered);
  assert.equal(recovered.uninstallFingerprint, undefined);
});

test('preserved backup rejects restore over reinstall and restores after uninstall', async () => {
  const original = (await listTrash()).find(x => x.name === 'alpha');
  const conflict = await manager.restoreTrash(original.id);
  assert.equal(conflict.ok, false);
  assert.equal(await fs.readFile(file('alpha'), 'utf8'), doc('alpha', 'old'));
  assert.ok((await state()).installs.some(x => x.trashId === original.id));
  await manager.uninstall(req('alpha'));
  const restored = await manager.restoreTrash(original.id);
  assert.notEqual(restored.ok, false);
  assert.equal(await fs.readFile(file('alpha'), 'utf8'), doc('alpha', 'old'));
  const saved = await state();
  assert.ok(saved.installs.some(x => x.name === 'alpha' && !x.trashId && x.complete));
  assert.ok(!saved.installs.some(x => x.trashId === original.id));
});

test('deleteSkill issues a one-use receipt only after successful rollback', async () => {
  const write = fs.writeFile;
  fs.writeFile = async (path, ...args) => {
    if (String(path).includes('.stage-') && String(path).endsWith('metadata.json')) throw new Error('metadata failure');
    return write(path, ...args);
  };
  try {
    let failure;
    try { await deleteSkill(join(process.env.DSH_HOME, 'skills'), 'alpha'); } catch (error) { failure = error; }
    assert.equal(failure?.message, 'metadata failure');
    assert.equal(isSafeDeleteFailure(failure), true);
    assert.equal(isSafeDeleteFailure(failure), false);
    assert.equal(await fs.readFile(file('alpha'), 'utf8'), doc('alpha', 'old'));
  } finally { fs.writeFile = write; }
});

test('deleteSkill does not certify failed rollback or failed stage cleanup', async () => {
  const write = fs.writeFile, rename = fs.rename, rm = fs.rm;
  let stage;
  fs.writeFile = async (path, ...args) => {
    if (String(path).includes('.stage-') && String(path).endsWith('metadata.json')) {
      stage = dirname(path); throw new Error('metadata failure');
    }
    return write(path, ...args);
  };
  try {
    fs.rename = async (from, to) => {
      if (stage && from === join(stage, 'alpha')) throw Object.assign(new Error('rollback failure'), { code: 'EIO' });
      return rename(from, to);
    };
    let failure;
    try { await deleteSkill(join(process.env.DSH_HOME, 'skills'), 'alpha'); } catch (error) { failure = error; }
    assert.equal(failure?.code, 'error.trash.rollbackFailed');
    assert.equal(isSafeDeleteFailure(failure), false);
    await rename(join(stage, 'alpha'), dirname(file('alpha')));
    await rm(stage, { recursive: true, force: true });
    stage = undefined; fs.rename = rename;
    fs.rm = async (path, ...args) => {
      if (path === stage) throw new Error('cleanup failure');
      return rm(path, ...args);
    };
    failure = undefined;
    try { await deleteSkill(join(process.env.DSH_HOME, 'skills'), 'alpha'); } catch (error) { failure = error; }
    assert.equal(failure?.message, 'metadata failure');
    assert.equal(isSafeDeleteFailure(failure), false);
    assert.equal(await fs.readFile(file('alpha'), 'utf8'), doc('alpha', 'old'));
    await rm(stage, { recursive: true, force: true });
  } finally { fs.writeFile = write; fs.rename = rename; fs.rm = rm; }
});

test('failed rollback confirmation write rejects instead of reporting success', async () => {
  const rename = fs.rename;
  const edited = doc('alpha', 'edited during failure');
  let failConfirmation = false;
  fs.rename = async (from, to) => {
    if (from === dirname(file('alpha'))) {
      await fs.writeFile(file('alpha'), edited);
      failConfirmation = true;
      throw Object.assign(new Error('move failure'), { code: 'EIO' });
    }
    if (to === statePath && failConfirmation) throw new Error('state confirmation failure');
    return rename(from, to);
  };
  try {
    await assert.rejects(manager.uninstallMany({ items: [req('alpha')] }), /state confirmation failure/);
    const saved = (await state()).installs.find(x => x.name === 'alpha' && x.trashId);
    assert.ok(saved);
    assert.equal(await fs.readFile(file('alpha'), 'utf8'), edited);
    fs.rename = rename;
    await manager.list();
    assert.ok((await state()).installs.some(x => x.trashId === saved.trashId));
  } finally {
    fs.rename = rename;
    await fs.writeFile(file('alpha'), doc('alpha', 'old'));
    await manager.list();
  }
});

test.after(async () => { await fs.rm(sandbox, { recursive: true, force: true }); });
