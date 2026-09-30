// 使用确定的网络响应与隔离目录，验证仓库来源、安装和失败边界。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { promises as fileSystem } from "node:fs";

const sandbox = await mkdtemp(join(tmpdir(), "dssm-repository-test-"));
process.env.DSH_HOME = join(sandbox, "home");
process.env.USERPROFILE = join(sandbox, "user");
const { parseRepositoryInput, decodeRepositoryArchive, createRepositoryManager } = await import("../lib/repositories.js");
let sha = "a".repeat(40);
const doc = (name, description = "测试技能") => strToU8(`---\nname: ${name}\ndescription: ${description}\n---\n技能正文\n`);
let archive = zipSync({ "repo-main/skills/pdf/SKILL.md": doc("pdf", "Use when: reviewing files"), "repo-main/skills/pdf/references/help.txt": strToU8("参考资料"), "repo-main/skills/docx/SKILL.md": doc("docx") });
let broken = false;
const requested = [];
const fetchImpl = async (url, options) => {
  requested.push(url);
  assert.equal(options.redirect, "error", "不跟随网络重定向");
  if (broken === "timeout") throw new DOMException("请求超时", "TimeoutError");
  if (broken) return new Response("", { status: 403 });
  if (url.startsWith("https://codeload.github.com/")) return new Response(archive);
  if (url.includes("/commits/")) return Response.json({ sha });
  return Response.json({ default_branch: "main", private: false });
};
try {
  assert.deepEqual(parseRepositoryInput({ url: "https://github.com/Example/Skills/tree/main/skills" }), { owner: "example", name: "skills", ref: "main", subdirectory: "skills" });
  assert.equal(parseRepositoryInput({ url: "https://github.com/Example/Skills/tree/main/skills", ref: "", subdirectory: "" }).subdirectory, "skills", "表单留空保留地址携带的子目录");
  assert.equal(parseRepositoryInput({ url: "example/skills", ref: "feature/ui" }).ref, "feature/ui");
  for (const url of ["http://github.com/a/b", "https://github.com.evil/a/b", "https://user:pass@github.com/a/b", "https://github.com/a/b?token=secret", "https://github.com/a/b/tree/main/%2e%2e"]) {
    assert.throws(() => parseRepositoryInput({ url }), /仓库|路径/);
  }
  for (const subdirectory of ["../skills", "C:/skills", "skills/CON", "skills/a.", "skills\\pdf"]) assert.throws(() => parseRepositoryInput({ url: "a/b", subdirectory }));
  assert.throws(() => decodeRepositoryArchive(zipSync({ "root/../escape/SKILL.md": doc("escape") })), /路径/);
  assert.throws(() => decodeRepositoryArchive(zipSync({ "root/A.txt": strToU8("a"), "root/a.txt": strToU8("b") })), /重复/);
  assert.throws(() => decodeRepositoryArchive(new Uint8Array((32 << 20) + 1)), error => error.code === "error.repo.tooLarge", "超大仓库使用专用双语错误码");
  const manager = createRepositoryManager({ fetchImpl });
  const added = await manager.add({ url: "example/skills", subdirectory: "skills" });
  await assert.rejects(manager.add({ url: "https://github.com/example/skills", subdirectory: "skills" }), /已添加/);
  assert.equal((await manager.list()).repositories.length, 1);
  await manager.refresh({ id: added.id });
  let list = await manager.list();
  assert.equal(list.repositories[0].skills.length, 2);
  assert.match(list.repositories[0].commit, /^[a-f0-9]{64}$/, "归档以内容摘要锁定，不查询提交API");
  assert.equal(list.repositories[0].skills.find((s) => s.name === "pdf").status, "available");
  assert.equal((await manager.detail({ id: added.id, path: "skills/pdf" })).body, "技能正文");
  const originalArchive = archive;
  archive = zipSync({ "repo-main/skills/pdf/SKILL.md": doc("impostor") });
  const requestsBeforeInstall = requested.length;
  const installed = await manager.install({ id: added.id, path: "skills/pdf" });
  assert.equal(requested.length, requestsBeforeInstall, "安装复用已验证缓存，不重新下载移动中的分支");
  const enabledPolicy = JSON.parse(await readFile(join(process.env.DSH_HOME, "skills-manager/state.json"), "utf8"));
  assert.ok(enabledPolicy.enabledSkills.dsh.includes("pdf"), "仓库安装写入显式启用策略，而不是只在界面上显示为开启");
  const { listProviderCandidates } = await import("../lib/core.js");
  const installedCandidate = (await listProviderCandidates()).find((candidate) => candidate.name === "pdf");
  assert.equal(installedCandidate?.invocation.userInvocable, true, "安装后的技能进入斜杠菜单覆盖项");
  assert.equal(installedCandidate?.invocation.modelInvocable, true, "安装后的技能同时允许模型调用");
  archive = originalArchive;
  const restartManager = createRepositoryManager({ fetchImpl: async () => { throw new Error("不应请求网络"); } });
  const cacheFile = join(process.env.DSH_HOME, "skills-manager/repository-cache", `${added.id}-${list.repositories[0].commit}.zip`);
  await writeFile(cacheFile, "损坏缓存", "utf8");
  await assert.rejects(restartManager.install({ id: added.id, path: "skills/docx" }), /缓存/, "重启后读取缓存仍检查摘要");
  await writeFile(cacheFile, originalArchive);
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
  await assert.rejects(manager.install({ id: added.id, path: "skills/pdf" }), /同名|安装/);
  sha = "b".repeat(40);
  archive = zipSync({ "repo-main/skills/pdf/SKILL.md": doc("pdf", "Use when: reviewing files"), "repo-main/skills/pdf/references/help.txt": strToU8("新版资料"), "repo-main/skills/docx/SKILL.md": doc("docx") });
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
  const requestsBeforeUpdate = requested.length;
  await manager.update({ id: added.id, path: "skills/pdf", token: clean.token });
  assert.equal(requested.length, requestsBeforeUpdate, "离线更新复用扫描缓存");
  broken = false;
  sha = "c".repeat(40);
  await manager.refresh({ id: added.id });
  assert.equal((await manager.list()).repositories[0].skills.find(s => s.name === "pdf").status, "installed", "仅提交变化不提示更新");
  await writeFile(join(process.env.DSH_HOME, "skills/pdf/SKILL.md"), "用户本地修改", "utf8");
  assert.equal((await manager.list()).repositories[0].skills.find((s) => s.name === "pdf").status, "conflict", "本地修改不误标为来源一致的安装副本");
  await assert.rejects(manager.install({ id: added.id, path: "skills/pdf" }), /同名|安装/);
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/SKILL.md"), "utf8"), "用户本地修改");
  broken = true;
  await manager.refresh({ id: added.id });
  list = await manager.list();
  assert.equal(list.repositories[0].skills.length, 2, "刷新失败保留上次目录");
  assert.equal(list.repositories[0].error.code, "error.repo.network");
  broken = "timeout";
  assert.equal((await manager.refresh({ id: added.id })).error.code, "error.repo.network", "数字错误码不会导致二次异常");
  broken = false;
  await assert.rejects(manager.install({ id: added.id, path: "../escape" }), /技能/);
  await manager.remove({ id: added.id });
  assert.equal((await manager.sources()).pdf.owner, "example", "移除订阅保留安装来源");
  assert.equal((await manager.list()).repositories.length, 0);
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills/pdf/SKILL.md"), "utf8"), "用户本地修改", "移除仓库不删除已安装技能");
  const concurrent = await Promise.allSettled([manager.add({ url: "a/concurrent" }), manager.add({ url: "a/concurrent" })]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1, "并发添加不会丢失状态或创建重复来源");
  assert.ok(requested.every(url => url.startsWith("https://codeload.github.com/")), "不消耗GitHub REST API额度");
  const branchRequests = [];
  const branchManager = createRepositoryManager({ fetchImpl: async url => { branchRequests.push(url); return url.includes("/refs/heads/") ? new Response("", { status: 404 }) : new Response(archive); } });
  const tagged = await branchManager.add({ url: "example/tagged", ref: "v1" });
  assert.equal((await branchManager.refresh({ id: tagged.id })).error, null);
  assert.equal(branchRequests.length, 2);
  assert.ok(branchRequests[1].endsWith("/refs/tags/v1"), "分支404才尝试同名标签");
  const deniedRequests = [];
  const denied = createRepositoryManager({ fetchImpl: async url => { deniedRequests.push(url); return new Response("", { status: 403 }); } });
  await denied.refresh({ id: tagged.id });
  assert.equal(deniedRequests.length, 1, "403不盲目重试其他分支");
  await mkdir(join(process.env.DSH_HOME, "skills-manager"), { recursive: true });
  await writeFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), JSON.stringify({ version: 1, repositories: [], installs: [null] }), "utf8");
  await assert.rejects(manager.add({ url: "a/b" }), /状态/, "结构损坏的来源记录同样拒绝覆盖");
  await writeFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), "坏数据", "utf8");
  await assert.rejects(manager.add({ url: "a/b" }), /状态/);
  assert.equal(await readFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), "utf8"), "坏数据", "损坏状态不能被覆盖");
  console.log("仓库来源、归档校验、安装、冲突、持久化与失败保护测试通过");
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
