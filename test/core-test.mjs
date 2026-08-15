// dsh-skills-manager core 单元测试（临时根，零第三方依赖）
// 运行：node test/core-test.mjs

import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  toKebab,
  parseSkillDoc,
  serializeSkillDoc,
  yamlScalar,
  unquote,
  parseBoolValue,
  setSkillEnabled,
  deleteSkill,
  importSkill,
  state,
  resolveEntry,
  userRoots,
} from "../lib/core.js";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("✗ " + msg);
  }
}
function eq(actual, expected, msg) {
  ok(actual === expected, msg + " (got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected) + ")");
}

async function makeSkill(root, name, content) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), content, "utf8");
  return dir;
}

const tmp = await mkdtemp(join(tmpdir(), "dssm-test-"));
process.env.DSH_HOME = join(tmp, "dsh");
process.env.DSH_AGENTS_HOME = join(tmp, "agents");
const dshRoot = join(process.env.DSH_HOME, "skills");
const agentsRoot = join(process.env.DSH_AGENTS_HOME, "skills");
await mkdir(dshRoot, { recursive: true });
await mkdir(agentsRoot, { recursive: true });

// ── 客户端静态约束 ──
const clientSource = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
ok(clientSource.includes("order: 17"), "settings section follows plugins");
ok(clientSource.includes("ctx.workspaces.pickDirectory()"), "upload falls back to native directory picker");
ok(clientSource.includes('window.addEventListener("keydown", closeTopModal, true)'), "Escape closes the innermost modal");
ok(clientSource.includes("正在打开系统原生目录选择窗口"), "upload fallback status is visible in the modal");

// ── 命名规整 ──
eq(toKebab("FooBar"), "foo-bar", "toKebab camelCase");
eq(toKebab("Foo Bar_Test"), "foo-bar-test", "toKebab mixed separators");
eq(toKebab("guizang-ppt-skill-main"), "guizang-ppt-skill-main", "toKebab already kebab");
eq(toKebab("  GuiZangPPT-Skill  "), "gui-zang-ppt-skill", "toKebab trim + acronym-ish");
eq(toKebab("中文名"), "", "toKebab non-ascii strips to empty");

// ── frontmatter 解析 ──
const bomDoc = parseSkillDoc("\uFEFF---\nname: foo\n---\nbody");
eq(bomDoc.map.name, "foo", "parseSkillDoc strips BOM");
eq(bomDoc.body, "body", "parseSkillDoc body");

const q = parseSkillDoc('---\nname: foo\ndescription: "has: colon"\ndisable-model-invocation: true\n---\nhello');
eq(q.map.description, '"has: colon"', "parseSkillDoc quoted value raw");
eq(unquote(q.map.description), "has: colon", "unquote");
eq(parseBoolValue("true"), true, "parseBoolValue true");
eq(parseBoolValue("YES"), true, "parseBoolValue yes");
eq(parseBoolValue("off"), false, "parseBoolValue off");
eq(parseBoolValue("0"), false, "parseBoolValue 0");
eq(parseBoolValue("notabool"), undefined, "parseBoolValue invalid");

eq(yamlScalar(true), "true", "yamlScalar bool");
eq(yamlScalar("has: colon"), '"has: colon"', "yamlScalar quote special");
eq(yamlScalar("plain"), "plain", "yamlScalar plain");
const roundtrip = serializeSkillDoc({ name: "foo", description: "has: colon", "disable-model-invocation": true }, "body");
ok(roundtrip.includes('description: "has: colon"'), "serializeSkillDoc quotes special");
ok(roundtrip.includes("disable-model-invocation: true"), "serializeSkillDoc bool");

