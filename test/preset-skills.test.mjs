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
process.env.DSH_HOME = tmp;

const mockCordisDir = join(tmp, "mock-cordis-skills");
await mkdir(join(mockCordisDir, "cordis-plugin-development"), { recursive: true });
await writeFile(
  join(mockCordisDir, "cordis-plugin-development", "SKILL.md"),
  `---
name: cordis-plugin-development
description: 创造模式内置专属技能，用于编写和扩展 DSH 插件。
---
这是创造模式插件开发的 instructions。`,
  "utf8",
);

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

const roots = await collectPresetRoots(mockCtx, { cordisSkillsDir: mockCordisDir });
ok(Array.isArray(roots), "collectPresetRoots 返回数组");
eq(roots.length, 2, "只为包含专属技能目录的预设生成根（cordis 与 code-review，排除 standard）");

const cordisRoot = roots.find((r) => r.key === "preset-cordis");
ok(!!cordisRoot, "发现内置 cordis 预设根");
eq(cordisRoot.kind, "preset", "根类型为 preset");
eq(cordisRoot.mutable, false, "预设根不可写");
eq(cordisRoot.toggleable, false, "B方案：内置预设根只读，不提供假开关");
eq(cordisRoot.rank, 10000, "预设根优先级为 10000 稳定沉底");
eq(cordisRoot.native, true, "内置 cordis 模式 native 为 true");
ok(cordisRoot.label.includes("创造模式") || cordisRoot.label.includes("cordis"), "标签包含模式名称");

const reviewRoot = roots.find((r) => r.key === "preset-code-review");
ok(!!reviewRoot, "发现自定义 code-review 预设根");
eq(reviewRoot.kind, "preset", "根类型为 preset");
eq(reviewRoot.mutable, true, "自定义预设根支持管理与写入（mutable: true）");
eq(reviewRoot.toggleable, false, "B方案：自定义预设根只读，不提供假开关");
eq(reviewRoot.rank, 10000, "自定义预设根优先级为 10000 稳定沉底");
eq(reviewRoot.native, false, "自定义模式 native 为 false");
eq(reviewRoot.path, customReviewSkillsDir, "路径指向自定义模式配置的 customSkillDirs");
ok(reviewRoot.label.includes("代码审查模式"), "标签包含自定义模式名称");

// P2-3 覆盖：当 definitions 为 undefined 时，走 list() + readDocument() 分支
const mockFallbackRegistry = {
  definitions: undefined,
  async list() {
    return [{ id: "yaml-mode", name: "YAML 预设模式" }];
  },
  async readDocument(id) {
    return {
      content: `
id: ${id}
name: YAML 预设模式
plugins:
  - id: skill-filesystem
    customSkillDirs:
      - "${customReviewSkillsDir}"
`,
    };
  },
};
const fallbackRoots = await collectPresetRoots({ agentPresets: mockFallbackRegistry });
ok(fallbackRoots.some((r) => r.key === "preset-yaml-mode"), "通过 list + readDocument 成功解析 YAML 块状 customSkillDirs");

// 覆盖 extractDirsFromYaml 行内数组分支 customSkillDirs: ["dir1", "dir2"]
const mockInlineYamlRegistry = {
  definitions: undefined,
  async list() {
    return [{ id: "inline-yaml-mode", name: "Inline YAML 预设模式" }];
  },
  async readDocument(id) {
    return {
      content: `
id: ${id}
name: Inline YAML 预设模式
plugins:
  - id: skill-filesystem
    customSkillDirs: ["${customReviewSkillsDir}"]
`,
    };
  },
};
const inlineRoots = await collectPresetRoots({ agentPresets: mockInlineYamlRegistry });
ok(inlineRoots.some((r) => r.key === "preset-inline-yaml-mode"), "成功解析 YAML 行内数组格式的 customSkillDirs");

// 覆盖 P2-B inspectCompositions 宿主基准路径 baseUrl 解析通道
const mockCompositionsRegistry = {
  definitions: new Map(),
  async inspectCompositions() {
    return {
      modules: [{ baseUrl: import.meta.url }],
    };
  },
};
const compRoots = await collectPresetRoots({ agentPresets: mockCompositionsRegistry });
ok(Array.isArray(compRoots), "通过 inspectCompositions baseUrl 探测通道运行正常");

