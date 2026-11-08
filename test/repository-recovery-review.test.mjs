import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const sandbox = await fs.mkdtemp(join(tmpdir(), 'dssm-recovery-review-'));
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
const skillDir = join(process.env.DSH_HOME, 'skills', 'alpha');

test('permanent deletion followed by identical reinstall never revives old record', async () => {
  await manager.install(req);
  assert.equal((await manager.uninstallMany({ items: [req] })).results[0].ok, true);
  const id = (await listTrash())[0].id;
  assert.notEqual((await manager.permanentlyDeleteTrash(id)).ok, false);
  await manager.install(req);
  await manager.list();
  assert.equal((await read()).installs.filter(x => x.name === 'alpha' && !x.trashId).length, 1);
});

test('single uninstall writes fingerprint before moving', async () => {
  const rename = fs.rename; let intent;
  fs.rename = async (from, to) => {
    if (from === skillDir) intent = await read();
    return rename(from, to);
  };
  try { await manager.uninstall(req); } finally { fs.rename = rename; }
  assert.ok(intent.installs.some(x => x.name === 'alpha' && x.trashId && /^[a-f0-9]{64}$/.test(x.uninstallFingerprint || '')));
});

test('failed permanent delete preserves backup and source for restore', async () => {
  const item = (await listTrash()).find(x => x.name === 'alpha');
  const rm = fs.rm;
  fs.rm = async (path, options) => {
    if (path === join(trashRootPath(), item.id)) throw Object.assign(new Error('injected delete failure'), { code: 'EIO' });
    return rm(path, options);
  };
  try { await assert.rejects(manager.permanentlyDeleteTrash(item.id), /injected delete failure/); }
  finally { fs.rm = rm; }
  assert.ok((await listTrash()).some(x => x.id === item.id));
  assert.ok((await read()).installs.some(x => x.trashId === item.id));
  assert.notEqual((await manager.restoreTrash(item.id)).ok, false);
  assert.ok((await read()).installs.some(x => x.name === 'alpha' && !x.trashId));
});

test('single uninstall interrupted before move recovers after restart, but not with unknown stage', async () => {
  let intent;
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (from === skillDir) intent = await read();
    return rename(from, to);
  };
  try { await manager.uninstall(req); } finally { fs.rename = rename; }
  const record = intent.installs.find(x => x.uninstallFingerprint);
  const id = record.trashId;
  await fs.rename(join(trashRootPath(), id, 'alpha'), skillDir);
  await fs.rm(join(trashRootPath(), id), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(intent));
  await fs.mkdir(join(trashRootPath(), `.stage-${id}`), { recursive: true });
  const restarted = createRepositoryManager({});
  await restarted.list();
  assert.ok((await read()).installs.some(x => x.trashId === id));
  await fs.rm(join(trashRootPath(), `.stage-${id}`), { recursive: true });
  await restarted.list();
  assert.ok((await read()).installs.some(x => x.name === 'alpha' && !x.trashId));
});

test('permanent delete state write failure leaves backup and provenance intact', async () => {
  await manager.uninstall(req);
  const item = (await listTrash()).find(x => x.name === 'alpha');
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === statePath) throw Object.assign(new Error('injected state failure'), { code: 'EIO' });
    return rename(from, to);
  };
  try { await assert.rejects(manager.permanentlyDeleteTrash(item.id)); }
  finally { fs.rename = rename; }
  assert.ok((await listTrash()).some(x => x.id === item.id));
  assert.ok((await read()).installs.some(x => x.trashId === item.id && x.uninstallFingerprint));
});


async function stagePermanentDelete(id) {
  const data = await read();
  const installs = data.installs.filter(x => x.trashId === id);
  const catalogInstalls = (data.catalogInstalls || []).filter(x => typeof x !== 'string' && x.trashId === id);
  data.installs = data.installs.filter(x => x.trashId !== id);
  data.catalogInstalls = (data.catalogInstalls || []).filter(x => typeof x === 'string' || x.trashId !== id);
  data.pendingTrashDeletes = [{ id, installs, catalogInstalls }];
  await fs.writeFile(statePath, JSON.stringify(data));
}

