// dsh-skills-manager core 单元测试（临时根，零第三方依赖）
// 运行：node test/core-test.mjs

import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  toKebab,
  parseSkillDoc,
  unquote,
  parseBoolValue,
  setSkillEnabled,
  deleteSkill,
  importSkill,
  scanEntries,
  state,
  resolveEntry,
  userRoots,
} from "../lib/core.js";
import { apply as applyHost } from "../lib/index.js";

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

// ── 客户端装配约束 ──
// 客户端 bundle 由宿主 AMD 加载，无法在零依赖测试中直接挂载；仅保留协议常量锚点。
const clientSource = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
ok(clientSource.includes('id: "@michengai/dsh-skills-manager"'), "client registers the scoped package module ID");
ok(clientSource.includes('"x-dsh-skills-manager": "1"'), "client sends the mutation request marker");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
ok(packageJson.peerDependencies["@deepseek-ai/dsh-client-runtime"], "package declares the client runtime peer");
ok(packageJson.peerDependencies["@deepseek-ai/dsh-client-ui-slots"], "package declares the settings slots peer");

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
eq(q.map.description, "has: colon", "parseSkillDoc reads quoted value");
eq(unquote(q.map.description), "has: colon", "unquote");
eq(parseBoolValue("true"), true, "parseBoolValue true");
eq(parseBoolValue("YES"), true, "parseBoolValue yes");
eq(parseBoolValue("off"), false, "parseBoolValue off");
eq(parseBoolValue("0"), false, "parseBoolValue 0");
eq(parseBoolValue("notabool"), undefined, "parseBoolValue invalid");

const folded = parseSkillDoc("---\nname: folded\ndescription: >-\n  First line.\n  Second line.\n---\nbody");
eq(folded.map.description, "First line. Second line.", "parseSkillDoc reads folded description");
const deeplyIndented = parseSkillDoc("---\nname: indented\ndescription: |\n    First line.\n    Second line.\n---\nbody");
eq(deeplyIndented.map.description, "First line.\nSecond line.", "parseSkillDoc removes common block indentation");

// ── 启用 / 停用 ──
await makeSkill(dshRoot, "good-skill", "---\nname: good-skill\ndescription: A good skill.\n---\nbody");
await setSkillEnabled(dshRoot, "good-skill", false);
let goodDoc = parseSkillDoc(await readFile(join(dshRoot, "good-skill", "SKILL.md"), "utf8"));
eq(parseBoolValue(goodDoc.map["disable-model-invocation"]), true, "disable sets flag");
eq(parseBoolValue(goodDoc.map["user-invocable"]), false, "disable hides the skill from slash commands");
await setSkillEnabled(dshRoot, "good-skill", true);
goodDoc = parseSkillDoc(await readFile(join(dshRoot, "good-skill", "SKILL.md"), "utf8"));
ok(goodDoc.map["disable-model-invocation"] === undefined, "enable removes flag");
ok(goodDoc.map["user-invocable"] === undefined, "enable restores slash command visibility");
await makeSkill(dshRoot, "crlf-skill", "---\r\nname: crlf-skill\r\n---\r\nbody");
await setSkillEnabled(dshRoot, "crlf-skill", false);
const crlfAfterDisable = await readFile(join(dshRoot, "crlf-skill", "SKILL.md"), "utf8");
ok(!/(^|[^\r])\n/.test(crlfAfterDisable), "toggle preserves CRLF frontmatter files");
const quotedFrontmatter = '---\nname: quoted-skill\ndescription: "Quoted description: unchanged"\nmetadata:\n  source: retained\n---\nbody';
await makeSkill(dshRoot, "quoted-skill", quotedFrontmatter);
await setSkillEnabled(dshRoot, "quoted-skill", false);
await setSkillEnabled(dshRoot, "quoted-skill", true);
const quotedAfterToggle = await readFile(join(dshRoot, "quoted-skill", "SKILL.md"), "utf8");
eq(quotedAfterToggle, quotedFrontmatter, "toggle preserves quoted and nested frontmatter exactly");
const missing = await setSkillEnabled(dshRoot, "no-such-skill", true);
ok(missing.ok === false, "setSkillEnabled missing returns error");
await makeSkill(dshRoot, "plain-skill", "没有 frontmatter 的正文");
const plainToggle = await setSkillEnabled(dshRoot, "plain-skill", false);
ok(plainToggle.ok === false, "setSkillEnabled rejects skills without frontmatter");
eq(await readFile(join(dshRoot, "plain-skill", "SKILL.md"), "utf8"), "没有 frontmatter 的正文", "missing frontmatter remains unchanged");
await makeSkill(agentsRoot, "public-skill", "---\nname: public-skill\ndescription: Public skill.\n---\nbody");
const publicToggle = await setSkillEnabled(agentsRoot, "public-skill", false);
ok(publicToggle.ok === false, "public Agent skill rejects enable and disable");
const publicDoc = parseSkillDoc(await readFile(join(agentsRoot, "public-skill", "SKILL.md"), "utf8"));
ok(publicDoc.map["disable-model-invocation"] === undefined, "public skill metadata remains unchanged");

