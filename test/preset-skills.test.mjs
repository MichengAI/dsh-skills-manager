// 预设模式专属技能（内置创造模式 + 用户新建自定义模式）的发现、详情与管理测试
// 运行：node test/preset-skills.test.mjs

import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { createTestFetchBridge } from "./fixtures/test-fetch-server.mjs";

import {
  state,
  skillDetail,
  collectPresetRoots,
} from "../lib/core.js";
import { apply as applyHost } from "../lib/index.js";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error("✗ " + msg);
  }
}
function eq(actual, expected, msg) {
  ok(
    actual === expected,
    msg +
      " (got " +
      JSON.stringify(actual) +
      ", want " +
      JSON.stringify(expected) +
      ")",
  );
}

const tmp = await mkdtemp(join(tmpdir(), "dssm-preset-test-"));
const customReviewSkillsDir = join(tmp, "custom-review-skills");
await mkdir(join(customReviewSkillsDir, "strict-code-review"), { recursive: true });
await writeFile(
  join(customReviewSkillsDir, "strict-code-review", "SKILL.md"),
  `---
name: strict-code-review
description: 针对代码提交执行严格的静态审查与缺陷分析。
---
这是代码审查模式专属技能的正文 instructions。`,
  "utf8",
);

console.log("── 1. 宿主预设来源提取（collectPresetRoots）──");

// 模拟宿主 AgentPresetRegistry 服务
const mockAgentPresets = {
  definitions: new Map([
    [
      "standard",
      {
        config: {
          id: "standard",
          name: "标准模式",
          plugins: [
            { id: "tool-bash", name: "@deepseek-ai/dsh-tool-bash" },
            { id: "skill-filesystem", name: "@deepseek-ai/dsh-skill-filesystem" },
          ],
        },
      },
    ],
    [
      "cordis",
      {
        config: {
          id: "cordis",
          name: "创造模式",
          plugins: [
            {
              id: "skill-filesystem",
              name: "@deepseek-ai/dsh-skill-filesystem",
              config: {
                customSkillDirs: ["@deepseek-ai/dsh-agent-preset/skills"],
              },
            },
          ],
        },
      },
    ],
    [
      "code-review",
      {
        config: {
          id: "code-review",
          name: "代码审查模式",
          plugins: [
            {
              id: "skill-filesystem",
              name: "@deepseek-ai/dsh-skill-filesystem",
              config: {
                customSkillDirs: [customReviewSkillsDir],
              },
            },
          ],
        },
      },
    ],
  ]),
  async list() {
    return [
      { id: "standard", name: "标准模式" },
      { id: "cordis", name: "创造模式" },
      { id: "code-review", name: "代码审查模式" },
    ];
  },
};

const mockCtx = {
  get(name) {
    if (name === "agentPresets") return mockAgentPresets;
    return undefined;
  },
};

const roots = await collectPresetRoots(mockCtx);
ok(Array.isArray(roots), "collectPresetRoots 返回数组");
eq(roots.length, 2, "只为包含专属技能目录的预设生成根（cordis 与 code-review，排除 standard）");

const cordisRoot = roots.find((r) => r.key === "preset-cordis");
ok(!!cordisRoot, "发现内置 cordis 预设根");
eq(cordisRoot.kind, "preset", "根类型为 preset");
eq(cordisRoot.mutable, false, "预设根不可写");
eq(cordisRoot.native, true, "内置 cordis 模式 native 为 true");
ok(cordisRoot.label.includes("创造模式") || cordisRoot.label.includes("cordis"), "标签包含模式名称");

const reviewRoot = roots.find((r) => r.key === "preset-code-review");
ok(!!reviewRoot, "发现自定义 code-review 预设根");
eq(reviewRoot.kind, "preset", "根类型为 preset");
eq(reviewRoot.mutable, false, "自定义预设根同样为只读");
eq(reviewRoot.native, false, "自定义模式 native 为 false");
eq(reviewRoot.path, customReviewSkillsDir, "路径指向自定义模式配置的 customSkillDirs");
ok(reviewRoot.label.includes("代码审查模式"), "标签包含自定义模式名称");

// 平滑降级测试：无 agentPresets 时安全返回空数组
const emptyRoots = await collectPresetRoots({});
ok(Array.isArray(emptyRoots) && emptyRoots.length === 0, "宿主无 agentPresets 服务时平滑降级返回空数组");

console.log("── 2. 状态快照集成（state）与排序位置 ──");

const snapshot = await state({ presetRoots: roots });
const foundReviewRoot = snapshot.roots.find((r) => r.key === "preset-code-review");
ok(!!foundReviewRoot, "state 返回的快照中包含自定义预设来源");
ok(
  foundReviewRoot && foundReviewRoot.skills.some((s) => s.name === "strict-code-review"),
  "自定义预设来源中包含其专属技能 strict-code-review",
);

