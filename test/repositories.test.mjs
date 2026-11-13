// 使用确定性的 Git 检出桩与隔离目录，验证仓库来源、安装和失败边界。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promises as fileSystem } from "node:fs";

const sandbox = await mkdtemp(join(tmpdir(), "dssm-repository-test-"));
process.env.DSH_HOME = join(sandbox, "home");
process.env.USERPROFILE = join(sandbox, "user");
// Linux/macOS 上 homedir() 读取 HOME；不隔离会把本机真实 Agent 技能目录扫进冲突判定。
process.env.HOME = join(sandbox, "user");
const { parseRepositoryInput, createRepositoryManager } = await import("../lib/repositories.js");
const { installationSourceKey } = await import("../lib/repository-updates.js");
const { estimateTokens, truncateCatalogDescription } = await import("../lib/token-count.js");

const doc = (name, description = "测试技能", extra = "") => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n技能正文\n`;
const longRepoDesc = "Use when: reviewing large files ".repeat(30) + "end";
const defaultTree = () => ({
  "skills/pdf/SKILL.md": doc("pdf", "Use when: reviewing files"),
  "skills/pdf/references/help.txt": "参考资料",
  "skills/docx/SKILL.md": doc("docx"),
  "skills/long/SKILL.md": doc("long", longRepoDesc),
});
let tree = defaultTree();
let commit = "a".repeat(40);
let broken = null;
let fetchCalls = 0;
const materialize = async (destinationDir, content) => {
  for (const [relative, body] of Object.entries(content)) {
    const target = join(destinationDir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, "utf8");
  }
};
// 检出桩：写出一棵确定的技能目录树，替代真实 Git 与网络。
const gitFetch = async (_repo, destinationDir) => {
  fetchCalls += 1;
  if (broken === "timeout") throw Object.assign(new Error("Git 请求超时，请检查网络后重试"), { code: "error.repo.network" });
  if (broken) throw Object.assign(new Error("无法连接到 Git 仓库，请检查网络或加速地址"), { code: "error.repo.network" });
  await materialize(destinationDir, tree);
  return { commit };
};

try {
  assert.deepEqual(parseRepositoryInput({ url: "https://github.com/Example/Skills/tree/main/skills" }), { owner: "example", name: "skills", ref: "main", subdirectory: "skills" });
  assert.equal(parseRepositoryInput({ url: "https://github.com/Example/Skills/tree/main/skills", ref: "", subdirectory: "" }).subdirectory, "skills", "表单留空保留地址携带的子目录");
  assert.equal(parseRepositoryInput({ url: "example/skills", ref: "feature/ui" }).ref, "feature/ui");
  for (const url of ["http://github.com/a/b", "https://github.com.evil/a/b", "https://user:pass@github.com/a/b", "https://github.com/a/b?token=secret", "https://github.com/a/b/tree/main/%2e%2e"]) {
    assert.throws(() => parseRepositoryInput({ url }), /仓库|路径/);
  }
  for (const subdirectory of ["../skills", "C:/skills", "skills/CON", "skills/a.", "skills\\pdf"]) assert.throws(() => parseRepositoryInput({ url: "a/b", subdirectory }));

  const manager = createRepositoryManager({ gitFetch });
  const added = await manager.add({ url: "example/skills", subdirectory: "skills" });
  await assert.rejects(manager.add({ url: "https://github.com/example/skills", subdirectory: "skills" }), /已添加/);
  assert.equal((await manager.list()).repositories.length, 1);
  await manager.refresh({ id: added.id });
  let list = await manager.list();
  assert.equal(list.repositories[0].skills.length, 3);
  assert.match(list.repositories[0].commit, /^[a-f0-9]{40}$/, "扫描版本以 Git 提交锁定，不再有归档摘要");
  assert.equal(list.repositories[0].skills.find((s) => s.name === "pdf").status, "available");
  const longSkill = list.repositories[0].skills.find((s) => s.name === "long");
  assert.ok(longSkill, "必须扫描到 long 技能");
  assert.equal(
    longSkill.descriptionTokens,
    estimateTokens(truncateCatalogDescription(longRepoDesc)),
    "仓库扫描阶段简介 token 必须真实接线 truncateCatalogDescription 截断",
  );
  assert.ok(
    longSkill.descriptionTokens < estimateTokens(longRepoDesc),
    "仓库扫描阶段截断 token 估算必须严格小于未截断值，防变异接线脱落",
  );
  assert.equal((await manager.detail({ id: added.id, path: "skills/pdf" })).body, "技能正文");
  const repoDetail = await manager.detail({ id: added.id, path: "skills/pdf" });
  assert.equal(repoDetail.descriptionTokens, estimateTokens("Use when: reviewing files"), "仓库详情返回简介 token 估算");
  assert.equal(repoDetail.bodyTokens, estimateTokens("技能正文"), "仓库详情返回正文 token 估算");

  // 存量兼容断言：模拟旧版本 state.json 中未持久化 token 字段的仓库条目，detail() 必须动态兜底估算
  const repoStatePath = join(sandbox, "home/skills-manager/repositories.json");
  const rawRepoState = JSON.parse(await readFile(repoStatePath, "utf8"));
  const targetSkill = rawRepoState.repositories[0].skills.find((s) => s.path === "skills/pdf");
  assert.ok(targetSkill, "必须在仓库状态中找到目标条目 skills/pdf");
  delete targetSkill.descriptionTokens;
  delete targetSkill.bodyTokens;
  const { writeFile: writeFsFile } = await import("node:fs/promises");
  await writeFsFile(repoStatePath, JSON.stringify(rawRepoState, null, 2), "utf8");
  const fallbackDetail = await manager.detail({ id: added.id, path: "skills/pdf" });
  assert.equal(fallbackDetail.descriptionTokens, estimateTokens("Use when: reviewing files"), "存量仓库条目在 detail() 优雅兜底简介 token 估算");
  assert.equal(fallbackDetail.bodyTokens, estimateTokens("技能正文"), "存量仓库条目在 detail() 优雅兜底正文 token 估算");

  tree = { "skills/pdf/SKILL.md": doc("impostor") };
  const callsBeforeInstall = fetchCalls;
  const installed = await manager.install({ id: added.id, path: "skills/pdf" });
  assert.equal(fetchCalls, callsBeforeInstall, "安装复用已验证的检出目录，不重新下载移动中的分支");
  tree = defaultTree();
  const enabledPolicy = JSON.parse(await readFile(join(process.env.DSH_HOME, "skills-manager/state.json"), "utf8"));
  assert.ok(enabledPolicy.enabledSkills.dsh.includes("pdf"), "仓库安装写入显式启用策略，而不是只在界面上显示为开启");
  const { listProviderCandidates, state: currentManagerState } = await import("../lib/core.js");
  const installedCandidate = (await listProviderCandidates()).find((candidate) => candidate.name === "pdf");
  assert.equal(installedCandidate?.invocation.userInvocable, true, "安装后的技能进入斜杠菜单覆盖项");
  assert.equal(installedCandidate?.invocation.modelInvocable, true, "安装后的技能同时允许模型调用");
  const dshRootState = (await currentManagerState()).roots.find((r) => r.key === "dsh");
  const installedSkillView = dshRootState?.skills.find((s) => s.name === "pdf");
  assert.equal(installedSkillView?.enabled, true, "安装后的常规技能处于开启状态");
  assert.equal(installedSkillView?.effectiveModelInvocable, true, "安装后的常规技能允许模型调用");
  assert.equal(installedSkillView?.effectiveUserInvocable, true, "安装后的常规技能允许用户调用");

  const offlineFetch = async () => { throw new Error("不应请求网络"); };
  const restartManager = createRepositoryManager({ gitFetch: offlineFetch });
  // 检出目录被清掉时必须给出可操作的错误，而不是退回整库下载。
  const checkoutDir = join(process.env.DSH_HOME, "skills-manager/repository-cache", `${added.id}-${list.repositories[0].commit}`);
  await rm(checkoutDir, { recursive: true, force: true });
  await assert.rejects(restartManager.install({ id: added.id, path: "skills/docx" }), /缓存/, "检出目录缺失时提示重新刷新，不回落下载");
  await manager.refresh({ id: added.id });
  const originalRename = fileSystem.rename;
  fileSystem.rename = async (from, to) => {
    if (to.endsWith("repositories.json")) {
      const pending = JSON.parse(await readFile(from, "utf8"));
      if (pending.installs.some(record => record.name === "docx" && record.complete)) throw new Error("模拟安装确认写入失败");
    }
    return originalRename(from, to);
  };
  try { await assert.rejects(manager.install({ id: added.id, path: "skills/docx" }), /安装|状态/); }
  finally { fileSystem.rename = originalRename; }
  const statePath = join(process.env.DSH_HOME, "skills-manager/repositories.json");
  const extraRepo = await restartManager.add({ url: "example/other" });
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).installs.find(record => record.name === "docx").complete, false, "添加订阅不触发无关的技能目录恢复");
  await restartManager.remove({ id: extraRepo.id });
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).installs.find(record => record.name === "docx").complete, false, "移除订阅不触发无关恢复");
  assert.equal((await restartManager.preview({ id: added.id, path: "skills/docx" })).localModified, false, "直接调用预览也能恢复安装记录，无需先打开列表");
  assert.equal((await restartManager.list()).repositories[0].skills.find(skill => skill.name === "docx").status, "installed", "重启后校验完整文件再恢复未确认安装");
  const recoveredStateFile = join(process.env.DSH_HOME, "skills-manager/repositories.json");
  const recoveredState = JSON.parse(await readFile(recoveredStateFile, "utf8"));
  assert.equal(recoveredState.installs.find(record => record.name === "docx").complete, true, "恢复结果必须持久化");
  assert.equal((await restartManager.preview({ id: added.id, path: "skills/docx" })).localModified, false, "恢复后可进入正常更新预览");
  recoveredState.installs.find(record => record.name === "docx").complete = false;
  await writeFile(recoveredStateFile, JSON.stringify(recoveredState), "utf8");
  await writeFile(join(process.env.DSH_HOME, "skills/docx/SKILL.md"), "用户修改", "utf8");
  assert.equal((await restartManager.list()).repositories[0].skills.find(skill => skill.name === "docx").status, "conflict", "不认领已被修改的未确认安装");
  await writeFile(join(process.env.DSH_HOME, "skills/docx/SKILL.md"), doc("docx"));
  await restartManager.list();
  await assert.rejects(restartManager.install({ id: added.id, path: "skills/docx" }), /同名/, "已恢复安装不能重复覆盖");
  assert.equal(installed.name, "pdf");
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/references/help.txt"), "utf8"), "参考资料");
  assert.equal((await manager.list()).repositories[0].skills.find((s) => s.name === "pdf").status, "installed");
  await rm(join(process.env.DSH_HOME, "skills/pdf"), { recursive: true });
  const missingCopy = (await manager.list()).repositories[0].skills.find((s) => s.name === "pdf");
  assert.equal(missingCopy.installations.length, 0, "文件已不在时不把安装记录显示成已安装位置");
  assert.equal(missingCopy.status, "available");
  assert.equal(missingCopy.installedRoot, null);
  await manager.install({ id: added.id, path: "skills/pdf" });
  await assert.rejects(manager.install({ id: added.id, path: "skills/pdf" }), /同名|安装/);

  commit = "b".repeat(40);
  tree = { ...defaultTree(), "skills/pdf/references/help.txt": "新版资料" };
  await manager.refresh({ id: added.id });
  assert.equal((await manager.list()).repositories[0].skills.find(s => s.name === "pdf").status, "update", "资源变化也提示更新");
  const preview = await manager.preview({ id: added.id, path: "skills/pdf" });
  assert.deepEqual(preview.changes, [{ path: "references/help.txt", kind: "modified" }]);
  await writeFile(join(process.env.DSH_HOME, "skills/pdf/extra.txt"), "用户文件", "utf8");
  await assert.rejects(manager.update({ id: added.id, path: "skills/pdf", token: preview.token }), /变化|修改/);
  const changed = await manager.preview({ id: added.id, path: "skills/pdf" });
  assert.equal(changed.localModified, true, "额外文件也属于本地修改");
  await assert.rejects(manager.update({ id: added.id, path: "skills/pdf", token: changed.token }), /本地修改/);
  await manager.update({ id: added.id, path: "skills/pdf", token: changed.token, overwrite: true });
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/references/help.txt"), "utf8"), "新版资料");
  const rollback = await manager.preview({ id: added.id, path: "skills/pdf", rollback: true });
  const { createRepositoryUpdater } = await import("../lib/repository-updates.js");
  const failingWriter = createRepositoryUpdater({
    read: async () => JSON.parse(await readFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), "utf8")),
    write: async () => { throw new Error("模拟状态写入失败"); },
    serialize: task => task(), parseRepositoryInput,
  });
  await assert.rejects(failingWriter.rollback({ id: added.id, path: "skills/pdf", token: rollback.token }), /模拟状态写入失败/);
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/references/help.txt"), "utf8"), "新版资料", "状态写入失败自动恢复替换前内容");
  await manager.rollback({ id: added.id, path: "skills/pdf", token: rollback.token });
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/extra.txt"), "utf8"), "用户文件", "回退完整恢复原有本地文件");
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/references/help.txt"), "utf8"), "参考资料");
  await rm(join(process.env.DSH_HOME, "skills/pdf/extra.txt"));
  const clean = await manager.preview({ id: added.id, path: "skills/pdf" });
  broken = true;
  const callsBeforeUpdate = fetchCalls;
  await manager.update({ id: added.id, path: "skills/pdf", token: clean.token });
  assert.equal(fetchCalls, callsBeforeUpdate, "离线更新复用扫描缓存");
  broken = null;
  commit = "c".repeat(40);
  await manager.refresh({ id: added.id });
  assert.equal((await manager.list()).repositories[0].skills.find(s => s.name === "pdf").status, "installed", "仅提交变化不提示更新");
  await writeFile(join(process.env.DSH_HOME, "skills/pdf/SKILL.md"), "用户本地修改", "utf8");
  assert.equal((await manager.list()).repositories[0].skills.find((s) => s.name === "pdf").status, "conflict", "本地修改不误标为来源一致的安装副本");
  await assert.rejects(manager.install({ id: added.id, path: "skills/pdf" }), /同名|安装/);
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/SKILL.md"), "utf8"), "用户本地修改");
  broken = true;
  await manager.refresh({ id: added.id });
  list = await manager.list();
  assert.equal(list.repositories[0].skills.length, 3, "刷新失败保留上次目录");
  assert.equal(list.repositories[0].error.code, "error.repo.network");
  broken = "timeout";
  assert.equal((await manager.refresh({ id: added.id })).error.code, "error.repo.network", "数字错误码不会导致二次异常");
  broken = null;
  await assert.rejects(manager.install({ id: added.id, path: "../escape" }), /技能/);
  await manager.remove({ id: added.id });
  assert.equal((await manager.sources())[installationSourceKey(join(process.env.DSH_HOME, "skills"), "pdf")].owner, "example", "移除订阅保留安装来源");
  assert.equal((await manager.list()).repositories.length, 0);
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/SKILL.md"), "utf8"), "用户本地修改", "移除仓库不删除已安装技能");

  // 回归测试：通过仓库安装包含 disable-model-invocation: true 的技能，权限不被提权 (#51)
  const restrictedTree = { "skills/restricted/SKILL.md": doc("restricted", "Only for user.", "disable-model-invocation: true\n") };
  const restrictedManager = createRepositoryManager({
    gitFetch: async (_repo, destinationDir) => { await materialize(destinationDir, restrictedTree); return { commit: "e".repeat(40) }; },
  });
  const restrictedRepo = await restrictedManager.add({ url: "example/restricted", subdirectory: "skills" });
  await restrictedManager.refresh({ id: restrictedRepo.id });
  await restrictedManager.install({ id: restrictedRepo.id, path: "skills/restricted" });
  const dshState = (await (await import("../lib/core.js")).state()).roots.find((r) => r.key === "dsh");
  const restrictedView = dshState?.skills.find((s) => s.name === "restricted");
  assert.equal(restrictedView?.enabled, true, "受限技能安装后总闸处于开启状态");
  assert.equal(restrictedView?.effectiveModelInvocable, false, "受限技能模型不可调用，未被管理器提权 (#51)");
  assert.equal(restrictedView?.effectiveUserInvocable, true, "受限技能斜杠命令正常允许调用");

  // 分支/标签选择原样传给检出层，不再有归档分支回退
  const seenRefs = [];
  const refManager = createRepositoryManager({
    gitFetch: async (repo, destinationDir) => { seenRefs.push(repo.ref); await materialize(destinationDir, defaultTree()); return { commit: "f".repeat(40) }; },
  });
  const taggedRepo = await refManager.add({ url: "example/tagged", ref: "v1" });
  assert.equal((await refManager.refresh({ id: taggedRepo.id })).error, null);
  assert.deepEqual(seenRefs, ["v1"], "分支与标签由检出层解析，管理器不做多分支回退");

  const concurrent = await Promise.allSettled([manager.add({ url: "a/concurrent" }), manager.add({ url: "a/concurrent" })]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1, "并发添加不会丢失状态或创建重复来源");

  await mkdir(join(process.env.DSH_HOME, "skills-manager"), { recursive: true });
  await writeFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), JSON.stringify({ version: 1, repositories: [], installs: [null] }), "utf8");
  await assert.rejects(manager.add({ url: "a/b" }), /状态/, "结构损坏的来源记录同样拒绝覆盖");
  await writeFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), JSON.stringify({ version: 1, repositories: [], installs: [] }), "utf8");
  await manager.rememberCatalogInstall("clawhub:owner/skill-a", "pdf");
  await manager.rememberCatalogInstall("clawhub:owner/missing-skill", "missing");
  const initialCatalogList = await manager.list();
  assert.deepEqual(initialCatalogList.catalogInstalls, ["clawhub:owner/skill-a"], "list() 只返回本地实际存在的技能目录标识，过滤已不存在的技能");
  await manager.forgetCatalogInstall({ name: "pdf", root: "dsh" });
  const clearedCatalogList = await manager.list();
  assert.deepEqual(clearedCatalogList.catalogInstalls, [], "forgetCatalogInstall 成功清除对应技能的目录安装记录");
  await writeFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), "坏数据", "utf8");
  await assert.rejects(manager.add({ url: "a/b" }), /状态/);
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), "utf8"), "坏数据", "损坏状态不能被覆盖");
  console.log("仓库来源、Git 检出复用、安装、冲突、持久化与失败保护测试通过");
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