// ── 删除 ──
const deleted = await deleteSkill(dshRoot, "good-skill");
eq(deleted.name, "good-skill", "deleteSkill returns deleted name");
ok(await resolveEntry(dshRoot, "good-skill") === null, "deleteSkill removes bundle");
const publicDelete = await deleteSkill(agentsRoot, "public-skill");
ok(publicDelete.ok === false, "deleteSkill rejects public Agent directory");
ok(await resolveEntry(agentsRoot, "public-skill") !== null, "public skill remains after rejected delete");
await writeFile(join(dshRoot, "SKILL.md"), "---\nname: root\n---\nbody", "utf8");
await writeFile(join(process.env.DSH_HOME, "SKILL.md"), "---\nname: dsh-home\n---\nbody", "utf8");
ok(await resolveEntry(dshRoot, ".") === null, "resolveEntry rejects current-directory traversal");
ok(await resolveEntry(dshRoot, "..") === null, "resolveEntry rejects parent-directory traversal");
ok(await resolveEntry(dshRoot, "...") === null, "resolveEntry rejects Windows-normalized dot names");
const dotDelete = await deleteSkill(dshRoot, ".");
ok(dotDelete.ok === false, "deleteSkill rejects current-directory traversal");
await makeSkill(dshRoot, "safe-bar", "---\nname: safe-bar\n---\nbody");
const nestedDelete = await deleteSkill(dshRoot, "foo/../safe-bar");
ok(nestedDelete.ok === false, "deleteSkill rejects nested traversal");
ok(await resolveEntry(dshRoot, "safe-bar") !== null, "nested delete leaves the target skill unchanged");
await writeFile(join(dshRoot, "flat-delete.md"), "---\nname: flat-delete\n---\nbody", "utf8");
const flatDeleted = await deleteSkill(dshRoot, "flat-delete");
eq(flatDeleted.name, "flat-delete", "deleteSkill deletes a flat skill");
ok(await resolveEntry(dshRoot, "flat-delete") === null, "flat skill no longer resolves after delete");

// ── 导入 ──
const srcSkill = await makeSkill(tmp, "Import Me", "---\nname: import-me\ndescription: Imported.\n---\nbody");
const imp = await importSkill(join(srcSkill, "SKILL.md"), null);
eq(imp.imported.length, 1, "import single dir");
eq(imp.imported[0].name, "import-me", "import kebabifies name");
const importedEntry = await resolveEntry(dshRoot, "import-me");
ok(importedEntry !== null, "imported entry resolvable");

// 已安装目录不能作为导入来源，否则覆盖会先删除来源再复制。
const selfImport = await importSkill(dshRoot, null, { dryRun: true });
ok(selfImport.ok === false, "import rejects a source inside the DSH skills root");
const parentImport = await importSkill(tmp, null, { dryRun: true });
ok(parentImport.ok === false, "import rejects a source that contains the DSH skills root");
const namesBeforeHomeImport = (await scanEntries(dshRoot)).entries.map((entry) => entry.name).sort().join(",");
const homeSkillImport = await importSkill(join(process.env.DSH_HOME, "SKILL.md"), null, { dryRun: true });
ok(homeSkillImport.ok === false && homeSkillImport.error.includes("导入来源不能与 DSH 技能目录相同、包含或位于其中"), "import rejects a SKILL.md whose parent contains the DSH skills root");
eq((await scanEntries(dshRoot)).entries.map((entry) => entry.name).sort().join(","), namesBeforeHomeImport, "rejected home SKILL.md import leaves skills unchanged");

