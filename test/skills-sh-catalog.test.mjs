import assert from "node:assert/strict";
import { searchSkillsSh } from "../lib/skills-sh-catalog.js";
import { catalogUrls } from "../lib/catalog-skill.js";

const originalFetch = globalThis.fetch;
try {
  const valid = { source: "Owner_1/repo.name", skillId: "skill-1", name: "Skill" };
  const invalid = ["../repo", "owner/repo/extra", "https://evil.test/repo", " owner/repo", "owner/repo ", "owner/re po", "owner/" + "r".repeat(129)];
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), options };
    return new Response(JSON.stringify({ skills: [valid,
      ...invalid.map(source => ({ ...valid, source })),
      ...["../skill", "skill/name", " skill", "skill ", "%2f", "s".repeat(129)].map(skillId => ({ ...valid, skillId })),
      null, [], {}, { ...valid, id: "duplicate" }, { ...valid, id: "duplicate" },
    ] }));
  };
  const result = await searchSkillsSh(" browser ");
  assert.deepEqual(result.skills.map(({ source, skillId }) => ({ source, skillId })), [valid, valid].map(({ source, skillId }) => ({ source, skillId })), "搜索标识必须与安装 IDENTIFIER 白名单一致，不得修整标识");
  for (const item of result.skills) assert.doesNotThrow(() => catalogUrls({ catalog: "skillsh", ...item }));
  assert.equal(call.url, "https://skills.sh/api/search?q=browser");
  assert.equal(call.options.redirect, "error");
  assert.ok(call.options.signal instanceof AbortSignal);
  for (const query of ["", " ", "q".repeat(101), null]) await assert.rejects(searchSkillsSh(query), error => error.code === "error.catalog.query");
  let pulls = 0, cancelled = false;
  const oversizedStream = new ReadableStream({ pull(controller) { pulls++; if (pulls <= 2) controller.enqueue(new Uint8Array(700_000)); else controller.close(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  globalThis.fetch = async () => new Response(oversizedStream);
  await assert.rejects(searchSkillsSh("browser"), error => error.code === "error.catalog.response" && error.statusCode === 502 && error.message === "skills.sh 搜索响应过大");
  assert.equal(oversizedStream.locked, false, "超限后必须释放读取锁");
  assert.equal(pulls, 2, "搜索必须流式限制字节，而非完整读取后检查");
  assert.equal(cancelled, true);
  for (const body of ["not json", "null", "[]", "{}", '{"skills":null}', '{"skills":{}}']) {
    globalThis.fetch = async () => new Response(body);
    await assert.rejects(searchSkillsSh("browser"), error => error.code === "error.catalog.response" && error.statusCode === 502);
  }
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  await assert.rejects(searchSkillsSh("browser"), error => error.code === "error.catalog.upstream");
  globalThis.fetch = async () => new Response("{}", { headers: { "content-length": "1048577" } });
  await assert.rejects(searchSkillsSh("browser"), error => error.code === "error.catalog.response");
  globalThis.fetch = async () => new Response(JSON.stringify({ skills: Array.from({ length: 110 }, (_, index) => ({ ...valid, id: String(index), installs: index })) }));
  const bounded = await searchSkillsSh("browser");
  assert.equal(bounded.skills.length, 100);
  assert.equal(bounded.skills[99].installs, 99);
  globalThis.fetch = async () => { throw new TypeError("网络不可达"); };
  await assert.rejects(searchSkillsSh("browser"), error => error.code === "error.catalog.upstream" && error.statusCode === 502);
  let cancelAttempts = 0;
  const interruptedStream = new ReadableStream({ start(controller) { controller.error(new Error("private reader failure")); } });
  const getReader = interruptedStream.getReader.bind(interruptedStream);
  interruptedStream.getReader = () => {
    const reader = getReader();
    const cancel = reader.cancel.bind(reader);
    reader.cancel = (...args) => { cancelAttempts++; return cancel(...args); };
    return reader;
  };
  globalThis.fetch = async () => new Response(interruptedStream);
  await assert.rejects(searchSkillsSh("browser"), error => error.code === "error.catalog.response" && error.statusCode === 502 && error.message === "skills.sh 搜索响应无效或读取中断");
  assert.equal(cancelAttempts, 1, "读取中断必须尝试 cancel，即使 cancel 自身拒绝");
  assert.equal(interruptedStream.locked, false, "读取中断必须释放读取锁");
} finally { globalThis.fetch = originalFetch; }
console.log("skills.sh 搜索校验测试通过");
