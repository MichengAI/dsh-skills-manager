// 隔离目录验证新增来源、项目隔离、策略持久化及实际正文加载。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temp = await mkdtemp(join(tmpdir(), "dssm-project-sources-"));
process.env.HOME = join(temp, "home");
process.env.USERPROFILE = join(temp, "home");
for (const key of [
  "DSH_HOME",
  "DSH_AGENTS_HOME",
  "DSH_CODEX_HOME",
  "DSH_CLAUDE_HOME",
  "DSH_GEMINI_HOME",
  "DSH_OPENCODE_HOME",
  "DSH_CURSOR_HOME",
  "DSH_COPILOT_HOME",
  "DSH_WINDSURF_HOME",
  "DSH_WINDSURF_USER_HOME",
  "DSH_TRAE_HOME",
  "DSH_TRAE_CN_HOME",
  "DSH_OPENCLAW_HOME",
  "DSH_CLAWDBOT_HOME",
  "DSH_ROO_HOME",
  "DSH_CODEBUDDY_HOME",
])
  process.env[key] = join(temp, key);
const core = await import("../lib/core.js");
async function skill(path, name) {
  await mkdir(path, { recursive: true });
  const file = join(path, "SKILL.md");
  await writeFile(file, `---\nname: ${name}\ndescription: 项目回归技能\n---\n${name} 正文`, "utf8");
  return file;
}
try {
  const firstTierUserKeys = [
    "copilot",
    "windsurf",
    "windsurf-user",
    "trae",
    "trae-cn",
    "openclaw",
    "clawdbot",
    "roo",
    "codebuddy",
  ];
  for (const key of firstTierUserKeys)
    assert.ok(core.userRoots().some((root) => root.key === key), `注册全局 ${key} 来源`);
  const copilot = core.userRoots().find((root) => root.key === "copilot");
  await skill(join(copilot.path, "global"), "global-copilot");
  const oldState = (await core.readManagerState()).state;
  for (const key of ["copilot", "windsurf", "trae", "openclaw", "roo", "codebuddy"]) {
    delete oldState.sources[key];
    delete oldState.disabledSkills[key];
    delete oldState.enabledSkills[key];
  }
  await mkdir(join(process.env.DSH_HOME, "skills-manager"), { recursive: true });
  await writeFile(core.managerStatePath(), JSON.stringify(oldState), "utf8");
  const migrated = await core.readManagerState();
  assert.equal(migrated.writable, true, "旧状态可兼容新来源");
  assert.equal(migrated.state.sources.windsurf, true, "迁移补齐 Windsurf");
  assert.equal(migrated.state.sources.codebuddy, true, "迁移补齐 CodeBuddy");
  const project = join(temp, "project"), other = join(temp, "other");
  await mkdir(join(project, ".git"), { recursive: true });
  await mkdir(join(other, ".git"), { recursive: true });
  const sources = {
    copilot: ".github",
    codex: ".codex",
    claude: ".claude",
    gemini: ".gemini",
    opencode: ".opencode",
    cursor: ".cursor",
    windsurf: ".windsurf",
    trae: ".trae",
    "trae-cn": ".trae-cn",
    openclaw: ".openclaw",
    roo: ".roo",
    codebuddy: ".codebuddy",
  };
  for (const [key, directory] of Object.entries(sources)) {
    const file = await skill(join(project, directory, "skills", "group", key), `project-${key}`);
    const before = await readFile(file, "utf8");
    const root = (await core.projectRoots([project])).find((r) => r.kind === `project-${key}`);
    assert.ok(root, `注册项目 ${key}`);
    const candidate = (await core.listProviderCandidates({ cwd: project })).find((c) => c.name === `project-${key}`);
    assert.equal((await core.getProviderSkill(candidate, { cwd: project })).content, `project-${key} 正文`);
    assert.equal(await core.getProviderSkill(candidate, { cwd: other }), undefined, "不能跨项目读取");
    await core.setSkillEnabled(root, `group/${key}`, false);
    assert.ok((await core.readManagerState()).state.disabledSkills[root.key].includes(`group/${key}`));
    assert.equal((await core.listProviderCandidates({ cwd: project })).find((c) => c.name === `project-${key}`).invocation.modelInvocable, false);
    assert.equal((await core.deleteSkill(root, `group/${key}`)).code, "error.root.readonly");
    assert.equal(await readFile(file, "utf8"), before, "启停不修改来源正文");
    await core.setSkillEnabled(root, `group/${key}`, true);
  }
  await skill(join(copilot.path, "same"), "same-name");
  await skill(join(project, ".github", "skills", "same"), "same-name");
  const winner = (await core.listProviderCandidates({ cwd: project })).find((c) => c.name === "same-name");
  assert.equal(winner.source, "project-copilot", "项目来源优先于全局");
  const root = (await core.projectRoots([project])).find((r) => r.kind === "project-copilot");
  await core.setSkillEnabled(root, "same", false);
  assert.equal((await core.listProviderCandidates({ cwd: project })).find((c) => c.name === "same-name").invocation.modelInvocable, false, "禁用赢家不回流全局副本");
  assert.equal((await core.listProviderCandidates({ cwd: other })).find((c) => c.name === "same-name").invocation.modelInvocable, true);
  console.log("项目来源、Copilot 迁移与加载回归通过");
} finally {
  await rm(temp, { recursive: true, force: true });
}
