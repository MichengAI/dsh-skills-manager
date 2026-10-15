// 工作区目标：只接受已登记工作区，解析出该项目的 .dsh/skills，且沿用链接与重叠防护。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temp = await mkdtemp(join(tmpdir(), "dssm-workspace-target-"));
process.env.HOME = join(temp, "home");
process.env.USERPROFILE = join(temp, "home");
for (const key of [
  "DSH_HOME", "DSH_AGENTS_HOME", "DSH_CODEX_HOME", "DSH_CLAUDE_HOME", "DSH_GEMINI_HOME", "DSH_OPENCODE_HOME",
  "DSH_CURSOR_HOME", "DSH_COPILOT_HOME", "DSH_WINDSURF_HOME", "DSH_WINDSURF_USER_HOME", "DSH_TRAE_HOME",
  "DSH_TRAE_CN_HOME", "DSH_OPENCLAW_HOME", "DSH_CLAWDBOT_HOME", "DSH_ROO_HOME", "DSH_CODEBUDDY_HOME",
  "DSH_WORKBUDDY_HOME", "DSH_QODER_HOME", "DSH_QODER_CN_HOME", "DSH_LINGMA_HOME",
]) process.env[key] = join(temp, key);
const core = await import("../lib/core.js");
const exists = (path) => lstat(path).then(() => true, () => false);