const dshIndex = snapshot.roots.findIndex((r) => r.key === "dsh");
const agentsIndex = snapshot.roots.findIndex((r) => r.key === "agents");
const cordisIndex = snapshot.roots.findIndex((r) => r.key === "preset-cordis");
const reviewIndex = snapshot.roots.findIndex((r) => r.key === "preset-code-review");
ok(cordisIndex > dshIndex && cordisIndex > agentsIndex, "预设来源排在常规 DSH 与公共 Agent 之后（正常来源最后面）");
ok(reviewIndex > dshIndex && reviewIndex > agentsIndex, "自定义预设来源排在常规 DSH 与公共 Agent 之后（正常来源最后面）");

console.log("── 2.1 客户端 rootDisplayName 国际化（i18n）测试 ──");
const { stripTypeScriptTypes } = await import("node:module");
const clientSource = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");
const dictMatch = clientSource.match(/var DICT\s*=\s*(\{[\s\S]*?\n\s{4}\});/);
ok(dictMatch, "DICT 定义存在");
const DICT = new Function(`return ${dictMatch[1]};`)();

const fnMatch = clientSource.match(/function rootDisplayName\s*\([\s\S]*?\n\s{4}\}/);
ok(fnMatch, "rootDisplayName 函数存在");
const strippedJs = stripTypeScriptTypes(fnMatch[0]);
const translateOrFallback = (t, key, fallback) => {
  const val = t(key);
  return typeof val === "string" && val !== key ? val : fallback;
};
const rootDisplayName = new Function("translateOrFallback", `return ${strippedJs}`)(translateOrFallback);

function translateMock(locale, key, params) {
  let val = DICT[locale]?.[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) val = val.replace(`{${k}}`, v);
  }
  return val;
}
eq(rootDisplayName((k, p) => translateMock("zh", k, p), cordisRoot), "预设: 创造模式", "中文下正确渲染「预设: 创造模式」");
eq(rootDisplayName((k, p) => translateMock("en", k, p), cordisRoot), "Preset: Creator Mode", "英文下正确渲染「Preset: Creator Mode」");
eq(rootDisplayName((k, p) => translateMock("zh", k, p), reviewRoot), "预设: 代码审查模式", "自定义模式中文下正确保留自定义名");
eq(rootDisplayName((k, p) => translateMock("en", k, p), reviewRoot), "Preset: 代码审查模式", "自定义模式英文下前缀本地化");

console.log("── 3. 技能详情读取（skillDetail）──");

const detail = await skillDetail("preset-code-review", "strict-code-review", { presetRoots: roots });
ok(detail.ok !== false, "成功读取自定义预设技能详情");
eq(detail.name, "strict-code-review", "技能名称匹配");
ok(detail.description.includes("严格的静态审查"), "读取到 frontmatter 中的描述");
ok(detail.body.includes("代码审查模式专属技能的正文"), "读取到正文内容");

console.log("── 4. 端到端 HTTP 路由测试 ──");

const { connection, handler } = createTestFetchBridge();
const emitted = [];
applyHost({
  connection,
  skills: {
    registerProvider() {
      return () => {};
    },
  },
  tools: {
    register() {
      return () => {};
    },
  },
  effect(fn) {
    return fn();
  },
  emit(...args) {
    emitted.push(args);
  },
  get(name) {
    if (name === "agentPresets") return mockAgentPresets;
    return undefined;
  },
});

const server = createServer(handler);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const api = `http://127.0.0.1:${port}/api/michengai/dsh-skills-manager`;

const stateRes = await fetch(`${api}/state`, {
  headers: { host: `127.0.0.1:${port}` },
});
eq(stateRes.status, 200, "GET /state 返回 200");
const statePayload = await stateRes.json();
ok(statePayload.ok === true, "GET /state payload.ok === true");
const httpReviewRoot = statePayload.data.roots.find((r) => r.key === "preset-code-review");
ok(!!httpReviewRoot, "HTTP 状态接口返回自定义预设根");
ok(
  httpReviewRoot && httpReviewRoot.skills.some((s) => s.name === "strict-code-review"),
  "HTTP 状态接口中包含自定义预设的专属技能",
);

// 详情接口
const detailRes = await fetch(`${api}/detail`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({ root: "preset-code-review", name: "strict-code-review" }),
});
eq(detailRes.status, 200, "POST /detail 返回 200");
const detailPayload = await detailRes.json();
ok(detailPayload.ok === true, "POST /detail payload.ok === true");
eq(detailPayload.data.name, "strict-code-review", "POST /detail 成功获取到技能名称");

// 停用接口：允许停用，不改动源文件，记录在本地状态
const disableRes = await fetch(`${api}/disable`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({ root: "preset-code-review", name: "strict-code-review" }),
});
eq(disableRes.status, 200, "POST /disable 返回 200");
const disablePayload = await disableRes.json();
ok(disablePayload.ok === true && disablePayload.data.enabled === false, "预设专属技能可被本地停用");

// 重新获取状态，验证 enabled 为 false
const stateRes2 = await fetch(`${api}/state`, {
  headers: { host: `127.0.0.1:${port}` },
});
const statePayload2 = await stateRes2.json();
const disabledSkill = statePayload2.data.roots
  .find((r) => r.key === "preset-code-review")
  ?.skills.find((s) => s.name === "strict-code-review");
ok(disabledSkill && disabledSkill.enabled === false, "状态快照中该预设技能已显示为停用");

server.close();
await rm(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