test('restart rolls back a prepared permanent delete while its backup exists', async () => {
  const item = (await listTrash()).find(x => x.name === 'alpha');
  const original = await read();
  (original.catalogInstalls ||= []).push({ id: 'skillsh:owner/alpha', name: 'alpha', root: 'dsh', trashId: item.id });
  await fs.writeFile(statePath, JSON.stringify(original));
  await stagePermanentDelete(item.id);
  const restarted = createRepositoryManager({});
  await restarted.list();
  const data = await read();
  assert.ok(data.installs.some(x => x.trashId === item.id && x.uninstallFingerprint));
  assert.ok(data.catalogInstalls.some(x => x.id === 'skillsh:owner/alpha' && x.trashId === item.id));
  assert.equal(data.pendingTrashDeletes?.length || 0, 0);
  assert.notEqual((await restarted.restoreTrash(item.id)).ok, false);
});

test('restart commits a prepared permanent delete with no backup before identical reinstall', async () => {
  await manager.uninstall(req);
  const item = (await listTrash()).find(x => x.name === 'alpha');
  const original = await read();
  (original.catalogInstalls ||= []).push({ id: 'skillsh:owner/beta', name: 'alpha', root: 'dsh', trashId: item.id });
  await fs.writeFile(statePath, JSON.stringify(original));
  await stagePermanentDelete(item.id);
  await fs.rm(join(trashRootPath(), item.id), { recursive: true });
  const restarted = createRepositoryManager({});
  await restarted.install(req);
  await restarted.list();
  const data = await read();
  assert.equal(data.pendingTrashDeletes?.length || 0, 0);
  assert.ok(!data.installs.some(x => x.trashId === item.id));
  assert.ok(!data.catalogInstalls.some(x => typeof x !== 'string' && x.trashId === item.id));
  assert.ok(!data.catalogInstalls.some(x => typeof x !== 'string' && x.id === 'skillsh:owner/beta'));
  assert.equal(data.installs.filter(x => x.name === 'alpha' && !x.trashId).length, 1);
});

test('failure of final commit leaves durable transaction for restart', async () => {
  await manager.uninstall(req);
  const item = (await listTrash()).find(x => x.name === 'alpha');
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === statePath) {
      const candidate = JSON.parse(await fs.readFile(from, 'utf8'));
      if (!candidate.pendingTrashDeletes?.length) throw new Error('injected final commit failure');
    }
    return rename(from, to);
  };
  try { await assert.rejects(manager.permanentlyDeleteTrash(item.id), /injected final commit failure/); }
  finally { fs.rename = rename; }
  const pending = await read();
  assert.equal(pending.pendingTrashDeletes[0].id, item.id);
  assert.ok(!(await listTrash()).some(x => x.id === item.id));
  const restarted = createRepositoryManager({});
  await restarted.install(req);
  const data = await read();
  assert.equal(data.pendingTrashDeletes?.length || 0, 0);
  assert.ok(!data.installs.some(x => x.trashId === item.id));
  assert.equal(data.installs.filter(x => x.name === 'alpha' && !x.trashId).length, 1);
});

test('malformed pending transaction is rejected without touching files', async () => {
  const original = await read();
  await fs.writeFile(statePath, JSON.stringify({ ...original, pendingTrashDeletes: [{ id: '../unsafe', installs: [], catalogInstalls: [] }] }));
  try {
    await assert.rejects(createRepositoryManager({}).list(), error => error.code === 'error.repo.state');
    assert.ok(await fs.stat(join(skillDir, 'SKILL.md')));
  } finally { await fs.writeFile(statePath, JSON.stringify(original)); }
});

test('two prepared deletes in different slots both roll back after restart', async () => {
  const state = await read();
  const template = state.installs[0];
  assert.ok(template, '前置状态应已有安装记录');
  const ids = ['888-22222222-2222-4222-8222-222222222222', '999-11111111-1111-4111-8111-111111111111'];
  for (const id of ids) await fs.mkdir(join(trashRootPath(), id), { recursive: true });
  state.pendingTrashDeletes = ids.map(id => ({ id, installs: [{ ...template, trashId: id }], catalogInstalls: [] }));
  await fs.writeFile(statePath, JSON.stringify(state));
  const restarted = createRepositoryManager({});
  await restarted.list();
  const data = await read();
  assert.equal(data.pendingTrashDeletes, undefined, '两个槽位都应完成收口');
  for (const id of ids) assert.ok(data.installs.some(x => x.trashId === id), `事务身份 ${id} 应恢复`);
  for (const id of ids) await fs.rm(join(trashRootPath(), id), { recursive: true, force: true });
});

