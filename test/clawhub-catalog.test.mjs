import assert from "node:assert/strict";
import * as module from "../lib/clawhub-catalog.js";
assert.equal(typeof module.listClawHub, "function", "必须提供 ClawHub 榜单代理");
const { listClawHub } = module;
let call;
const item = { ownerHandle: "pskoett", slug: "self-improving-agent", displayName: "self-improving agent", summary: "Captures learnings", stats: { downloads: 484721, installs: 18487, stars: 3998 } };
const cursor = '{"v":1,"index":"by_active_stats_downloads","key":[1,"id"]}';
const page = await listClawHub({ limit: "10", cursor, sort: "downloads" }, async (url, options) => {
  call = { url: String(url), options };
  return new Response(JSON.stringify({ items: [item], nextCursor: cursor }));
});
assert.deepEqual(page, { items: [item], nextCursor: cursor });
const url = new URL(call.url);
assert.equal(url.origin + url.pathname, "https://clawhub.ai/api/v1/skills");
assert.equal(url.searchParams.get("limit"), "10");
assert.equal(url.searchParams.get("sort"), "downloads");
assert.equal(url.searchParams.get("cursor"), cursor);
assert.equal(call.options.redirect, "error");
assert.ok(call.options.signal instanceof AbortSignal);
let attempted = 0;
const noFetch = async () => { attempted++; return new Response('{"items":[]}'); };
for (const options of [null, [], { limit: 11 }, { limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: "1e1" }, { limit: " 10" }, { limit: true }, { limit: null }, { limit: {} }, { cursor: "x".repeat(4097) }, { cursor: 1 }, { cursor: "" }, { sort: "https://evil.test" }, { sort: "downloads&limit=100" }, { sort: null }]) {
  await assert.rejects(listClawHub(options, noFetch), error => error.statusCode === 400 && error.code === "error.catalog.query", `非法榜单参数 ${JSON.stringify(options)} 必须拒绝`);
}
assert.equal(attempted, 0, "参数校验必须发生在网络调用前");
assert.equal(typeof module.searchClawHub, "function", "必须提供 ClawHub 搜索代理");
const { searchClawHub } = module;
const searchItem = { source: "clawhub", id: "clawhub:kd76yx34hfyzj8apcshzv05jjh836dz0", owner: { handle: "gaxxx" }, slug: "bsession", displayName: "browser", summary: "Browser automation", downloads: 2856, native: { skill: { stats: { downloads: 2856, installs: 57, stars: 1 } } } };
const search = await searchClawHub(" browser ", { limit: "100" }, async (url, options) => {
  call = { url: String(url), options };
  return new Response(JSON.stringify({ results: [searchItem, null, { ...searchItem, source: "github" }, { ...searchItem, slug: "../evil" }] }));
});
assert.deepEqual(search, { results: [{ source: "clawhub", id: searchItem.id, ownerHandle: "gaxxx", slug: "bsession", displayName: "browser", summary: "Browser automation", downloads: 2856, stats: { downloads: 2856, installs: 57, stars: 1 } }] }, "真实 native.skill.stats 必须映射为 UI 解析的 stats");
assert.equal(call.url, "https://clawhub.ai/api/v1/search?q=browser&limit=100");
assert.equal(call.options.redirect, "error");
assert.ok(call.options.signal instanceof AbortSignal);
for (const query of ["", " ", "x".repeat(101), null, {}]) await assert.rejects(searchClawHub(query, {}, noFetch), error => error.code === "error.catalog.query");
for (const options of [null, [], { limit: 101 }, { limit: 0 }, { limit: "https://evil.test" }]) await assert.rejects(searchClawHub("browser", options, noFetch), error => error.code === "error.catalog.query");
assert.equal(attempted, 0);
for (const [invoke, key] of [
  [fetchImpl => listClawHub({}, fetchImpl), "items"],
  [fetchImpl => searchClawHub("browser", {}, fetchImpl), "results"],
]) {
  for (const body of ["not json", "null", "[]", "1", "{}", JSON.stringify({ [key]: null }), JSON.stringify({ [key]: {} })]) {
    await assert.rejects(invoke(async () => new Response(body)), error => error.code === "error.catalog.response" && error.statusCode === 502, "响应结构错误必须返回统一诊断");
  }
  await assert.rejects(invoke(async () => new Response("{}", { status: 503 })), error => error.code === "error.catalog.upstream");
  await assert.rejects(invoke(async () => { throw new TypeError("redirect blocked"); }), error => error.code === "error.catalog.upstream");
  let pulls = 0, cancelled = false;
  const oversizedStream = new ReadableStream({ pull(controller) { pulls++; if (pulls <= 2) controller.enqueue(new Uint8Array(700_000)); else controller.close(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(invoke(async () => new Response(oversizedStream)), error => error.code === "error.catalog.response" && error.statusCode === 502 && error.message === "ClawHub 响应过大");
  assert.equal(oversizedStream.locked, false, "超限后必须释放读取锁");
  assert.equal(pulls, 2); assert.equal(cancelled, true);
  let cancelAttempts = 0;
  const interruptedStream = new ReadableStream({ start(controller) { controller.error(new Error("private reader failure")); } });
  const getReader = interruptedStream.getReader.bind(interruptedStream);
  interruptedStream.getReader = () => {
    const reader = getReader();
    const cancel = reader.cancel.bind(reader);
    reader.cancel = (...args) => { cancelAttempts++; return cancel(...args); };
    return reader;
  };
  await assert.rejects(invoke(async () => new Response(interruptedStream)), error => error.code === "error.catalog.response" && error.statusCode === 502 && error.message === "ClawHub 响应无效或过大");
  assert.equal(cancelAttempts, 1, "读取中断必须尝试 cancel，即使 cancel 自身拒绝");
  assert.equal(interruptedStream.locked, false, "读取中断必须释放读取锁");
  await assert.rejects(invoke(async () => new Response("{}", { headers: { "content-length": "1048577" } })), error => error.code === "error.catalog.response");
}
for (const nextCursor of [1, {}, "x".repeat(4097)]) await assert.rejects(listClawHub({}, async () => new Response(JSON.stringify({ items: [], nextCursor }))), error => error.code === "error.catalog.response");
const filtered = await listClawHub({ limit: 1 }, async () => new Response(JSON.stringify({ items: [null, [], { ...item, ownerHandle: "../owner" }, { ...item, extra: "not exposed" }, item], nextCursor: null })));
assert.deepEqual(filtered, { items: [item], nextCursor: null }, "榜单过滤无效元素，仅返回校验字段并限制数量");
const cappedSearch = await searchClawHub("browser", { limit: 100 }, async () => new Response(JSON.stringify({ results: Array.from({ length: 110 }, () => searchItem) })));
assert.equal(cappedSearch.results.length, 100);
await listClawHub({ limit: 10, url: "https://evil.test", hostname: "evil.test" }, async (url) => {
  assert.equal(new URL(url).origin + new URL(url).pathname, "https://clawhub.ai/api/v1/skills");
  assert.equal(new URL(url).searchParams.has("url"), false);
  return new Response('{"items":[]}');
});
await searchClawHub("https://evil.test/?limit=1000", { limit: 1, url: "https://evil.test" }, async (url) => {
  assert.equal(new URL(url).origin + new URL(url).pathname, "https://clawhub.ai/api/v1/search");
  assert.equal(new URL(url).searchParams.get("q"), "https://evil.test/?limit=1000");
  assert.equal(new URL(url).searchParams.get("limit"), "1");
  return new Response('{"results":[]}');
});
console.log("ClawHub 本地代理测试通过");