// 平滑降级测试：无 agentPresets 且无任何 cordis 时安全返回空数组
const emptyRoots = await collectPresetRoots({});
ok(Array.isArray(emptyRoots), "宿主无 agentPresets 服务时平滑降级返回数组");

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

console.log("── 2.05 P2-A 只读来源对历史残留脏数据的防御测试 ──");
const stateDir = join(tmp, "skills-manager");
await mkdir(stateDir, { recursive: true });
await writeFile(
  join(stateDir, "state.json"),
  JSON.stringify({
    sources: { "preset-cordis": false, "preset-code-review": false },
    disabledSkills: {
      "preset-cordis": ["cordis-plugin-development"],
      "preset-code-review": ["strict-code-review"],
    },
    enabledSkills: {},
  }),
  "utf8",
);
const dirtySnapshot = await state({ presetRoots: roots });
const dirtyCordisRoot = dirtySnapshot.roots.find((r) => r.key === "preset-cordis");
const dirtyReviewRoot = dirtySnapshot.roots.find((r) => r.key === "preset-code-review");
eq(dirtyCordisRoot?.enabled, true, "哪怕历史配置残留 false，只读 cordis 来源恒为 enabled: true");
eq(dirtyReviewRoot?.enabled, true, "哪怕历史配置残留 false，只读 review 来源恒为 enabled: true");
const dirtyCordisSkill = dirtyCordisRoot?.skills.find((s) => s.name === "cordis-plugin-development");
eq(dirtyCordisSkill?.enabled, true, "只读预设技能不读取 disabledSkills 残留，恒为 enabled: true");
const dirtyDetail = await skillDetail("preset-cordis", "cordis-plugin-development", { presetRoots: roots });
eq(dirtyDetail.loadable, true, "skillDetail 读取只读预设详情成功且 loadable: true");
eq(dirtyDetail.sourceReadOnly, true, "只读预设来源详情标记 sourceReadOnly: true");
// 清理测试用的脏 state.json，避免影响后续测试
await rm(stateDir, { recursive: true, force: true });

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
const addr = server.address();
const port = addr && typeof addr === "object" ? addr.port : 0;
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

// B方案只读测试：只读预设来源拒绝写入停用状态，防止假开关误导
const disableRes = await fetch(`${api}/disable`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({ root: "preset-code-review", name: "strict-code-review" }),
});
const disablePayload = await disableRes.json();
ok(disablePayload.ok === false, "B方案：只读预设来源发起停用请求被安全拒绝");
eq(disablePayload.code, "error.root.readonly", "精准返回只读错误码 error.root.readonly");

// 整源停用接口同样拒绝只读预设来源
const sourceDisableRes = await fetch(`${api}/source-disable`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({ root: "preset-code-review" }),
});
const sourceDisablePayload = await sourceDisableRes.json();
ok(sourceDisablePayload.ok === false, "B方案：只读预设来源发起整源停用被安全拒绝");

console.log("── 5. 自定义预设模式专属技能管理能力测试（增删改与目标选择）──");

// 5.1 目标选择器（DestinationPicker）契约
const { destinationPayload, destinationReady } = await import("../lib/destination-picker.js");
const presetValue = { scope: "preset", location: "dsh", workspace: "", presetKey: "preset-code-review" };
const presetPl = destinationPayload(presetValue);
eq(presetPl.root, "preset-code-review", "destinationPayload 在 scope=preset 时正确带出 presetKey");
const testPresetDests = [{ key: "preset-code-review", name: "代码审查模式", path: customReviewSkillsDir, available: true }];
ok(destinationReady(presetValue, [], [], testPresetDests), "destinationReady 认可有效的自定义预设");
ok(!destinationReady({ ...presetValue, presetKey: "unknown" }, [], [], testPresetDests), "destinationReady 拒绝未知的预设");
ok(!destinationReady(presetValue, [], [], undefined), "destinationReady 缺列表时安全拒绝");
ok(!destinationReady(presetValue, [], [], []), "destinationReady 空列表时安全拒绝");

