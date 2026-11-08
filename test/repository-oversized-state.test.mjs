import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';

const sandbox = await fs.mkdtemp(join(tmpdir(), 'dssm-delete-concurrency-'));
process.env.DSH_HOME = join(sandbox, 'home');
process.env.USERPROFILE = join(sandbox, 'user');
const { createRepositoryManager } = await import('../lib/repositories.js');
const { listTrash, trashRootPath } = await import('../lib/core.js');
const manager = createRepositoryManager({ gitFetch: async (_repo, dest) => {
  await fs.mkdir(join(dest, 'alpha'), { recursive: true });
  await fs.writeFile(join(dest, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: test\n---\ncontent\n');
  return { commit: 'a'.repeat(40) };
}});
const repo = await manager.add({ url: 'example/recovery' });
await manager.refresh({ id: repo.id });
const req = { id: repo.id, path: 'alpha' };
const statePath = join(process.env.DSH_HOME, 'skills-manager', 'repositories.json');
const read = async () => JSON.parse(await fs.readFile(statePath, 'utf8'));

async function trashOne() {
  await manager.install(req);
  await manager.uninstall(req);
  return (await listTrash()).find(x => x.name === 'alpha').id;
}

test('oversized state permits transactional permanent deletion without losing unrelated state', async () => {
  const id = await trashOne();
  const original = await read();
  original.padding = 'x'.repeat(16 * 1024 * 1024);
  await fs.writeFile(statePath, JSON.stringify(original));
  assert.ok((await fs.stat(statePath)).size > 16 * 1024 * 1024);
  assert.notEqual((await manager.permanentlyDeleteTrash(id)).ok, false);
  const result = await read();
  assert.equal(result.padding, original.padding);
  assert.ok(!result.installs.some(x => x.trashId === id));
  assert.equal(result.pendingTrashDeletes, undefined);
  assert.ok(!(await listTrash()).some(x => x.id === id));
  delete result.padding;
  await fs.writeFile(statePath, JSON.stringify(result));
});

test('oversized transaction rollback preserves provenance after filesystem failure', async () => {
  const id = await trashOne();
  const original = await read();
  original.padding = 'x'.repeat  (16 * 1024 * 1024);
  await fs.writeFile(statePath, JSON.stringify(original));
  const target = join(trashRootPath(), id);
  const rename = fs.rename, rm = fs.rm;
  const fail = path => { if (path === target) throw Object.assign(new Error('injected delete failure'), { code: 'EIO' }); };
  fs.rename = async (from, to) => { fail(from); return rename(from, to); };
  fs.rm = async (path, options) => { fail(path); return rm(path, options); };
  try { await assert.rejects(manager.permanentlyDeleteTrash(id), /injected delete failure/); }
  finally { fs.rename = rename; fs.rm = rm; }
  const recovered = await read();
  assert.equal(recovered.padding, original.padding);
  assert.ok(recovered.installs.some(x => x.trashId === id));
  assert.equal(recovered.pendingTrashDeletes, undefined);
  assert.ok((await listTrash()).some(x => x.id === id));
  delete recovered.padding;
  await fs.writeFile(statePath, JSON.stringify(recovered));
  assert.notEqual((await manager.permanentlyDeleteTrash(id)).ok, false);
});

// 跨实例/跨进程的 read-modify-write 没有互斥（已知边界，本仓库不做跨进程锁）。
// 这里锁定的是「即便发生穿插，本实例的事务仍会收口、被删身份不会复活」；
// 另一实例这次写入是否幸存不在保证范围内，改天真要加锁时这条注释就是入口。
test('interleaved write from another instance neither blocks nor revives our delete', async () => {
  const id = await trashOne();
  const target = join(trashRootPath(), id);
  const rm = fs.rm;
  let enteredResolve, releaseResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const release = new Promise(resolve => { releaseResolve = resolve; });
  fs.rm = async (path, options) => {
    if (path === target) { enteredResolve(); await release; }
    return rm(path, options);
  };
  let deletion, otherSurvived;
  try {
    deletion = manager.permanentlyDeleteTrash(id);
    await entered;
    await createRepositoryManager({ probeRemote: false }).add({ url: 'example/interleave' });
    releaseResolve();
    await deletion;
  } finally {
    releaseResolve(); fs.rm = rm;
    if (deletion) await deletion.catch(() => {});
  }
  const state = await read();
  otherSurvived = state.repositories.some(x => x.name === 'interleave');
  assert.equal(state.pendingTrashDeletes, undefined, '发起删除的实例必须完成自己的事务');
  assert.ok(!state.installs.some(x => x.trashId === id), '被删身份不得复活');
  assert.ok(!(await listTrash()).some(x => x.id === id), '回收项不得残留');
  console.log(JSON.stringify({ otherInstanceWriteSurvived: otherSurvived }));
});
