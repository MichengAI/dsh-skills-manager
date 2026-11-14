import assert from "node:assert/strict";
import { catalogUrls, readCatalogSkill, loadCatalogPackage } from "../lib/catalog-skill.js";
import { estimateTokens, truncateCatalogDescription } from "../lib/token-count.js";

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
assert.equal(detail.descriptionTokens, estimateTokens("A real skill"), "目录详情返回简介 token 估算");
assert.equal(detail.bodyTokens, estimateTokens(detail.body), "目录详情返回正文 token 估算");
assert.equal(calls[0].redirect, "error", "目录读取不跟随重定向");
assert.equal(calls[0].url, "https://clawhub.ai/api/v1/skills/demo/file?path=SKILL.md&owner=pskoett");

// 验证超长简介目录详情真实接线 truncateCatalogDescription
const longDescCatalog = "long catalog description words ".repeat(30) + "end";
const catalogWithLongDesc = await readCatalogSkill(
  { catalog: "clawhub", owner: "pskoett", slug: "long-skill" },
  async () => new Response(`---\nname: long-skill\ndescription: ${longDescCatalog}\n---\n\n# Long\n`, { status: 200, headers: { "content-type": "text/markdown" } }),
);
assert.equal(
  catalogWithLongDesc.descriptionTokens,
  estimateTokens(truncateCatalogDescription(longDescCatalog)),
  "目录详情必须真实接线 truncateCatalogDescription 进行 500 字符截断估算",
);
assert.ok(
  catalogWithLongDesc.descriptionTokens < estimateTokens(longDescCatalog),
  "目录详情截断 token 必须严格小于未截断值，防变异接线脱落",
);

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
  [loadCatalogPackage, { catalog: "clawhub", owner: "owner", slug: "skill" }, 20_000_000],
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
const multiFiles = Array.from({ length: 200 }, (_, i) => ({ path: i === 0 ? "SKILL.md" : `refs/file-${i}.txt`, contents: i === 0 ? skillDoc : `content-${i}` }));
const complexPackage = await loadCatalogPackage(skillshIdentity, async () => new Response(JSON.stringify({ files: multiFiles })));
assert.equal(complexPackage.name, "example", "包含 200 个文件的复合技能必须能成功解析并返回包名");
assert.equal(complexPackage.entries.length, 200, "包含 200 个文件的复合技能必须保留全部文件");

const complexDetail = await readCatalogSkill(skillshIdentity, async () => new Response(JSON.stringify({ files: multiFiles })));
assert.equal(complexDetail.name, "example", "包含 200 个文件的技能详情必须能正常读取");

// 构造 2.5 MiB 的 skills.sh 技能响应（对齐 ppt-master 真实规模），readCatalogSkill 必须能成功解析
const largeContent = "x".repeat(2_500_000);
const largeDetail = await readCatalogSkill(skillshIdentity, async () => new Response(JSON.stringify({ files: [{ path: "SKILL.md", contents: skillDoc }, { path: "large.txt", contents: largeContent }] })));
assert.equal(largeDetail.name, "example", "大于 1MB 的 skills.sh 详情必须能成功读取");

// 中断信号测试：传入被 abort 的 signal 时必须立即抛出取消错误
const abortedController = new AbortController();
abortedController.abort();
await assert.rejects(
  loadCatalogPackage(skillshIdentity, async () => new Response(JSON.stringify({ files: [{ path: "SKILL.md", contents: skillDoc }] })), abortedController.signal),
  error => error.code === "error.catalog.cancelled" && error.statusCode === 499,
  "传入中断信号必须触发取消并返回 cancelled 错误码"
);

// 中途取消测试：流式读取过程中触发 abort，绝不退化为 500
const inflightController = new AbortController();
let streamPulls = 0;
const inflightStream = new ReadableStream({
  pull(controller) {
    streamPulls++;
    if (streamPulls === 1) {
      controller.enqueue(new TextEncoder().encode('{"files":[{"path":"SKILL.md","contents":"'));
      inflightController.abort();
    } else {
      controller.close();
    }
  }
});
await assert.rejects(
  loadCatalogPackage(skillshIdentity, async () => new Response(inflightStream), inflightController.signal),
  error => error.code === "error.catalog.cancelled" && error.statusCode === 499,
  "流式读取中途触发中断必须返回 499 和 error.catalog.cancelled 业务错误码"
);
assert.equal(inflightStream.locked, false, "中途取消后必须释放读取锁");

// 模拟真实网络流在 reader.read() 挂起等待下一个分块时被外部 signal 中断
const readerAbortController = new AbortController();
const delayedStream = new ReadableStream({
  pull(controller) {
    return new Promise(resolve => {
      readerAbortController.signal.addEventListener("abort", () => {
        controller.error(new Error("aborted"));
        resolve();
      });
      setTimeout(() => readerAbortController.abort(), 10);
    });
  }
});
await assert.rejects(
  loadCatalogPackage(skillshIdentity, async () => new Response(delayedStream), readerAbortController.signal),
  error => error.code === "error.catalog.cancelled" && error.statusCode === 499,
  "reader.read 挂起等待时外部触发 abort 必须返回 499 和 cancelled 错误码"
);

// 验证内部超时产生的 AbortError 绝不被误判为 499 用户取消
const timeoutAbortError = new Error("The operation was aborted due to timeout");
timeoutAbortError.name = "AbortError";
const timeoutStream = new ReadableStream({
  pull() {
    throw timeoutAbortError;
  }
});
await assert.rejects(
  loadCatalogPackage(skillshIdentity, async () => new Response(timeoutStream)),
  error => error.code === "error.catalog.response" && error.statusCode === 502,
  "内部超时打断正文读取绝不能被误判为 499 用户取消，必须返回 502 错误"
);

for (const operation of [readCatalogSkill, loadCatalogPackage]) {
  await assert.rejects(operation(skillshIdentity, async () => new Response(JSON.stringify({ files: Array.from({ length: 1001 }, () => ({ path: "SKILL.md", contents: skillDoc })) }))), error => error.code === "error.catalog.response", "超过 1000 个文件必须拦截");
  await assert.rejects(operation(skillshIdentity, async () => new Response("{}", { headers: { "content-length": "33554433" } })), error => error.code === "error.catalog.response");
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