// 5.2 在自定义预设模式下新建技能（POST /create）
const createRes = await fetch(`${api}/create`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({
    root: "preset-code-review",
    name: "new-analyzer-skill",
    description: "专为代码审查模式创建的深度分析技能",
    body: "这是新建分析技能的正文内容",
  }),
});
eq(createRes.status, 200, "POST /create 到自定义预设返回 200");
const createPayload = await createRes.json();
ok(createPayload.ok === true && createPayload.data.name === "new-analyzer-skill", "自定义预设成功创建新技能");

// 校验物理文件确实存在于 customReviewSkillsDir
const newSkillFile = join(customReviewSkillsDir, "new-analyzer-skill", "SKILL.md");
const newSkillContent = await readFile(newSkillFile, "utf8");
ok(newSkillContent.includes("专为代码审查模式创建的深度分析技能"), "物理文件成功写入自定义预设专属目录");

// 5.3 在自定义预设模式下删除技能 / 移入回收站（POST /delete）
const deleteRes = await fetch(`${api}/delete`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({
    root: "preset-code-review",
    name: "new-analyzer-skill",
  }),
});
eq(deleteRes.status, 200, "POST /delete 移除自定义预设技能返回 200");
const deletePayload = await deleteRes.json();
ok(deletePayload.ok === true && !!deletePayload.data.id, "自定义预设技能成功移入回收站");

// 校验物理文件已被移除
let fileExistsAfterDelete = true;
try {
  await readFile(newSkillFile, "utf8");
} catch {
  fileExistsAfterDelete = false;
}
ok(!fileExistsAfterDelete, "物理文件已被移出自定义预设目录");

// 5.4 从回收站恢复（POST /trash-restore）
const restoreRes = await fetch(`${api}/trash-restore`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({
    id: deletePayload.data.id,
  }),
});
eq(restoreRes.status, 200, "POST /trash-restore 恢复预设技能返回 200");
const restorePayload = await restoreRes.json();
ok(restorePayload.ok === true, "自定义预设技能从回收站恢复成功");

// 校验物理文件已恢复回 customReviewSkillsDir
const restoredContent = await readFile(newSkillFile, "utf8");
ok(restoredContent.includes("专为代码审查模式创建的深度分析技能"), "物理文件成功恢复至自定义预设目录");

// 5.5 内置预设模式（cordis）严格防写保护
const builtinCreateRes = await fetch(`${api}/create`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({
    root: "preset-cordis",
    name: "malicious-write",
    description: "尝试向官方内置模式写入技能",
    body: "应该被拒绝",
  }),
});
const builtinCreatePayload = await builtinCreateRes.json();
ok(builtinCreatePayload.ok === false, "向内置只读预设（cordis）写入技能被安全拒绝");

// 5.6 导入（POST /upload）到自定义预设模式，验证文件精确写入预设目录，且全局目录零污染
const uploadRes = await fetch(`${api}/upload`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({
    root: "preset-code-review",
    name: "imported-checker-skill",
    entries: [
      {
        path: "SKILL.md",
        data: Buffer.from(`---
name: imported-checker-skill
description: 通过 upload 导入到代码审查模式的静态检查器
---
这是检查器正文`).toString("base64"),
      },
    ],
  }),
});
eq(uploadRes.status, 200, "POST /upload 到自定义预设返回 200");
const uploadPayload = await uploadRes.json();
ok(uploadPayload.ok === true, "POST /upload 成功导入");

// 校验物理文件落入预设专属目录，且全局技能目录无此技能
const importedSkillInPreset = join(customReviewSkillsDir, "imported-checker-skill", "SKILL.md");
const importedSkillInGlobal = join(tmp, "skills", "imported-checker-skill", "SKILL.md");
let globalHasSkill = false;
try {
  await readFile(importedSkillInGlobal);
  globalHasSkill = true;
} catch {}
ok(await readFile(importedSkillInPreset, "utf8").then((c) => c.includes("静态检查器")), "物理文件精确落入自定义预设专属目录");
ok(!globalHasSkill, "P1-A 闭环：全局 DSH 技能目录零写入、无副本污染");

