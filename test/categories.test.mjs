// 分类只记在管理器状态里，按来源分开，不移动技能文件。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const temporary = await mkdtemp(join(tmpdir(), "dssm-cat-"));
process.env.DSH_HOME = join(temporary, "dsh");
process.env.DSH_AGENTS_HOME = join(temporary, "agents");
process.env.DSH_CODEX_HOME = join(temporary, "codex");
process.env.HOME = process.env.USERPROFILE = join(temporary, "user");
const { createCategory, renameCategory, deleteCategory, assignSkillCategory, moveSkillInCategory, setCategoryEnabled, readManagerState, state, projectRoots, deleteSkill, restoreTrash, permanentlyDeleteTrash } = await import("../lib/core.js");

const skillText = (name) => `---\nname: ${name}\ndescription: 测试技能\n---\n正文\n`;
const writeSkill = async (root, name, text = skillText(name)) => {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), text);
  return join(dir, "SKILL.md");
};

const dsh = join(process.env.DSH_HOME, "skills");
const codex = join(process.env.DSH_CODEX_HOME, "skills");
const kept = await writeSkill(dsh, "kept-skill");
await writeSkill(dsh, "broken-skill", "没有 frontmatter\n");
await writeSkill(codex, "codex-skill");
const before = await readFile(kept, "utf8");

const created = await createCategory("dsh", "工作");
assert.equal(created.ok, undefined);
assert.equal(created.root, "dsh");
assert.equal(created.category.name, "工作");
const assigned = await assignSkillCategory("dsh", "kept-skill", created.category.id);
assert.equal(assigned.ok, undefined);
assert.equal(await readFile(kept, "utf8"), before, "归类不改技能文件");

const view = await state();
const dshRoot = view.roots.find((root) => root.key === "dsh");
const codexRoot = view.roots.find((root) => root.key === "codex");
assert.deepEqual(dshRoot.categories.map((item) => item.name), ["工作"]);
assert.equal(dshRoot.skills.find((item) => item.name === "kept-skill").categoryId, created.category.id);
assert.equal(codexRoot.categories.length, 0, "分类不跨来源");
assert.equal(codexRoot.skills.find((item) => item.name === "codex-skill").categoryId, null);

const duplicate = await createCategory("dsh", "工作");
assert.equal(duplicate.ok, false);
assert.equal(duplicate.code, "error.category.duplicate");

const toggled = await setCategoryEnabled("dsh", created.category.id, false);
assert.equal(toggled.changed, 1);
assert.deepEqual(toggled.skipped, []);
assert.equal(await readFile(kept, "utf8"), before, "整组启停不改技能文件");
const disabled = (await state()).roots.find((root) => root.key === "dsh").skills.find((item) => item.name === "kept-skill");
assert.equal(disabled.enabled, false);

const broken = await assignSkillCategory("dsh", "broken-skill", created.category.id);
assert.equal(broken.ok, undefined);
const skipped = await setCategoryEnabled("dsh", created.category.id, true);
assert.equal(skipped.skipped.includes("broken-skill"), true, "结构不完整的技能被跳过");
assert.equal((await state()).roots.find((root) => root.key === "dsh").skills.find((item) => item.name === "kept-skill").enabled, true);

await writeSkill(dsh, "loose-skill");
const looseOff = await setCategoryEnabled("dsh", "", false);
assert.equal(looseOff.changed, 1, "未分类开关只动未归类技能");
const afterLoose = (await state()).roots.find((root) => root.key === "dsh");
assert.equal(afterLoose.skills.find((item) => item.name === "loose-skill").enabled, false);
assert.equal(afterLoose.skills.find((item) => item.name === "kept-skill").enabled, true, "未分类开关不动已归类技能");
const allOff = await setCategoryEnabled("dsh", "*", false);
assert.equal(allOff.changed >= 1, true, "全部关闭才动这个来源里的可调用技能");
assert.equal((await state()).roots.find((root) => root.key === "dsh").skills.find((item) => item.name === "kept-skill").enabled, false);

const renamed = await renameCategory("dsh", created.category.id, "科研");
assert.equal(renamed.category.name, "科研");
const removed = await deleteCategory("dsh", created.category.id);
assert.equal(removed.ok, undefined);
const afterDelete = (await state()).roots.find((root) => root.key === "dsh");
assert.equal(afterDelete.categories.length, 0);
assert.equal(afterDelete.skills.find((item) => item.name === "kept-skill").categoryId, null);
assert.equal(await readFile(kept, "utf8"), before, "删除分类不搬文件");

