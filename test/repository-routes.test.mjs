// 通过真实 HTTP 请求验证仓库接口沿用 Host、Origin 与写请求标记校验。
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { access, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";
const temporary = await mkdtemp(join(tmpdir(), "dssm-repo-http-"));
process.env.DSH_HOME = join(temporary, "home");
process.env.DSH_AGENTS_HOME = join(temporary, "agents");
process.env.HOME = process.env.USERPROFILE = join(temporary, "user");
process.env.DSH_CODEX_HOME = join(temporary, "configured-codex");
process.env.DSH_CLAUDE_HOME = join(temporary, "configured-claude");
const nativeFetch = globalThis.fetch;
let interceptedDownload;
globalThis.fetch = (url, options) => interceptedDownload && String(url).startsWith("https://codeload.github.com/") ? interceptedDownload() : nativeFetch(url, options);
const { apply } = await import("../lib/index.js");
let route;
apply({
  effect(register) { return register(); },
  skills: { registerProvider() { return () => {}; } },
  webRuntime: { trustedHosts: [] },
  webServer: { register(value) { if (value.kind === "prefix") route = value; return () => {}; } },
});
const server = createServer((req, res) => route.handler(req, res));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const api = `http://127.0.0.1:${server.address().port}/api/dsh-skills-manager/repositories`;
const headers = { "content-type": "application/json", "x-dsh-skills-manager": "1" };
try {
  assert.equal((await fetch(api)).status, 200);
  const head = await fetch(api, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
  const untrustedHostStatus = await new Promise((resolve, reject) => {
    const req = request(api, { headers: { Host: "evil.example" } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject); req.end();
  });
  assert.equal(untrustedHostStatus, 403);
  for (const action of ["add", "remove", "refresh", "detail", "install", "uninstall", "preview", "update", "rollback"]) {
    assert.equal((await fetch(api + "/" + action, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await fetch(api + "/" + action, { method: "POST", headers: { ...headers, Origin: "https://evil.example" }, body: "{}" })).status, 403);
  }
  const add = await fetch(api + "/add", { method: "POST", headers, body: JSON.stringify({ url: "example/skills" }) });
  assert.equal(add.status, 200);
  const id = (await add.json()).data.id;
  const originalFetch = nativeFetch;
  let releaseDownload, downloadStarted, timeout;
  const started = new Promise(resolve => { downloadStarted = resolve; });
  interceptedDownload = () => new Promise(resolve => { releaseDownload = () => resolve(new Response("", { status: 403 })); downloadStarted(); });
  const refreshing = originalFetch(api + "/refresh", { method: "POST", headers, body: JSON.stringify({ id }) });
  try {
    await started;
    const localResponse = await Promise.race([
      originalFetch(api.replace(/\/repositories$/, "/enable"), { method: "POST", headers, body: "{}" }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("仓库下载阻塞了本地写操作")), 2000); }),
    ]);
    assert.equal(localResponse.status, 400, "本地参数校验无需等待远程下载");
    clearTimeout(timeout);
    const localApi = api.replace(/\/repositories$/, '');
    const create = await originalFetch(localApi + '/create', { method: 'POST', headers, body: JSON.stringify({ name: 'ordinary-http', description: 'Ordinary DSH skill', body: 'Instructions' }) });
    assert.equal(create.status, 200);
    const deleted = await originalFetch(localApi + '/delete', { method: 'POST', headers, body: JSON.stringify({ root: 'dsh', name: 'ordinary-http' }) });
    assert.equal(deleted.status, 200);
    const trash = (await deleted.json()).data;
    const restored = await Promise.race([
      originalFetch(localApi + '/trash-restore', { method: 'POST', headers, body: JSON.stringify({ id: trash.id }) }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Ordinary restore waited behind repository download')), 2000); }),
    ]);
    assert.equal(restored.status, 200, 'ordinary restore bypasses the repository queue');
  } finally { clearTimeout(timeout); releaseDownload?.(); await refreshing; interceptedDownload = undefined; }
  assert.equal((await (await fetch(api)).json()).data.repositories.length, 1);
  assert.equal((await fetch(api + "/install", { method: "POST", headers, body: JSON.stringify({ id, path: "../escape" }) })).status, 400);
  interceptedDownload = () => new Response(zipSync({ "root/demo/SKILL.md": strToU8("---\nname: http-demo\ndescription: HTTP test skill\n---\nInstructions\n") }));
  const post = (action, payload) => fetch(api + '/' + action, { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal((await post('refresh', { id })).status, 200);
  assert.equal((await post('install', { id, path: 'demo', root: '../escape' })).status, 400);
  const destinations = (await (await fetch(api)).json()).data.installRoots;
  assert.deepEqual(destinations.map(root => root.key), ['dsh', 'agents']);
  assert.equal(destinations.find(root => root.key === 'agents').path, join(process.env.DSH_AGENTS_HOME, 'skills'));
  assert.equal((await post('install', { id, path: 'demo', root: 'agents' })).status, 200);
  const managerApi = api.replace(/\/repositories$/, '');
  const shared = (await (await fetch(managerApi + '/state')).json()).data.roots.find(root => root.key === 'agents');
  assert.equal(shared.skills.find(skill => skill.name === 'http-demo').installSource.root, 'agents', 'global source metadata follows the installation destination');
  assert.equal((await fetch(managerApi + '/delete', { method: 'POST', headers, body: JSON.stringify({ root: 'agents', name: 'http-demo', allowSharedAgent: true }) })).status, 400, 'request cannot opt into internal Shared Agent write permission');
  const uninstall = await post('uninstall', { id, path: 'demo', root: 'dsh' });
  assert.equal(uninstall.status, 200);
  const trash = (await uninstall.json()).data;
  assert.equal(trash.root.key, 'agents');
  assert.equal((await (await fetch(api)).json()).data.repositories[0].skills[0].status, 'available');
  assert.equal((await fetch(managerApi + '/trash-restore', { method: 'POST', headers, body: JSON.stringify({ id: trash.id }) })).status, 200);
  assert.equal((await (await fetch(api)).json()).data.repositories[0].skills[0].status, 'installed');
  assert.equal((await post('uninstall', { id, path: 'demo' })).status, 200);
  for (const key of ['codex', 'claude']) {
    assert.equal((await post('install', { id, path: 'demo', root: key })).status, 400, key + ' is not a repository install destination');
    assert.equal(await access(join(process.env["DSH_" + key.toUpperCase() + "_HOME"], "skills")).then(() => true, () => false), false);
  }
  assert.equal((await post('install', { id, path: 'demo', root: join(process.env.DSH_CLAUDE_HOME, 'skills') })).status, 400, 'arbitrary paths are not installation keys');
  interceptedDownload = undefined;
  assert.equal((await fetch(api + "/remove", { method: "POST", headers, body: JSON.stringify({ id }) })).status, 200);
  assert.equal((await (await fetch(api)).json()).data.repositories.length, 0);
  console.log("仓库 HTTP 接口、HEAD、跨站与写请求保护测试通过");
} finally {
  globalThis.fetch = nativeFetch;
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
