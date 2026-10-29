// 项目页按所有已登记工作区取数：折叠行不扫描，展开才读技能；多路径同一项目根合并。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const temporary = await mkdtemp(join(tmpdir(), "dssm-ws-list-"));
process.env.DSH_HOME = join(temporary, "home");
process.env.HOME = process.env.USERPROFILE = join(temporary, "user");
for (const key of ["AGENTS", "CODEX", "CLAUDE", "GEMINI", "OPENCODE", "CURSOR", "COPILOT"]) process.env[`DSH_${key}_HOME`] = join(temporary, `configured-${key.toLowerCase()}`);
const { apply } = await import("../lib/index.js");
const core = await import("../lib/core.js");

const write = async (dir, name, description = "项目技能") => {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n正文\n`);
};
const gitProject = join(temporary, "work", "git-project");
const nested = join(gitProject, "packages", "web");
const plain = join(temporary, "work", "plain");
const ghost = join(temporary, "work", "ghost");
for (const dir of [join(gitProject, ".git"), nested, plain]) await mkdir(dir, { recursive: true });
await write(join(gitProject, ".dsh", "skills"), "git-skill");
await write(join(gitProject, ".claude", "skills"), "claude-skill");
await write(join(plain, ".dsh", "skills"), "plain-skill");
await write(join(process.env.DSH_HOME, "skills"), "global-skill");
await write(join(plain, ".dsh", "skills"), "global-skill", "项目同名");

// 只登记了子目录的项目：折叠行展示项目根，但请求必须用登记过的子目录路径。
const subOnlyRoot = join(temporary, "work", "sub-only");
const subOnlyDir = join(subOnlyRoot, "apps", "api");
await mkdir(join(subOnlyRoot, ".git"), { recursive: true });
await mkdir(subOnlyDir, { recursive: true });
await write(join(subOnlyRoot, ".dsh", "skills"), "sub-skill");

let registered = [
  { id: "a", title: "git-project", path: gitProject },
  { id: "b", title: "web", path: nested },
  { id: "c", title: "plain", path: plain },
  { id: "d", title: "ghost", path: ghost },
  { id: "e", title: "api", path: subOnlyDir },
];
let route;
apply({
  effect(register) { return register(); },
  skills: { registerProvider() { return () => {}; } },
  webStartup: { trustedHosts: [] },
  webServer: { register(value) { if (value.kind === "prefix") route = value; return () => {}; } },
  get(name) { return name === "workspaceRegistry" ? { list: () => registered } : undefined; },
});
const server = createServer((req, res) => route.handler(req, res));
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/api/michengai/dsh-skills-manager`;
const headers = { "content-type": "application/json", "x-dsh-skills-manager": "1" };
const get = async (path) => (await (await fetch(base + path)).json()).data;
const post = (path, body) => fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });

