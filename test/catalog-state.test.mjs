// 使用可控下载和隔离磁盘验证目录身份与仓库状态的并发一致性。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";

const sandbox = await mkdtemp(join(process.env.TMPDIR || tmpdir(), "dssm-catalog-state-"));
process.env.DSH_HOME = join(sandbox, "home");
process.env.DSH_AGENTS_HOME = join(sandbox, "agents");
process.env.HOME = process.env.USERPROFILE = join(sandbox, "user");
const { createRepositoryManager } = await import("../lib/repositories.js");
const { readManagerState } = await import("../lib/core.js");
const initialPolicy = (await readManagerState()).state;
const statePath = join(process.env.DSH_HOME, "skills-manager/repositories.json");
const stored = async () => JSON.parse(await readFile(statePath, "utf8"));
const document = strToU8("---\nname: actual-name\ndescription: 测试技能\n---\n正文\n");

try {
  await test("仓库下载不阻塞身份写入，刷新提交不覆盖并发身份", async () => {
    let release, start;
    const started = new Promise(resolve => { start = resolve; });
    const manager = createRepositoryManager({ fetchImpl: async () => {
      start();
      await new Promise(resolve => { release = resolve; });
      return new Response(zipSync({ "repo-main/actual-name/SKILL.md": document }));
    } });
    const repo = await manager.add({ url: "owner/concurrency" });
    const refreshing = manager.refresh({ id: repo.id });
    await started;
    let timeout;
    try {
      await Promise.race([
        manager.rememberCatalogInstall("skillsh:owner/skills/concurrent", "actual-name", { root: "dsh" }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("下载期间身份写入被阻塞")), 1000); }),
      ]);
    } finally { clearTimeout(timeout); release(); await refreshing; }
    const data = await stored();
    assert.equal(data.catalogInstalls?.length, 1, "刷新不得丢掉刚写入的目录身份");
    assert.equal(data.repositories.find(row => row.id === repo.id).skills.length, 1, "身份写入不得覆盖仓库扫描");
  });
  await test("目录身份按项目和用户根保存独立副本，不借用其他根的同名技能", async () => {
    const workspace = join(sandbox, "project");
    await mkdir(join(workspace, ".git"), { recursive: true });
    const projectSkill = join(workspace, ".dsh/skills/actual-name");
    const userSkill = join(process.env.DSH_HOME, "skills/actual-name");
    await mkdir(projectSkill, { recursive: true });
    await writeFile(join(projectSkill, "SKILL.md"), document);
    const manager = createRepositoryManager({ registeredWorkspaces: () => [workspace] });
    const id = "skillsh:owner/skills/position";
    await manager.rememberCatalogInstall(id, "actual-name", { workspace });
    assert.ok((await manager.list()).catalogInstalls.includes(id), "项目安装刷新后仍显示已安装");
    await mkdir(userSkill, { recursive: true });
    await writeFile(join(userSkill, "SKILL.md"), document);
    await manager.rememberCatalogInstall(id, "actual-name", { root: "dsh" });
    assert.equal((await stored()).catalogInstalls.filter(row => row.id === id).length, 2, "同一目录条目的两份副本都应保留");
    const copies = (await manager.list()).catalogCopies.filter(copy => copy.id === id);
    assert.deepEqual(copies.map(copy => copy.installedWorkspace ? "project" : copy.installedRoot).sort(), ["dsh", "project"], "列表返回每个安装位置，不只返回一个已安装标记");
    await manager.forgetCatalogInstall({ id, name: "actual-name", root: "dsh" });
    assert.ok((await manager.list()).catalogInstalls.includes(id), "移除用户身份不得影响项目副本");
    await rm(projectSkill, { recursive: true });
    assert.ok(!(await manager.list()).catalogInstalls.includes(id), "项目不存在时不能借用户根同名文件点亮");
    await rm(userSkill, { recursive: true });
  });
  await test("显式旧身份清理只移除该 ID 的无位置记录，保留副本与回收记录", async () => {
    const manager = createRepositoryManager();
    const id = "clawhub:owner/legacy";
    const data = await stored();
    const preserved = [
      { id, name: "actual-name", root: "dsh" },
      { id, name: "actual-name", root: "agents" },
      { id, name: "actual-name", trashId: "1-00000000-0000-4000-8000-000000000000" },
      "clawhub:owner/other",
    ];
    data.catalogInstalls = [id, { id, name: "actual-name" }, ...preserved];
    await writeFile(statePath, JSON.stringify(data), "utf8");
    await manager.forgetCatalogInstall({ name: "actual-name", root: "dsh" });
    assert.ok((await stored()).catalogInstalls.includes(id), "普通副本清理不猜测旧记录的位置");
    await manager.forgetCatalogInstall({ legacyId: id });
    assert.deepEqual((await stored()).catalogInstalls, preserved.slice(1), "仅清理明确 ID 的无位置旧记录");
    await assert.rejects(manager.forgetCatalogInstall({ legacyId: "" }), /清理/);
    assert.deepEqual((await stored()).catalogInstalls, preserved.slice(1), "无效 ID 不改写状态");
  });
  await test("仓库卸载保留目录回收身份，但不认领后来创建的同名替代品", async () => {
    const manager = createRepositoryManager({ fetchImpl: async () => new Response(zipSync({ "repo-main/actual-name/SKILL.md": document })) });
    const repo = await manager.add({ url: "owner/sibling" });
    await manager.refresh({ id: repo.id });
    await manager.install({ id: repo.id, path: "actual-name" });
    const id = "clawhub:owner/sibling";
    await manager.rememberCatalogInstall(id, "actual-name", { root: "dsh" });
    const deleted = await manager.uninstall({ id: repo.id, path: "actual-name", root: "dsh" });
    const userSkill = join(process.env.DSH_HOME, "skills/actual-name");
    await mkdir(userSkill, { recursive: true });
    await writeFile(join(userSkill, "SKILL.md"), document);
    assert.ok(!(await manager.list()).catalogInstalls.includes(id), "回收身份不能认领同位置的替代品");
    await rm(userSkill, { recursive: true });
    await manager.restoreTrash(deleted.id);
    assert.ok((await manager.list()).catalogInstalls.includes(id), "显式恢复后应重新关联目录身份");
  });
  await test("删除重建订阅后，旧下载结果不能覆盖新订阅", async () => {
    let start, release;
    const started = new Promise(resolve => { start = resolve; });
    const manager = createRepositoryManager({ fetchImpl: async () => {
      start(); await new Promise(resolve => { release = resolve; });
      return new Response(zipSync({ "repo-main/actual-name/SKILL.md": document }));
    } });
    const original = await manager.add({ url: "owner/recreated" });
    const refreshing = manager.refresh({ id: original.id });
    await started;
    try {
      await manager.remove({ id: original.id });
      const recreated = await manager.add({ url: "owner/recreated" });
      assert.equal(recreated.id, original.id);
    } finally { release(); await refreshing; }
    assert.equal((await stored()).repositories.find(repo => repo.id === original.id).commit, null, "旧刷新不属于新建的订阅生命周期");
  });
  await test("超过 16 MiB 的来源状态仍可缩小清理，但不能继续增大", async () => {
    const manager = createRepositoryManager();
    const id = `clawhub:owner/${"a".repeat(120)}`;
    const records = Array.from({ length: 160000 }, (_, index) => `clawhub:owner/p${String(index).padStart(6, "0")}${"b".repeat(100)}`);
    records.push(id);
    await mkdir(join(process.env.DSH_HOME, "skills-manager"), { recursive: true });
    await writeFile(statePath, JSON.stringify({ version: 1, repositories: [], installs: [], catalogInstalls: records }, null, 2), "utf8");
    assert.ok((await import("node:fs")).statSync(statePath).size > 16 << 20, "夹具必须真正超过 16 MiB");
    await manager.forgetCatalogInstall({ legacyId: id });
    const after = await stored();
    assert.equal(after.catalogInstalls.includes(id), false, "超限后仍必须能删除旧身份");
    assert.ok(after.catalogInstalls.length > 100000, "缩小清理不能截断其余身份");
    await assert.rejects(manager.rememberCatalogInstall("clawhub:owner/new-over-limit", "actual-name", { root: "dsh" }), error => error.code === "error.repo.capacity");
  });
  await test("已有定位副本时，同 ID 的旧记录不再标成位置未知", async () => {
    const name = "actual-name";
    const skill = join(process.env.DSH_HOME, "skills", name);
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), document);
    const id = "clawhub:owner/both";
    await mkdir(join(process.env.DSH_HOME, "skills-manager"), { recursive: true });
    const data = await stored().catch(() => ({ version: 1, repositories: [], installs: [], catalogInstalls: [] }));
    data.catalogInstalls = [id, { id, name, root: "dsh" }];
    await writeFile(statePath, JSON.stringify(data), "utf8");
    const listed = await createRepositoryManager().list();
    assert.ok(listed.catalogInstalls.includes(id), "已定位副本仍显示已安装");
    assert.equal(listed.catalogUnknownIds.includes(id), false, "同一 ID 不能同时显示位置未知");
  });
  await test("仓库安装确认写入失败要留下警告，不能静默返回", async () => {
    const manager = createRepositoryManager({ fetchImpl: async () => new Response(zipSync({ "repo-main/pending-warning/SKILL.md": strToU8("---\nname: pending-warning\ndescription: 测试技能\n---\n正文\n") })) });
    const repo = await manager.add({ url: "owner/pending-warning" });
    await manager.refresh({ id: repo.id });
    await manager.install({ id: repo.id, path: "pending-warning" });
    const data = await stored();
    const record = data.installs.find(item => item.name === "pending-warning");
    record.complete = false;
    await writeFile(statePath, JSON.stringify(data), "utf8");
    const nodeFs = await import("node:fs");
    const originalRename = nodeFs.promises.rename;
    nodeFs.promises.rename = async (from, to) => {
      if (String(to).endsWith("repositories.json")) throw new Error("模拟仓库安装确认写入失败");
      return originalRename(from, to);
    };
    try {
      const listed = await manager.list();
      assert.ok(listed.catalogWarnings.some(item => item.code === "error.repo.installState"), "确认写回失败必须可见");
    } finally { nodeFs.promises.rename = originalRename; }
    assert.equal((await stored()).installs.find(item => item.id === record.id).complete, false, "写入失败不得假装已确认");
  });
  await test("普通来源查询不补写未确认目录副本的启用策略", async () => {
    const name = "metadata-no-enable";
    const content = `---\nname: ${name}\ndescription: 测试技能\n---\n正文\n`;
    const skill = join(process.env.DSH_HOME, "skills", name);
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), content, "utf8");
    await mkdir(join(process.env.DSH_HOME, "skills-manager"), { recursive: true });
    await writeFile(statePath, JSON.stringify({ version: 1, repositories: [], installs: [], catalogInstalls: [] }), "utf8");
    const policyPath = join(process.env.DSH_HOME, "skills-manager/state.json");
    const policyBefore = JSON.stringify(initialPolicy);
    await writeFile(policyPath, policyBefore, "utf8");
    assert.equal((await readManagerState()).writable, true, "前置策略必须合法，不能靠失败关闭掩盖误写");
    const data = await stored();
    data.catalogInstalls.push({ id: "skillsh:owner/skills/metadata", name, root: "dsh", complete: false, files: [{ path: "SKILL.md", hash: createHash("sha256").update(content).digest("hex") }] });
    await writeFile(statePath, JSON.stringify(data), "utf8");
    const manager = createRepositoryManager();
    await manager.sources();
    assert.equal(await readFile(policyPath, "utf8"), policyBefore, "来源元数据读取不得改写任何启用策略");
  });
} finally { await rm(sandbox, { recursive: true, force: true }); }
