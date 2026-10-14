// 通过真实 HTTP 请求验证仓库接口沿用 Host、Origin 与写请求标记校验。
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { EventEmitter } from "node:events";
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
let interceptedSkillshSearch;
let interceptedCatalog;
globalThis.fetch = (url, options) => {
  const target = String(url);
  if (interceptedSkillshSearch && target.startsWith("https://skills.sh/api/search?")) return interceptedSkillshSearch(url, options);
  if (interceptedCatalog && (target.startsWith("https://clawhub.ai/api/v1/") || target.startsWith("https://skills.sh/api/download/"))) return interceptedCatalog(url, options);
  if (interceptedDownload && target.startsWith("https://codeload.github.com/")) return interceptedDownload();
  return nativeFetch(url, options);
};
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
  const brokenRequest = new EventEmitter();
  Object.assign(brokenRequest, { url: "/api/dsh-skills-manager/create", method: "POST", headers: { ...headers, host: "localhost" } });
  let outerStatus, outerPayload;
  const brokenResponse = new EventEmitter();
  Object.assign(brokenResponse, { writeHead(status) { outerStatus = status; }, end(body) { outerPayload = JSON.parse(body); } });
  const handling = route.handler(brokenRequest, brokenResponse);
  brokenRequest.emit("error", Object.assign(new Error("业务读取失败"), { statusCode: 400, code: "error.workspace.unavailable", params: { path: "C:/missing", action: "restore" } }));
  await handling;
  assert.equal(outerStatus, 400);
  assert.deepEqual(outerPayload.params, { path: "C:/missing", action: "restore" }, "外层响应保留完整业务参数");
  assert.equal((await fetch(api)).status, 200);
  let proxyRequest;
  interceptedCatalog = async (url, options) => {
    proxyRequest = { url: String(url), options };
    return Response.json(String(url).includes("/search?") ? { results: [{ ownerHandle: "owner", slug: "proxy-skill", displayName: "Proxy Skill", summary: "真实字段" }] } : { items: [{ ownerHandle: "owner", slug: "proxy-skill", displayName: "Proxy Skill", summary: "真实字段" }], nextCursor: "next" });
  };
  const clawBase = api.replace("/repositories", "/clawhub");
  const listProxy = await fetch(clawBase + "/list?sort=downloads&limit=10&cursor=opaque");
  assert.equal(listProxy.status, 200, "ClawHub 下载榜通过本地代理读取");
  assert.equal((await listProxy.json()).data.items[0].slug, "proxy-skill");
  assert.equal(proxyRequest.url, "https://clawhub.ai/api/v1/skills?sort=downloads&limit=10&cursor=opaque");
  assert.equal(proxyRequest.options.redirect, "error");
  const searchProxy = await fetch(clawBase + "/search?q=Browser&limit=100");
  assert.equal(searchProxy.status, 200);
  assert.equal((await searchProxy.json()).data.results[0].ownerHandle, "owner");
  assert.equal(proxyRequest.url, "https://clawhub.ai/api/v1/search?q=Browser&limit=100");
  for (const query of ["/list?limit=11", "/list?cursor=", "/list?limit=10&limit=1", "/list?url=https://evil.test", "/search?q=a&q=b", "/search?limit=100", "/search?q=a&limit=101"]) assert.equal((await fetch(clawBase + query)).status, 400, "本地代理拒绝非法或重复参数");
  let upstreamRequest;
  interceptedSkillshSearch = async (url, options) => {
    upstreamRequest = { url: String(url), headers: options?.headers, redirect: options?.redirect };
    return new Response(JSON.stringify({ skills: [{ id: "owner/skills/react", source: "owner/skills", skillId: "react", name: "react", installs: 123, description: "ignored", injected: "ignored" }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const searchBase = api.replace("/repositories", "/skills-sh/search");
  const skillshResponse = await fetch(searchBase + "?q=React%20Native");
  assert.equal(skillshResponse.status, 200, "skills.sh 搜索通过本地 API 代理提供结果");
  const skillshPayload = await skillshResponse.json();
  assert.deepEqual(skillshPayload.data.skills, [{ id: "owner/skills/react", source: "owner/skills", skillId: "react", name: "react", installs: 123 }], "代理仅返回受校验的 skills.sh 目录字段");
  assert.equal(upstreamRequest.url, "https://skills.sh/api/search?q=React+Native", "代理固定调用 skills.sh 搜索端点并传递编码查询词");
  assert.equal(upstreamRequest.headers.authorization, undefined, "搜索不需要凭据");
  assert.equal(upstreamRequest.redirect, "error", "固定的 skills.sh 端点不允许跟随外部重定向");
  const noQueryResponse = await fetch(searchBase);
  assert.equal(noQueryResponse.status, 400, "空关键词被拒绝且不会触发上游搜索");
  const longQueryResponse = await fetch(searchBase + "?q=" + "a".repeat(101));
  assert.equal(longQueryResponse.status, 400, "过长关键词被拒绝");
  interceptedSkillshSearch = async () => new Response("unavailable", { status: 503 });
  const failedSearchResponse = await fetch(searchBase + "?q=retry");
  assert.equal(failedSearchResponse.status, 502, "上游错误不会透传为成功结果");
  assert.equal((await failedSearchResponse.json()).code, "error.catalog.upstream", "上游失败返回稳定错误码");
  let catalogRequest;
  interceptedCatalog = async (url, options) => {
    catalogRequest = { url: String(url), redirect: options?.redirect };
    return new Response("---\nname: demo\ndescription: Real skill\n---\n\n# Demo\n", { status: 200, headers: { "content-type": "text/markdown" } });
  };
  const catalogDetail = await fetch(api.replace("/repositories", "/catalog/detail"), { method: "POST", headers, body: JSON.stringify({ catalog: "clawhub", owner: "pskoett", slug: "demo" }) });
  assert.equal(catalogDetail.status, 200, "目录详情走本地接口");
  assert.equal((await catalogDetail.json()).data.origin, "pskoett/demo");
  assert.equal(catalogRequest.url, "https://clawhub.ai/api/v1/skills/demo/file?path=SKILL.md&owner=pskoett", "详情只请求这一条 ClawHub 技能文件");
  assert.equal(catalogRequest.redirect, "error");
  const rejectedCatalog = await fetch(api.replace("/repositories", "/catalog/detail"), { method: "POST", headers, body: JSON.stringify({ catalog: "clawhub", owner: "../evil", slug: "demo" }) });
  assert.equal(rejectedCatalog.status, 400, "非法目录标识在请求上游前被拒绝");
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
  assert.equal((await fetch(managerApi + '/delete', { method: 'POST', headers, body: JSON.stringify({ root: 'codex', name: 'http-demo', allowSharedAgent: true }) })).status, 400, '请求参数不能放开其他只读 Agent 目录');
  assert.equal((await post('uninstall', { id, path: 'demo', root: 'dsh' })).status, 400, 'wrong root cannot select a Shared Agent copy');
  const uninstall = await post('uninstall', { id, path: 'demo', root: 'agents' });
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
