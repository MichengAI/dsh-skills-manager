import assert from "node:assert/strict";
import { catalogUrls, readCatalogSkill, loadCatalogPackage } from "../lib/catalog-skill.js";

const clawhub = catalogUrls({ catalog: "clawhub", owner: "pskoett", slug: "self-improving-agent" });
assert.equal(clawhub.detail, "https://clawhub.ai/api/v1/skills/self-improving-agent/file?path=SKILL.md&owner=pskoett");
assert.equal(clawhub.download, "https://clawhub.ai/api/v1/download?slug=self-improving-agent&owner=pskoett");
assert.equal(clawhub.origin, "pskoett/self-improving-agent");

const skillsh = catalogUrls({ catalog: "skillsh", source: "vercel-labs/agent-browser", skillId: "agent-browser" });
assert.equal(skillsh.download, "https://skills.sh/api/download/vercel-labs/agent-browser/agent-browser");
assert.equal(skillsh.origin, "vercel-labs/agent-browser/agent-browser");

for (const input of [
  { catalog: "clawhub", owner: "../pskoett", slug: "skill" },
  { catalog: "clawhub", owner: "pskoett", slug: "skill/../../etc" },
  { catalog: "skillsh", source: "https://evil.example/repo", skillId: "skill" },
  { catalog: "other", owner: "a", slug: "b" },
]) {
  assert.throws(() => catalogUrls(input), (error) => error.code === "error.catalog.identity", "拒绝可构造任意地址的目录标识");
}

