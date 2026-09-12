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
  const source = await readFile(new URL("../src/core.js", import.meta.url), "utf8");
  const rankSources = new Function(source.slice(source.indexOf("const EXTERNAL_SOURCE_ORDER"), source.indexOf("const PROJECT_SOURCES")) + "; return rankSources;")();
  assert.throws(() => rankSources([{ key: "newcomer" }], 210), /newcomer/, "单个未知来源也必须明确报错");
  assert.throws(() => rankSources([{ key: "codex" }, { key: "newcomer" }], 210), /newcomer/, "未知来源不能静默成为最高优先级");
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
  for (const key of ["copilot", "windsurf", "windsurf-user", "trae", "trae-cn", "openclaw", "clawdbot", "roo", "codebuddy"]) {
    delete oldState.sources[key];
    delete oldState.disabledSkills[key];
    delete oldState.enabledSkills[key];
  }
  await mkdir(join(process.env.DSH_HOME, "skills-manager"), { recursive: true });
  await writeFile(core.managerStatePath(), JSON.stringify(oldState), "utf8");
  const migrated = await core.readManagerState();
  assert.equal(migrated.writable, true, "旧状态可兼容新来源");
  assert.equal(migrated.state.sources["windsurf-user"], true, "迁移补齐 Windsurf 主目录");
  assert.equal(migrated.state.sources["trae-cn"], true, "迁移补齐 Trae 国内版");
  assert.equal(migrated.state.sources.clawdbot, true, "迁移补齐 OpenClaw 旧目录");
  assert.equal(migrated.state.sources.codebuddy, true, "迁移补齐 CodeBuddy");
  for (const field of ["sources", "disabledSkills"]) {
    const broken = structuredClone(migrated.state);
    delete broken[field].agents;
    await writeFile(core.managerStatePath(), JSON.stringify(broken), "utf8");
    assert.equal((await core.readManagerState()).writable, false, `旧来源 ${field} 缺失必须失败关闭`);
    assert.equal(await readFile(core.managerStatePath(), "utf8"), JSON.stringify(broken), "读取不能覆盖损坏状态");
  }
  await writeFile(core.managerStatePath(), JSON.stringify(migrated.state), "utf8");
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
    openclaw: "",
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
  const bare = join(temp, "bare");
  await mkdir(join(bare, ".git"), { recursive: true });
  assert.deepEqual(
    (await core.projectRoots([bare])).map((root) => root.kind),
    ["project-dsh"],
    "缺少目录的只读项目来源不进入 projectRoots",
  );
  const dsh = core.userRoots().find((root) => root.key === "dsh");
  await skill(join(dsh.path, "shared"), "shared");
  await skill(join(project, ".github", "skills", "shared"), "shared");
  const dshWinner = (await core.listProviderCandidates({ cwd: project })).find((c) => c.name === "shared");
  assert.equal(dshWinner.source, "project-copilot", "项目 Agent 优先于用户 DSH 同名技能");
  await skill(join(copilot.path, "same"), "same-name");
  await skill(join(project, ".github", "skills", "same"), "same-name");
  const winner = (await core.listProviderCandidates({ cwd: project })).find((c) => c.name === "same-name");
  assert.equal(winner.source, "project-copilot", "项目 Agent 优先于全局来源");
  const root = (await core.projectRoots([project])).find((r) => r.kind === "project-copilot");
  const projectSources = (await core.projectRoots([project])).filter((r) => !r.native);
  const userRanks = core.userRoots().map((r) => r.rank);
  assert.equal(new Set(projectSources.map((r) => r.rank)).size, projectSources.length, "项目来源 rank 唯一");
  assert.ok(projectSources.every((r) => r.rank < Math.min(...userRanks)), "新增项目来源全部排在用户来源之前");
  // 覆盖全部项目来源与全部用户来源的同名竞争，包括此前跨 Agent 的 10 组同分。
  for (const userRoot of core.userRoots()) {
    const name = `collision-${userRoot.key}`;
    await skill(join(userRoot.path, name), name);
    for (const projectRoot of projectSources) await skill(join(projectRoot.path, name), name);
  }
  const collisionState = await core.state({ projectCwds: [project] });
  const candidates = await core.listProviderCandidates({ cwd: project });
  for (const userRoot of core.userRoots()) {
    const name = `collision-${userRoot.key}`;
    const candidate = candidates.find((c) => c.name === name);
    assert.equal(candidate.locator.rootKey, projectSources[0].key, "Provider 选择最高优先级项目副本");
    for (const projectRoot of projectSources) {
      const view = collisionState.roots.find((r) => r.key === projectRoot.key).skills.find((s) => s.name === name);
      if (projectRoot.key === candidate.locator.rootKey) assert.equal(view.winner, true);
      else {
        assert.equal(view.shadowedBy.root, candidate.locator.rootKey, "项目 UI 与 Provider 的赢家一致");
        assert.notEqual(view.winner, true, "被覆盖项目副本不得标为赢家");
      }
    }
    await core.setSkillEnabled(userRoot, name, false);
    const disabled = (await core.listProviderCandidates({ cwd: project })).find((c) => c.name === name);
    assert.equal(disabled.locator.rootKey, projectSources[0].key, "停用全局副本不影响项目赢家");
    assert.equal(disabled.invocation.modelInvocable, true);
    await core.setSkillEnabled(userRoot, name, true);
  }
  // 项目各副本分别停用后逐级回退，最终使用全局副本；全部停用才阻断调用。
  const cascadeName = "collision-codex";
  const globalCodex = core.userRoots().find((r) => r.key === "codex");
  for (let i = 0; i < projectSources.length; i++) {
    const disabledRoot = projectSources[i];
    await core.setSkillEnabled(disabledRoot, cascadeName, false);
    const next = (await core.listProviderCandidates({ cwd: project })).find((c) => c.name === cascadeName);
    assert.equal(next.locator.rootKey, projectSources[i + 1]?.key ?? globalCodex.key);
    assert.equal(next.invocation.modelInvocable, true);
    const view = (await core.state({ projectCwds: [project] })).roots.find((r) => r.key === disabledRoot.key).skills.find((s) => s.name === cascadeName);
    assert.equal(view.enabled, false, "已停用副本保持停用状态");
    assert.equal(view.shadowedBy, undefined, "已停用副本不标为被覆盖");
    assert.notEqual(view.winner, true);
    assert.deepEqual(view.fallbackTo, { root: next.locator.rootKey, name: cascadeName, scope: i + 1 < projectSources.length ? "project" : "user" }, "回退提示来自当前项目实际赢家");
  }
  await core.setSkillEnabled(globalCodex, cascadeName, false);
  assert.equal((await core.listProviderCandidates({ cwd: project })).find((c) => c.name === cascadeName).invocation.modelInvocable, false);
  for (const r of (await core.state({ projectCwds: [project] })).roots) {
    for (const skill of r.skills.filter((s) => s.name === cascadeName)) assert.equal(skill.fallbackTo, undefined, "全部停用不提示接管");
  }
  await core.setSkillEnabled(globalCodex, cascadeName, true);
  assert.equal((await core.listProviderCandidates({ cwd: project })).find((c) => c.name === cascadeName).locator.rootKey, globalCodex.key);
  const restrictedPath = join(globalCodex.path, cascadeName, "SKILL.md");
  const originalCopy = await readFile(restrictedPath, "utf8");
  await writeFile(restrictedPath, "---\nname: " + cascadeName + "\ndescription: 受限副本\ndisable-model-invocation: true\nuser-invocable: false\n---\n受限正文", "utf8");
  const currentPolicy = (await core.readManagerState()).state;
  currentPolicy.enabledSkills[globalCodex.key] = currentPolicy.enabledSkills[globalCodex.key].filter((name) => name !== cascadeName);
  await writeFile(core.managerStatePath(), JSON.stringify(currentPolicy), "utf8");
  const restricted = await core.state({ projectCwds: [project] });
  assert.equal(restricted.roots.find((r) => r.key === projectSources[0].key).skills.find((s) => s.name === cascadeName).fallbackTo, undefined, "回退目标不可调用时不提示接管");
  await writeFile(restrictedPath, originalCopy, "utf8");
  await core.setSkillEnabled(projectSources[0], cascadeName, true);
  assert.equal((await core.listProviderCandidates({ cwd: project })).find((c) => c.name === cascadeName).locator.rootKey, projectSources[0].key);
  assert.equal((await core.state({ projectCwds: [project] })).roots.find((r) => r.key === projectSources[0].key).skills.find((s) => s.name === cascadeName).fallbackTo, undefined, "项目恢复后移除旧接管提示");
  await core.setSkillEnabled(root, "same", false);
  assert.equal((await core.listProviderCandidates({ cwd: project })).find((c) => c.name === "same-name").invocation.modelInvocable, true, "停用项目副本后全局副本继续生效");
  assert.equal((await core.listProviderCandidates({ cwd: other })).find((c) => c.name === "same-name").invocation.modelInvocable, true);
  await core.setSkillEnabled(root, "same", true);
  assert.equal((await core.setSourceEnabled(root.key, false, undefined, { projectCwds: [project] })).enabled, false);
  assert.equal((await core.readManagerState()).state.sources[root.key], false);
  assert.equal((await core.listProviderCandidates({ cwd: project })).find((c) => c.name === "project-copilot").invocation.modelInvocable, false, "项目来源总开关写入 manager 状态");
  const validState = (await core.readManagerState()).state;
  for (const invalid of ["false", 0, null, {}, []]) {
    const broken = structuredClone(validState);
    broken.sources[root.key] = invalid;
    await writeFile(core.managerStatePath(), JSON.stringify(broken), "utf8");
    assert.equal((await core.readManagerState()).writable, false, "非法项目来源开关失败关闭");
    assert.equal((await core.listProviderCandidates({ cwd: project })).find((c) => c.name === "project-copilot").invocation.modelInvocable, false);
    assert.equal((await core.setSourceEnabled(root.key, true, undefined, { projectCwds: [project] })).code, "error.state.invalid");
  }
  await writeFile(core.managerStatePath(), JSON.stringify(validState), "utf8");
  const afterDisable = await core.state({ projectCwds: [project] });
  assert.equal(afterDisable.roots.find((item) => item.key === root.key).enabled, false);
  assert.equal(afterDisable.summary.total, afterDisable.roots.reduce((count, r) => count + r.skills.length, 0));
  assert.equal(afterDisable.summary.enabled, afterDisable.roots.flatMap((r) => r.skills).filter((skill) => skill.enabled === true).length);
  assert.equal(typeof afterDisable.summary.disabled, "number");
  assert.equal(typeof afterDisable.summary.issues, "number");
  const openclawRoot = afterDisable.roots.find((r) => r.kind === "project-openclaw");
  assert.equal(openclawRoot.path, join(project, "skills"), "通用项目 Skills 保留 workspace/skills 目录");
  assert.equal(openclawRoot.localeKey, "projectSkills", "根目录 skills 使用中性显示名称，保留策略 key 兼容性");
  console.log("项目来源、Copilot 迁移与加载回归通过");
} finally {
  await rm(temp, { recursive: true, force: true });
}