try {
  const gitProject = join(temp, "work", "git-project");
  const plainProject = join(temp, "work", "plain-project");
  const unregistered = join(temp, "work", "unregistered");
  const nested = join(gitProject, "packages", "web");
  for (const dir of [join(gitProject, ".git"), nested, plainProject, unregistered]) await mkdir(dir, { recursive: true });
  const registered = [gitProject, plainProject];

  // 1. 已登记工作区解析为项目根的 .dsh/skills，且只开放 DSH。
  const target = await core.resolveWorkspaceTarget(gitProject, registered);
  assert.equal(target.ok, undefined, "已登记路径可解析");
  assert.equal(target.root.kind, "project-dsh");
  assert.equal(target.root.projectRoot, resolve(gitProject));
  assert.equal(target.root.path, resolve(join(gitProject, ".dsh", "skills")));
  assert.equal(target.root.mutable, true);
  assert.equal(await exists(join(gitProject, ".dsh")), false, "解析目标不创建目录");

  // 2. 登记的是子目录时，沿用最近 Git 根的规则，不向仓库外写。
  const viaNested = await core.resolveWorkspaceTarget(nested, [nested]);
  assert.equal(viaNested.root.projectRoot, resolve(gitProject));
  assert.equal((await core.projectRootForRecord(gitProject, [])).code, "error.workspace.unregistered", "安装记录不能自行授权");
  assert.equal((await core.projectRootForRecord(gitProject, [nested])).root.projectRoot, resolve(gitProject), "真实登记子目录可授权保存根");
  const indexed = await core.indexRegisteredWorkspaces([gitProject, plainProject]);
  assert.equal(indexed.filter((item) => item.root).length, 2, "一次索引解析全部登记工作区");
  assert.equal((await core.projectRootForRecord(gitProject, [gitProject, plainProject], indexed)).root.projectRoot, resolve(gitProject), "共享索引仍能命中保存根");
  assert.equal((await core.projectRootForRecord(plainProject, [gitProject, plainProject], indexed)).root.projectRoot, resolve(plainProject), "同一份索引可解析另一条记录");
  const driftParent = join(temp, "drift-parent");
  const driftProject = join(driftParent, "child");
  await mkdir(join(driftProject, ".git"), { recursive: true });
  await mkdir(join(driftParent, ".git"), { recursive: true });
  await rm(join(driftProject, ".git"), { recursive: true });
  const drift = await core.projectRootForRecord(driftProject, [driftProject]);
  assert.equal(drift.code, "error.workspace.unavailable", "保存根变为父 Git 项目时明确失败，不重定位");
  assert.deepEqual(drift.params, { path: driftProject });

  // 3. 无 Git 标记时使用该目录本身。
  const plain = await core.resolveWorkspaceTarget(plainProject, registered);
  assert.equal(plain.root.projectRoot, resolve(plainProject));

  // 4. 未登记路径、空列表、非绝对路径、非字符串一律拒绝。
  for (const bad of [unregistered, "relative/path", "", null, undefined, 42, {}, join(temp, "work", "nope")]) {
    const result = await core.resolveWorkspaceTarget(bad, registered);
    assert.equal(result.ok, false, `拒绝 ${String(bad)}`);
    assert.equal(result.code, "error.workspace.unregistered");
  }
  const emptyList = await core.resolveWorkspaceTarget(gitProject, []);
  assert.equal(emptyList.ok, false, "空登记列表不能写任何工作区");
  assert.equal(emptyList.code, "error.workspace.unregistered");
  const notList = await core.resolveWorkspaceTarget(gitProject, undefined);
  assert.equal(notList.ok, false, "宿主不提供列表时也不写项目");

  // 5. 登记路径不存在时返回不可用，而不是创建它。
  const ghost = join(temp, "work", "ghost");
  const missing = await core.resolveWorkspaceTarget(ghost, [ghost]);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "error.workspace.unavailable");
  assert.equal(await exists(ghost), false);

  // 6. 项目里的 .dsh 是链接时拒绝，避免把写入重定向到项目之外。
  const linked = join(temp, "work", "linked");
  const outside = join(temp, "outside");
  await mkdir(linked, { recursive: true });
  await mkdir(outside, { recursive: true });
  await symlink(outside, join(linked, ".dsh"), process.platform === "win32" ? "junction" : undefined);
  const linkedResult = await core.resolveWorkspaceTarget(linked, [linked]);
  assert.equal(linkedResult.ok, false, ".dsh 链接被拒绝");
  assert.equal(linkedResult.code, "error.root.unsafe");

  // 7. 工作区与用户技能目录重叠时拒绝（用户 DSH 目录本身不能当项目写）。
  const overlapHome = join(temp, "overlap-home");
  await mkdir(join(overlapHome, ".git"), { recursive: true });
  const savedHome = process.env.DSH_HOME;
  process.env.DSH_HOME = join(overlapHome, ".dsh");
  const overlap = await core.resolveWorkspaceTarget(overlapHome, [overlapHome]);
  assert.equal(overlap.ok, false, "项目 .dsh/skills 与用户 DSH 重叠时拒绝");
  assert.equal(overlap.code, "error.root.unsafe");
  process.env.DSH_HOME = savedHome;

  // 8. 登记路径大小写或结尾分隔符不同也算同一条。
  const trailing = await core.resolveWorkspaceTarget(gitProject + (process.platform === "win32" ? "\\" : "/"), registered);
  assert.equal(trailing.ok, undefined);
  assert.equal(trailing.root.projectRoot, resolve(gitProject));

  // 9. 解析出的根可以直接用于创建、导入，且只写所选工作区。
  const created = await core.createSkill({ name: "ws-demo", description: "工作区创建", body: "正文" }, undefined, { root: target.root });
  assert.equal(created.ok, undefined, JSON.stringify(created));
  assert.equal(await exists(join(gitProject, ".dsh", "skills", "ws-demo", "SKILL.md")), true);
  assert.equal(await exists(join(core.userRoots().find((r) => r.key === "dsh").path, "ws-demo")), false, "不写全局");
  assert.equal(await exists(join(plainProject, ".dsh")), false, "不写其他工作区");
  assert.match(await readFile(join(gitProject, ".dsh", "skills", "ws-demo", "SKILL.md"), "utf8"), /name: ws-demo/);

  // 10. 同名只和所选目录比较：全局已有同名，不挡住工作区创建。
  const globalRoot = core.userRoots().find((r) => r.key === "dsh");
  await mkdir(join(globalRoot.path, "shared-name"), { recursive: true });
  await writeFile(join(globalRoot.path, "shared-name", "SKILL.md"), "---\nname: shared-name\ndescription: 全局\n---\n全局");
  const sameName = await core.createSkill({ name: "shared-name", description: "项目同名", body: "项目正文" }, undefined, { root: target.root });
  assert.equal(sameName.ok, undefined, "全局同名不阻止项目创建");
  const duplicate = await core.createSkill({ name: "shared-name", description: "再来一次", body: "项目正文" }, undefined, { root: target.root });
  assert.equal(duplicate.ok, false, "同一项目目录内仍然冲突");
  assert.equal(duplicate.code, "error.create.conflict");

  // 用户级写入开放 Shared Agent，其他 Agent 目录无论如何都不可写。
  const sharedRoot = core.userRoots().find((item) => item.key === "agents");
  const viaAgents = await core.createSkill({ name: "via-agents", description: "x", body: "x" }, undefined, { root: sharedRoot });
  assert.equal(viaAgents.ok, undefined, "Shared Agent 普通创建无需安装特权");
  assert.equal(await lstat(join(sharedRoot.path, "via-agents", "SKILL.md")).then(() => true, () => false), true);
  for (const key of ["codex", "claude", "gemini", "cursor"]) {
    const other = core.userRoots().find((item) => item.key === key);
    const refused = await core.createSkill({ name: "never-" + key, description: "x", body: "x" }, undefined, { root: other });
    assert.equal(refused.ok, false, key + " 不可写");
    assert.equal(await lstat(join(other.path, "never-" + key)).then(() => true, () => false), false);
  }

  let directBuilds = 0;
  const watched = core.createWorkspaceIndex([gitProject, plainProject], { onBuild: () => { directBuilds += 1; } });
  assert.equal(directBuilds, 0, "创建索引对象本身不扫描");
  await watched.load();
  await watched.load();
  assert.equal(directBuilds, 1, "同一次索引只在第一次读取时通知一次");
  assert.equal(core.takeWorkspaceIndexBuilds, undefined, "测试计数器不能导出到插件");

  const { createRepositoryManager } = await import("../lib/repositories.js");
  let builds = 0;
  const idle = createRepositoryManager({ registeredWorkspaces: () => [gitProject, plainProject], onWorkspaceIndexBuild: () => { builds += 1; } });
  await idle.list();
  await idle.sources();
  assert.equal(builds, 0, "没有工作区安装记录时不扫描登记工作区");

  console.log("工作区目标：登记校验、项目根解析、链接与重叠防护、同名只比较所选目录均通过");
} finally {
  await rm(temp, { recursive: true, force: true });
}