const calls = [];
const fetchImpl = async (url, options) => {
  calls.push({ url: String(url), redirect: options?.redirect });
  if (String(url).includes("/file?")) return new Response("---\nname: demo\ndescription: \"A real skill\"\n---\n\n# Demo\n", { status: 200, headers: { "content-type": "text/markdown" } });
  if (String(url).includes("skills.sh/api/download/")) return new Response(JSON.stringify({ files: [{ path: "SKILL.md", contents: "---\nname: browser\ndescription: Browse\n---\n\nUse it.\n" }, { path: "../outside.md", contents: "no" }] }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("PK", { status: 200, headers: { "content-type": "application/zip" } });
};

const detail = await readCatalogSkill({ catalog: "clawhub", owner: "pskoett", slug: "demo" }, fetchImpl);
assert.equal(detail.name, "demo");
assert.equal(detail.description, "A real skill");
assert.match(detail.body, /^# Demo/m);
assert.equal(calls[0].redirect, "error", "目录读取不跟随重定向");
assert.equal(calls[0].url, "https://clawhub.ai/api/v1/skills/demo/file?path=SKILL.md&owner=pskoett");

await assert.rejects(loadCatalogPackage({ catalog: "skillsh", source: "owner/repo", skillId: "skill" }, fetchImpl), (error) => error.code === "error.catalog.response", "skills.sh 文件路径不能穿越安装目录");
const folded = await readCatalogSkill({ catalog: "skillsh", source: "owner/repo", skillId: "ponytail" }, async () => new Response(JSON.stringify({ files: [{ path: "SKILL.md", contents: "---\nname: ponytail\ndescription: >\n  Lazy senior dev mode: the smallest change.\n---\n\n# Ponytail\n" }] }), { status: 200, headers: { "content-type": "application/json" } }));
assert.equal(folded.description, "Lazy senior dev mode: the smallest change.", "YAML 折叠标记 > 不能当成简介");
const foldedDash = await readCatalogSkill({ catalog: "skillsh", source: "owner/repo", skillId: "ponytail-dash" }, async () => new Response(JSON.stringify({ files: [{ path: "SKILL.md", contents: "---\nname: ponytail\ndescription: >-\n  Lazy senior dev mode: dash variant.\n---\n\n# Ponytail\n" }] }), { status: 200, headers: { "content-type": "application/json" } }));
assert.equal(foldedDash.description, "Lazy senior dev mode: dash variant.", "YAML 折叠标记 >- 不能当成简介");

const skillshIdentity = { catalog: "skillsh", source: "owner/repo", skillId: "skill" };
for (const operation of [readCatalogSkill, loadCatalogPackage]) {
  await assert.rejects(operation(skillshIdentity, async () => new Response("not json")),
    error => error.code === "error.catalog.response" && error.statusCode === 502,
    "下载 JSON 解析失败必须返回统一诊断，不能暴露 SyntaxError");
}

for (const payload of [null, [], 1, "text", {}, { files: null }, { files: {} }, { files: [] }, { files: [null] }, { files: ["text"] }, { files: [{ path: "SKILL.md", contents: 1 }] }]) {
  for (const operation of [readCatalogSkill, loadCatalogPackage]) {
    await assert.rejects(operation(skillshIdentity, async () => new Response(JSON.stringify(payload))),
      error => error.code === "error.catalog.response" && error.statusCode === 502,
      `无效响应结构 ${JSON.stringify(payload)} 不得泄漏 TypeError`);
  }
}

for (const [operation, input, chunkSize] of [
  [readCatalogSkill, { catalog: "clawhub", owner: "owner", slug: "skill" }, 700_000],
  [loadCatalogPackage, { catalog: "clawhub", owner: "owner", slug: "skill" }, 5_000_000],
]) {
  let pulls = 0, cancelled = false;
  const stream = new ReadableStream({ pull(controller) { pulls++; if (pulls <= 2) controller.enqueue(new Uint8Array(chunkSize)); else controller.close(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(operation(input, async () => new Response(stream)), error => error.code === "error.catalog.response" && error.statusCode === 502 && error.message === "目录技能内容过大");
  assert.equal(stream.locked, false, "超限后必须释放读取锁");
  assert.equal(pulls, 2, "无 content-length 的超限流必须立即停止读取");
  assert.equal(cancelled, true, "超限流必须取消");
}
const skillDoc = "---\nname: example\ndescription: Example\n---\n\nUse it.\n";
const successfulPackage = await loadCatalogPackage(skillshIdentity, async () => new Response(JSON.stringify({ files: [{ path: "SKILL.md", contents: skillDoc }, { path: "scripts/demo.txt", contents: "示例" }] })));
assert.equal(successfulPackage.name, "example");
assert.equal(Buffer.from(successfulPackage.entries[1].data, "base64").toString("utf8"), "示例");
for (const operation of [readCatalogSkill, loadCatalogPackage]) {
  await assert.rejects(operation(skillshIdentity, async () => new Response(JSON.stringify({ files: Array.from({ length: 101 }, () => ({ path: "SKILL.md", contents: skillDoc })) }))), error => error.code === "error.catalog.response");
  await assert.rejects(operation(skillshIdentity, async () => new Response("{}", { headers: { "content-length": "8388609" } })), error => error.code === "error.catalog.response");
}
for (const operation of [readCatalogSkill, loadCatalogPackage]) {
  await assert.rejects(operation(skillshIdentity, async () => { throw new TypeError("网络不可达"); }), error => error.code === "error.catalog.upstream" && error.statusCode === 502, "网络异常也必须返回目录错误码");
}
for (const operation of [readCatalogSkill, loadCatalogPackage]) {
  let cancelAttempts = 0;
  const stream = new ReadableStream({ start(controller) { controller.error(new Error("private reader failure")); } });
  const getReader = stream.getReader.bind(stream);
  stream.getReader = () => {
    const reader = getReader();
    const cancel = reader.cancel.bind(reader);
    reader.cancel = (...args) => { cancelAttempts++; return cancel(...args); };
    return reader;
  };
  await assert.rejects(operation(skillshIdentity, async () => new Response(stream)), error => error.code === "error.catalog.response" && error.statusCode === 502 && error.message === "目录技能响应无效或读取中断", "真实 reader 异常不得泄漏内部信息");
  assert.equal(cancelAttempts, 1, "读取中断必须尝试 cancel，即使 cancel 自身拒绝");
  assert.equal(stream.locked, false, "读取中断必须释放读取锁");
}
console.log("目录技能详情与安装包地址测试通过");
