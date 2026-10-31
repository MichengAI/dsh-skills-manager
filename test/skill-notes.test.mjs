import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const temporary = await mkdtemp(join(tmpdir(), "dssm-note-"));
process.env.DSH_HOME = join(temporary, "dsh");
process.env.DSH_AGENTS_HOME = join(temporary, "agents");
process.env.DSH_CODEX_HOME = join(temporary, "codex");
process.env.HOME = process.env.USERPROFILE = join(temporary, "user");

const {
  setSkillNote,
  readManagerState,
  state,
  projectRoots,
  deleteSkill,
  permanentlyDeleteTrash,
} = await import("../lib/core.js");

const skillText = (name, desc = "原始说明") => `---
name: ${name}
description: ${desc}
---
正文
`;

const writeSkill = async (root, name, desc) => {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), skillText(name, desc));
  return join(dir, "SKILL.md");
};

const dsh = join(process.env.DSH_HOME, "skills");
const codex = join(process.env.DSH_CODEX_HOME, "skills");
const keptPath = await writeSkill(dsh, "kept-skill", "原始 DSH 说明");
const codexPath = await writeSkill(codex, "codex-skill", "Original Codex prompt");
const keptBefore = await readFile(keptPath, "utf8");
const codexBefore = await readFile(codexPath, "utf8");

try {
  // 1. 设置自定义简介
  const res1 = await setSkillNote("dsh", "kept-skill", "我自己的中文备注");
  assert.equal(res1.ok, undefined);
  assert.equal(res1.root, "dsh");
  assert.equal(res1.name, "kept-skill");
  assert.equal(res1.note, "我自己的中文备注");
  assert.equal(await readFile(keptPath, "utf8"), keptBefore, "设置备注绝对不修改 SKILL.md");

  // 2. 外部只读来源也可以设置备注且不修改外部文件
  const res2 = await setSkillNote("codex", "codex-skill", "用于快速审查代码");
  assert.equal(res2.ok, undefined);
  assert.equal(res2.note, "用于快速审查代码");
  assert.equal(await readFile(codexPath, "utf8"), codexBefore, "只读来源也不改动文件");

  // 3. state() 接口返回的视图中应包含 customNote
  const view = await state();
  const dshSkill = view.roots.find((r) => r.key === "dsh").skills.find((s) => s.name === "kept-skill");
  assert.equal(dshSkill.customNote, "我自己的中文备注");
  assert.equal(dshSkill.description, "原始 DSH 说明", "原 description 保持不变");

  const codexSkill = view.roots.find((r) => r.key === "codex").skills.find((s) => s.name === "codex-skill");
  assert.equal(codexSkill.customNote, "用于快速审查代码");
  assert.equal(codexSkill.description, "Original Codex prompt");

  // 4. 清空备注（传空字符串或纯空白）会移除自定义简介
  const clearRes = await setSkillNote("dsh", "kept-skill", "   ");
  assert.equal(clearRes.ok, undefined);
  assert.equal(clearRes.note, null);
  const viewAfterClear = await state();
  const dshSkillCleared = viewAfterClear.roots.find((r) => r.key === "dsh").skills.find((s) => s.name === "kept-skill");
  assert.equal(dshSkillCleared.customNote, null);

  // 5. 长度超出 500 字符限制应报错
  const tooLong = "a".repeat(501);
  const failLong = await setSkillNote("dsh", "kept-skill", tooLong);
  assert.equal(failLong.ok, false);
  assert.equal(failLong.code, "error.note.tooLarge");

  // 6. 不存在的技能或不存在的来源
  const noSkill = await setSkillNote("dsh", "non-existent", "test");
  assert.equal(noSkill.ok, false);
  assert.equal(noSkill.code, "error.skill.notFound");

  const noRoot = await setSkillNote("invalid-root", "kept-skill", "test");
  assert.equal(noRoot.ok, false);
  assert.equal(noRoot.code, "error.note.root");

  // 7. 项目来源支持
  const project = join(temporary, "workspace");
  await mkdir(join(project, ".git"), { recursive: true });
  await writeSkill(join(project, ".dsh", "skills"), "project-skill", "项目原生说明");
  const projectRoot = (await projectRoots([project])).find((item) => item.kind === "project-dsh");
  assert.ok(projectRoot);

  const projRes = await setSkillNote(projectRoot.key, "project-skill", "项目专用备注", undefined, { projectCwds: [project] });
  assert.equal(projRes.ok, undefined);
  assert.equal(projRes.note, "项目专用备注");

  // 8. 回收站永久删除后清理备注记录
  await setSkillNote("dsh", "kept-skill", "待清空备注");
  const trashed = await deleteSkill(dsh, "kept-skill");
  const rawStateBefore = (await readManagerState()).state;
  assert.equal(rawStateBefore.customNotes?.dsh?.["kept-skill"], "待清空备注", "软删除进回收站仍保留备注");
  await permanentlyDeleteTrash(trashed.id);
  const rawStateAfter = (await readManagerState()).state;
  assert.equal(rawStateAfter.customNotes?.dsh?.["kept-skill"], undefined, "永久删除后清理备注");

  // 9. 边界缺陷：同名现役技能防误删
  // 场景：技能 active-note 被移入回收站（旧条目），随后用户又新建了同名技能 active-note 并设置了新备注；
  // 此时去永久删除旧回收站条目，不能误杀现役 active-note 的新备注！
  await writeSkill(dsh, "active-note", "旧说明");
  await setSkillNote("dsh", "active-note", "旧备注");
  const oldTrash = await deleteSkill(dsh, "active-note");
  // 新建同名技能并写新备注
  await writeSkill(dsh, "active-note", "新说明");
  await setSkillNote("dsh", "active-note", "新现役备注");
  assert.equal((await readManagerState()).state.customNotes?.dsh?.["active-note"], "新现役备注");
  // 永久删除旧条目
  await permanentlyDeleteTrash(oldTrash.id);
  // 断言：现役同名技能的备注绝不能被清空！
  const stateAfterTrashDelete = (await readManagerState()).state;
  assert.equal(
    stateAfterTrashDelete.customNotes?.dsh?.["active-note"],
    "新现役备注",
    "永久删除旧回收站条目时，如果该来源下当前已有同名现役技能，绝不能清空现役技能的备注！"
  );

  // 10. 边界缺陷：移除来源或历史来源残留备注时，不能触发 state.json fail-closed
  // 场景：用户曾为自定义来源写过备注，随后该来源被移除或暂时不可用，state.json 中留有其 customNotes 记录；
  // 读取 state.json 时必须保持 writable: true，不能误判为文件损坏！
  const stateFilePath = join(process.env.DSH_HOME, "skills-manager", "state.json");
  const rawState = JSON.parse(await readFile(stateFilePath, "utf8"));
  rawState.customNotes["custom:removed-source"] = { "some-skill": "历史遗留备注" };
  await writeFile(stateFilePath, JSON.stringify(rawState, null, 2));

  const loadedStateResult = await readManagerState();
  assert.equal(loadedStateResult.writable, true, "存在历史或已移除来源的备注记录时，状态文件仍应可写，绝不能 fail-closed 锁定！");
  assert.equal(loadedStateResult.warning, null);

  console.log("skill-notes.test.mjs passed");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
