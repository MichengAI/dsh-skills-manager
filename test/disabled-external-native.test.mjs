// 用真实 DSH scope 合并与 skill.execute 回归；仅使用临时用户目录。
// 默认使用开发宿主依赖；DSH_RUNTIME_DIR 可指定真实安装的 dsh 包目录。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const req = process.env.DSH_RUNTIME_DIR
  ? createRequire(join(resolve(process.env.DSH_RUNTIME_DIR), "package.json"))
  : createRequire(createRequire(import.meta.url).resolve("@deepseek-ai/dsh-web-app/package.json"));
const load = (name) => import(pathToFileURL(req.resolve(name)).href);
const qa = await mkdtemp(join(tmpdir(), "dssm-disabled-external-"));
process.env.USERPROFILE = process.env.HOME = join(qa, "user");
process.env.DSH_HOME = join(qa, "home");
process.env.DSH_AGENTS_HOME = join(qa, "user", ".agents");
const skill = "bundled-regression";
const bundled = join(qa, "bundled");
const core = await import("../lib/core.js");
async function fixtureNamed(root, name, body) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: fixture\n---\n${body}`);
  return dir;
}
async function fixture(root, body) {
  return fixtureNamed(root, skill, body);
}
const roots = core.userRoots();
const cc = roots.find((r) => r.key === "ccswitch");
const wb = roots.find((r) => r.key === "workbuddy");
await fixture(bundled, "plugin fixture");
const ccDir = await fixture(cc.path, "ccswitch fixture");
await fixture(wb.path, "workbuddy fixture");
await core.setSourceEnabled("ccswitch", false);
await core.setSourceEnabled("workbuddy", false);
const { Context } = await load("@deepseek-ai/cordis");
const { SkillRegistry, isUserInvocable } = await load("@deepseek-ai/dsh-skill");
const { createScope } = await load("@deepseek-ai/dsh-scope");
const { FileSystemSkillProvider } = await load("@deepseek-ai/dsh-skill-filesystem");
const toolmod = await load("@deepseek-ai/dsh-tool-skill");
const ctx = new Context();
const registry = ctx.plugin(SkillRegistry);
await registry.await();
let scope;
let runRegression;
const harness = ctx.plugin({ name: "regression-harness", inject: ["skills"], apply(host) {
  host.skills.registerProvider((control) => new FileSystemSkillProvider(host, control, {
    providerName: "bundled-plugin", includeDefaultRoots: true, bundledSkillDir: bundled, watch: false,
  }));
  const agent = { session: { header: { cwd: qa } } };
  scope = createScope(host, agent);
  let invalidate;
  scope.ctx.skills.registerProvider((control) => {
    invalidate = control.invalidate;
    return { name: "dsh-skills-manager-external", list: core.listProviderCandidates, get: core.getProviderSkill };
  });
  let tool;
  toolmod.apply({ skills: host.skills, tools: { register(t) { tool = t; } }, workingDirectory: { ensure: async () => qa }, on() {} });
  runRegression = async () => {
    const selected = async () => {
      invalidate();
      return (await host.skills.list({ cwd: qa, scope: agent })).find((s) => s.name === skill);
    };
    const execute = () => tool.execute({ name: skill }, { agent, signal: new AbortController().signal });
    const selectedNamed = async (name) => {
      invalidate();
      return (await host.skills.list({ cwd: qa, scope: agent })).find((s) => s.name === name);
    };
    const executeNamed = (name) => tool.execute({ name }, { agent, signal: new AbortController().signal });
    const chosen = await selected();
    assert.equal(chosen.provider, "bundled-plugin", "关闭的外部来源不遮蔽全局插件");
    assert.ok(isUserInvocable(chosen), "斜杠入口可用");
    await execute();
    console.log("通过：关闭外部来源后 bundled 目录与实际技能调用正常");
    await core.setSourceEnabled("ccswitch", true);
    assert.equal((await selected()).source, "agent-ccswitch");
    await execute();
    assert.equal((await core.readManagerState()).state.sources.workbuddy, false);
    console.log("通过：重新启用 CC Switch，WorkBuddy 保持关闭");
    await core.setSourceEnabled("ccswitch", false);
    // 高优先级来源关闭不能吞掉另一个副本的显式单技能禁用。
    await core.setSourceEnabled("workbuddy", true);
    await core.setSkillEnabled(wb.path, skill, false);
    assert.equal(isUserInvocable(await selected()), false, "混合禁用仍保留单技能阻断");
    await assert.rejects(execute, /not available for model invocation/);
    await core.setSourceEnabled("workbuddy", false);
    assert.equal(isUserInvocable(await selected()), false, "关闭来源不清除显式单技能阻断");
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：混合来源禁用保留显式单技能阻断");
    await core.setSourceEnabled("workbuddy", true);
    await core.setSkillEnabled(wb.path, skill, true);
    assert.equal((await selected()).source, "agent-workbuddy", "重新启用显式禁用的副本后恢复调用");
    await execute();
    await core.setSourceEnabled("workbuddy", false);
    assert.equal((await selected()).provider, "bundled-plugin", "解除单技能禁用后仅关闭来源不再遮蔽插件");
    await execute();
    console.log("通过：解除单技能禁用后恢复外部副本及 bundled 技能");
    const agentsRoot = join(process.env.DSH_AGENTS_HOME, "skills");
    await fixture(agentsRoot, "native fixture");
    await core.setSourceEnabled("agents", false);
    assert.equal(isUserInvocable(await selected()), false);
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：原生来源禁用仍阻止实际技能调用");
    const projectSkills = join(qa, ".codex", "skills");
    await fixture(projectSkills, "project external fixture");
    const projectCodex = (await core.projectRoots([qa])).find((r) => r.kind === "project-codex");
    await core.setSourceEnabled(projectCodex.key, false, undefined, { projectCwds: [qa] });
    assert.equal(isUserInvocable(await selected()), false);
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：关闭项目外部来源仍保留原生用户副本阻断");
    await core.setSourceEnabled("agents", true);
    assert.equal((await selected()).source, "agent-agents");
    await execute();
    await core.setSourceEnabled("agents", false);
    console.log("通过：项目外部来源关闭时原生用户来源可重新启用");
    await rm(join(agentsRoot, skill), { recursive: true });
    await symlink(ccDir, join(agentsRoot, skill), process.platform === "win32" ? "junction" : "dir");
    assert.equal(isUserInvocable(await selected()), false);
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：关闭项目外部来源仍保留原生分发链接阻断");
    await rm(join(projectSkills, skill), { recursive: true });
    assert.equal(isUserInvocable(await selected()), false);
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：链接到原生根的外部副本仍保持禁用");
    // 原生 DSH 用户根由宿主自带 provider 提供；组内只有这一份副本时，来源停用必须发布覆盖层才生效。
    const dshOnly = "native-dsh-only";
    const dshRoot = join(process.env.DSH_HOME, "skills");
    await fixtureNamed(dshRoot, dshOnly, "native dsh fixture");
    assert.equal(isUserInvocable(await selectedNamed(dshOnly)), true, "宿主原生副本默认可用");
    await core.setSourceEnabled("dsh", false);
    const blocked = await selectedNamed(dshOnly);
    assert.equal(blocked === undefined || !isUserInvocable(blocked), true, "关闭原生 DSH 来源仍阻断宿主原生副本");
    await assert.rejects(executeNamed(dshOnly), /not available for model invocation/);
    console.log("通过：关闭原生 DSH 来源阻止实际技能调用");
    await core.setSourceEnabled("dsh", true);
    assert.equal(isUserInvocable(await selectedNamed(dshOnly)), true, "重新启用原生 DSH 来源后恢复调用");
    await executeNamed(dshOnly);
    console.log("通过：重新启用原生 DSH 来源恢复技能调用");
  };
} });
await harness.await();
try {
  await runRegression();
} finally {
  await scope?.dispose();
  await harness.dispose();
  await registry.dispose();
  await rm(qa, { recursive: true, force: true });
}
