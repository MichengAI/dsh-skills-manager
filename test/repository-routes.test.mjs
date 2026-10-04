// 通过真实 HTTP 请求验证仓库接口沿用 Host、Origin 与写请求标记校验。
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const temporary = await mkdtemp(join(tmpdir(), "dssm-repo-http-"));
process.env.DSH_HOME = join(temporary, "home");
process.env.USERPROFILE = join(temporary, "user");
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
  for (const action of ["add", "remove", "refresh", "detail", "install", "preview", "update", "rollback"]) {
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
  } finally { clearTimeout(timeout); releaseDownload?.(); await refreshing; interceptedDownload = undefined; }
  assert.equal((await (await fetch(api)).json()).data.repositories.length, 1);
  assert.equal((await fetch(api + "/install", { method: "POST", headers, body: JSON.stringify({ id, path: "../escape" }) })).status, 400);
  assert.equal((await fetch(api + "/remove", { method: "POST", headers, body: JSON.stringify({ id }) })).status, 200);
  assert.equal((await (await fetch(api)).json()).data.repositories.length, 0);
  console.log("仓库 HTTP 接口、HEAD、跨站与写请求保护测试通过");
} finally {
  globalThis.fetch = nativeFetch;
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