// ── 启用 / 停用 ──
await makeSkill(dshRoot, "good-skill", "---\nname: good-skill\ndescription: A good skill.\n---\nbody");
await setSkillEnabled(dshRoot, "good-skill", false);
let goodDoc = parseSkillDoc(await readFile(join(dshRoot, "good-skill", "SKILL.md"), "utf8"));
eq(parseBoolValue(goodDoc.map["disable-model-invocation"]), true, "disable sets flag");
await setSkillEnabled(dshRoot, "good-skill", true);
goodDoc = parseSkillDoc(await readFile(join(dshRoot, "good-skill", "SKILL.md"), "utf8"));
ok(goodDoc.map["disable-model-invocation"] === undefined, "enable removes flag");
const missing = await setSkillEnabled(dshRoot, "no-such-skill", true);
ok(missing.ok === false, "setSkillEnabled missing returns error");
await makeSkill(agentsRoot, "public-skill", "---\nname: public-skill\ndescription: Public skill.\n---\nbody");
await setSkillEnabled(agentsRoot, "public-skill", false);
let publicDoc = parseSkillDoc(await readFile(join(agentsRoot, "public-skill", "SKILL.md"), "utf8"));
eq(parseBoolValue(publicDoc.map["disable-model-invocation"]), true, "public skill can be disabled");
await setSkillEnabled(agentsRoot, "public-skill", true);
publicDoc = parseSkillDoc(await readFile(join(agentsRoot, "public-skill", "SKILL.md"), "utf8"));
ok(publicDoc.map["disable-model-invocation"] === undefined, "public skill can be enabled");

// ── 删除 ──
const deleted = await deleteSkill(dshRoot, "good-skill");
eq(deleted.name, "good-skill", "deleteSkill returns deleted name");
ok(await resolveEntry(dshRoot, "good-skill") === null, "deleteSkill removes bundle");
const publicDelete = await deleteSkill(agentsRoot, "public-skill");
ok(publicDelete.ok === false, "deleteSkill rejects public Agent directory");
ok(await resolveEntry(agentsRoot, "public-skill") !== null, "public skill remains after rejected delete");

// ── 导入 ──
const srcSkill = await makeSkill(tmp, "Import Me", "---\nname: import-me\ndescription: Imported.\n---\nbody");
const imp = await importSkill(join(srcSkill, "SKILL.md"), null);
eq(imp.imported.length, 1, "import single dir");
eq(imp.imported[0].name, "import-me", "import kebabifies name");
const importedEntry = await resolveEntry(dshRoot, "import-me");
ok(importedEntry !== null, "imported entry resolvable");

// 重名 dry-run
const dry = await importSkill(join(srcSkill, "SKILL.md"), null, { dryRun: true });
eq(dry.conflicts.length, 1, "import dryRun detects conflict");
eq(dry.pending.length, 0, "import dryRun pending empty on conflict");
// 覆盖
const overwrite = await importSkill(join(srcSkill, "SKILL.md"), null, { conflict: "overwrite" });
eq(overwrite.imported.length, 1, "import overwrite");
ok(overwrite.imported[0].overwritten === true, "import overwrite marks overwritten");

// 批量导入
const batchDir = join(tmp, "batch");
await mkdir(batchDir, { recursive: true });
await makeSkill(batchDir, "Alpha Beta", "---\nname: alpha-beta\ndescription: A.\n---\nbody");
await writeFile(join(batchDir, "gamma.md"), "---\nname: gamma\ndescription: G.\n---\nbody", "utf8");
const batch = await importSkill(batchDir, null);
eq(batch.imported.length, 2, "import batch dir");

// ── 状态快照 ──
const snap = await state();
eq(snap.roots.length, 2, "state returns DSH and public Agent roots");
const dshSnap = snap.roots.find((r) => r.key === "dsh");
ok(dshSnap.mutable === true, "DSH root allows destructive actions");
ok(dshSnap.skills.some((s) => s.name === "import-me"), "state lists imported skill");
ok(dshSnap.skills.find((s) => s.name === "import-me").modelInvocable === true, "state modelInvocable");
const agentsSnap = snap.roots.find((r) => r.key === "agents");
ok(agentsSnap.mutable === false, "public Agent root disallows destructive actions");
ok(agentsSnap.skills.some((s) => s.name === "public-skill"), "state lists public Agent skill");

// 清理
await rm(tmp, { recursive: true, force: true });
delete process.env.DSH_HOME;
delete process.env.DSH_AGENTS_HOME;

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
