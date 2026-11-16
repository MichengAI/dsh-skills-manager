import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const req = createRequire(createRequire(import.meta.url).resolve("@deepseek-ai/dsh-web-app/package.json"));
const load = (name) => import(pathToFileURL(req.resolve(name)).href);

const tempHome = await mkdtemp(join(tmpdir(), "dssm-office-test-"));
process.env.USERPROFILE = process.env.HOME = join(tempHome, "user");
process.env.DSH_HOME = join(tempHome, "home");

// 创建一个模拟的 office assets 目录（包含真实的 4 个技能结构）
const mockOfficeDir = join(tempHome, "mock-office-assets");
for (const name of ["office", "office-docx", "office-pptx", "office-xlsx"]) {
  const dir = join(mockOfficeDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Office skill for ${name}\n---\n\n# ${name}\nInstructions for ${name}`,
  );
}
process.env.DSH_OFFICE_SKILLS_DIR = mockOfficeDir;

import react from "react";
const core = await import("../lib/core.js");

// 加载 client bundle
let loadedClient = null;
const clientCode = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
new Function("window", clientCode)({
  __ModuleLoader__: {
    load(def) {
      loadedClient = def;
    },
  },
});
const client = loadedClient.factory((id) => {
  if (id === "react") return react;
  if (id === "react/jsx-runtime") return { jsx: react.createElement, jsxs: react.createElement, Fragment: react.Fragment };
  if (id.startsWith("react-dom")) return { createPortal: (node) => node };
  if (id === "@deepseek-ai/dsh-client-ui-primitives") {
    return {
      Button: (props) => react.createElement("button", props, props.children),
      Checkbox: (props) => react.createElement("input", { type: "checkbox", ...props }),
      Input: (props) => react.createElement("input", props),
      Modal: (props) => props.open ? react.createElement("div", null, props.children) : null,
      Menu: (props) => react.createElement("div", null),
    };
  }
  return {};
});

console.log("── 1. userRoots 包含官方 dsh-office 来源 ──");
const roots = core.userRoots();
const officeRoot = roots.find((r) => r.key === "dsh-office");
assert.ok(officeRoot, "userRoots 中应存在 dsh-office 根");
assert.equal(officeRoot.native, true, "dsh-office 应当是原生内置根");
assert.equal(officeRoot.mutable, false, "dsh-office 应当是只读的");
assert.equal(officeRoot.toggleable, true, "dsh-office 应当是可开关控制的");
assert.equal(officeRoot.rank, 600, "dsh-office 的优先级 rank 应当为 600（对齐 BUNDLED_SKILL_RANK）");
assert.equal(officeRoot.localeKey, "dshOffice", "dsh-office 的 localeKey 应当为 dshOffice");

console.log("── 2. 状态扫描包含 4 个 office 技能 ──");
const state = await core.state();
const stateOfficeRoot = state.roots.find((r) => r.key === "dsh-office");
assert.ok(stateOfficeRoot, "state.roots 中应当包含 dsh-office");
const officeSkills = stateOfficeRoot.skills.map((s) => s.name).sort();
assert.deepEqual(
  officeSkills,
  ["office", "office-docx", "office-pptx", "office-xlsx"],
  "应当发现全部 4 个 office 技能",
);

console.log("── 3. 来源开关与单技能禁用阻断 ──");
// 默认启用时，作为原生根，不需要发布多余的覆盖层候选
let candidates = await core.listProviderCandidates();
let officeCandidates = candidates.filter((c) => ["office", "office-docx", "office-pptx", "office-xlsx"].includes(c.name));
assert.equal(officeCandidates.length, 0, "默认未修改状态下不发布多余覆盖层");

// 禁用单技能 office-pptx
await core.setSkillEnabled(officeRoot.path, "office-pptx", false);
candidates = await core.listProviderCandidates();
const pptxOverlay = candidates.find((c) => c.name === "office-pptx");
assert.ok(pptxOverlay, "停用单技能后应当生成覆盖层");
assert.equal(pptxOverlay.rank, 599, "覆盖层的 rank 应当为 599（比官方 600 优先级更高）");
assert.equal(pptxOverlay.invocation.modelInvocable, false, "覆盖层 modelInvocable 必须为 false");
assert.equal(pptxOverlay.invocation.userInvocable, false, "覆盖层 userInvocable 必须为 false");

