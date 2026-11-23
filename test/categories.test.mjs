// 分类只记在管理器状态里，按来源分开，不移动技能文件。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const temporary = await mkdtemp(join(tmpdir(), "dssm-cat-"));
process.env.DSH_HOME = join(temporary, "dsh");
process.env.DSH_AGENTS_HOME = join(temporary, "agents");
process.env.DSH_CODEX_HOME = join(temporary, "codex");
process.env.HOME = process.env.USERPROFILE = join(temporary, "user");
const { createCategory, renameCategory, deleteCategory, assignSkillCategory, moveSkillInCategory, moveCategory, sortCategoriesByName, setCategoryEnabled, readManagerState, state, projectRoots, deleteSkill, restoreTrash, permanentlyDeleteTrash, managerStatePath } = await import("../lib/core.js");

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

// 边界测试：空分类名、纯空白、前后空格 trim 以及重名冲突
const emptyName = await createCategory("dsh", "   ");
assert.equal(emptyName.code, "error.category.name", "纯空白分类名应被拒绝");
const trimmedCategory = await createCategory("dsh", "  去空格分类  ");
assert.equal(trimmedCategory.category.name, "去空格分类", "分类名应自动 trim 掉首尾空格");
const duplicateName = await createCategory("dsh", "去空格分类");
assert.equal(duplicateName.code, "error.category.duplicate", "同来源下已存在的同名分类应报错拒绝");
const selfRename = await renameCategory("dsh", trimmedCategory.category.id, "去空格分类");
assert.equal(selfRename.category.name, "去空格分类", "重命名为自身名称保持幂等");

// 字符长度测试：支持最长 64 字符，超过 64 字符被拒绝
const len64Name = "c".repeat(64);
const cat64 = await createCategory("dsh", len64Name);
assert.equal(cat64.ok, undefined, "允许创建 64 字符上限的分类");
assert.equal(cat64.category.name, len64Name);
const len65Name = "c".repeat(65);
const cat65 = await createCategory("dsh", len65Name);
assert.equal(cat65.code, "error.category.name", "超过 64 字符应被拒绝");
const rename65 = await renameCategory("dsh", cat64.category.id, len65Name);
assert.equal(rename65.code, "error.category.name", "重命名超过 64 字符应被拒绝");
await deleteCategory("dsh", cat64.category.id);

// 分类自选排序与按名称排序测试
const catAlpha = await createCategory("dsh", "Playwright-Alpha");
const catBeta = await createCategory("dsh", "Playwright-Beta");
const catGamma = await createCategory("dsh", "Playwright-Gamma");
// 测试 moveCategory：将 catGamma 移动到 catAlpha 之前
const movedCategory = await moveCategory("dsh", catGamma.category.id, catAlpha.category.id, "before");
assert.equal(movedCategory.ok, undefined, "支持将分类移动到目标分类之前");
const currentCats1 = (await state()).roots.find((r) => r.key === "dsh").categories;
const gammaIndex = currentCats1.findIndex((c) => c.id === catGamma.category.id);
const alphaIndex = currentCats1.findIndex((c) => c.id === catAlpha.category.id);
assert.equal(gammaIndex + 1, alphaIndex, "catGamma 应紧邻在 catAlpha 之前");

// 测试 moveCategory：将 catAlpha 移动到 catBeta 之后 (position: "after")，覆盖下移关键语义
await moveCategory("dsh", catAlpha.category.id, catBeta.category.id, "after");
const currentCatsAfter = (await state()).roots.find((r) => r.key === "dsh").categories;
const alphaIdxAfter = currentCatsAfter.findIndex((c) => c.id === catAlpha.category.id);
const betaIdxAfter = currentCatsAfter.findIndex((c) => c.id === catBeta.category.id);
assert.equal(betaIdxAfter + 1, alphaIdxAfter, "catAlpha 应紧邻在 catBeta 之后");

// 测试 moveCategory 防御：targetId === id 自指定时保持原位，不得被移到末尾（被测分类必须不在末尾，以防假绿）
const curCatsBeforeSelf = (await state()).roots.find((r) => r.key === "dsh").categories;
const betaIdx = curCatsBeforeSelf.findIndex((c) => c.id === catBeta.category.id);
assert.ok(betaIdx >= 0 && betaIdx < curCatsBeforeSelf.length - 1, "前置：被测分类 catBeta 必须不在末尾");
const beforeSelf = curCatsBeforeSelf.map((c) => c.id);
await moveCategory("dsh", catBeta.category.id, catBeta.category.id, "before");
const afterSelf = (await state()).roots.find((r) => r.key === "dsh").categories.map((c) => c.id);
assert.deepEqual(afterSelf, beforeSelf, "targetId === id 自指定时顺序保持不变");

// 测试 moveCategory 移至末尾
await moveCategory("dsh", catGamma.category.id, undefined, "after");
const currentCats2 = (await state()).roots.find((r) => r.key === "dsh").categories;
assert.equal(currentCats2[currentCats2.length - 1].id, catGamma.category.id, "catGamma 应被移到末尾");

// 测试 sortCategoriesByName：按名称升序排序
const sortedCatsAsc = await sortCategoriesByName("dsh", "asc");
assert.equal(sortedCatsAsc.ok, undefined, "支持按名称升序排序分类");
const ascNames = (await state()).roots.find((r) => r.key === "dsh").categories.map((c) => c.name);
const expectedAsc = [...ascNames].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
assert.deepEqual(ascNames, expectedAsc, "分类应按名称自然排序");

// 测试 sortCategoriesByName 幂等：重复同向排序直接返回现有列表，且不得重写状态文件
const mtimeBefore = (await stat(managerStatePath())).mtimeMs;
const reSortedCats = await sortCategoriesByName("dsh", "asc");
assert.equal(reSortedCats.ok, undefined, "重复排序应直接成功返回");
assert.deepEqual(reSortedCats.categories.map((c) => c.id), sortedCatsAsc.categories.map((c) => c.id), "重复排序结果应保持一致");
const mtimeAfter = (await stat(managerStatePath())).mtimeMs;
assert.equal(mtimeAfter, mtimeBefore, "已有序时不应重写状态文件");

// 测试 sortCategoriesByName：按名称降序排序
const sortedCatsDesc = await sortCategoriesByName("dsh", "desc");
assert.equal(sortedCatsDesc.ok, undefined, "支持按名称降序排序分类");
const descNames = (await state()).roots.find((r) => r.key === "dsh").categories.map((c) => c.name);
const expectedDesc = [...descNames].sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
assert.deepEqual(descNames, expectedDesc, "分类应按名称降序排序");

// 清理测试分类
await deleteCategory("dsh", catAlpha.category.id);
await deleteCategory("dsh", catBeta.category.id);
await deleteCategory("dsh", catGamma.category.id);

await rm(temporary, { recursive: true, force: true });
console.log("categories ok");
