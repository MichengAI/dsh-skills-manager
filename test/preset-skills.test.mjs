// 预设模式专属技能（内置创造模式 + 用户新建自定义模式）的发现、详情与管理测试
// 运行：node test/preset-skills.test.mjs

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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

console.log("── 2. 状态快照集成（state）──");

const snapshot = await state({ presetRoots: roots });
const foundReviewRoot = snapshot.roots.find((r) => r.key === "preset-code-review");
ok(!!foundReviewRoot, "state 返回的快照中包含自定义预设来源");
ok(
  foundReviewRoot && foundReviewRoot.skills.some((s) => s.name === "strict-code-review"),
  "自定义预设来源中包含其专属技能 strict-code-review",
);

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