const stored = await readManagerState();
assert.equal(stored.writable, true, "分类写入后状态文件仍可写");

const ghost = await createCategory("dsh", "幽灵");
const missing = await assignSkillCategory("dsh", "no-such-skill", ghost.category.id);
assert.equal(missing.ok, false);
assert.equal(missing.code, "error.skill.notFound", "归类不存在的技能必须失败");
assert.equal((await readManagerState()).state.categoryMembers.dsh?.["no-such-skill"], undefined, "失败的归类不能落盘");

const fakeKey = "project-dsh:0123456789abcdef";
for (const result of [
  await createCategory(fakeKey, "假项目分类"),
  await renameCategory(fakeKey, "deadbeefdeadbeef", "改名"),
  await deleteCategory(fakeKey, "deadbeefdeadbeef"),
  await assignSkillCategory(fakeKey, "alpha", ""),
]) {
  assert.equal(result.ok, false);
  assert.equal(result.code, "error.category.root", "未登记的项目来源不能写入分类");
}
assert.equal((await readManagerState()).state.categories[fakeKey], undefined, "伪造项目键不能留下分类");

const project = join(temporary, "workspace");
await mkdir(join(project, ".git"), { recursive: true });
await writeSkill(join(project, ".dsh", "skills"), "alpha");
const projectRoot = (await projectRoots([project])).find((item) => item.kind === "project-dsh");
assert.ok(projectRoot, "测试工作区应解析出项目 DSH 来源");
const unbound = await createCategory(projectRoot.key, "无作用域");
assert.equal(unbound.code, "error.category.root", "没有工作区作用域时不能写项目分类");
const projectCategory = await createCategory(projectRoot.key, "项目分类", undefined, { projectCwds: [project] });
assert.equal(projectCategory.ok, undefined);
const projectAssigned = await assignSkillCategory(projectRoot.key, "alpha", projectCategory.category.id, undefined, { projectCwds: [project] });
assert.equal(projectAssigned.categoryId, projectCategory.category.id);

await writeSkill(dsh, "purge-skill");
const purgeCategory = await createCategory("dsh", "待清");
await assignSkillCategory("dsh", "purge-skill", purgeCategory.category.id);
const trashed = await deleteSkill(dsh, "purge-skill");
assert.equal((await readManagerState()).state.categoryMembers.dsh["purge-skill"], purgeCategory.category.id, "进回收站时保留分类");
await restoreTrash(trashed.id);
assert.equal((await state()).roots.find((root) => root.key === "dsh").skills.find((item) => item.name === "purge-skill").categoryId, purgeCategory.category.id, "恢复后仍在原分类");
const trashedAgain = await deleteSkill(dsh, "purge-skill");
await permanentlyDeleteTrash(trashedAgain.id);
assert.equal((await readManagerState()).state.categoryMembers.dsh?.["purge-skill"], undefined, "永久删除清掉分类成员");
await writeSkill(dsh, "purge-skill");
assert.equal((await state()).roots.find((root) => root.key === "dsh").skills.find((item) => item.name === "purge-skill").categoryId, null, "同名新建不继承已删除技能的分类");

for (const name of ["order-alpha", "order-beta", "order-gamma"]) await writeSkill(dsh, name);
const orderCategory = await createCategory("dsh", "排序");
for (const name of ["order-alpha", "order-beta", "order-gamma"]) await assignSkillCategory("dsh", name, orderCategory.category.id);
const reordered = await moveSkillInCategory("dsh", "order-gamma", orderCategory.category.id, "order-alpha", "before");
assert.deepEqual(reordered.order, ["order-gamma", "order-alpha", "order-beta"], "支持在同分类内移动到指定技能之前");
assert.deepEqual((await readManagerState()).state.categoryOrder.dsh[orderCategory.category.id], reordered.order, "排序顺序写入状态文件");
const movedToLoose = await moveSkillInCategory("dsh", "order-alpha", "", "loose-skill", "after");
assert.deepEqual(movedToLoose.order, ["broken-skill", "kept-skill", "loose-skill", "order-alpha", "purge-skill"], "技能跨分类后接入目标分类现有顺序");
assert.equal((await state()).roots.find((root) => root.key === "dsh").skills.find((item) => item.name === "order-alpha").categoryId, null, "排序落点同时更新分类归属");

await rm(temporary, { recursive: true, force: true });
console.log("categories ok");