// 重名 dry-run
const dry = await importSkill(join(srcSkill, "SKILL.md"), null, { dryRun: true });
eq(dry.conflicts.length, 1, "import dryRun detects conflict");
eq(dry.pending.length, 0, "import dryRun pending empty on conflict");
// 覆盖
const overwrite = await importSkill(join(srcSkill, "SKILL.md"), null, { conflict: "overwrite" });
eq(overwrite.imported.length, 1, "import overwrite");
ok(overwrite.imported[0].overwritten === true, "import overwrite marks overwritten");

// 跨形态重名：foo.md 与 foo\SKILL.md 视为同一技能，覆盖时只保留新形态。
await writeFile(join(dshRoot, "cross-shape.md"), "---\nname: cross-shape\n---\nflat", "utf8");
const crossShapeSource = await makeSkill(tmp, "cross-shape", "---\nname: cross-shape\n---\nbundle");
const crossShapeDryRun = await importSkill(join(crossShapeSource, "SKILL.md"), null, { dryRun: true });
eq(crossShapeDryRun.conflicts.length, 1, "cross-shape duplicate is detected as a conflict");
const crossShapeOverwrite = await importSkill(join(crossShapeSource, "SKILL.md"), null, { conflict: "overwrite" });
eq(crossShapeOverwrite.imported.length, 1, "cross-shape overwrite imports bundle");
ok(await resolveEntry(dshRoot, "cross-shape").then((entry) => entry.kind === "bundle"), "cross-shape overwrite keeps bundle");
let crossShapeFlatExists = true;
try { await readFile(join(dshRoot, "cross-shape.md"), "utf8"); } catch { crossShapeFlatExists = false; }
ok(crossShapeFlatExists === false, "cross-shape overwrite removes flat entry");

// 单条导入完全失败必须返回错误，不能被客户端显示为上传完成。
const invalidSource = join(tmp, "中文技能.md");
await writeFile(invalidSource, "---\nname: invalid\n---\nbody", "utf8");
const invalidImport = await importSkill(invalidSource, null);
ok(invalidImport.ok === false, "failed single import returns an error result");
eq(invalidImport.failed.length, 1, "failed single import includes failure detail");

const partialBatchDir = join(tmp, "partial-batch");
await mkdir(partialBatchDir, { recursive: true });
await writeFile(join(partialBatchDir, "valid.md"), "---\nname: valid\n---\nbody", "utf8");
await writeFile(join(partialBatchDir, "无效.md"), "---\nname: invalid\n---\nbody", "utf8");
const partialImport = await importSkill(partialBatchDir, null);
eq(partialImport.imported.length, 1, "partial import keeps successful entries");
eq(partialImport.failed.length, 1, "partial import returns failed entry details");

const duplicateBatchDir = join(tmp, "duplicate-batch");
await mkdir(duplicateBatchDir, { recursive: true });
await writeFile(join(duplicateBatchDir, "Foo Bar.md"), "---\nname: foo-bar\n---\nfirst", "utf8");
await writeFile(join(duplicateBatchDir, "foo-bar.md"), "---\nname: foo-bar\n---\nsecond", "utf8");
const duplicateBatch = await importSkill(duplicateBatchDir, null, { dryRun: true });
ok(duplicateBatch.ok === false, "batch import rejects candidates with the same normalized name");
eq(duplicateBatch.failed.length, 2, "duplicate batch reports every colliding candidate");

const deepSource = await makeSkill(tmp, "deep-source", "---\nname: deep-source\n---\nbody");
let deepPath = deepSource;
for (let i = 0; i < 65; i++) {
  deepPath = join(deepPath, `nested-${i}`);
  await mkdir(deepPath);
}
const deepImport = await importSkill(join(deepSource, "SKILL.md"), null);
ok(deepImport.ok === false, "import rejects sources that exceed the directory depth limit");