try {
  // 1. 工作区列表：每个登记项一行，只含名称、路径、技能数量，不带技能正文。
  const list = await get("/workspaces");
  assert.equal(list.items.length, 4, "子目录与仓库根合并成一个项目，失效路径单独成行");
  const gitRow = list.items.find((item) => item.projectRoot === resolve(gitProject));
  assert.deepEqual(gitRow.registeredPaths.map((p) => resolve(p)).sort(), [resolve(gitProject), resolve(nested)].sort());
  assert.equal(gitRow.name, "git-project");
  assert.equal(gitRow.skillCount, 2, ".dsh 与 .claude 两个来源共两个技能");
  assert.equal(gitRow.available, true);
  assert.equal("skills" in gitRow, false, "折叠行不带技能内容");
  const plainRow = list.items.find((item) => item.projectRoot === resolve(plain));
  assert.equal(plainRow.skillCount, 2);
  const ghostRow = list.items.find((item) => item.available === false);
  assert.equal(resolve(ghostRow.path), resolve(ghost), "目录不存在时标不可用并保留路径");
  assert.equal(ghostRow.errorCode, "ENOENT", "不可用工作区保留具体错误码");
  assert.equal(ghostRow.skillCount, 0);

  const subRow = list.items.find((item) => item.projectRoot === resolve(subOnlyRoot));
  assert.equal(resolve(subRow.path), resolve(subOnlyRoot), "展示的是项目根");
  assert.deepEqual(subRow.registeredPaths.map((p) => resolve(p)), [resolve(subOnlyDir)], "同时给出真正登记过的路径");
  let subResponse = await post("/workspace-skills", { workspace: subRow.registeredPaths[0] });
  assert.equal(subResponse.status, 200, "用登记路径展开可以读到项目技能");
  assert.deepEqual((await subResponse.json()).data.roots.find((r) => r.kind === "project-dsh").skills.map((s) => s.name), ["sub-skill"]);
  subResponse = await post("/workspace-skills", { workspace: subRow.path });
  assert.equal(subResponse.status, 400, "未登记的项目根不能直接当作入口");

  // 2. 没有登记服务时返回空列表，不抛错、不回退到当前会话。
  registered = null;
  const none = await get("/workspaces");
  assert.deepEqual(none.items, []);
  registered = [{ id: "a", title: "git-project", path: gitProject }, { id: "b", title: "web", path: nested }, { id: "c", title: "plain", path: plain }, { id: "d", title: "ghost", path: ghost }, { id: "e", title: "api", path: subOnlyDir }];

  // 3. 展开：只扫描所选项目，返回该项目的来源与技能，并按该项目算覆盖关系。
  let response = await post("/workspace-skills", { workspace: plain });
  assert.equal(response.status, 200);
  const detail = (await response.json()).data;
  assert.equal(detail.project.root, resolve(plain));
  const dsh = detail.roots.find((root) => root.kind === "project-dsh");
  assert.deepEqual(dsh.skills.map((s) => s.name).sort(), ["global-skill", "plain-skill"]);
  const shadow = dsh.skills.find((s) => s.name === "global-skill");
  assert.equal(shadow.shadowedBy, undefined, "项目副本优先于全局副本，自己不被覆盖");
  assert.equal(detail.roots.every((root) => root.projectRoot === resolve(plain)), true, "不混入其他项目的来源");
  assert.equal(JSON.stringify(detail).includes("git-skill"), false);

  // 4. 展开请求同样只认登记路径。
  for (const workspace of [join(temporary, "work", "unregistered"), "relative", 42, undefined]) {
    response = await post("/workspace-skills", { workspace });
    assert.equal(response.status, 400, `拒绝 ${String(workspace)}`);
    assert.equal((await response.json()).code, "error.workspace.unregistered");
  }
  response = await post("/workspace-skills", { workspace: ghost });
  assert.equal(response.status, 400);
  const ghostErr = await response.json();
  assert.equal(ghostErr.code, "error.workspace.unavailable");
  assert.equal(ghostErr.params?.code, "ENOENT", "工作区不可用错误保留具体错误码");

  // 5. 在项目页启停只改该项目的副本策略，不影响全局同名技能。
  const root = detail.roots.find((item) => item.kind === "project-dsh");
  response = await post("/disable", { workspace: plain, root: root.key, name: "global-skill" });
  assert.equal(response.status, 200, await response.clone().text());
  const after = (await (await post("/workspace-skills", { workspace: plain })).json()).data;
  assert.equal(after.roots.find((item) => item.kind === "project-dsh").skills.find((s) => s.name === "global-skill").managerEnabled, false);
  const user = (await get("/state")).roots.find((item) => item.key === "dsh");
  assert.equal(user.skills.find((s) => s.name === "global-skill").managerEnabled, true, "全局副本不受影响");
  response = await post("/enable", { workspace: join(temporary, "work", "unregistered"), root: root.key, name: "global-skill" });
  assert.equal(response.status, 400, "未登记工作区不能改启停");

  // 6. 其他来源（.claude）也能在项目页启停，根由该工作区自己的来源解析，不能借用别的项目的根。
  const claudeRoot = (await (await post("/workspace-skills", { workspace: gitProject })).json()).data.roots.find((item) => item.kind === "project-claude");
  assert.ok(claudeRoot, "git 项目有 .claude 来源");
  response = await post("/disable", { workspace: gitProject, root: claudeRoot.key, name: "claude-skill" });
  assert.equal(response.status, 200, await response.clone().text());
  response = await post("/disable", { workspace: plain, root: claudeRoot.key, name: "claude-skill" });
  assert.equal(response.status, 400, "其他项目的根 key 不能在这个工作区下使用");

  // 7. 展开后的详情、回收站、来源开关都以所选工作区为准，不依赖当前会话。
  response = await post("/detail", { workspace: plain, root: root.key, name: "plain-skill" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).data.name, "plain-skill");
  response = await post("/detail", { workspace: join(temporary, "work", "unregistered"), root: root.key, name: "plain-skill" });
  assert.equal(response.status, 400);
  response = await post("/source-disable", { workspace: gitProject, root: claudeRoot.key });
  assert.equal(response.status, 200, await response.clone().text());
  response = await post("/delete", { workspace: plain, root: root.key, name: "plain-skill" });
  assert.equal(response.status, 200, await response.clone().text());
  const afterDelete = (await (await post("/workspace-skills", { workspace: plain })).json()).data;
  assert.equal(afterDelete.roots.find((item) => item.kind === "project-dsh").skills.some((s) => s.name === "plain-skill"), false, "已移入回收站");
  // 回收站：被删技能能凭其原项目路径恢复，不要求该项目是当前会话。
  const trashed = (await get("/state")).trash.find((item) => item.name === "plain-skill");
  assert.ok(trashed, "项目技能进入回收站");
  assert.equal(trashed.root.projectRoot, resolve(plain), "条目记着原项目根");
  const savedRegistered = registered;
  registered = [];
  response = await post("/trash-restore", { id: trashed.id });
  assert.equal(response.status, 400, "原项目撤销登记后，省略 workspace 也无法恢复");
  registered = savedRegistered;
  response = await post("/trash-restore", { id: trashed.id, workspace: join(temporary, "work", "unregistered") });
  assert.equal(response.status, 400, "未登记工作区不能用来恢复");
  response = await post("/trash-restore", { id: trashed.id, workspace: gitProject });
  assert.equal(response.status, 400, "其他项目的作用域不能恢复这个条目");
  response = await post("/trash-restore", { id: trashed.id, workspace: plain });
  assert.equal(response.status, 200, await response.clone().text());
  const restored = (await (await post("/workspace-skills", { workspace: plain })).json()).data;
  assert.equal(restored.roots.find((item) => item.kind === "project-dsh").skills.some((s) => s.name === "plain-skill"), true, "已恢复回原项目");
  response = await post("/delete", { workspace: plain, root: root.key, name: "plain-skill" });
  assert.equal(response.status, 200);

  response = await post("/delete", { workspace: join(temporary, "work", "unregistered"), root: root.key, name: "global-skill" });
  assert.equal(response.status, 400, "未登记工作区不能删除");

  console.log("工作区列表：折叠行轻量、按项目展开、合并子目录、失效路径、登记校验与项目内启停均通过");
} finally {
  server.close();
  await rm(temporary, { recursive: true, force: true });
}