// 5.7 预设目录重叠守卫（P2-A）：与全局技能目录重叠时拒绝写入
const overlapSkillsDir = join(tmp, "skills");
await mkdir(overlapSkillsDir, { recursive: true });
const overlapMockPresets = {
  definitions: new Map([
    [
      "overlap-preset",
      {
        config: {
          id: "overlap-preset",
          name: "重叠模式",
          plugins: [
            {
              id: "skill-filesystem",
              name: "@deepseek-ai/dsh-skill-filesystem",
              config: {
                customSkillDirs: [overlapSkillsDir],
              },
            },
          ],
        },
      },
    ],
  ]),
};
const overlapBridge = createTestFetchBridge();
applyHost({
  connection: overlapBridge.connection,
  skills: { registerProvider: () => () => {} },
  tools: { register: () => () => {} },
  effect: (fn) => fn(),
  emit: () => {},
  get: (name) => (name === "agentPresets" ? overlapMockPresets : undefined),
});
const overlapServer = createServer(overlapBridge.handler);
await new Promise((resolve) => overlapServer.listen(0, "127.0.0.1", resolve));
const overlapPort = overlapServer.address().port;
const overlapApi = `http://127.0.0.1:${overlapPort}/api/michengai/dsh-skills-manager`;

const overlapCreateRes = await fetch(`${overlapApi}/create`, {
  method: "POST",
  headers: {
    host: `127.0.0.1:${overlapPort}`,
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  },
  body: JSON.stringify({
    root: "preset-overlap-preset",
    name: "overlap-skill",
    description: "尝试向与全局重叠的预设写入",
    body: "应该被拒绝",
  }),
});
const overlapPayload = await overlapCreateRes.json();
ok(overlapPayload.ok === false, "P2-A 闭环：与全局目录重叠的预设根拒绝写入");
eq(overlapPayload.code, "error.root.unsafe", "重叠预设根精准返回 error.root.unsafe");
overlapServer.close();

console.log("── 5.8 仓库安装、列表 present 识别与卸载端到端闭环（P1-B）──");
const { createRepositoryManager } = await import("../lib/repositories.js");
const repoManager = createRepositoryManager({
  probeRemote: false,
  gitFetch: async (_repo, dest) => {
    await mkdir(join(dest, "audit"), { recursive: true });
    await writeFile(
      join(dest, "audit", "SKILL.md"),
      `---
name: repo-audit-skill
description: 仓库测试技能
---
这是正文`,
      "utf8",
    );
    return { commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  },
  getPresetRoots: async () => roots,
});
const addedRepo = await repoManager.add({ url: "example/preset-repo" });
await repoManager.refresh({ id: addedRepo.id });

// 1. 验证 installRoots 里包含自定义预设模式
const listBefore = await repoManager.list();
const presetDest = listBefore.installRoots.find((item) => item.key === "preset-code-review");
ok(!!presetDest && presetDest.available, "installRoots 成功列出可用的自定义预设安装位置");

// 2. 安装技能到自定义预设模式
const installed = await repoManager.install({ id: addedRepo.id, path: "audit", root: "preset-code-review" });
eq(installed.root, customReviewSkillsDir, "成功安装到自定义预设模式物理目录");

// 校验物理文件已写入
const installedSkillPath = join(customReviewSkillsDir, "repo-audit-skill", "SKILL.md");
ok(await readFile(installedSkillPath, "utf8").then((c) => c.includes("仓库测试技能")), "仓库技能文件成功写入自定义预设专属目录");

// 3. 校验 list() 中 present 状态判定成功，技能标记为 installed
const listAfter = await repoManager.list();
const repoInList = listAfter.repositories.find((r) => r.id === addedRepo.id);
const installedSkillInRepo = repoInList?.skills.find((s) => s.name === "repo-audit-skill");
ok(installedSkillInRepo?.installations?.some((c) => c.installedRoot === "preset-code-review"), "仓库列表中正确识别已安装到预设的副本");

// 4. 卸载该技能并移入回收站
const uninstalled = await repoManager.uninstall({ id: addedRepo.id, path: "audit", root: "preset-code-review" });
ok(uninstalled.ok !== false, "成功从自定义预设模式卸载技能");

// 校验物理文件已被移出
let repoFileExists = true;
try {
  await readFile(installedSkillPath);
} catch {
  repoFileExists = false;
}
ok(!repoFileExists, "卸载后物理文件已被移出自定义预设目录");

server.close();
await rm(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