await makeSkill(dshRoot, "invalid-policy", "---\nname: invalid-policy\ndisable-model-invocation: maybe\n---\nbody");
const invalidPolicyEntries = await scanEntries(dshRoot);
eq(invalidPolicyEntries.entries.find((entry) => entry.name === "invalid-policy").invocationPolicyValid, false, "scan marks invalid invocation policy values");
await writeFile(join(dshRoot, "UPPER.MD"), "---\nname: upper\n---\nbody", "utf8");
const upperCaseEntries = await scanEntries(dshRoot);
ok(upperCaseEntries.entries.some((entry) => entry.name === "UPPER"), "scan recognizes uppercase Markdown extensions");

// 批量导入
const batchDir = join(tmp, "batch");
await mkdir(batchDir, { recursive: true });
await makeSkill(batchDir, "Alpha Beta", "---\nname: alpha-beta\ndescription: A.\n---\nbody");
await writeFile(join(batchDir, "gamma.md"), "---\nname: gamma\ndescription: G.\n---\nbody", "utf8");
const batch = await importSkill(batchDir, null);
eq(batch.imported.length, 2, "import batch dir");

// ── HTTP 路由 ──
await makeSkill(dshRoot, "http-skill", "---\nname: http-skill\n---\nbody");
let route;
let invalidated = 0;
applyHost({
  webServer: { register(value) { route = value; return function () {}; } },
  skills: { registerProvider(register) { register({ invalidate() { invalidated++; } }); return function () {}; } },
  effect(register) { return register(); },
});
const server = createServer((req, res) => route.handler(req, res));
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});
const address = server.address();
const api = `http://127.0.0.1:${address.port}/api/dsh-skills-manager`;
const secureHeaders = { "content-type": "application/json", "x-dsh-skills-manager": "1" };
try {
  const stateResponse = await fetch(api + "/state");
  eq(stateResponse.status, 200, "state route returns 200");

  const csrfResponse = await fetch(api + "/disable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "http-skill" }) });
  eq(csrfResponse.status, 403, "mutating route rejects requests without the client marker");

  const contentTypeResponse = await fetch(api + "/disable", { method: "POST", headers: { "x-dsh-skills-manager": "1" }, body: JSON.stringify({ name: "http-skill" }) });
  eq(contentTypeResponse.status, 415, "mutating route requires JSON content type");

  const invalidJsonResponse = await fetch(api + "/disable", { method: "POST", headers: secureHeaders, body: "{" });
  eq(invalidJsonResponse.status, 400, "invalid JSON returns 400");

  let oversizedStatus = 0;
  try {
    const oversizedResponse = await fetch(api + "/disable", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "http-skill", padding: "x".repeat(1 << 20) }) });
    oversizedStatus = oversizedResponse.status;
  } catch {
    oversizedStatus = -1;
  }
  eq(oversizedStatus, 413, "oversized JSON returns 413 without dropping the response");

  const disableResponse = await fetch(api + "/disable", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "http-skill" }) });
  eq(disableResponse.status, 200, "valid mutation returns 200");
  ok((await readFile(join(dshRoot, "http-skill", "SKILL.md"), "utf8")).includes("disable-model-invocation: true"), "HTTP disable updates the skill policy");
  ok(invalidated > 0, "successful mutation invalidates the skill catalog");

  const publicResponse = await fetch(api + "/disable", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "public-skill", root: "agents" }) });
  eq(publicResponse.status, 400, "HTTP route rejects public Agent mutations");
  const httpDotDelete = await fetch(api + "/delete", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "." }) });
  eq(httpDotDelete.status, 400, "HTTP delete rejects current-directory traversal");
  const httpNestedDelete = await fetch(api + "/delete", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "foo/../safe-bar" }) });
  eq(httpNestedDelete.status, 400, "HTTP delete rejects nested traversal");
  ok(await resolveEntry(dshRoot, "safe-bar") !== null, "HTTP traversal deletes leave skills unchanged");
  const unknownResponse = await fetch(api + "/unknown", { method: "POST", headers: secureHeaders, body: "{}" });
  eq(unknownResponse.status, 404, "unknown mutation route returns 404");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

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