// 禁用整个 dsh-office 来源
await core.setSourceEnabled("dsh-office", false);
candidates = await core.listProviderCandidates();
officeCandidates = candidates.filter((c) => ["office", "office-docx", "office-pptx", "office-xlsx"].includes(c.name));
assert.equal(officeCandidates.length, 4, "来源停用后所有 4 个 office 技能都应当发布禁用覆盖层");
for (const c of officeCandidates) {
  assert.equal(c.rank, 599, "全部覆盖层 rank 均为 599");
  assert.equal(c.invocation.modelInvocable, false, "全部覆盖层 modelInvocable 均为 false");
}

console.log("── 4. 分类与自定义备注支持 ──");
await core.setSourceEnabled("dsh-office", true);
await core.setSkillEnabled(officeRoot.path, "office-pptx", true);
const catResult = await core.createCategory("dsh-office", "文档工具");
assert.ok(catResult.category && catResult.category.id, "在 dsh-office 创建分类成功");
await core.assignSkillCategory("dsh-office", "office-docx", catResult.category.id);
await core.setSkillNote("dsh-office", "office-xlsx", "电子表格专用技能");

const freshState = await core.state();
const freshOffice = freshState.roots.find((r) => r.key === "dsh-office");
const docxSkill = freshOffice.skills.find((s) => s.name === "office-docx");
assert.equal(docxSkill.categoryId, catResult.category.id, "技能分类归属生效");
const xlsxSkill = freshOffice.skills.find((s) => s.name === "office-xlsx");
assert.equal(xlsxSkill.customNote, "电子表格专用技能", "技能自定义备注生效");

console.log("── 5. 集成真实宿主 SkillRegistry 验证调用阻断 ──");
const { Context } = await load("@deepseek-ai/cordis");
const { SkillRegistry, isModelInvocable } = await load("@deepseek-ai/dsh-skill");
const hostCtx = new Context();
const registry = hostCtx.plugin(SkillRegistry);
await registry.await();

// 注册官方 dsh-office provider（使用真实 assets 结构）
hostCtx.skills.registerProvider((control) => ({
  name: "dsh-office",
  async list() {
    return {
      candidates: ["office", "office-docx", "office-pptx", "office-xlsx"].map((name) => ({
        name,
        description: `Official ${name}`,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: "dsh-office",
        source: "bundled",
        rank: 600,
        resourceBase: { kind: "directory", path: join(mockOfficeDir, name) },
        locator: join(mockOfficeDir, name, "SKILL.md"),
      })),
      complete: true,
    };
  },
  async get(c) {
    return { name: c.name, description: c.description, content: `# ${c.name}` };
  },
}));

// 注册 skills-manager 的 provider
let invalidateManager;
hostCtx.skills.registerProvider((control) => {
  invalidateManager = control.invalidate;
  return {
    name: "dsh-skills-manager-external",
    list: core.listProviderCandidates,
    get: core.getProviderSkill,
  };
});

// 检查未禁用时的胜出者
invalidateManager?.();
let list = await hostCtx.skills.list();
let pptx = list.find((s) => s.name === "office-pptx");
assert.equal(isModelInvocable(pptx), true, "默认情况下 office-pptx 应当可被模型调用");

// 停用 office-pptx
await core.setSkillEnabled(officeRoot.path, "office-pptx", false);
invalidateManager?.();
list = await hostCtx.skills.list();
pptx = list.find((s) => s.name === "office-pptx");
assert.equal(isModelInvocable(pptx), false, "停用后 office-pptx 成功被阻断（模型不可调用）");

let docx = list.find((s) => s.name === "office-docx");
assert.equal(isModelInvocable(docx), true, "未停用的 office-docx 保持正常可用");

console.log("── 6. 客户端多语言字典 ──");
const tZh = (k) => client.DICT.zh[k] || k;
const tEn = (k) => client.DICT.en[k] || k;
assert.equal(client.rootDisplayName(tZh, officeRoot), "官方 Office", "中文显示名应当为 官方 Office");
assert.equal(client.rootDisplayName(tEn, officeRoot), "Official Office", "英文显示名应当为 Official Office");

await registry.dispose();
await rm(tempHome, { recursive: true, force: true });
console.log("所有测试全部通过！");