test('non-delete cleanup keeps the state file indented', async () => {
  const state = await read();
  state.catalogInstalls = [...(state.catalogInstalls || []), 'skillsh:owner/legacy'];
  await fs.writeFile(statePath, JSON.stringify(state));
  await manager.forgetCatalogInstall({ legacyId: 'skillsh:owner/legacy' });
  const text = await fs.readFile(statePath, 'utf8');
  assert.ok(/\n\s{2}"/.test(text), '非删除事务的清理写入必须保持缩进，避免压缩绕过容量闸门');
  assert.ok(!text.includes('skillsh:owner/legacy'));
});

test('one request parses the state file at most twice', async () => {
  const readFile = fs.readFile;
  let stateReads = 0;
  fs.readFile = async (path, ...rest) => {
    if (path === statePath) stateReads += 1;
    return readFile(path, ...rest);
  };
  try { await manager.list(); } finally { fs.readFile = readFile; }
  assert.ok(stateReads <= 2, `预读+任务体最多两次解析，实际 ${stateReads}`);
});

test('a failed rollback still surfaces the original delete error', async () => {
  // 自建夹具，不依赖前面用例留下的状态。
  const id = '666-33333333-3333-4333-8333-333333333333';
  const itemRoot = join(trashRootPath(), id);
  await fs.mkdir(join(itemRoot, 'alpha'), { recursive: true });
  await fs.writeFile(join(itemRoot, 'metadata.json'), JSON.stringify({ id, name: 'alpha', deletedAt: new Date().toISOString(), entries: ['alpha'] }));
  await fs.writeFile(join(itemRoot, 'alpha', 'SKILL.md'), 'fixture');
  const before = await read();
  const template = before.installs[0];
  assert.ok(template, '前置状态应已有安装记录');
  const record = { ...template, name: 'alpha', path: 'alpha', trashId: id, uninstallFingerprint: 'a'.repeat(64) };
  await fs.writeFile(statePath, JSON.stringify({ ...before, installs: [...before.installs, record] }));

  const rm = fs.rm, rename = fs.rename;
  fs.rm = async (path, options) => {
    if (path === itemRoot) throw Object.assign(new Error('injected delete failure'), { code: 'EIO' });
    return rm(path, options);
  };
  fs.rename = async (from, to) => {
    if (to === statePath) {
      const candidate = JSON.parse(await fs.readFile(from, 'utf8'));
      // 准备事务的写入放行，回滚写入失败：原始删除错误不能被它盖掉。
      if (!candidate.pendingTrashDeletes?.length) throw new Error('injected rollback failure');
    }
    return rename(from, to);
  };
  try {
    await assert.rejects(manager.permanentlyDeleteTrash(id), error => {
      assert.match(String(error.message), /来源身份回滚未完成/);
      assert.match(String(error.message), /injected delete failure/, '必须保留原始失败原因');
      assert.match(String(error.cause?.message || ''), /injected rollback failure/);
      return true;
    });
  } finally { fs.rm = rm; fs.rename = rename; }

  // 收尾：还原夹具，避免污染后续用例。
  await fs.rm(itemRoot, { recursive: true, force: true });
  await fs.writeFile(statePath, JSON.stringify(before));
});

test('each request re-parses the state instead of reusing the previous parse', async () => {
  const readFile = fs.readFile;
  let stateReads = 0;
  fs.readFile = async (path, ...rest) => {
    if (path === statePath) stateReads += 1;
    return readFile(path, ...rest);
  };
  try { await manager.list(); await manager.list(); } finally { fs.readFile = readFile; }
  assert.equal(stateReads, 4, `两次请求应各自解析两次，实际 ${stateReads}（缓存越界会变少）`);
});

test('a failed state write leaves no dirty parse for the next request', async () => {
  const rename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === statePath) throw Object.assign(new Error('injected write failure'), { code: 'EIO' });
    return rename(from, to);
  };
  try { await assert.rejects(manager.forgetCatalogInstall({ legacyId: 'skillsh:owner/stale' })); }
  finally { fs.rename = rename; }

  const readFile = fs.readFile;
  let stateReads = 0;
  fs.readFile = async (path, ...rest) => {
    if (path === statePath) stateReads += 1;
    return readFile(path, ...rest);
  };
  try { await manager.list(); } finally { fs.readFile = readFile; }
  assert.equal(stateReads, 2, `写失败后下一次请求必须重新读盘，实际 ${stateReads}`);
});
