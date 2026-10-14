// 通过真实插件 HTTP 路由验证目录安装副本、回收站与失败边界。
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { promises as fileSystem } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const sandbox = await mkdtemp(join(process.env.TMPDIR || tmpdir(), "dssm-catalog-lifecycle-"));
process.env.DSH_HOME = join(sandbox, "home");
process.env.DSH_AGENTS_HOME = join(sandbox, "agents");
process.env.HOME = process.env.USERPROFILE = join(sandbox, "user");
const workspace = join(sandbox, "project");
await mkdir(join(workspace, ".git"), { recursive: true });
const nativeFetch = globalThis.fetch;
let installedName = "actual-name";
let releaseDownload, downloadStarted;
let holdDownload = false;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://skills.sh/api/download/")) return nativeFetch(url, options);
  if (holdDownload) {
    downloadStarted?.();
    await new Promise(resolve => { releaseDownload = resolve; });
  }
  return Response.json({ files: [{ path: "SKILL.md", contents: `---\nname: ${installedName}\ndescription: 测试技能\n---\n正文\n` }] });
};
const { apply } = await import("../lib/index.js");
let route;
apply({ effect: fn => fn(), skills: { registerProvider() { return () => {}; } }, webRuntime: { trustedHosts: [] },
  webServer: { register(value) { if (value.kind === "prefix") route = value; return () => {}; } },
  get(name) { if (name === "workspaceRegistry") return { list: () => [{ id: "one", title: "项目", path: workspace }] }; },
});
const server = createServer((req, res) => route.handler(req, res));
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/api/dsh-skills-manager`;
const post = async (path, body) => {
  const response = await nativeFetch(base + path, { method: "POST", headers: { "content-type": "application/json", "x-dsh-skills-manager": "1" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  return { status: response.status, ...await response.json() };
};
const install = (slug, target = {}) => post("/catalog/install", { catalog: "skillsh", source: "owner/skills", skillId: slug, ...target });
const list = async () => (await (await nativeFetch(base + "/repositories")).json()).data;
const stored = async () => JSON.parse(await readFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), "utf8"));

try {
  await test("软删除保留目录身份，恢复后恢复徽章", async () => {
    assert.equal((await install("restore-slug")).status, 200);
    const deleted = await post("/delete", { root: "dsh", name: installedName });
    assert.equal(deleted.status, 200);
    assert.ok((await stored()).catalogInstalls.some(record => record.id === "skillsh:owner/skills/restore-slug"), "移入回收站不得丢身份");
    assert.ok(!(await list()).catalogInstalls.includes("skillsh:owner/skills/restore-slug"));
    assert.equal((await post("/trash-restore", { id: deleted.data.id })).status, 200);
    assert.ok((await list()).catalogInstalls.includes("skillsh:owner/skills/restore-slug"));
  });
  await test("安装确认写入失败留下持久意图，重读后校验文件并恢复身份", async () => {
    installedName = "confirm-failure";
    const originalRename = fileSystem.rename;
    fileSystem.rename = async (from, to) => {
      if (to.endsWith("repositories.json")) {
        const data = JSON.parse(await readFile(from, "utf8"));
        if (data.catalogInstalls?.some(record => record.name === installedName && record.complete !== false)) throw new Error("模拟目录安装确认失败");
      }
      return originalRename(from, to);
    };
    let failed;
    try { failed = await install("confirm-slug"); }
    finally { fileSystem.rename = originalRename; }
    assert.ok(failed.status >= 400);
    const pending = (await stored()).catalogInstalls.find(record => record.id === "skillsh:owner/skills/confirm-slug");
    assert.equal(pending?.complete, false, "文件落盘后必须存在可恢复意图");
    assert.ok(pending.files.some(file => file.path === "SKILL.md"), "恢复必须基于精确的文件摘要");
    assert.equal(failed.code, "error.repo.installState");
    assert.ok((await list()).catalogInstalls.includes("skillsh:owner/skills/confirm-slug"));
    assert.equal((await stored()).catalogInstalls.find(record => record.id === "skillsh:owner/skills/confirm-slug").complete, true);
  });
  await test("失败删除不清身份，项目与用户副本分别回收和永久删除", async () => {
    installedName = "positions-name";
    const id = "skillsh:owner/skills/positions-slug";
    assert.equal((await install("positions-slug")).status, 200);
    assert.equal((await install("positions-slug", { workspace })).status, 200);
    const original = (await stored()).catalogInstalls.filter(record => record.id === id);
    assert.equal(original.length, 2);
    assert.equal((await post("/delete", { root: "agents", name: installedName })).status, 400);
    assert.deepEqual((await stored()).catalogInstalls.filter(record => record.id === id), original);
    const project = await post("/workspace-skills", { workspace });
    const projectRoot = project.data.roots.find(root => root.kind === "project-dsh");
    const userDeleted = await post("/delete", { root: "dsh", name: installedName });
    assert.ok((await list()).catalogInstalls.includes(id), "用户副本回收后仍有活动项目副本");
    const projectDeleted = await post("/delete", { root: "dsh", workspace, name: installedName });
    assert.equal(projectDeleted.status, 200, "目录卸载传 dsh 加工作区时要解析到项目根，不能报来源只读");
    assert.ok(!(await list()).catalogInstalls.includes(id));
    assert.equal((await post("/trash-restore", { id: projectDeleted.data.id, workspace })).status, 200);
    assert.ok((await list()).catalogInstalls.includes(id));
    assert.equal((await post("/trash-delete", { id: userDeleted.data.id })).status, 200);
    const remaining = (await stored()).catalogInstalls.filter(record => record.id === id);
    assert.equal(remaining.length, 1, "永久删除只清对应回收副本");
    assert.equal(remaining[0].workspace, projectRoot.projectRoot);
  });
  await test("Shared Agent 目录副本可以回收、恢复并保留安装身份", async () => {
    installedName = "shared-catalog-name";
    const id = "skillsh:owner/skills/shared-catalog-slug";
    assert.equal((await install("shared-catalog-slug", { root: "agents" })).status, 200);
    const deleted = await post("/delete", { root: "agents", name: installedName });
    assert.equal(deleted.status, 200, "已安装的 Shared Agent 副本不能被误判为只读");
    assert.ok(!(await list()).catalogInstalls.includes(id));
    assert.ok((await stored()).catalogInstalls.some(record => record.id === id && record.trashId === deleted.data.id));
    assert.equal((await post("/trash-restore", { id: deleted.data.id })).status, 200);
    assert.ok((await list()).catalogInstalls.includes(id));
  });
  await test("旧字符串身份不猜名称，用户重装时仅对完整相同内容重新关联", async () => {
    installedName = "legacy-real-name";
    const skill = join(process.env.DSH_HOME, "skills", installedName);
    await mkdir(skill, { recursive: true });
    const originalDoc = `---\nname: ${installedName}\ndescription: 测试技能\n---\n正文\n`;
    await writeFile(join(skill, "SKILL.md"), originalDoc, "utf8");
    const id = "skillsh:owner/skills/legacy-slug";
    const data = await stored();
    data.catalogInstalls.push(id);
    await writeFile(join(process.env.DSH_HOME, "skills-manager/repositories.json"), JSON.stringify(data), "utf8");
    assert.ok(!(await list()).catalogInstalls.includes(id), "旧字符串不能拿 slug 或同名技能猜身份");
    const beforeIntent = fileSystem.rename;
    let failedIntent = false;
    fileSystem.rename = async (from, to) => {
      if (to.endsWith("repositories.json") && !failedIntent) {
        const candidate = JSON.parse(await readFile(from, "utf8"));
        if (candidate.catalogInstalls?.some(record => record.id === id && record.complete === false)) { failedIntent = true; throw new Error("模拟重新关联意图写入失败"); }
      }
      return beforeIntent(from, to);
    };
    try { assert.ok((await install("legacy-slug")).status >= 400); }
    finally { fileSystem.rename = beforeIntent; }
    assert.ok((await stored()).catalogInstalls.includes(id), "意图写入失败必须保留旧身份，不因清理新意图而丢失旧记录");
    await writeFile(join(skill, "SKILL.md"), originalDoc + "用户修改\n", "utf8");
    assert.equal((await install("legacy-slug")).status, 409, "内容不一致时不得认领或覆盖旧安装");
    assert.equal(await readFile(join(skill, "SKILL.md"), "utf8"), originalDoc + "用户修改\n");
    await writeFile(join(skill, "SKILL.md"), originalDoc, "utf8");
    assert.equal((await install("legacy-slug")).status, 200, "内容完全相同的旧安装可在明确目的地重新关联");
    assert.equal(await readFile(join(skill, "SKILL.md"), "utf8"), originalDoc, "重新关联不改已有技能文件");
    assert.ok((await list()).catalogInstalls.includes(id));
    assert.ok((await stored()).catalogInstalls.some(record => record.id === id && record.name === installedName && record.root === "dsh"));
  });
  await test("目录包下载不阻塞本地写入", async () => {
    installedName = "nonblocking-download";
    holdDownload = true;
    const started = new Promise(resolve => { downloadStarted = resolve; });
    const installing = install("nonblocking-slug");
    await started;
    const localWriting = post("/create", { name: "ordinary-during-download", description: "测试本地操作", body: "正文" });
    let timeout;
    try {
      const local = await Promise.race([
        localWriting,
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("目录下载阻塞了本地写入")), 1000); }),
      ]);
      assert.equal(local.status, 200);
    } finally { clearTimeout(timeout); holdDownload = false; releaseDownload(); await installing; await localWriting; }
  });
  await test("启用写入失败保留意图，修改过的未确认副本不会被恢复认领", async () => {
    installedName = "policy-failure";
    const id = "skillsh:owner/skills/policy-slug";
    const originalRename = fileSystem.rename;
    fileSystem.rename = async (from, to) => {
      if (to.endsWith("state.json")) throw new Error("模拟启用策略写入失败");
      return originalRename(from, to);
    };
    let failed;
    try { failed = await install("policy-slug"); }
    finally { fileSystem.rename = originalRename; }
    assert.ok(failed.status >= 400);
    assert.equal(failed.code, "error.repo.installState", "文件保留后的启用失败必须提供可恢复诊断");
    assert.equal((await stored()).catalogInstalls.find(record => record.id === id).complete, false);
    const skillDoc = join(process.env.DSH_HOME, "skills", installedName, "SKILL.md");
    const original = await readFile(skillDoc, "utf8");
    await writeFile(skillDoc, original + "本地修改\n", "utf8");
    assert.ok(!(await list()).catalogInstalls.includes(id), "不完整或被修改的未确认副本不得恢复认领");
    await writeFile(skillDoc, original, "utf8");
    assert.ok((await list()).catalogInstalls.includes(id), "精确文件恢复后可完成启用与身份确认");
  });
  await test("回收站恢复确认失败后，根据成功凭据恢复原身份", async () => {
    installedName = "restore-confirm-failure";
    const id = "skillsh:owner/skills/restore-confirm-slug";
    assert.equal((await install("restore-confirm-slug")).status, 200);
    const deleted = await post("/delete", { root: "dsh", name: installedName });
    const originalRename = fileSystem.rename;
    fileSystem.rename = async (from, to) => {
      if (to.endsWith("repositories.json")) {
        const data = JSON.parse(await readFile(from, "utf8"));
        if (data.catalogInstalls.some(record => record.id === id && !record.trashId)) throw new Error("模拟恢复确认失败");
      }
      return originalRename(from, to);
    };
    let failed;
    try { failed = await post("/trash-restore", { id: deleted.data.id }); }
    finally { fileSystem.rename = originalRename; }
    assert.equal(failed.code, "error.repo.installState");
    const pending = (await stored()).catalogInstalls.find(record => record.id === id);
    assert.equal(pending.trashId, deleted.data.id);
    assert.ok(pending.restoreFingerprint);
    assert.ok((await list()).catalogInstalls.includes(id));
    assert.equal((await stored()).catalogInstalls.find(record => record.id === id).trashId, undefined);
  });
  await test("恢复未确认安装时保留用户后续明确的停用选择", async () => {
    installedName = "respect-disable";
    const id = "skillsh:owner/skills/respect-disable-slug";
    const originalRename = fileSystem.rename;
    fileSystem.rename = async (from, to) => {
      if (to.endsWith("repositories.json")) {
        const data = JSON.parse(await readFile(from, "utf8"));
        if (data.catalogInstalls.some(record => record.id === id && record.complete === true)) throw new Error("模拟身份确认失败");
      }
      return originalRename(from, to);
    };
    try { assert.equal((await install("respect-disable-slug")).status, 500); }
    finally { fileSystem.rename = originalRename; }
    assert.equal((await post("/disable", { root: "dsh", name: installedName })).status, 200);
    assert.ok((await list()).catalogInstalls.includes(id), "副本仍然已安装，不因停用丢身份");
    const policy = JSON.parse(await readFile(join(process.env.DSH_HOME, "skills-manager/state.json"), "utf8"));
    assert.ok(policy.disabledSkills.dsh.includes(installedName), "修复来源状态不能重新启用用户明确停用的副本");
    assert.ok(!policy.enabledSkills.dsh.includes(installedName));
  });
  await test("永久删除的状态写入失败时保留回收站文件和身份", async () => {
    installedName = "delete-write-failure";
    const id = "skillsh:owner/skills/delete-write-failure";
    assert.equal((await install("delete-write-failure")).status, 200);
    const deleted = await post("/delete", { root: "dsh", name: installedName });
    assert.equal(deleted.status, 200);
    const trashDir = join(process.env.DSH_HOME, "skills-manager/trash", deleted.data.id);
    const originalRename = fileSystem.rename;
    fileSystem.rename = async (from, to) => {
      if (String(to).endsWith("repositories.json")) {
        const data = JSON.parse(await readFile(from, "utf8"));
        if (!data.catalogInstalls.some(record => record.id === id && record.trashId === deleted.data.id)) throw new Error("模拟永久删除后的状态写入失败");
      }
      return originalRename(from, to);
    };
    let failed;
    try { failed = await post("/trash-delete", { id: deleted.data.id }); }
    finally { fileSystem.rename = originalRename; }
    assert.ok(failed.status >= 400, "状态写失败必须报告失败");
    assert.equal(await readFile(join(trashDir, "metadata.json"), "utf8").then(() => true, () => false), true, "状态未提交时不得删除回收站文件");
    assert.equal((await stored()).catalogInstalls.find(record => record.id === id).trashId, deleted.data.id);
  });
  await test("超过500条身份仍可安装，不淘汰已定位副本和回收记录", async () => {
    const path = join(process.env.DSH_HOME, "skills-manager/repositories.json");
    const original = await stored();
    const records = Array.from({ length: 500 }, (_, index) => ({ id: `clawhub:owner/capacity-${index}`, name: `capacity-${index}`, root: index % 2 ? "agents" : "dsh", ...(index === 0 ? { trashId: "1-00000000-0000-4000-8000-000000000000" } : {}) }));
    try {
      await writeFile(path, JSON.stringify({ ...original, catalogInstalls: records }), "utf8");
      installedName = "capacity-new";
      assert.equal((await install("capacity-new")).status, 200, "第501次安装不能被记录数量阻断");
      const actual = (await stored()).catalogInstalls;
      assert.equal(actual.length, 501);
      assert.deepEqual(actual.slice(0, 500), records, "已有副本和回收记录不得被截断");
    } finally { await writeFile(path, JSON.stringify(original), "utf8"); }
  });
  await test("恢复启用失败不阻断查询和其他仓库操作，意图与诊断保留", async () => {
    const path = join(process.env.DSH_HOME, "skills-manager/repositories.json");
    const policyPath = join(process.env.DSH_HOME, "skills-manager/state.json");
    const original = await stored();
    const originalPolicy = await readFile(policyPath, "utf8");
    installedName = "pending-broken-policy";
    const id = "skillsh:owner/skills/pending-broken-policy";
    const originalRename = fileSystem.rename;
    fileSystem.rename = async (from, to) => {
      if (to.endsWith("state.json")) throw new Error("模拟启用失败");
      return originalRename(from, to);
    };
    try { assert.equal((await install("pending-broken-policy")).status, 500); }
    finally { fileSystem.rename = originalRename; }
    try {
      await writeFile(policyPath, "{broken-json", "utf8");
      const response = await nativeFetch(base + "/repositories");
      assert.equal(response.status, 200, "恢复意图失败不能阻断列表");
      const data = (await response.json()).data;
      assert.ok(data.catalogWarnings.some(item => item.id === id && item.code === "error.repo.installState"), "读取成功也必须提示恢复失败");
      assert.equal((await stored()).catalogInstalls.find(item => item.id === id).complete, false);
      const added = await post("/repositories/add", { url: "owner/unrelated-policy" });
      assert.equal(added.status, 200, "无关仓库操作不能被启用意图阻断");
      await writeFile(policyPath, originalPolicy, "utf8");
      assert.ok((await list()).catalogInstalls.includes(id), "策略恢复后再完成原意图");
    } finally {
      await writeFile(path, JSON.stringify(original), "utf8");
      await writeFile(policyPath, originalPolicy, "utf8");
    }
  });
} finally {
  globalThis.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(sandbox, { recursive: true, force: true });
}
