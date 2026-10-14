// 路由层的工作区目标：创建、导入、上传、仓库安装都只经登记列表解析，且不信任前端路径。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";

const temporary = await mkdtemp(join(tmpdir(), "dssm-ws-routes-"));
process.env.DSH_HOME = join(temporary, "home");
process.env.DSH_AGENTS_HOME = join(temporary, "agents");
process.env.HOME = process.env.USERPROFILE = join(temporary, "user");
for (const key of ["CODEX", "CLAUDE", "GEMINI", "OPENCODE", "CURSOR", "COPILOT"]) process.env[`DSH_${key}_HOME`] = join(temporary, `configured-${key.toLowerCase()}`);
const nativeFetch = globalThis.fetch;
let download;
globalThis.fetch = (url, options) => download && String(url).startsWith("https://codeload.github.com/") ? download() : nativeFetch(url, options);
const { apply } = await import("../lib/index.js");

const registered = join(temporary, "work", "registered");
const other = join(temporary, "work", "other");
const unregistered = join(temporary, "work", "unregistered");
for (const dir of [join(registered, ".git"), join(other, ".git"), unregistered]) await mkdir(dir, { recursive: true });
let list = [
  { id: "ws-1", title: "registered", path: registered },
  { id: "ws-2", title: "other", path: other },
];
let registryAvailable = true;
let route;
const emitted = [];
apply({
  sessions: { get: () => ({ header: { cwd: registered } }) },
  effect(register) { return register(); },
  skills: { registerProvider() { return () => {}; } },
  webRuntime: { trustedHosts: [] },
  webServer: { register(value) { if (value.kind === "prefix") route = value; return () => {}; } },
  get(name) {
    if (name === "sessions") return { list: () => [{ id: "test-session", header: { agentPreset: "default" } }] };
    return name === "workspaceRegistry" && registryAvailable ? { list: () => list } : undefined;
  },
  emit(name, ...args) { emitted.push([name, ...args]); },
});
const server = createServer((req, res) => route.handler(req, res));
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}/api/dsh-skills-manager`;
const headers = { "content-type": "application/json", "x-dsh-skills-manager": "1" };
const post = (action, payload) => fetch(`${base}/${action}`, { method: "POST", headers, body: JSON.stringify(payload) });
const exists = (path) => lstat(path).then(() => true, () => false);
const globalRoot = join(process.env.DSH_HOME, "skills");
const doc = (name) => `---\nname: ${name}\ndescription: 工作区路由测试\n---\n正文\n`;

try {
  // 1. 创建：选工作区只写该项目，不写全局，也不写别的工作区。
  let response = await post("create", { name: "route-create", description: "路由创建", body: "正文", workspace: registered });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(registered, ".dsh", "skills", "route-create", "SKILL.md")), true);
  assert.equal(await exists(join(globalRoot, "route-create")), false);
  assert.equal(await exists(join(other, ".dsh")), false);

  // 2. 未登记路径、相对路径、不存在路径：400 且不创建任何目录。
  for (const workspace of [unregistered, "relative/dir", join(temporary, "work", "ghost"), 42, {}]) {
    response = await post("create", { name: "route-denied", description: "x", body: "x", workspace });
    assert.equal(response.status, 400, `拒绝 ${JSON.stringify(workspace)}`);
    assert.equal((await response.json()).code, "error.workspace.unregistered");
  }
  assert.equal(await exists(join(unregistered, ".dsh")), false, "拒绝时不创建目录");
  assert.equal(await exists(join(temporary, "work", "ghost")), false);

  // 3. 登记服务不可用：任何工作区写入都拒绝，用户目录仍可写。
  registryAvailable = false;
  response = await post("create", { name: "no-registry", description: "x", body: "x", workspace: registered });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "error.workspace.unregistered");
  response = await post("create", { name: "user-still-ok", description: "用户目录", body: "正文" });
  assert.equal(response.status, 200, "缺省仍写用户目录");
  assert.equal(await exists(join(globalRoot, "user-still-ok", "SKILL.md")), true);
  registryAvailable = true;

  // 4. 同名只比较所选目录：全局已有，不挡项目；同一项目重复才冲突。
  response = await post("create", { name: "user-still-ok", description: "项目同名", body: "正文", workspace: other });
  assert.equal(response.status, 200, "全局同名不阻止项目");
  response = await post("create", { name: "user-still-ok", description: "再来", body: "正文", workspace: other });
  assert.equal(response.status, 400, "同一项目重复冲突");

  // 5. 上传：同样只写所选工作区，覆盖策略只相对所选目录。
  const entries = [{ path: "SKILL.md", data: Buffer.from(doc("route-upload")).toString("base64") }];
  response = await post("upload", { name: "route-upload", entries, workspace: registered });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(registered, ".dsh", "skills", "route-upload", "SKILL.md")), true);
  assert.equal(await exists(join(globalRoot, "route-upload")), false);
  response = await post("upload", { name: "route-upload", entries, workspace: unregistered });
  assert.equal(response.status, 400);
  assert.equal(await exists(join(unregistered, ".dsh")), false);

  // 6. 本地路径导入：来源与目标目录重叠检查对所选目录生效。
  // 本地目录导入沿用来源文件夹名作为技能名，因此文件夹名与断言保持一致。
  const source = join(temporary, "route-import");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "SKILL.md"), doc("route-import"));
  response = await post("import", { source, workspace: other });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(other, ".dsh", "skills", "route-import", "SKILL.md")), true);
  response = await post("import", { source: join(other, ".dsh", "skills"), workspace: other });
  const overlap = await response.json();
  assert.equal(overlap.ok === false || response.status >= 400, true, "来源位于所选目录内时拒绝");

  // 6b. 用户级位置：创建、上传、导入也可以写 Shared Agent，且只有它和 DSH 两处可写。
  const agentsRoot = process.env.DSH_AGENTS_HOME ? join(process.env.DSH_AGENTS_HOME, "skills") : "";
  response = await post("create", { name: "agents-created", description: "写进公共 Agent", body: "正文", root: "agents" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(agentsRoot, "agents-created", "SKILL.md")), true, "创建写进 Shared Agent 目录");
  assert.equal(await exists(join(globalRoot, "agents-created")), false, "不会同时写全局 DSH");
  response = await post("upload", { name: "agents-upload", entries: [{ path: "SKILL.md", data: Buffer.from(doc("agents-upload")).toString("base64") }], root: "agents" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(agentsRoot, "agents-upload", "SKILL.md")), true);
  const agentsSource = join(temporary, "agents-import-src");
  await mkdir(agentsSource, { recursive: true });
  await writeFile(join(agentsSource, "SKILL.md"), doc("agents-import-src"));
  response = await post("import", { source: agentsSource, root: "agents" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(agentsRoot, "agents-import-src", "SKILL.md")), true);
  // 写进 Shared Agent 的技能，在管理页里要能正常启停，并能移入回收站后原样恢复。
  response = await post("disable", { root: "agents", name: "agents-created" });
  assert.equal(response.status, 200, await response.clone().text());
  response = await post("enable", { root: "agents", name: "agents-created" });
  assert.equal(response.status, 200, await response.clone().text());
  response = await post("delete", { root: "agents", name: "agents-created" });
  assert.equal(response.status, 200, await response.clone().text());
  const agentsDeleted = (await response.json()).data;
  assert.equal(await exists(join(agentsRoot, "agents-created", "SKILL.md")), false, "普通 Shared Agent 技能无需安装记录也可回收");
  response = await post("trash-restore", { id: agentsDeleted.id });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(agentsRoot, "agents-created", "SKILL.md")), true, "普通 Shared Agent 技能恢复到原目录");
  const managerState = await (await fetch(`${base}/state`)).json();
  assert.equal(managerState.data.roots.find(root => root.key === "agents").mutable, true, "管理页应提供 Shared Agent 的普通文件操作");
  // Codex、Claude 等其他 Agent 目录仍然只读。
  for (const key of ["codex", "claude", "gemini"]) {
    response = await post("create", { name: "forbidden-" + key, description: "x", body: "x", root: key });
    assert.equal(response.status >= 400, true, key + " 目录不可写");
    assert.equal(await exists(join(temporary, "configured-" + key, "skills", "forbidden-" + key)), false);
  }
  // 带 workspace 的请求一律只写项目 DSH：即使同时声明 root=agents，也不能落到 Shared Agent。
  for (const [action, payload] of [
    ["create", { name: "ws-and-agents", description: "x", body: "x" }],
    ["upload", { name: "ws-and-agents", entries: [{ path: "SKILL.md", data: Buffer.from(doc("ws-and-agents")).toString("base64") }] }],
  ]) {
    response = await post(action, { ...payload, workspace: registered, root: "agents" });
    assert.equal(await exists(join(agentsRoot, "ws-and-agents")), false, action + "：带工作区时不写 Shared Agent");
    if (response.status === 200) assert.equal(await exists(join(registered, ".dsh", "skills", "ws-and-agents", "SKILL.md")), true, action + "：落在项目 DSH");
  }
  // 其他 Agent 目录即使走导入也不可写。
  const forbiddenSource = join(temporary, "forbidden-src");
  await mkdir(forbiddenSource, { recursive: true });
  await writeFile(join(forbiddenSource, "SKILL.md"), doc("forbidden-src"));
  for (const key of ["codex", "claude"]) {
    response = await post("import", { source: forbiddenSource, root: key });
    assert.equal(await exists(join(temporary, "configured-" + key, "skills", "forbidden-src")), false, "导入也不能写 " + key);
    response = await post("upload", { name: "forbidden-up", entries: [{ path: "SKILL.md", data: Buffer.from(doc("forbidden-up")).toString("base64") }], root: key });
    assert.equal(await exists(join(temporary, "configured-" + key, "skills", "forbidden-up")), false, "上传也不能写 " + key);
  }
  // 同名冲突只相对所选目录：DSH 里已有，不挡 Shared Agent。
  response = await post("create", { name: "dsh-and-agents", description: "x", body: "x" });
  assert.equal(response.status, 200);
  response = await post("create", { name: "dsh-and-agents", description: "x", body: "x", root: "agents" });
  assert.equal(response.status, 200, "同名只比较所选目录");

  // 7. 仓库安装：工作区只开放 DSH；不能和 Shared Agent 组合。
  download = () => new Response(zipSync({ "root/demo/SKILL.md": strToU8(doc("route-repo")) }));
  response = await post("repositories/add", { url: "example/ws-skills" });
  const id = (await response.json()).data.id;
  assert.equal((await post("repositories/refresh", { id })).status, 200);
  const missingWorkspace = join(temporary, "registered-but-missing");
  list.push({ path: missingWorkspace });
  response = await post("repositories/install", { id, path: "demo", workspace: missingWorkspace });
  assert.equal(response.status, 400);
  const missingError = await response.json();
  assert.equal(missingError.code, "error.workspace.unavailable");
  assert.deepEqual(missingError.params, { path: missingWorkspace }, "安装包装和 HTTP run 均保留完整翻译参数");
  response = await post("repositories/install", { id, path: "demo", root: "agents", workspace: registered });
  assert.equal(response.status, 400, "工作区不能装进 Shared Agent");
  assert.equal(await exists(join(registered, ".agents")), false);
  response = await post("repositories/install", { id, path: "demo", workspace: unregistered });
  assert.equal(response.status, 400);
  assert.equal(await exists(join(unregistered, ".dsh")), false);
  response = await post("repositories/install", { id, path: "demo", workspace: registered });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(registered, ".dsh", "skills", "route-repo", "SKILL.md")), true);
  assert.equal(await exists(join(globalRoot, "route-repo")), false, "工作区安装不写全局");
  const repoList = (await (await fetch(`${base}/repositories`)).json()).data.repositories[0].skills.find((item) => item.name === "route-repo");
  assert.equal(repoList.installedWorkspace, resolve(registered), "安装记录保存项目根");
  assert.equal(repoList.canUninstall, true);
  response = await post("repositories/preview", { id, path: "demo" });
  assert.equal(response.status, 400, "旧请求没有 workspace 时不能选择项目副本");
  response = await post("repositories/uninstall", { id, path: "demo", workspace: other });
  assert.equal(response.status, 400, "登记的其他工作区不授权本项目副本");
  assert.equal(await exists(join(registered, ".dsh", "skills", "route-repo")), true);
  response = await post("create", { name: "route-repo", description: "无来源的同名用户技能", body: "用户正文" });
  assert.equal(response.status, 200);
  const sourcedState = (await (await fetch(`${base}/state`)).json()).data;
  assert.equal(sourcedState.roots.find(root => root.key === "dsh").skills.find(skill => skill.name === "route-repo").installSource, null, "全局同名不能误挂项目来源");
  response = await post("workspace-skills", { workspace: registered });
  const projectSource = (await response.json()).data.roots.find(root => root.kind === "project-dsh").skills.find(skill => skill.name === "route-repo").installSource;
  assert.equal(projectSource?.workspace, resolve(registered), "项目展开装配该副本的来源");
  assert.equal(projectSource?.id, id);
  assert.equal((await post("delete", { name: "route-repo", root: "dsh" })).status, 200);
  assert.equal((await post("repositories/install", { id, path: "demo", workspace: other })).status, 200);
  assert.equal((await post("repositories/install", { id, path: "demo", root: "agents" })).status, 200);
  const copies = (await (await fetch(`${base}/repositories`)).json()).data.repositories[0].skills.find(item => item.name === "route-repo").installations;
  assert.equal(copies?.length, 3, "列表独立投影用户和两个项目副本");
  assert.deepEqual(copies.map(item => [item.installedRoot, item.installedWorkspace ?? null]), [["dsh", resolve(registered)], ["dsh", resolve(other)], ["agents", null]]);
  assert.ok(copies.every(item => item.tracked && item.canUninstall && item.status === "installed" && !item.updateAvailable && !item.canRollback));
  download = () => new Response(zipSync({ "root/demo/SKILL.md": strToU8(doc("route-repo") + "新版正文\n") }));
  assert.equal((await post("repositories/refresh", { id })).status, 200);
  const userPreview = (await (await post("repositories/preview", { id, path: "demo" })).json()).data;
  const projectPreview = (await (await post("repositories/preview", { id, path: "demo", workspace: other })).json()).data;
  assert.notEqual(userPreview.token, projectPreview.token, "预览令牌绑定副本身份");
  response = await post("repositories/update", { id, path: "demo", workspace: other, token: userPreview.token });
  assert.equal(response.status, 400, "用户令牌不能更新项目副本");
  response = await post("repositories/update", { id, path: "demo", workspace: other, token: projectPreview.token });
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(await readFile(join(other, ".dsh", "skills", "route-repo", "SKILL.md"), "utf8"), /新版正文/);
  assert.equal(await readFile(join(registered, ".dsh", "skills", "route-repo", "SKILL.md"), "utf8"), doc("route-repo"), "更新其他项目不碰本项目");
  assert.equal(await readFile(join(agentsRoot, "route-repo", "SKILL.md"), "utf8"), doc("route-repo"), "项目更新不碰用户副本");
  const rollbackPreview = (await (await post("repositories/preview", { id, path: "demo", workspace: other, rollback: true })).json()).data;
  response = await post("repositories/rollback", { id, path: "demo", workspace: other, token: rollbackPreview.token });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await readFile(join(other, ".dsh", "skills", "route-repo", "SKILL.md"), "utf8"), doc("route-repo"));
  assert.equal((await post("repositories/uninstall", { id, path: "demo", root: "dsh" })).status, 400, "root 独立定位用户目录，不能指向项目或 Shared Agent");

  // 每次管理重新读取登记；已有来源记录不是写权限。
  list = [];
  for (const action of ["preview", "update", "rollback", "uninstall"]) {
    response = await post("repositories/" + action, { id, path: "demo", workspace: registered, token: "stale" });
    assert.equal(response.status, 400, action + " 拒绝撤销登记后的项目管理");
    assert.equal((await response.json()).code, "error.workspace.unregistered");
    assert.equal(await exists(join(registered, ".dsh", "skills", "route-repo", "SKILL.md")), true);
  }
  list = [{ path: registered }, { path: other }];
  response = await post("repositories/uninstall", { id, path: "demo", workspace: registered, root: "dsh" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(registered, ".dsh", "skills", "route-repo")), false);
  assert.equal(await exists(join(other, ".dsh", "skills", "route-repo")), true, "卸载不碰其他项目副本");

  const trashed = (await response.json()).data;
  list = [];
  headers["x-dsh-skills-session"] = "still-active";
  response = await post("trash-restore", { id: trashed.id });
  assert.equal(response.status, 400, "无 workspace 的恢复也不能借活动会话绕过撤销登记");
  assert.equal(await exists(join(registered, ".dsh", "skills", "route-repo")), false);
  list = [{ path: registered }];
  response = await post("trash-restore", { id: trashed.id });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await exists(join(registered, ".dsh", "skills", "route-repo", "SKILL.md")), true);

  response = await post("disable", { name: "user-still-ok", root: "dsh" });
  assert.equal(response.status, 200, "不带 workspace 仍可停用全局技能");
  response = await post("enable", { name: "user-still-ok", root: "dsh", workspace: registered });
  assert.equal(response.status, 400, "带 workspace 时 root=dsh 不能改全局技能");
  assert.equal(await exists(join(globalRoot, "user-still-ok", "SKILL.md")), true);
  const afterSteal = (await (await fetch(`${base}/state`)).json()).data.roots.find((item) => item.key === "dsh").skills.find((item) => item.name === "user-still-ok");
  assert.notEqual(afterSteal.enabled, true, "全局技能保持停用");
  response = await post("detail", { name: "user-still-ok", root: "dsh", workspace: registered });
  assert.equal(response.status, 400, "带 workspace 的详情不能读取全局技能");
  response = await post("delete", { name: "user-still-ok", root: "dsh", workspace: registered });
  assert.equal(response.status, 400, "带 workspace 的删除不能移走全局技能");
  assert.equal(await exists(join(globalRoot, "user-still-ok", "SKILL.md")), true);
  const projectKey = (await (await post("workspace-skills", { workspace: registered })).json()).data.roots.find((item) => item.kind === "project-dsh").key;
  response = await post("disable", { name: "route-create", root: projectKey, workspace: registered });
  assert.equal(response.status, 200, "工作区范围内仍可按项目根键停用");
  response = await post("category-create", { root: "project-dsh:0123456789abcdef", name: "假项目分类", workspace: registered });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "error.category.root", "未登记项目键不能创建分类");
  emitted.length = 0;
  response = await post("category-create", { root: projectKey, name: "路由分类", workspace: registered });
  assert.equal(response.status, 200, await response.clone().text());
  const categoryId = (await response.json()).data.category.id;
  assert.deepEqual(emitted, [], "纯分类元数据创建不刷新宿主技能目录");
  response = await post("category-assign", { root: projectKey, name: "no-such-skill", category: categoryId, workspace: registered });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "error.skill.notFound", "路由归类也不接受不存在的技能");
  response = await post("category-assign", { root: projectKey, name: "route-create", category: categoryId, workspace: registered });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(emitted, [], "切换分组只改管理器元数据，不刷新宿主技能目录");
  response = await post("category-move", { root: projectKey, name: "route-create", category: categoryId, workspace: registered });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(emitted, [], "排序只改管理器元数据，不刷新宿主技能目录");
  response = await post("category-disable", { root: projectKey, category: categoryId, workspace: registered });
  assert.equal(response.status, 200, await response.clone().text());
  assert.ok(emitted.some(([name]) => name === "commands/change"), "分类启停仍刷新宿主技能目录");

  // 保存的项目根失效后，即便登记仍在，也不能改写父 Git 项目的同名文件。
  const parentSkill = join(temporary, "work", ".dsh", "skills", "route-repo", "SKILL.md");
  await mkdir(join(temporary, "work", ".git"), { recursive: true });
  await mkdir(join(temporary, "work", ".dsh", "skills", "route-repo"), { recursive: true });
  await writeFile(parentSkill, "父项目不可碰");
  await rm(join(registered, ".git"), { recursive: true });
  const stateBeforeDrift = await readFile(join(process.env.DSH_HOME, "skills-manager", "repositories.json"), "utf8");
  for (const action of ["preview", "update", "rollback", "uninstall"]) {
    response = await post("repositories/" + action, { id, path: "demo", workspace: registered, token: "stale" });
    assert.equal(response.status, 400, action + " 拒绝保存根漂移");
    assert.equal(await readFile(parentSkill, "utf8"), "父项目不可碰");
    assert.equal(await readFile(join(registered, ".dsh", "skills", "route-repo", "SKILL.md"), "utf8"), doc("route-repo"));
    assert.equal(await readFile(join(process.env.DSH_HOME, "skills-manager", "repositories.json"), "utf8"), stateBeforeDrift);
  }

  console.log("工作区路由：创建、上传、导入、仓库安装、登记校验与同名隔离均通过");
} finally {
  server.close();
  globalThis.fetch = nativeFetch;
  await rm(temporary, { recursive: true, force: true });
}
