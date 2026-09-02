// dsh-skills-manager core 单元测试（临时根；ZIP 用例复用生产依赖 fflate）
// 运行：node test/core-test.mjs

import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink, rename } from "node:fs/promises";
import { createServer, request } from "node:http";
import { basename, dirname, join, sep } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";

import {
  toKebab,
  parseSkillDoc,
  unquote,
  parseBoolValue,
  renameWithRetry,
  setSkillEnabled,
  setSourceEnabled,
  deleteSkill,
  listTrash,
  restoreTrash,
  permanentlyDeleteTrash,
  importSkill,
  importUploadedSkill,
  createSkill,
  skillDetail,
  listProviderCandidates,
  getProviderSkill,
  scanEntries,
  state,
  resolveEntry,
  entryPath,
  userRoots,
  projectRoots,
  browseDirectories,
  managerStatePath,
  readManagerState,
} from "../lib/core.js";
import { activeSessionCwds, apply as applyHost, inject as hostInject, notifyChatCatalog, registerAgentSkillProviders } from "../lib/index.js";

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

function requestJson(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, payload: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function makeSkill(root, name, content) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), content, "utf8");
  return dir;
}

const tmp = await mkdtemp(join(tmpdir(), "dssm-test-"));
const testUserHome = join(tmp, "home");
process.env.HOME = testUserHome;
process.env.USERPROFILE = testUserHome;
process.env.DSH_HOME = join(tmp, "dsh");
process.env.DSH_AGENTS_HOME = join(tmp, "agents");
process.env.DSH_CODEX_HOME = join(tmp, "codex");
process.env.DSH_CLAUDE_HOME = join(tmp, "claude");
process.env.DSH_GEMINI_HOME = join(tmp, "gemini");
process.env.DSH_OPENCODE_HOME = join(tmp, "opencode");
const dshRoot = join(process.env.DSH_HOME, "skills");
const agentsRoot = join(process.env.DSH_AGENTS_HOME, "skills");
const ccswitchRoot = join(testUserHome, ".cc-switch", "skills");
const codexRoot = join(process.env.DSH_CODEX_HOME, "skills");
await mkdir(dshRoot, { recursive: true });
await mkdir(agentsRoot, { recursive: true });
await mkdir(ccswitchRoot, { recursive: true });
await mkdir(codexRoot, { recursive: true });

const ccswitchDefinition = userRoots().find((root) => root.key === "ccswitch");
ok(ccswitchDefinition && ccswitchDefinition.path === ccswitchRoot, "userRoots exposes the fixed CC Switch Skills storage");
ok(ccswitchDefinition && ccswitchDefinition.mutable === false && ccswitchDefinition.toggleable === true, "CC Switch source is read-only and locally toggleable");
eq(ccswitchDefinition && ccswitchDefinition.rank, 510, "CC Switch source ranks after shared Agents and before app-specific roots");

// Linux 同样必须拒绝 Windows 保留设备名；Windows 无法创建这类来源，故仅在可创建的系统上做端到端断言。
if (process.platform !== "win32") {
  const reservedSourceRoot = join(tmp, "reserved-source");
  const reservedHome = join(tmp, "reserved-home");
  const reservedRoot = join(reservedHome, "skills");
  await mkdir(reservedSourceRoot, { recursive: true });
  const conSource = await makeSkill(reservedSourceRoot, "con", "---\nname: con\n---\nbody");
  const nulSource = join(reservedSourceRoot, "nul.md");
  await writeFile(nulSource, "---\nname: nul\n---\nbody", "utf8");
  const linkTarget = join(reservedSourceRoot, "link-target.md");
  await writeFile(linkTarget, "---\nname: link-target\n---\nbody", "utf8");
  const linkSource = join(reservedSourceRoot, "linked-source.md");
  await symlink(linkTarget, linkSource);
  const nestedLinkSource = await makeSkill(reservedSourceRoot, "nested-link", "---\nname: nested-link\n---\nbody");
  await symlink(linkTarget, join(nestedLinkSource, "linked-content.md"));
  const originalDshHome = process.env.DSH_HOME;
  process.env.DSH_HOME = reservedHome;
  try {
    for (const [source, name] of [[conSource, "con"], [nulSource, "nul"]]) {
      const result = await importSkill(source, null);
      ok(result.ok === false, `import rejects reserved device name: ${name}`);
      eq(result.failed[0].code, "error.import.invalidName", `reserved device name carries invalidName: ${name}`);
    }
    let targetCreated = true;
    try { await stat(reservedRoot); } catch { targetCreated = false; }
    ok(targetCreated === false, "reserved-name imports do not create the target root");

    await makeSkill(reservedRoot, "con", "---\nname: con\n---\nbody");
    await writeFile(join(reservedRoot, "nul.md"), "---\nname: nul\n---\nbody", "utf8");
    eq((await scanEntries(reservedRoot)).entries.length, 0, "scan hides entries that cannot be resolved safely");
    const linkedSourceImport = await importSkill(linkSource, null);
    eq(linkedSourceImport.code, "error.source.symlink", "import rejects a symbolic-link source");
    const nestedLinkImport = await importSkill(join(nestedLinkSource, "SKILL.md"), null);
    eq(nestedLinkImport.failed[0].code, "error.source.symlink", "import rejects a source containing a symbolic link");
    // 预检必须与实导同口径：嵌套链接与深度超限在 dry-run 阶段即拒绝，不能等用户确认覆盖后才失败。
    const nestedLinkDry = await importSkill(join(nestedLinkSource, "SKILL.md"), null, { dryRun: true });
    ok(nestedLinkDry.ok === false, "dry-run rejects a source containing a nested symbolic link");
    eq(nestedLinkDry.failed[0].code, "error.source.symlink", "nested-link dry-run carries the symlink code");
    const mixedBatch = join(reservedSourceRoot, "mixed-batch");
    const taintedSkill = await makeSkill(mixedBatch, "tainted", "---\nname: tainted\n---\nbody");
    await symlink(linkTarget, join(taintedSkill, "linked.md"));
    await writeFile(join(mixedBatch, "clean.md"), "---\nname: clean\n---\nbody", "utf8");
    const mixedDry = await importSkill(mixedBatch, null, { dryRun: true });
    ok(mixedDry.ok !== false, "mixed dry-run still reports the clean candidate");
    eq(mixedDry.pending.length, 1, "mixed dry-run keeps only the clean candidate pending");
    eq(mixedDry.failed[0].code, "error.source.symlink", "mixed dry-run fails the tainted candidate");
  } finally {
    process.env.DSH_HOME = originalDshHome;
  }
}

// ── 客户端装配约束 ──
// 客户端 bundle 由宿主 AMD 加载，无法在零依赖测试中直接挂载；仅保留协议常量锚点。
const clientSource = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
ok(clientSource.includes('id: "@michengai/dsh-skills-manager"'), "client registers the scoped package module ID");
ok(clientSource.includes('"x-dsh-skills-manager": "1"'), "client sends the mutation request marker");
ok(clientSource.includes('className: "dssm-modal" + (props.wide ? " dssm-modal-wide" : "") + (props.className ? " " + props.className : "")'), "dialogs use the shared adaptive modal component");
ok(clientSource.includes('.dssm-modal{box-sizing:border-box;display:flex;width:min(560px,100%)!important;'), "all plugin dialogs stay compact against host stretch");
ok(clientSource.includes('.dssm-modal-wide{width:min(720px,100%)!important}'), "detail dialog has a bounded wider layout");
ok(clientSource.includes('.dssm-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}'), "dialog actions wrap instead of stretching the dialog");
ok(clientSource.includes('placeholder: t("search.placeholder")'), "settings panel registers a skill search input");
ok(clientSource.includes('className: "dssm-control dssm-search"'), "search field follows the source-first filter layout");
ok(clientSource.includes('className: "dssm-sources"'), "settings panel renders source-first skill groups");
ok(clientSource.includes('"root.ccswitch": "CC Switch"'), "settings panel localizes the CC Switch source in both dictionaries");
ok(clientSource.includes('className: "dssm-select-trigger"'), "category filter uses the styled custom select");
ok(clientSource.includes('.dssm-select-menu{'), "custom select menu uses design tokens instead of native chrome");
ok(!/h\(\s*"select"/.test(clientSource), "category filter does not use a native select");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
eq(packageJson.version, "0.1.33", "release contract tracks the package version");
ok(packageJson.peerDependencies["@deepseek-ai/dsh-client-runtime"], "package declares the client runtime peer");
ok(packageJson.peerDependencies["@deepseek-ai/dsh-client-ui-slots"], "package declares the settings slots peer");
ok(packageJson.peerDependencies["@deepseek-ai/dsh-host-webserver"].includes("<0.2.0"), "host-webserver peer has an upper bound");
ok(packageJson.peerDependencies["@deepseek-ai/dsh-skill"].includes("<0.2.0"), "skill peer has an upper bound");
ok(packageJson.peerDependencies["@deepseek-ai/dsh-tools"].includes("<0.2.0"), "tools peer has an upper bound");
ok(!packageJson.peerDependencies["@deepseek-ai/dsh-client-ui-workspace"], "browser-native import no longer depends on the workspace directory picker");
ok(clientSource.includes("inflightRef"), "client guards mutations with a synchronous in-flight flag");
ok(clientSource.includes('if (inflightRef.current) return Promise.reject'), "post rejects a second in-flight mutation synchronously");
ok(clientSource.includes('function submitImport()') && clientSource.includes('post("/upload", payload'), "upload import uses the shared guarded mutation path");
ok(clientSource.includes('function submitCreate()') && clientSource.includes('post("/create", form'), "create uses the shared guarded mutation path");
ok(clientSource.includes('webkitdirectory: ""'), "folder import uses the browser-native folder picker");
ok(!clientSource.includes('className: "dssm-modal-browser"'), "folder selection does not chain into a second custom picker");
ok(!clientSource.includes("ctx.workspaces.pickDirectory"), "folder picker never launches the Node-hosted workspace chooser");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
ok(publishWorkflow.includes("id-token: write"), "publish workflow enables OIDC trusted publishing");
ok(publishWorkflow.includes("pnpm install --frozen-lockfile"), "publish workflow installs the ZIP runtime dependency from the lockfile");
ok(!publishWorkflow.includes("registry-url:"), "publish workflow relies on package publishConfig instead of token-backed registry setup");
ok(publishWorkflow.includes("npm test"), "publish workflow runs the project tests");
ok(publishWorkflow.includes("npm publish"), "publish workflow publishes the package after tests");

// ── 命名规整 ──
eq(toKebab("FooBar"), "foo-bar", "toKebab camelCase");
eq(toKebab("Foo Bar_Test"), "foo-bar-test", "toKebab mixed separators");
eq(toKebab("guizang-ppt-skill-main"), "guizang-ppt-skill-main", "toKebab already kebab");
eq(toKebab("  GuiZangPPT-Skill  "), "gui-zang-ppt-skill", "toKebab trim + acronym-ish");
eq(toKebab("中文名"), "", "toKebab non-ascii strips to empty");

// ── 前台目录浏览器：只列真实子目录，并返回可导航的绝对路径 ──
const browseRoot = join(tmp, "browse-root");
await mkdir(join(browseRoot, "zeta"), { recursive: true });
await mkdir(join(browseRoot, ".hidden"), { recursive: true });
await writeFile(join(browseRoot, "file.txt"), "not a directory", "utf8");
const browseResult = await browseDirectories(browseRoot);
ok(browseResult.ok !== false, "browseDirectories lists an absolute directory");
eq(browseResult.path, browseRoot, "browseDirectories returns the canonical current path");
eq(browseResult.entries.map((entry) => entry.name).join(","), ".hidden,zeta", "browseDirectories lists directories only and sorts them");
ok(browseResult.entries.find((entry) => entry.name === ".hidden").hidden, "browseDirectories marks dot directories hidden");
eq((await browseDirectories("relative-folder")).code, "error.browse.absolute", "browseDirectories rejects relative paths");
const browseLinkedTarget = join(tmp, "browse-linked-target");
await mkdir(browseLinkedTarget, { recursive: true });
const browseLinkType = process.platform === "win32" ? "junction" : undefined;
if (await tryLink(browseLinkedTarget, join(browseRoot, "junction"), browseLinkType)) {
  ok(!(await browseDirectories(browseRoot)).entries.some((entry) => entry.name === "junction"), "browseDirectories excludes directory links and Windows junctions");
} else {
  ok(true, "directory-link browser test skipped because this environment cannot create links");
}
eq(entryPath(dshRoot, "foo:bar"), null, "entryPath rejects Windows ADS names");
eq(entryPath(dshRoot, ".hidden"), null, "entryPath rejects leading-dot names");
eq(entryPath(dshRoot, ".good-skill.dssm-stage-dead"), null, "entryPath rejects leftover stage directories");
eq(entryPath(dshRoot, "a".repeat(129)), null, "entryPath rejects names longer than 128 characters");
ok(entryPath(dshRoot, "a".repeat(128)) !== null, "entryPath accepts a 128-character name");

// ── frontmatter 解析 ──
const protoDoc = parseSkillDoc("---\n__proto__: polluted\nname: proto\n---\nbody");
ok(Object.getPrototypeOf(protoDoc.map) === null, "frontmatter map uses a null prototype");
eq(protoDoc.map.name, "proto", "frontmatter still reads ordinary keys");
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

let transientRenameAttempts = 0;
await renameWithRetry("from", "to", {
  delayMs: 0,
  rename: async function () {
    transientRenameAttempts++;
    if (transientRenameAttempts < 3) {
      const error = new Error("temporary Windows lock");
      error.code = "EPERM";
      throw error;
    }
  },
});
eq(transientRenameAttempts, 3, "renameWithRetry retries transient Windows EPERM errors");

let permanentRenameAttempts = 0;
let permanentRenameCode = "";
try {
  await renameWithRetry("from", "to", {
    delayMs: 0,
    rename: async function () {
      permanentRenameAttempts++;
      const error = new Error("invalid path");
      error.code = "EINVAL";
      throw error;
    },
  });
} catch (error) {
  permanentRenameCode = error.code;
}
eq(permanentRenameAttempts, 1, "renameWithRetry does not retry permanent errors");
eq(permanentRenameCode, "EINVAL", "renameWithRetry preserves permanent errors");

const folded = parseSkillDoc("---\nname: folded\ndescription: >-\n  First line.\n  Second line.\n---\nbody");
eq(folded.map.description, "First line. Second line.", "parseSkillDoc reads folded description");
const deeplyIndented = parseSkillDoc("---\nname: indented\ndescription: |\n    First line.\n    Second line.\n---\nbody");
eq(deeplyIndented.map.description, "First line.\nSecond line.", "parseSkillDoc removes common block indentation");

// ── 启用 / 停用 ──
const goodSkillSource = "---\nname: good-skill\ndescription: A good skill.\n---\nbody";
await makeSkill(dshRoot, "good-skill", goodSkillSource);
const audit = [];
await setSkillEnabled(dshRoot, "good-skill", false, (event) => audit.push(event));
eq(await readFile(join(dshRoot, "good-skill", "SKILL.md"), "utf8"), goodSkillSource, "DSH disable leaves the original Skill file byte-for-byte unchanged");
eq(audit.join(","), "policy-disable", "disable writes a local-policy audit event");
await setSkillEnabled(dshRoot, "good-skill", true, (event) => audit.push(event));
eq(audit.join(","), "policy-disable,policy-enable", "enable writes a local-policy audit event");
eq(await readFile(join(dshRoot, "good-skill", "SKILL.md"), "utf8"), goodSkillSource, "DSH enable also leaves the original Skill file unchanged");
await makeSkill(dshRoot, "crlf-skill", "---\r\nname: crlf-skill\r\ndescription: CRLF skill.\r\n---\r\nbody");
const crlfBeforeToggle = await readFile(join(dshRoot, "crlf-skill", "SKILL.md"), "utf8");
await setSkillEnabled(dshRoot, "crlf-skill", false);
const crlfAfterDisable = await readFile(join(dshRoot, "crlf-skill", "SKILL.md"), "utf8");
eq(crlfAfterDisable, crlfBeforeToggle, "local-policy toggles do not normalize CRLF source files");
const quotedFrontmatter = '---\nname: quoted-skill\ndescription: "Quoted description: unchanged"\nmetadata:\n  source: retained\n---\nbody';
await makeSkill(dshRoot, "quoted-skill", quotedFrontmatter);
await setSkillEnabled(dshRoot, "quoted-skill", false);
await setSkillEnabled(dshRoot, "quoted-skill", true);
const quotedAfterToggle = await readFile(join(dshRoot, "quoted-skill", "SKILL.md"), "utf8");
eq(quotedAfterToggle, quotedFrontmatter, "toggle preserves quoted and nested frontmatter exactly");
const literalFrontmatter = "---\nname: literal-skill\ndescription: |\n  disable-model-invocation: explanatory text\n  user-invocable: explanatory text\n---\nbody";
await makeSkill(dshRoot, "literal-skill", literalFrontmatter);
await setSkillEnabled(dshRoot, "literal-skill", false);
const literalAfterToggle = await readFile(join(dshRoot, "literal-skill", "SKILL.md"), "utf8");
ok(literalAfterToggle.includes("  disable-model-invocation: explanatory text") && literalAfterToggle.includes("  user-invocable: explanatory text"), "toggle preserves block-scalar content that resembles policy fields");
await makeSkill(dshRoot, "trailing-root", "---\nname: trailing-root\ndescription: Trailing root.\n---\nbody");
const trailingRootToggle = await setSkillEnabled(dshRoot + sep, "trailing-root", false);
ok(trailingRootToggle.ok !== false, "toggle accepts a normalized DSH root path");
const missing = await setSkillEnabled(dshRoot, "no-such-skill", true);
ok(missing.ok === false, "setSkillEnabled missing returns error");
eq(missing.code, "error.skill.notFound", "missing skill carries the notFound code");
eq(missing.params && missing.params.name, "no-such-skill", "missing skill params.name");
await makeSkill(dshRoot, "plain-skill", "没有 frontmatter 的正文");
const plainToggle = await setSkillEnabled(dshRoot, "plain-skill", false);
ok(plainToggle.ok === false, "setSkillEnabled rejects skills without frontmatter");
eq(plainToggle.code, "error.skill.noFrontmatter", "no-frontmatter toggle carries the code");
eq(plainToggle.params && plainToggle.params.action, "disable", "no-frontmatter params.action");
eq(await readFile(join(dshRoot, "plain-skill", "SKILL.md"), "utf8"), "没有 frontmatter 的正文", "missing frontmatter remains unchanged");
await makeSkill(dshRoot, "missing-description", "---\nname: missing-description\n---\nbody");
const incompleteToggle = await setSkillEnabled(dshRoot, "missing-description", true);
ok(incompleteToggle.ok === false, "setSkillEnabled rejects structurally incomplete skills even when called outside the UI");
eq(incompleteToggle.code, "error.skill.notLoadable", "structurally incomplete toggle carries the notLoadable code");
await makeSkill(agentsRoot, "public-skill", "---\nname: public-skill\ndescription: Public skill.\n---\nbody");
const publicToggle = await setSkillEnabled(agentsRoot, "public-skill", false);
ok(publicToggle.ok !== false && publicToggle.enabled === false, "public Agent skill supports manager-local disable");
const publicDoc = parseSkillDoc(await readFile(join(agentsRoot, "public-skill", "SKILL.md"), "utf8"));
ok(publicDoc.map["disable-model-invocation"] === undefined, "public skill metadata remains unchanged");

const sourceDisabledText = "---\nname: source-disabled\ndescription: Disabled in source.\ndisable-model-invocation: true\nuser-invocable: false\n---\nSource-disabled body";
await makeSkill(dshRoot, "source-disabled", sourceDisabledText);
await setSkillEnabled(dshRoot, "source-disabled", true);
eq(await readFile(join(dshRoot, "source-disabled", "SKILL.md"), "utf8"), sourceDisabledText, "manager enable does not remove source-level disabled fields");
let dshPolicyCandidate = (await listProviderCandidates()).find((item) => item.source === "user-dsh" && item.name === "source-disabled");
ok(dshPolicyCandidate && dshPolicyCandidate.rank === 399 && dshPolicyCandidate.invocation.modelInvocable && dshPolicyCandidate.invocation.userInvocable, "explicit manager enable overrides a source-disabled user DSH Skill through rank 399 policy");
eq((await getProviderSkill(dshPolicyCandidate)).content, "Source-disabled body", "user DSH policy candidate loads through the manager without changing its source");

// ── 外部来源 provider 与本地策略 ──
await makeSkill(codexRoot, "code-review", "---\nname: code-review\ndescription: Review code safely.\n---\nCodex review body");
let providerCandidates = await listProviderCandidates();
const codexCandidate = providerCandidates.find((item) => item.source === "agent-codex" && item.name === "code-review");
ok(codexCandidate && codexCandidate.invocation.modelInvocable === true, "Codex skill is exposed to the DSH provider");
eq(codexCandidate.rank, 520, "Codex provider rank stays below native DSH and public Agents");
const loadedCodex = await getProviderSkill(codexCandidate);
eq(loadedCodex.content, "Codex review body", "provider loads the external skill body");

// CC Switch 以固定 SSOT 保存技能，并把顶层技能目录链接到各 Agent 来源。
const ccswitchSkill = await makeSkill(ccswitchRoot, "ccswitch-shared", "---\nname: ccswitch-shared\ndescription: Shared by CC Switch.\n---\nCC Switch body");
const linkedCcSwitchSkill = join(codexRoot, "ccswitch-shared");
const readonlyOutsideRoot = join(tmp, "readonly-link-outside");
const readonlyOutsideSkill = await makeSkill(readonlyOutsideRoot, "outside-linked", "---\nname: outside-linked\ndescription: Outside trusted roots.\n---\nOutside body");
const providerLinkType = process.platform === "win32" ? "junction" : undefined;
if (await tryLink(ccswitchSkill, linkedCcSwitchSkill, providerLinkType)) {
  const linkedCodexEntry = (await scanEntries(codexRoot)).entries.find((entry) => entry.name === "ccswitch-shared");
  ok(linkedCodexEntry && linkedCodexEntry.linked === true, "user read-only roots discover a trusted top-level linked Skill bundle");
  ok(await resolveEntry(codexRoot, "ccswitch-shared") !== null, "resolveEntry resolves a trusted top-level linked Skill bundle");

  const ccswitchState = await state();
  const ccswitchView = ccswitchState.roots.find((root) => root.key === "ccswitch");
  const codexView = ccswitchState.roots.find((root) => root.key === "codex");
  ok(ccswitchView && ccswitchView.enabled === true && ccswitchView.skills.some((skill) => skill.name === "ccswitch-shared"), "CC Switch source is enabled by default and owns its SSOT Skill");
  ok(codexView && !codexView.skills.some((skill) => skill.name === "ccswitch-shared"), "state deduplicates a CC Switch Skill distributed into Codex by real path");

  const ccswitchCandidates = (await listProviderCandidates()).filter((item) => item.name === "ccswitch-shared");
  eq(ccswitchCandidates.length, 1, "provider deduplicates a CC Switch Skill distributed to another Agent root");
  eq(ccswitchCandidates[0] && ccswitchCandidates[0].source, "agent-ccswitch", "provider keeps the direct CC Switch source as the canonical candidate");
  const loadedCcSwitch = ccswitchCandidates[0] ? await getProviderSkill(ccswitchCandidates[0]) : undefined;
  eq(loadedCcSwitch && loadedCcSwitch.content, "CC Switch body", "provider loads the canonical CC Switch Skill body");

  await setSourceEnabled("ccswitch", false);
  const disabledCcSwitchCandidates = (await listProviderCandidates()).filter((item) => item.name === "ccswitch-shared");
  const disabledCcSwitch = disabledCcSwitchCandidates.find((item) => item.source === "agent-ccswitch");
  ok(disabledCcSwitch && disabledCcSwitch.invocation.modelInvocable === false && disabledCcSwitch.invocation.userInvocable === false, "CC Switch source supports manager-local source disable");
  eq(disabledCcSwitchCandidates.length, 1, "disabling CC Switch does not restore its Codex distribution link as another candidate");
  await setSourceEnabled("ccswitch", true);

  const linkedCandidate = {
    name: linkedCodexEntry.declaredName,
    description: linkedCodexEntry.description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: "dsh-skills-manager-external",
    source: "agent-codex",
    locator: { rootKey: "codex", entryName: linkedCodexEntry.name, path: linkedCodexEntry.docPath, realEntryPath: linkedCodexEntry.realEntryPath, realDocPath: linkedCodexEntry.realDocPath },
    resourceBase: { kind: "directory", path: linkedCodexEntry.realEntryPath },
    path: linkedCodexEntry.docPath,
    metadata: {},
  };
  eq((await getProviderSkill(linkedCandidate)).content, "CC Switch body", "provider accepts an unchanged trusted linked candidate");
  const missingRealEntryLocator = { ...linkedCandidate, locator: { ...linkedCandidate.locator } };
  delete missingRealEntryLocator.locator.realEntryPath;
  eq(await getProviderSkill(missingRealEntryLocator), undefined, "provider rejects a user candidate missing its discovered real bundle path");
  const missingRealDocLocator = { ...linkedCandidate, locator: { ...linkedCandidate.locator } };
  delete missingRealDocLocator.locator.realDocPath;
  eq(await getProviderSkill(missingRealDocLocator), undefined, "provider rejects a user candidate missing its discovered real document path");
  const replacementSkill = await makeSkill(ccswitchRoot, "ccswitch-replacement", "---\nname: ccswitch-shared\ndescription: Retargeted CC Switch Skill.\n---\nRetargeted body");
  await rm(linkedCcSwitchSkill, { recursive: true, force: true });
  await symlink(replacementSkill, linkedCcSwitchSkill, providerLinkType);
  eq(await getProviderSkill(linkedCandidate), undefined, "provider rejects a trusted link retargeted after candidate discovery");
  await rm(linkedCcSwitchSkill, { recursive: true, force: true });
  await symlink(ccswitchSkill, linkedCcSwitchSkill, providerLinkType);
  await rm(replacementSkill, { recursive: true, force: true });
} else {
  ok(true, "trusted user-source link tests skipped because this environment cannot create directory links");
}
const writableTrustedLink = join(dshRoot, "ccswitch-linked-dsh");
if (await tryLink(ccswitchSkill, writableTrustedLink, providerLinkType)) {
  eq(await resolveEntry(dshRoot, "ccswitch-linked-dsh"), null, "writable DSH roots still reject trusted linked bundles");
  ok(!(await scanEntries(dshRoot)).entries.some((entry) => entry.name === "ccswitch-linked-dsh"), "writable DSH scans also hide trusted linked bundles");
  await rm(writableTrustedLink, { recursive: true, force: true });
} else {
  ok(true, "writable-root trusted link test skipped because this environment cannot create directory links");
}
const sameRootReadonlyLink = join(codexRoot, "code-review-alias");
if (await tryLink(join(codexRoot, "code-review"), sameRootReadonlyLink, providerLinkType)) {
  ok(!(await scanEntries(codexRoot)).entries.some((entry) => entry.name === "code-review-alias"), "user read-only roots reject linked aliases targeting the same Skills root");
  await rm(sameRootReadonlyLink, { recursive: true, force: true });
} else {
  ok(true, "same-root read-only link test skipped because this environment cannot create directory links");
}
if (await tryLink(readonlyOutsideSkill, join(codexRoot, "outside-linked"), providerLinkType)) {
  ok(!(await scanEntries(codexRoot)).entries.some((entry) => entry.name === "outside-linked"), "user read-only roots reject linked bundles outside known Skills roots");
} else {
  ok(true, "outside-target link test skipped because this environment cannot create directory links");
}
const hiddenCcSwitchSkill = await makeSkill(ccswitchRoot, ".hidden-ccswitch", "---\nname: hidden-ccswitch\ndescription: Hidden target.\n---\nHidden body");
if (await tryLink(hiddenCcSwitchSkill, join(codexRoot, "hidden-via-link"), providerLinkType)) {
  ok(!(await scanEntries(codexRoot)).entries.some((entry) => entry.name === "hidden-via-link"), "trusted links cannot expose a hidden target excluded by normal entry-name rules");
} else {
  ok(true, "hidden-target link test skipped because this environment cannot create directory links");
}
const ccswitchAgentSkill = await makeSkill(ccswitchRoot, "ccswitch-agent-owned", "---\nname: ccswitch-agent-owned\ndescription: Direct CC Switch SSOT with a public Agent distribution link.\n---\nCC Switch Agent body");
const linkedAgentSkill = join(agentsRoot, "ccswitch-agent-owned");
if (await tryLink(ccswitchAgentSkill, linkedAgentSkill, providerLinkType)) {
  const linkedAgentState = await state();
  const linkedAgentCcSwitchView = linkedAgentState.roots.find((root) => root.key === "ccswitch");
  const linkedAgentPublicView = linkedAgentState.roots.find((root) => root.key === "agents");
  ok(linkedAgentCcSwitchView && linkedAgentCcSwitchView.skills.some((skill) => skill.name === "ccswitch-agent-owned"), "a direct CC Switch SSOT keeps ownership when public Agents links to it");
  ok(linkedAgentPublicView && !linkedAgentPublicView.skills.some((skill) => skill.name === "ccswitch-agent-owned"), "state hides the public Agent distribution link owned by CC Switch");
  let linkedAgentCandidates = (await listProviderCandidates()).filter((item) => item.name === "ccswitch-agent-owned");
  eq(linkedAgentCandidates.length, 1, "provider emits one candidate for a CC Switch Skill distributed to public Agents");
  eq(linkedAgentCandidates[0] && linkedAgentCandidates[0].source, "agent-ccswitch", "provider attributes the public Agent distribution link to the direct CC Switch SSOT");
  eq(linkedAgentCandidates[0] && linkedAgentCandidates[0].rank, 450, "the direct CC Switch candidate inherits the strongest distribution entry rank");
  await setSourceEnabled("ccswitch", false);
  linkedAgentCandidates = (await listProviderCandidates()).filter((item) => item.name === "ccswitch-agent-owned");
  ok(linkedAgentCandidates.length === 1 && linkedAgentCandidates[0].source === "agent-ccswitch" && linkedAgentCandidates[0].invocation.modelInvocable === false && linkedAgentCandidates[0].invocation.userInvocable === false, "disabling CC Switch keeps a disabled canonical blocker instead of falling back to public Agents");
  await setSourceEnabled("ccswitch", true);
  await rm(linkedAgentSkill, { recursive: true, force: true });
} else {
  ok(true, "public Agent distribution-link ownership test skipped because this environment cannot create directory links");
}
await rm(ccswitchAgentSkill, { recursive: true, force: true });
await setSkillEnabled(codexRoot, "code-review", false);
providerCandidates = await listProviderCandidates();
ok(providerCandidates.find((item) => item.name === "code-review").invocation.modelInvocable === false, "external skill disable keeps a disabled winning candidate");
ok(!(await readFile(join(codexRoot, "code-review", "SKILL.md"), "utf8")).includes("disable-model-invocation"), "external skill toggle never modifies the source file");
await setSourceEnabled("codex", false);
providerCandidates = await listProviderCandidates();
ok(providerCandidates.find((item) => item.name === "code-review").invocation.userInvocable === false, "source disable keeps external candidates disabled");
await setSourceEnabled("codex", true);

// 已存在但损坏的状态文件必须 fail-closed，且任何后续启停不得覆盖原文件。
const validManagerState = await readFile(managerStatePath(), "utf8");
const legacyManagerState = JSON.parse(validManagerState);
delete legacyManagerState.enabledSkills;
delete legacyManagerState.disabledSkills.dsh;
delete legacyManagerState.sources.ccswitch;
delete legacyManagerState.disabledSkills.ccswitch;
await writeFile(managerStatePath(), JSON.stringify(legacyManagerState), "utf8");
const migratedLegacyState = await readManagerState();
ok(migratedLegacyState.writable === true && Array.isArray(migratedLegacyState.state.enabledSkills.dsh), "legacy state without enabledSkills or a DSH policy list is normalized compatibly");
ok(migratedLegacyState.state.sources.ccswitch === true && Array.isArray(migratedLegacyState.state.disabledSkills.ccswitch), "legacy state gains a default-enabled CC Switch source without failing closed");
const conflictingManagerState = JSON.parse(validManagerState);
conflictingManagerState.disabledSkills.dsh = ["good-skill"];
conflictingManagerState.enabledSkills.dsh = ["good-skill"];
await writeFile(managerStatePath(), JSON.stringify(conflictingManagerState), "utf8");
ok((await readManagerState()).writable === false, "conflicting enabled and disabled policy entries fail closed");
await writeFile(managerStatePath(), validManagerState, "utf8");
await writeFile(managerStatePath(), "{broken", "utf8");
const invalidManagerState = await readManagerState();
ok(invalidManagerState.writable === false, "invalid manager state locks subsequent writes");
ok(Object.values(invalidManagerState.state.sources).every((enabled) => enabled === false), "invalid manager state fails closed for every external source");
const rejectedStateToggle = await setSourceEnabled("codex", true);
eq(rejectedStateToggle.code, "error.state.invalid", "source toggle refuses to overwrite an invalid manager state file");
eq(await readFile(managerStatePath(), "utf8"), "{broken", "rejected state toggle preserves the unreadable file for recovery");
providerCandidates = await listProviderCandidates();
ok(providerCandidates.find((item) => item.name === "code-review").invocation.userInvocable === false, "provider keeps external candidates disabled while manager state is invalid");
ok(providerCandidates.find((item) => item.source === "user-dsh" && item.name === "good-skill").invocation.modelInvocable === false, "invalid manager state also installs a fail-closed policy candidate for user DSH skills");
await writeFile(managerStatePath(), validManagerState, "utf8");

// ── 创建与详情 ──
const created = await createSkill({ name: "Conversation Helper", description: "Create reusable prompts.", body: "Follow the user request carefully." });
eq(created.name, "conversation-helper", "createSkill normalizes a conversation title to kebab-case");
const createdDetail = await skillDetail("dsh", "conversation-helper");
eq(createdDetail.body, "Follow the user request carefully.", "skillDetail returns the markdown body");
ok(createdDetail.loadable === true && createdDetail.diagnostics.length === 0, "created skill passes diagnostics");
eq((await createSkill({ name: "Conversation Helper", description: "Duplicate.", body: "body" })).code, "error.create.conflict", "createSkill rejects overwrite by default");

// ── 删除 ──
const deleted = await deleteSkill(dshRoot, "good-skill");
eq(deleted.name, "good-skill", "deleteSkill returns deleted name");
ok(await resolveEntry(dshRoot, "good-skill") === null, "deleteSkill removes bundle");
ok((await listTrash()).some((item) => item.id === deleted.id), "deleteSkill moves the skill into trash");
const restored = await restoreTrash(deleted.id);
eq(restored.name, "good-skill", "restoreTrash returns restored name");
ok(await resolveEntry(dshRoot, "good-skill") !== null, "restoreTrash restores the skill bundle");
const deletedAgain = await deleteSkill(dshRoot, "good-skill");
await permanentlyDeleteTrash(deletedAgain.id);
ok(!(await listTrash()).some((item) => item.id === deletedAgain.id), "permanent trash deletion removes the second-stage entry");
const publicDelete = await deleteSkill(agentsRoot, "public-skill");
ok(publicDelete.ok === false, "deleteSkill rejects public Agent directory");

// Windows 可能在 stage 内容刚写完时持续阻止目录 rename；最终发布应降级复制，不能把成功的搬运回滚掉。
await makeSkill(dshRoot, "trash-publish-fallback", "---\nname: trash-publish-fallback\ndescription: Publish fallback.\n---\nbody");
await writeFile(join(dshRoot, "trash-publish-fallback", "asset.txt"), "kept", "utf8");
let trashPublishAttempts = 0;
const fallbackDeleted = await deleteSkill(dshRoot, "trash-publish-fallback", null, {
  renameOptions: {
    maxAttempts: 2,
    delayMs: 0,
    async rename(source, destination) {
      if (basename(source).startsWith(".stage-") && dirname(source) === dirname(destination)) {
        trashPublishAttempts++;
        const error = new Error("Windows scanner keeps the stage directory busy");
        error.code = "EPERM";
        throw error;
      }
      return rename(source, destination);
    },
  },
});
eq(trashPublishAttempts, 2, "deleteSkill exhausts the bounded final rename retries before fallback");
ok(await resolveEntry(dshRoot, "trash-publish-fallback") === null, "trash publish fallback keeps the source removed");
ok((await listTrash()).some((item) => item.id === fallbackDeleted.id), "trash publish fallback creates a visible trash item");
await restoreTrash(fallbackDeleted.id);
eq(await readFile(join(dshRoot, "trash-publish-fallback", "asset.txt"), "utf8"), "kept", "trash publish fallback preserves nested files through restore");

// 项目根与 manager Trash 可能位于不同盘符；EXDEV 时复制后在源盘原子隐藏，恢复同样降级。
const crossDeviceBundle = await makeSkill(dshRoot, "cross-device-trash", "---\nname: cross-device-trash\ndescription: Cross-device fallback.\n---\nbody");
await writeFile(join(crossDeviceBundle, "asset.txt"), "cross-device-kept", "utf8");
let crossDeviceDeleteFallbacks = 0;
const crossDeviceDeleted = await deleteSkill(dshRoot, "cross-device-trash", null, {
  renameOptions: {
    maxAttempts: 1,
    async rename(source, destination) {
      if (source === crossDeviceBundle && destination.includes(`${sep}.stage-`)) {
        crossDeviceDeleteFallbacks++;
        const error = new Error("simulated cross-device delete");
        error.code = "EXDEV";
        throw error;
      }
      return rename(source, destination);
    },
  },
});
eq(crossDeviceDeleteFallbacks, 1, "deleteSkill falls back exactly once after EXDEV");
ok(await resolveEntry(dshRoot, "cross-device-trash") === null, "cross-device delete hides the source entry");
let crossDeviceRestoreFallbacks = 0;
await restoreTrash(crossDeviceDeleted.id, null, {
  renameOptions: {
    maxAttempts: 1,
    async rename(source, destination) {
      if (basename(source) === "cross-device-trash" && destination === crossDeviceBundle) {
        crossDeviceRestoreFallbacks++;
        const error = new Error("simulated cross-device restore");
        error.code = "EXDEV";
        throw error;
      }
      return rename(source, destination);
    },
  },
});
eq(crossDeviceRestoreFallbacks, 1, "restoreTrash falls back exactly once after EXDEV");
eq(await readFile(join(crossDeviceBundle, "asset.txt"), "utf8"), "cross-device-kept", "cross-device restore preserves the complete bundle");

// 删除发生二次故障时必须保留未恢复的 stage，不能清理唯一副本。
const rollbackBundle = await makeSkill(dshRoot, "rollback-risk", "---\nname: rollback-risk\ndescription: Bundle.\n---\nbody");
const rollbackFlat = join(dshRoot, "rollback-risk.md");
await writeFile(rollbackFlat, "---\nname: rollback-risk\ndescription: Flat.\n---\nbody", "utf8");
let rollbackDeleteError = null;
try {
  await deleteSkill(dshRoot, "rollback-risk", null, {
    renameOptions: {
      maxAttempts: 1,
      delayMs: 0,
      async rename(source, destination) {
        if (source === rollbackFlat) {
          const error = new Error("primary move failure");
          error.code = "EIO";
          throw error;
        }
        if (destination === rollbackBundle && source.includes(`${sep}.stage-`)) {
          const error = new Error("rollback failure");
          error.code = "EACCES";
          throw error;
        }
        return rename(source, destination);
      },
    },
  });
} catch (error) {
  rollbackDeleteError = error;
}
eq(rollbackDeleteError && rollbackDeleteError.code, "error.trash.rollbackFailed", "deleteSkill reports a rollback-specific error after a double failure");
ok(rollbackDeleteError && rollbackDeleteError.params && rollbackDeleteError.params.path, "delete rollback failure reports the preserved stage path");
let preservedRollbackCopy = false;
try {
  const kept = await stat(join(rollbackDeleteError.params.path, "rollback-risk"));
  preservedRollbackCopy = kept.isDirectory();
} catch {}
ok(preservedRollbackCopy, "deleteSkill preserves the only unrecovered bundle copy in stage");
ok(await stat(rollbackFlat).then(() => true, () => false), "deleteSkill leaves the entry that never moved at its original path");

async function tryLink(target, path, type) {
  try {
    if (type) await symlink(target, path, type);
    else await symlink(target, path);
    return true;
  } catch {
    return false;
  }
}

const leftoverDir = join(dshRoot, ".good-skill.dssm-stage-dead");
await mkdir(leftoverDir, { recursive: true });
await writeFile(join(leftoverDir, "SKILL.md"), "---\nname: leftover\n---\nbody", "utf8");
ok(!(await scanEntries(dshRoot)).entries.some((item) => item.name.startsWith(".")), "scan hides crash leftover stage directories");

const outsidePayload = await makeSkill(join(tmp, "outside-payload"), "payload", "---\nname: payload\n---\nsecret");
const plantedLink = join(dshRoot, "evil-link");
const linkType = process.platform === "win32" ? "junction" : undefined;
if (await tryLink(outsidePayload, plantedLink, linkType)) {
  eq(await resolveEntry(dshRoot, "evil-link"), null, "resolveEntry ignores a symlink bundle that leaves the skill root");
  const linkedToggle = await setSkillEnabled(dshRoot, "evil-link", false);
  ok(linkedToggle.ok === false, "enable/disable refuses a symlink planted in the skill root");
  const outsideDoc = await readFile(join(outsidePayload, "SKILL.md"), "utf8");
  ok(!outsideDoc.includes("disable-model-invocation: true"), "symlink toggle does not rewrite files outside the skill root");
  ok(!(await scanEntries(dshRoot)).entries.some((item) => item.name === "evil-link"), "scan hides symlink bundles");
} else {
  ok(true, "symlink write-through test skipped because this environment cannot create directory links");
}

const aliasHome = join(tmp, "alias-home");
if (await tryLink(process.env.DSH_HOME, aliasHome, linkType)) {
  const viaAlias = await importSkill(join(aliasHome, "skills"), null, { dryRun: true });
  eq(viaAlias.code, "error.import.overlap", "import overlap follows intermediate directory links");
} else {
  ok(true, "intermediate-link overlap test skipped because this environment cannot create directory links");
}
eq(publicDelete.code, "error.root.readonly", "public delete carries the readonly code");
eq(publicDelete.params && publicDelete.params.action, "delete", "public delete params.action");
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
await makeSkill(dshRoot, "dual-shape", "---\nname: dual-shape\n---\nbundle");
await writeFile(join(dshRoot, "dual-shape.md"), "---\nname: dual-shape\n---\nflat", "utf8");
await deleteSkill(dshRoot, "dual-shape");
ok(await resolveEntry(dshRoot, "dual-shape") === null, "deleteSkill removes both bundle and flat forms of one skill");
await makeSkill(dshRoot, "dual-scan", "---\nname: dual-scan\n---\nbundle");
await writeFile(join(dshRoot, "dual-scan.md"), "---\nname: dual-scan\n---\nflat", "utf8");
eq((await scanEntries(dshRoot)).entries.filter((item) => item.name === "dual-scan").length, 1, "scan keeps one row when bundle and flat share a name");
eq((await scanEntries(dshRoot)).entries.find((item) => item.name === "dual-scan").kind, "bundle", "scan prefers the bundle form over the flat file");

// 删除必须清掉指向目录的伴随链接本身，且不跟随链接误删目标内容。
const altDirTarget = join(tmp, "alt-dir-target");
await mkdir(altDirTarget, { recursive: true });
if (await tryLink(altDirTarget, join(dshRoot, "alt-dir.md"), linkType)) {
  await makeSkill(dshRoot, "alt-dir", "---\nname: alt-dir\n---\nbundle");
  await deleteSkill(dshRoot, "alt-dir");
  let altDirLinkExists = true;
  try { await stat(join(dshRoot, "alt-dir.md")); } catch { altDirLinkExists = false; }
  ok(altDirLinkExists === false, "deleteSkill removes an alternate link that points at a directory");
  let targetStillExists = true;
  try { await stat(altDirTarget); } catch { targetStillExists = false; }
  ok(targetStillExists, "deleteSkill does not follow the alternate link to its target");
} else {
  ok(true, "alternate-link delete test skipped because this environment cannot create directory links");
}

// ── 导入 ──
const srcSkill = await makeSkill(tmp, "Import Me", "---\nname: import-me\ndescription: Imported.\n---\nbody");
const imp = await importSkill(join(srcSkill, "SKILL.md"), null);
eq(imp.imported.length, 1, "import single dir");
eq(imp.imported[0].name, "import-me", "import kebabifies name");
const importedEntry = await resolveEntry(dshRoot, "import-me");
ok(importedEntry !== null, "imported entry resolvable");

// 浏览器上传：同一个入口接收单个 SKILL.md、完整文件夹与 ZIP，不依赖本机绝对路径。
const uploadedSingle = await importUploadedSkill({
  name: "SKILL.md",
  entries: [{ path: "SKILL.md", data: Buffer.from("---\nname: uploaded-single\ndescription: Uploaded.\n---\nbody", "utf8").toString("base64") }],
}, null);
eq(uploadedSingle.imported.length, 1, "uploaded SKILL.md imports through staged content");
ok(await readFile(join(dshRoot, "uploaded-single", "SKILL.md"), "utf8").then((text) => text.includes("Uploaded.")), "uploaded SKILL.md keeps its content");
eq((await importUploadedSkill({ name: "SKILL.md", entries: [{ path: "SKILL.md", data: "%%%=" }] }, null)).code, "error.upload.encoding", "uploaded content rejects non-Base64 characters");
eq((await importUploadedSkill({ name: "SKILL.md", entries: [{ path: "SKILL.md", data: "A===" }] }, null)).code, "error.upload.encoding", "uploaded content rejects invalid Base64 padding");

const uploadedFolder = await importUploadedSkill({
  name: "uploaded-folder",
  entries: [
    { path: "uploaded-folder/SKILL.md", data: Buffer.from("---\nname: uploaded-folder\ndescription: Folder.\n---\nbody", "utf8").toString("base64") },
    { path: "uploaded-folder/scripts/run.js", data: Buffer.from("console.log('ok')\n", "utf8").toString("base64") },
  ],
}, null);
eq(uploadedFolder.imported.length, 1, "uploaded folder imports as one skill");
eq(await readFile(join(dshRoot, "uploaded-folder", "scripts", "run.js"), "utf8"), "console.log('ok')\n", "uploaded folder keeps nested resources");

const zipBytes = zipSync({
  "uploaded-zip/SKILL.md": strToU8("---\nname: uploaded-zip\ndescription: Zip.\n---\nbody"),
  "uploaded-zip/references/info.md": strToU8("reference"),
});
const uploadedZip = await importUploadedSkill({ name: "uploaded-zip.zip", zip: Buffer.from(zipBytes).toString("base64") }, null);
eq(uploadedZip.imported.length, 1, "uploaded ZIP imports as one skill");
eq(await readFile(join(dshRoot, "uploaded-zip", "references", "info.md"), "utf8"), "reference", "uploaded ZIP keeps nested resources");

const traversalUpload = await importUploadedSkill({
  name: "unsafe-folder",
  entries: [{ path: "../escaped.txt", data: Buffer.from("escape").toString("base64") }],
}, null);
eq(traversalUpload.code, "error.upload.path", "uploaded folder rejects traversal paths");
let escapedUploadExists = true;
try { await stat(join(process.env.DSH_HOME, "escaped.txt")); } catch { escapedUploadExists = false; }
ok(!escapedUploadExists, "rejected uploaded traversal never writes outside staging");

const traversalZip = zipSync({ "../escaped-zip.txt": strToU8("escape") });
const unsafeZip = await importUploadedSkill({ name: "unsafe.zip", zip: Buffer.from(traversalZip).toString("base64") }, null);
eq(unsafeZip.code, "error.upload.path", "uploaded ZIP rejects traversal paths");
const formerOversizedArchive = await importUploadedSkill({ name: "eleven-mib.zip", zip: Buffer.alloc(11 << 20).toString("base64") }, null);
eq(formerOversizedArchive.code, "error.upload.zipInvalid", "an 11 MiB archive passes the former 10 MiB size ceiling before ZIP validation");

// 已安装目录不能作为导入来源，否则覆盖会先删除来源再复制。
const selfImport = await importSkill(dshRoot, null, { dryRun: true });
ok(selfImport.ok === false, "import rejects a source inside the DSH skills root");
eq(selfImport.code, "error.import.overlap", "self import carries the overlap code");
const parentImport = await importSkill(tmp, null, { dryRun: true });
ok(parentImport.ok === false, "import rejects a source that contains the DSH skills root");
eq(parentImport.code, "error.import.overlap", "parent import carries the overlap code");
const namesBeforeHomeImport = (await scanEntries(dshRoot)).entries.map((entry) => entry.name).sort().join(",");
const homeSkillImport = await importSkill(join(process.env.DSH_HOME, "SKILL.md"), null, { dryRun: true });
ok(homeSkillImport.ok === false && homeSkillImport.error.includes("导入来源不能与 DSH 技能目录相同、包含或位于其中"), "import rejects a SKILL.md whose parent contains the DSH skills root");
eq(homeSkillImport.code, "error.import.overlap", "home SKILL.md import carries the overlap code");
eq((await scanEntries(dshRoot)).entries.map((entry) => entry.name).sort().join(","), namesBeforeHomeImport, "rejected home SKILL.md import leaves skills unchanged");

// 重名 dry-run
const dry = await importSkill(join(srcSkill, "SKILL.md"), null, { dryRun: true });
eq(dry.conflicts.length, 1, "import dryRun detects conflict");
eq(dry.pending.length, 0, "import dryRun pending empty on conflict");

// dry-run 预检与实际导入对符号链接口径一致：SKILL.md 本身是链接时，预检阶段即拒绝。
const docLinkTarget = join(tmp, "doc-link-target.md");
await writeFile(docLinkTarget, "---\nname: doc-link\n---\nbody", "utf8");
const linkedDocSkill = join(tmp, "linked-doc-skill");
await mkdir(linkedDocSkill, { recursive: true });
if (await tryLink(docLinkTarget, join(linkedDocSkill, "SKILL.md"))) {
  const singleDryLink = await importSkill(linkedDocSkill, null, { dryRun: true });
  ok(singleDryLink.ok === false, "dry-run rejects a single source whose SKILL.md is a symlink");
  eq(singleDryLink.code, "error.source.symlink", "single dry-run symlink carries the code");
  const batchLinkDir = join(tmp, "batch-link");
  await mkdir(batchLinkDir, { recursive: true });
  await mkdir(join(batchLinkDir, "holder"), { recursive: true });
  await tryLink(docLinkTarget, join(batchLinkDir, "holder", "SKILL.md"));
  const batchDryLink = await importSkill(batchLinkDir, null, { dryRun: true });
  ok(batchDryLink.ok === false, "dry-run rejects a batch containing a symlinked SKILL.md");
  eq(batchDryLink.code, "error.source.symlink", "batch dry-run symlink carries the code");
} else {
  ok(true, "symlink dry-run tests skipped because this environment cannot create file links");
}
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
eq(invalidImport.failed[0].code, "error.import.invalidName", "invalid kebab name carries the code");
eq(invalidImport.failed[0].params && invalidImport.failed[0].params.name, "中文技能", "invalid kebab name params");
eq(invalidImport.code, "error.import.failed", "fully failed import carries the aggregate code");
eq(invalidImport.error, invalidImport.failed.map((item) => item.error).join("；"), "aggregate error preserves the original zh text");

const partialBatchDir = join(tmp, "partial-batch");
await mkdir(partialBatchDir, { recursive: true });
await writeFile(join(partialBatchDir, "valid.md"), "---\nname: valid\n---\nbody", "utf8");
await writeFile(join(partialBatchDir, "无效.md"), "---\nname: invalid\n---\nbody", "utf8");
const partialImport = await importSkill(partialBatchDir, null);
eq(partialImport.imported.length, 1, "partial import keeps successful entries");
eq(partialImport.failed.length, 1, "partial import returns failed entry details");
eq(partialImport.failed[0].code, "error.import.invalidName", "partial import failed item carries the code");
ok(partialImport.error === undefined, "partial import does not surface a top-level error");

const duplicateBatchDir = join(tmp, "duplicate-batch");
await mkdir(duplicateBatchDir, { recursive: true });
await writeFile(join(duplicateBatchDir, "Foo Bar.md"), "---\nname: foo-bar\n---\nfirst", "utf8");
await writeFile(join(duplicateBatchDir, "foo-bar.md"), "---\nname: foo-bar\n---\nsecond", "utf8");
const duplicateBatch = await importSkill(duplicateBatchDir, null, { dryRun: true });
ok(duplicateBatch.ok === false, "batch import rejects candidates with the same normalized name");
eq(duplicateBatch.failed.length, 2, "duplicate batch reports every colliding candidate");
eq(duplicateBatch.failed[0].code, "error.import.duplicateName", "duplicate batch carries the code");
eq(duplicateBatch.failed[0].params && duplicateBatch.failed[0].params.name, "foo-bar", "duplicate batch params.name");

const emptyBatchDir = join(tmp, "empty-batch");
await mkdir(emptyBatchDir, { recursive: true });
const emptyImport = await importSkill(emptyBatchDir, null);
ok(emptyImport.ok === false, "empty batch dir returns an error result");
eq(emptyImport.code, "error.import.emptySource", "empty batch carries the emptySource code");
eq(emptyImport.params && emptyImport.params.path, emptyBatchDir, "empty batch params.path");

const deepSource = await makeSkill(tmp, "deep-source", "---\nname: deep-source\n---\nbody");
let deepPath = deepSource;
for (let i = 0; i < 65; i++) {
  deepPath = join(deepPath, `nested-${i}`);
  await mkdir(deepPath);
}
const deepImport = await importSkill(join(deepSource, "SKILL.md"), null);
ok(deepImport.ok === false, "import rejects sources that exceed the directory depth limit");
eq(deepImport.failed[0].code, "error.source.tooDeep", "too-deep import carries the code");
eq(deepImport.failed[0].params && deepImport.failed[0].params.depth, 64, "too-deep params.depth");
const deepDry = await importSkill(join(deepSource, "SKILL.md"), null, { dryRun: true });
ok(deepDry.ok === false, "dry-run rejects sources that exceed the directory depth limit");
eq(deepDry.failed[0].code, "error.source.tooDeep", "too-deep dry-run carries the code");

await makeSkill(dshRoot, "invalid-policy", "---\nname: invalid-policy\ndescription: Invalid source invocation policy.\ndisable-model-invocation: maybe\n---\nbody");
const invalidPolicyEntries = await scanEntries(dshRoot);
eq(invalidPolicyEntries.entries.find((entry) => entry.name === "invalid-policy").invocationPolicyValid, false, "scan marks invalid invocation policy values");
const invalidPolicySource = await readFile(join(dshRoot, "invalid-policy", "SKILL.md"), "utf8");
await setSkillEnabled(dshRoot, "invalid-policy", true);
eq(await readFile(join(dshRoot, "invalid-policy", "SKILL.md"), "utf8"), invalidPolicySource, "enabling a Skill with invalid source invocation fields does not repair or rewrite the source");
const invalidPolicyOverlay = (await listProviderCandidates()).find((item) => item.source === "user-dsh" && item.name === "invalid-policy");
ok(invalidPolicyOverlay && invalidPolicyOverlay.invocation.modelInvocable === true && invalidPolicyOverlay.invocation.userInvocable === true, "explicit local enable overrides invalid source invocation fields");
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


// ── 斜杠菜单刷新通知 ──
{
  const events = [];
  let catalog = 0;
  notifyChatCatalog({
    emit() { events.push(Array.from(arguments)); },
    get(name) {
      if (name === "sessions") return { list() { return [{ id: "s1", header: { agentPreset: "web" } }]; } };
    },
  }, () => { catalog++; });
  eq(catalog, 1, "notifyChatCatalog invalidates the host skill catalog");
  ok(events.some((event) => event[0] === "commands/change"), "notifyChatCatalog emits commands/change");
  ok(events.some((event) => event[0] === "agent-preset/selected" && event[1] === "s1" && event[2] === "web"), "notifyChatCatalog emits the live session preset");
}

// ── Agent preset 作用域覆盖 ──
{
  const listeners = new Map();
  const invalidators = new Set();
  const registered = [];
  function agent(id) {
    return {
      id,
      ctx: {
        get(name) {
          if (name !== "skills") return undefined;
          return {
            registerProvider(create) {
              const lifecycle = new AbortController();
              const provider = create({ signal: lifecycle.signal, invalidate() {} });
              registered.push({ id, provider });
              let live = true;
              return () => {
                if (!live) return;
                live = false;
                lifecycle.abort();
              };
            },
          };
        },
      },
    };
  }
  const existing = agent("existing");
  const later = agent("later");
  const dispose = registerAgentSkillProviders({
    on(event, callback) {
      listeners.set(event, callback);
      return () => listeners.delete(event);
    },
    get(name) {
      if (name === "agents") return { list() { return [existing]; } };
    },
  }, invalidators);
  eq(registered.length, 1, "existing live agent receives an agent-scoped manager provider");
  eq(registered[0].provider.name, "dsh-skills-manager-external", "agent-scoped provider keeps the manager provider identity");
  eq(invalidators.size, 1, "agent-scoped provider contributes an invalidator");
  listeners.get("agent/created")({ agent: existing });
  eq(registered.length, 1, "duplicate agent creation notification does not register twice");
  listeners.get("agent/created")({ agent: later });
  eq(registered.length, 2, "new live agent receives an agent-scoped manager provider");
  listeners.get("agent/disposed")({ agent: existing });
  eq(invalidators.size, 1, "disposing an agent removes its scoped invalidator");
  dispose();
  eq(invalidators.size, 0, "plugin teardown disposes all remaining scoped providers");
  eq(listeners.size, 0, "plugin teardown removes agent lifecycle listeners");
}
// ── HTTP 路由 ──
await makeSkill(dshRoot, "http-skill", "---\nname: http-skill\ndescription: HTTP skill.\n---\nbody");
const concurrentImportSource = await makeSkill(tmp, "concurrent-import", "---\nname: concurrent-import\n---\nbody");
const routeProject = join(tmp, "route-project");
const routeProjectNested = join(routeProject, "packages", "app");
await mkdir(join(routeProject, ".git"), { recursive: true });
await mkdir(routeProjectNested, { recursive: true });
await makeSkill(join(routeProject, ".agents", "skills"), "route-project-skill", "---\nname: route-project-skill\ndescription: Project route skill.\n---\nProject route body");
await makeSkill(join(routeProject, ".dsh", "skills"), "route-project-dsh", "---\nname: route-project-dsh\ndescription: Project DSH route skill.\n---\nProject DSH route body");
let route;
let invalidated = 0;
const emitted = [];
let registeredTool = null;
applyHost({
  webServer: { register(value) { route = value; return function () {}; } },
  webRuntime: { trustedHosts: ["dsh.ere.lan", "dsh.fixed.lan:8443", "192.168.50.10", "attacker.example/path"] },
  skills: { registerProvider(register) { register({ invalidate() { invalidated++; } }); return function () {}; } },
  tools: { register(definition) { registeredTool = definition; return function () {}; } },
  effect(register) { return register(); },
  emit() { emitted.push(Array.from(arguments)); },
  get(name) {
    if (name === "sessions") {
      return {
        list() {
          return [
            { id: "sess-live", header: { id: "sess-live", agentPreset: "cordis", cwd: routeProjectNested } },
            { id: "sess-blank", header: { id: "sess-blank" } },
          ];
        },
      };
    }
  },
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
  const statePayload = await stateResponse.json();
  const httpProjectDshRoot = statePayload.data.roots.find((root) => root.kind === "project-dsh" && root.projectRoot === routeProject);
  const httpProjectRoot = statePayload.data.roots.find((root) => root.kind === "project-agents" && root.projectRoot === routeProject);
  ok(httpProjectDshRoot && httpProjectDshRoot.mutable === true, "state route exposes an active Session project DSH root as writable even before its directory exists");
  ok(httpProjectRoot && httpProjectRoot.mutable === false && httpProjectRoot.toggleable === true, "state route exposes project Agent files as read-only with manager-local toggles");
  ok(httpProjectRoot.skills.some((skill) => skill.name === "route-project-skill"), "state route lists project-scoped skills from the Session cwd");
  const projectDetailResponse = await requestJson(api + "/detail", "POST", secureHeaders, JSON.stringify({ root: httpProjectRoot.key, name: "route-project-skill" }));
  eq(projectDetailResponse.status, 200, "detail route accepts a live project root identity");
  eq(projectDetailResponse.payload.data.body, "Project route body", "project detail returns the current project skill body");
  const projectAgentSourceBeforeToggle = await readFile(join(routeProject, ".agents", "skills", "route-project-skill", "SKILL.md"), "utf8");
  const projectToggleResponse = await requestJson(api + "/disable", "POST", secureHeaders, JSON.stringify({ root: httpProjectRoot.key, name: "route-project-skill" }));
  eq(projectToggleResponse.status, 200, "project Agent skills support manager-local disable");
  ok(projectToggleResponse.payload.data.enabled === false, "project Agent disable returns the local policy state");
  eq(await readFile(join(routeProject, ".agents", "skills", "route-project-skill", "SKILL.md"), "utf8"), projectAgentSourceBeforeToggle, "project Agent disable never rewrites the shared source file");
  const disabledProjectState = await (await fetch(api + "/state")).json();
  const disabledProjectAgent = disabledProjectState.data.roots.find((root) => root.key === httpProjectRoot.key).skills.find((skill) => skill.name === "route-project-skill");
  ok(disabledProjectAgent.managerEnabled === false && disabledProjectAgent.enabled === false, "state reports the project Agent policy as disabled");
  let projectPolicyCandidates = await listProviderCandidates({ cwd: routeProjectNested });
  const projectPolicyBlocker = projectPolicyCandidates.find((item) => item.source === "project-agents" && item.name === "route-project-skill");
  ok(projectPolicyBlocker && projectPolicyBlocker.rank === 199 && projectPolicyBlocker.invocation.modelInvocable === false, "disabled project Agent skill contributes a policy blocker ahead of the official rank 200 candidate");
  ok(projectPolicyBlocker && typeof projectPolicyBlocker.locator.realEntryPath === "string" && typeof projectPolicyBlocker.locator.realDocPath === "string", "project policy candidates retain their discovered real bundle and document paths");
  eq((await getProviderSkill(projectPolicyBlocker, { cwd: routeProjectNested })).content, "Project route body", "project policy blocker resolves only inside its current workspace");
  const projectCandidateWithoutRealPath = { ...projectPolicyBlocker, locator: { ...projectPolicyBlocker.locator } };
  delete projectCandidateWithoutRealPath.locator.realDocPath;
  eq(await getProviderSkill(projectCandidateWithoutRealPath, { cwd: routeProjectNested }), undefined, "provider rejects a project candidate missing a discovered real path");
  eq(await getProviderSkill(projectPolicyBlocker, { cwd: join(tmp, "missing-workspace") }), undefined, "project policy blocker cannot load through an unrelated workspace");
  const projectAgentEnableResponse = await requestJson(api + "/enable", "POST", secureHeaders, JSON.stringify({ root: httpProjectRoot.key, name: "route-project-skill" }));
  eq(projectAgentEnableResponse.status, 200, "project Agent skills support manager-local enable");
  eq(await readFile(join(routeProject, ".agents", "skills", "route-project-skill", "SKILL.md"), "utf8"), projectAgentSourceBeforeToggle, "project Agent enable also leaves the source file unchanged");
  projectPolicyCandidates = await listProviderCandidates({ cwd: routeProjectNested });
  const projectEnableOverlay = projectPolicyCandidates.find((item) => item.source === "project-agents" && item.name === "route-project-skill");
  ok(projectEnableOverlay && projectEnableOverlay.rank === 199 && projectEnableOverlay.invocation.modelInvocable === true, "explicit project Agent enable is enforced by a non-mutating policy overlay");
  const validProjectManagerState = await readFile(managerStatePath(), "utf8");
  await writeFile(managerStatePath(), "{broken", "utf8");
  projectPolicyCandidates = await listProviderCandidates({ cwd: routeProjectNested });
  ok(projectPolicyCandidates.some((item) => item.source === "project-agents" && item.name === "route-project-skill" && item.invocation.modelInvocable === false), "invalid manager state fails closed for project Agent skills");
  ok(projectPolicyCandidates.some((item) => item.source === "project-dsh" && item.name === "route-project-dsh" && item.invocation.modelInvocable === false), "invalid manager state fails closed for project DSH skills");
  const rejectedProjectToggle = await requestJson(api + "/enable", "POST", secureHeaders, JSON.stringify({ root: httpProjectRoot.key, name: "route-project-skill" }));
  eq(rejectedProjectToggle.status, 400, "invalid manager state rejects project Agent toggle requests");
  eq(rejectedProjectToggle.payload.code, "error.state.invalid", "project Agent toggles refuse to overwrite an invalid manager state file");
  eq(await readFile(managerStatePath(), "utf8"), "{broken", "rejected project Agent toggle preserves the invalid state file for recovery");
  await writeFile(managerStatePath(), validProjectManagerState, "utf8");
  const projectCreateResponse = await requestJson(api + "/create", "POST", secureHeaders, JSON.stringify({ root: httpProjectDshRoot.key, name: "Route Project Created", description: "Created through the project route.", body: "Project route creation body." }));
  eq(projectCreateResponse.status, 200, "create route accepts an active Session project DSH root identity");
  eq(projectCreateResponse.payload.data.root, httpProjectDshRoot.key, "project create returns the resolved project root identity");
  ok((await resolveEntry(join(routeProject, ".dsh", "skills"), "route-project-created")) !== null, "project create persists under the active project's .dsh/skills root");
  const projectDshSourceBeforeToggle = await readFile(join(routeProject, ".dsh", "skills", "route-project-created", "SKILL.md"), "utf8");
  const projectDisableResponse = await requestJson(api + "/disable", "POST", secureHeaders, JSON.stringify({ root: httpProjectDshRoot.key, name: "route-project-created" }));
  eq(projectDisableResponse.status, 200, "disable route accepts an active project DSH root");
  eq(await readFile(join(routeProject, ".dsh", "skills", "route-project-created", "SKILL.md"), "utf8"), projectDshSourceBeforeToggle, "project DSH disable leaves the source Skill file unchanged");
  const projectDshDisableOverlay = (await listProviderCandidates({ cwd: routeProjectNested })).find((item) => item.source === "project-dsh" && item.name === "route-project-created");
  ok(projectDshDisableOverlay && projectDshDisableOverlay.rank === 99 && projectDshDisableOverlay.invocation.modelInvocable === false, "project DSH disable uses a rank 99 workspace policy overlay");
  const projectEnableResponse = await requestJson(api + "/enable", "POST", secureHeaders, JSON.stringify({ root: httpProjectDshRoot.key, name: "route-project-created" }));
  eq(projectEnableResponse.status, 200, "enable route restores an active project DSH skill");
  eq(await readFile(join(routeProject, ".dsh", "skills", "route-project-created", "SKILL.md"), "utf8"), projectDshSourceBeforeToggle, "project DSH enable also leaves the source Skill file unchanged");
  const projectDshEnableOverlay = (await listProviderCandidates({ cwd: routeProjectNested })).find((item) => item.source === "project-dsh" && item.name === "route-project-created");
  ok(projectDshEnableOverlay && projectDshEnableOverlay.invocation.modelInvocable === true, "project DSH enable is enforced without rewriting source invocation fields");
  const projectDeleteResponse = await requestJson(api + "/delete", "POST", secureHeaders, JSON.stringify({ root: httpProjectDshRoot.key, name: "route-project-created" }));
  eq(projectDeleteResponse.status, 200, "delete route moves a project DSH skill to the shared Trash");
  eq(projectDeleteResponse.payload.data.root.scope, "project", "project Trash metadata retains the original scope");
  ok((await resolveEntry(join(routeProject, ".dsh", "skills"), "route-project-created")) === null, "project delete removes the live project entry");
  const projectRestoreResponse = await requestJson(api + "/trash-restore", "POST", secureHeaders, JSON.stringify({ id: projectDeleteResponse.payload.data.id }));
  eq(projectRestoreResponse.status, 200, "Trash restore returns a project Skill to its active project");
  ok((await resolveEntry(join(routeProject, ".dsh", "skills"), "route-project-created")) !== null, "project restore recreates the original project entry");
  const projectAgentDeleteResponse = await requestJson(api + "/delete", "POST", secureHeaders, JSON.stringify({ root: httpProjectRoot.key, name: "route-project-skill" }));
  eq(projectAgentDeleteResponse.status, 400, "delete route keeps project .agents/skills read-only");
  eq(projectAgentDeleteResponse.payload.code, "error.root.readonly", "project Agent deletion uses the readonly error contract");
  const staleProjectCreateResponse = await requestJson(api + "/create", "POST", secureHeaders, JSON.stringify({ root: "project-dsh:stale", name: "Must Not Fall Back", description: "Must be rejected.", body: "Denied." }));
  eq(staleProjectCreateResponse.status, 400, "create route rejects a stale or forged project root identity");
  ok((await resolveEntry(dshRoot, "must-not-fall-back")) === null, "rejected project creation never falls back to the user DSH root");
  const headState = await fetch(api + "/state", { method: "HEAD" });
  eq(headState.status, 200, "HEAD /state returns 200");
  eq(await headState.text(), "", "HEAD /state has an empty body");
  const stateGet = await fetch(api + "/state");
  eq(headState.headers.get("content-length"), stateGet.headers.get("content-length"), "HEAD /state content-length matches the GET entity");
  const headDisable = await fetch(api + "/disable", { method: "HEAD" });
  eq(headDisable.status, 405, "HEAD on a mutation route returns 405");
  eq(await headDisable.text(), "", "HEAD 405 has an empty body");
  eq(headDisable.headers.get("content-length"), String(Buffer.byteLength(JSON.stringify({ ok: false, code: "error.proto.method", error: "method not allowed: HEAD" })), "utf8"), "HEAD 405 content-length matches the POST 405 payload shape");

  const evilStateResponse = await requestJson(api + "/state", "GET", { host: "evil.example" });
  eq(evilStateResponse.status, 403, "state route rejects untrusted non-loopback Host headers");
  eq(evilStateResponse.payload.code, "error.proto.forbiddenHost", "untrusted Host on GET carries the forbiddenHost code");

  const localhostStateResponse = await requestJson(api + "/state", "GET", { host: "localhost:" + address.port });
  eq(localhostStateResponse.status, 200, "state route accepts localhost Host headers");
  ok(localhostStateResponse.payload.ok === true, "loopback GET /state still returns the snapshot");

  const loopbackRangeResponse = await requestJson(api + "/state", "GET", { host: "127.23.45.67:" + address.port });
  eq(loopbackRangeResponse.status, 200, "state route accepts the full IPv4 127/8 loopback range like the DSH trust fence");

  const trustedDomainResponse = await requestJson(api + "/state", "GET", { host: "dsh.ere.lan" });
  eq(trustedDomainResponse.status, 200, "state route inherits a port-less DSH trusted host");
  const trustedDomainPortResponse = await requestJson(api + "/state", "GET", { host: "DSH.ERE.LAN:9443" });
  eq(trustedDomainPortResponse.status, 200, "port-less trusted hosts match any port and Host comparison is case-insensitive");

  const trustedExactPortResponse = await requestJson(api + "/state", "GET", { host: "dsh.fixed.lan:8443" });
  eq(trustedExactPortResponse.status, 200, "trusted host entries with a port match that exact authority");
  const rejectedOtherPortResponse = await requestJson(api + "/state", "GET", { host: "dsh.fixed.lan:9443" });
  eq(rejectedOtherPortResponse.status, 403, "trusted host entries with a port reject other ports");

  const trustedLanResponse = await requestJson(api + "/state", "GET", { host: "192.168.50.10:" + address.port });
  eq(trustedLanResponse.status, 200, "state route inherits LAN IP authorities derived by DSH Web runtime");
  const malformedRequestHostResponse = await requestJson(api + "/state", "GET", { host: "dsh.ere.lan/path" });
  eq(malformedRequestHostResponse.status, 403, "non-canonical request Host values never normalize into a trusted authority");
  const malformedTrustedEntryResponse = await requestJson(api + "/state", "GET", { host: "attacker.example" });
  eq(malformedTrustedEntryResponse.status, 403, "non-canonical trusted host entries never broaden access");

  const sameOriginResponse = await requestJson(api + "/state", "GET", { host: "dsh.ere.lan", origin: "https://dsh.ere.lan" });
  eq(sameOriginResponse.status, 200, "same-origin requests through a trusted host are accepted");
  const foreignOriginResponse = await requestJson(api + "/state", "GET", { host: "dsh.ere.lan", origin: "https://evil.example" });
  eq(foreignOriginResponse.status, 403, "foreign Origin requests through a trusted host are rejected");
  const crossSiteResponse = await requestJson(api + "/state", "GET", { host: "dsh.ere.lan", "sec-fetch-site": "cross-site" });
  eq(crossSiteResponse.status, 403, "explicit cross-site browser requests through a trusted host are rejected");

  const evilHostResponse = await requestJson(api + "/disable", "POST", { ...secureHeaders, host: "evil.example" }, JSON.stringify({ name: "http-skill" }));
  eq(evilHostResponse.status, 403, "mutating route rejects non-loopback Host headers");
  eq(evilHostResponse.payload.code, "error.proto.forbiddenHost", "untrusted Host carries the forbiddenHost code");

  const trustedHostResponse = await requestJson(api + "/disable", "POST", { ...secureHeaders, host: "dsh.ere.lan", origin: "https://dsh.ere.lan" }, JSON.stringify({ name: "http-skill" }));
  eq(trustedHostResponse.status, 200, "mutating routes accept a same-origin DSH trusted host");

  const trustedMissingMarkerResponse = await requestJson(api + "/enable", "POST", { "content-type": "application/json", host: "dsh.ere.lan" }, JSON.stringify({ name: "http-skill" }));
  eq(trustedMissingMarkerResponse.status, 403, "trusted hosts do not bypass the mutation client marker");
  eq(trustedMissingMarkerResponse.payload.code, "error.proto.forbidden", "trusted mutation without a marker keeps the forbidden request code");

  const localhostHostResponse = await requestJson(api + "/enable", "POST", { ...secureHeaders, host: "localhost:" + address.port }, JSON.stringify({ name: "http-skill" }));
  eq(localhostHostResponse.status, 200, "mutating route accepts localhost Host headers");

  const uploadResponse = await requestJson(api + "/upload", "POST", secureHeaders, JSON.stringify({
    name: "SKILL.md",
    entries: [{ path: "SKILL.md", data: Buffer.from("---\nname: http-upload\ndescription: HTTP upload.\n---\nbody").toString("base64") }],
  }));
  eq(uploadResponse.status, 200, "upload route accepts browser-read skill content");
  eq(uploadResponse.payload.data.imported[0].name, "http-upload", "upload route returns the imported skill");
  ok((await resolveEntry(dshRoot, "http-upload")) !== null, "upload route persists the skill through the normal import path");

  const largeUploadEntries = [{
    path: "http-large-upload/SKILL.md",
    data: Buffer.from("---\nname: http-large-upload\ndescription: Large HTTP upload.\n---\nbody").toString("base64"),
  }].concat([7, 10, 10].map((mib, index) => ({
    path: `http-large-upload/assets/part-${index}.bin`,
    data: Buffer.alloc(mib << 20, index + 1).toString("base64"),
  })));
  const largeUploadBody = JSON.stringify({ name: "http-large-upload", entries: largeUploadEntries });
  ok(Buffer.byteLength(largeUploadBody) > (36 << 20), "large upload regression exceeds the former 36 MiB request limit");
  const largeUploadResponse = await requestJson(api + "/upload", "POST", secureHeaders, largeUploadBody);
  eq(largeUploadResponse.status, 200, "upload route accepts a 27 MiB folder above the former total and Base64 JSON ceilings");
  eq(largeUploadResponse.payload.data.imported[0].name, "http-large-upload", "large browser upload reaches the normal import path");
  ok((await resolveEntry(dshRoot, "http-large-upload")) !== null, "large browser upload persists the skill");

  const csrfResponse = await fetch(api + "/disable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "http-skill" }) });
  eq(csrfResponse.status, 403, "mutating route rejects requests without the client marker");
  eq((await csrfResponse.json()).code, "error.proto.forbidden", "403 response carries the protocol error code");

  const contentTypeResponse = await fetch(api + "/disable", { method: "POST", headers: { "x-dsh-skills-manager": "1" }, body: JSON.stringify({ name: "http-skill" }) });
  eq(contentTypeResponse.status, 415, "mutating route requires JSON content type");
  eq((await contentTypeResponse.json()).code, "error.proto.contentType", "415 response carries the protocol error code");

  const methodResponse = await fetch(api + "/disable", { method: "PUT" });
  eq(methodResponse.status, 405, "unsupported method returns 405");
  eq((await methodResponse.json()).code, "error.proto.method", "405 response carries the protocol error code");

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

  const httpSkillSourceBeforeToggle = await readFile(join(dshRoot, "http-skill", "SKILL.md"), "utf8");
  const disableResponse = await fetch(api + "/disable", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "http-skill" }) });
  eq(disableResponse.status, 200, "valid mutation returns 200");
  eq(await readFile(join(dshRoot, "http-skill", "SKILL.md"), "utf8"), httpSkillSourceBeforeToggle, "HTTP disable stores policy without rewriting the user DSH Skill");
  ok(invalidated > 0, "successful mutation invalidates the skill catalog");
ok(emitted.some((event) => event[0] === "commands/change"), "successful mutation notifies the command catalog");
ok(emitted.some((event) => event[0] === "agent-preset/selected" && event[1] === "sess-live" && event[2] === "cordis"), "successful mutation refreshes live session slash menus");
ok(!emitted.some((event) => event[0] === "agent-preset/selected" && event[1] === "sess-blank"), "sessions without a preset are not rewritten");

  const publicResponse = await fetch(api + "/disable", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "public-skill", root: "agents" }) });
  eq(publicResponse.status, 200, "HTTP route stores public Agent toggles locally");
  const publicPayload = await publicResponse.json();
  ok(publicPayload.ok === true && publicPayload.data.enabled === false, "HTTP public toggle returns disabled manager state");
  const httpDeleteAgents = await fetch(api + "/delete", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "http-skill", root: "agents" }) });
  eq(httpDeleteAgents.status, 400, "HTTP delete rejects public Agent root");
  eq((await httpDeleteAgents.json()).code, "error.root.readonly", "HTTP delete with agents root is readonly");
  ok(await resolveEntry(dshRoot, "http-skill") !== null, "HTTP delete with agents root does not remove the DSH skill");
  const httpDotDelete = await fetch(api + "/delete", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "." }) });
  eq(httpDotDelete.status, 400, "HTTP delete rejects current-directory traversal");
  const httpNestedDelete = await fetch(api + "/delete", { method: "POST", headers: secureHeaders, body: JSON.stringify({ name: "foo/../safe-bar" }) });
  eq(httpNestedDelete.status, 400, "HTTP delete rejects nested traversal");
  ok(await resolveEntry(dshRoot, "safe-bar") !== null, "HTTP traversal deletes leave skills unchanged");
  const unknownResponse = await fetch(api + "/unknown", { method: "POST", headers: secureHeaders, body: "{}" });
  eq(unknownResponse.status, 404, "unknown mutation route returns 404");
  eq((await unknownResponse.json()).code, "error.proto.unknownAction", "404 response carries the protocol error code");

  const concurrentResponses = await Promise.all([1, 2].map(function () {
    return fetch(api + "/import", { method: "POST", headers: secureHeaders, body: JSON.stringify({ source: concurrentImportSource }) }).then(function (response) { return response.json(); });
  }));
  eq(concurrentResponses.reduce(function (count, payload) { return count + payload.data.imported.length; }, 0), 1, "concurrent imports perform one installation");
  eq(concurrentResponses.reduce(function (count, payload) { return count + payload.data.skipped.length; }, 0), 1, "concurrent imports serialize the second conflict check");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

// ── 状态快照 ──
const snap = await state();
eq(snap.roots.length, 7, "state returns DSH, CC Switch, and common Agent roots");
ok(snap.roots.some((root) => root.key === "ccswitch"), "state includes the CC Switch source");
const dshSnap = snap.roots.find((r) => r.key === "dsh");
ok(dshSnap.mutable === true, "DSH root allows destructive actions");
ok(dshSnap.skills.some((s) => s.name === "import-me"), "state lists imported skill");
ok(dshSnap.skills.find((s) => s.name === "import-me").modelInvocable === true, "state modelInvocable");
const invalidPolicySnap = dshSnap.skills.find((s) => s.name === "invalid-policy");
ok(invalidPolicySnap.hasFrontmatter === true, "state preserves hasFrontmatter for invalid source invocation policy");
ok(invalidPolicySnap.invocationPolicyValid === false, "state preserves invalid invocation policy status");
ok(invalidPolicySnap.loadable === true, "manager policy can load a structurally valid Skill even when source invocation fields are invalid");
const agentsSnap = snap.roots.find((r) => r.key === "agents");
ok(agentsSnap.mutable === false, "public Agent root disallows destructive actions");
ok(agentsSnap.skills.some((s) => s.name === "public-skill"), "state lists public Agent skill");
ok(hostInject.includes("sessions"), "host declares the Session service used for project workspace discovery");
eq(activeSessionCwds({ sessions: { list: () => [{ header: { cwd: routeProjectNested } }, { header: { cwd: routeProjectNested } }, { header: {} }] } }).length, 1, "activeSessionCwds deduplicates valid workspace paths");

// ── 项目级 Skill：按 workspace 隔离、遵循官方优先级、每次请求重新发现 ──
const noGitWorkspace = join(tmp, "no-git-workspace");
await mkdir(noGitWorkspace, { recursive: true });
eq((await projectRoots([noGitWorkspace])).length, 0, "projectRoots does not treat a readable cwd without a .git ancestor as a project");
const secondProject = join(tmp, "second-project");
await mkdir(join(secondProject, ".git"), { recursive: true });
await makeSkill(join(routeProject, ".dsh", "skills"), "project-priority", "---\nname: project-priority\ndescription: Project DSH winner.\n---\nDSH winner");
await makeSkill(join(routeProject, ".agents", "skills"), "project-priority", "---\nname: project-priority\ndescription: Project Agent loser.\n---\nAgent loser");
await makeSkill(join(secondProject, ".agents", "skills"), "project-priority", "---\nname: project-priority\ndescription: Independent workspace winner.\n---\nSecond project");
const resolvedProjectRoots = await projectRoots([routeProjectNested, routeProject, secondProject, "relative/path"]);
eq(resolvedProjectRoots.length, 4, "projectRoots deduplicates Sessions by nearest git root and ignores non-absolute cwd values");
eq(new Set(resolvedProjectRoots.map((root) => root.key)).size, 4, "project source keys stay unique across workspaces and source kinds");
const writableProjectDefinition = resolvedProjectRoots.find((root) => root.kind === "project-dsh" && root.projectRoot === routeProject);
const readonlyProjectDefinition = resolvedProjectRoots.find((root) => root.kind === "project-agents" && root.projectRoot === routeProject);
ok(writableProjectDefinition.mutable === true && writableProjectDefinition.toggleable === true, "project DSH roots allow create/delete plus manager-local invocation toggles");
ok(readonlyProjectDefinition.mutable === false && readonlyProjectDefinition.toggleable === true, "project Agent roots keep source files read-only while allowing local policy toggles");
const directProjectCreated = await createSkill({ name: "Direct Project Created", description: "Direct project create.", body: "Direct project body." }, null, { root: writableProjectDefinition });
eq(directProjectCreated.root, writableProjectDefinition.key, "createSkill accepts a validated active project DSH definition");
ok((await resolveEntry(writableProjectDefinition.path, "direct-project-created")) !== null, "direct project creation writes to .dsh/skills");
eq((await createSkill({ name: "Denied Project Agent", description: "Denied.", body: "Denied." }, null, { root: readonlyProjectDefinition })).code, "error.root.readonly", "createSkill rejects project .agents/skills");
eq((await createSkill({ name: "Forged Root", description: "Denied.", body: "Denied." }, null, { root: { key: "dsh", path: join(tmp, "forged"), mutable: true } })).code, "error.root.readonly", "createSkill rejects a forged mutable DSH root object");
const directProjectDeleted = await deleteSkill(writableProjectDefinition, "direct-project-created");
eq(directProjectDeleted.root.key, writableProjectDefinition.key, "deleteSkill stores the original project root identity in Trash");
eq((await restoreTrash(directProjectDeleted.id, null, { projectCwds: [] })).code, "error.trash.projectUnavailable", "project restore waits until the original project is an active Session workspace");
const directProjectRestored = await restoreTrash(directProjectDeleted.id, null, { projectCwds: [routeProjectNested] });
eq(directProjectRestored.root.key, writableProjectDefinition.key, "project restore resolves the original root from current active Session cwd values");
ok((await resolveEntry(writableProjectDefinition.path, "direct-project-created")) !== null, "project restore returns the complete bundle to its original root");
eq((await deleteSkill(readonlyProjectDefinition, "project-priority")).code, "error.root.readonly", "deleteSkill keeps project .agents/skills read-only");
const projectSnap = await state({ projectCwds: [routeProjectNested, secondProject] });
const firstDshProject = projectSnap.roots.find((root) => root.kind === "project-dsh" && root.projectRoot === routeProject);
const firstAgentsProject = projectSnap.roots.find((root) => root.kind === "project-agents" && root.projectRoot === routeProject);
const secondAgentsProject = projectSnap.roots.find((root) => root.kind === "project-agents" && root.projectRoot === secondProject);
ok(firstDshProject && firstDshProject.scope === "project" && firstDshProject.mutable === true && firstDshProject.toggleable === true, "project DSH roots expose create/delete plus non-mutating invocation-policy toggles");
eq(firstDshProject.rank, 100, "project state exposes the official project-dsh rank");
eq(firstAgentsProject.rank, 200, "project state exposes the official project-agents rank");
ok(firstAgentsProject.skills.find((skill) => skill.name === "project-priority").shadowedBy.root === firstDshProject.key, "project DSH rank 100 shadows project Agent rank 200 within one workspace");
ok(firstDshProject.skills.find((skill) => skill.name === "project-priority").enabled === true, "the higher-priority project skill reports invocation policy as enabled without claiming body loading");
ok(secondAgentsProject.skills.find((skill) => skill.name === "project-priority").enabled === true, "same-named skills in another workspace report their independent invocation policy");
ok(projectSnap.summary.enabled > snap.summary.enabled, "the enabled summary includes independently enabled project winners");
const projectDetail = await skillDetail(firstDshProject.key, "project-priority", { projectCwds: [routeProjectNested] });
eq(projectDetail.body, "DSH winner", "skillDetail resolves only live Session-derived project root identities");
eq((await skillDetail(firstDshProject.key, "project-priority", { projectCwds: [secondProject] })).code, "error.root.unknown", "stale project identities cannot read a workspace no longer present in active Sessions");
await writeFile(join(routeProject, ".dsh", "skills", "project-priority", "SKILL.md"), "---\nname: project-priority\ndescription: Refreshed.\n---\nFresh body", "utf8");
eq((await skillDetail(firstDshProject.key, "project-priority", { projectCwds: [routeProjectNested] })).body, "Fresh body", "project detail re-reads modified files instead of caching bodies");
await rm(join(routeProject, ".dsh", "skills", "project-priority"), { recursive: true, force: true });
const removedProjectSnap = await state({ projectCwds: [routeProjectNested] });
ok(!removedProjectSnap.roots.find((root) => root.key === firstDshProject.key).skills.some((skill) => skill.name === "project-priority"), "a removed project skill disappears on the next state snapshot");
const outsideProjectSkill = await makeSkill(join(tmp, "outside-project-skills"), "linked-project", "---\nname: linked-project\ndescription: Outside project link.\n---\nOutside");
const projectLinkType = process.platform === "win32" ? "junction" : undefined;
if (await tryLink(outsideProjectSkill, join(routeProject, ".agents", "skills", "linked-project"), projectLinkType)) {
  const linkedProjectSnap = await state({ projectCwds: [routeProjectNested] });
  ok(!linkedProjectSnap.roots.find((root) => root.key === firstAgentsProject.key).skills.some((skill) => skill.name === "linked-project"), "project discovery does not follow a linked bundle outside the active project skill root");
} else {
  ok(true, "project linked-bundle containment test skipped because this environment cannot create links");
}
const linkedCcSwitchProjectSkill = join(routeProject, ".agents", "skills", "linked-ccswitch-project");
if (await tryLink(ccswitchSkill, linkedCcSwitchProjectSkill, projectLinkType)) {
  const linkedCcSwitchProjectSnap = await state({ projectCwds: [routeProjectNested] });
  ok(!linkedCcSwitchProjectSnap.roots.find((root) => root.key === firstAgentsProject.key).skills.some((skill) => skill.name === "linked-ccswitch-project"), "project Agent roots reject links even when they target a trusted CC Switch child");
  await rm(linkedCcSwitchProjectSkill, { recursive: true, force: true });
} else {
  ok(true, "project trusted-target link test skipped because this environment cannot create directory links");
}
const unsafeProject = join(tmp, "unsafe-project");
const unsafeProjectTarget = join(tmp, "unsafe-project-target");
await mkdir(join(unsafeProject, ".git"), { recursive: true });
await mkdir(join(unsafeProject, ".dsh"), { recursive: true });
await makeSkill(unsafeProjectTarget, "outside-project-write", "---\nname: outside-project-write\ndescription: Must stay outside.\n---\nOutside");
const unsafeDefinition = (await projectRoots([unsafeProject])).find((root) => root.kind === "project-dsh");
if (await tryLink(unsafeProjectTarget, join(unsafeProject, ".dsh", "skills"), projectLinkType)) {
  ok(!(await projectRoots([unsafeProject])).some((root) => root.kind === "project-dsh"), "project discovery hides a linked .dsh/skills root");
  ok(!(await state({ projectCwds: [unsafeProject] })).roots.some((root) => root.kind === "project-dsh" && root.projectRoot === unsafeProject), "state does not expose a linked project DSH root");
  eq((await scanEntries(join(unsafeProject, ".dsh", "skills"))).entries.length, 0, "scanEntries does not follow a linked skill root");
  eq(await resolveEntry(join(unsafeProject, ".dsh", "skills"), "outside-project-write"), null, "resolveEntry does not follow a linked skill root");
  eq((await skillDetail(unsafeDefinition.key, "outside-project-write", { projectCwds: [unsafeProject] })).code, "error.root.unknown", "project detail cannot read through a linked skill root");
  eq((await createSkill({ name: "Escaped Create", description: "Must not escape.", body: "Denied." }, null, { root: unsafeDefinition })).code, "error.root.unsafe", "project create refuses a linked .dsh/skills root");
  eq((await setSkillEnabled(unsafeDefinition, "outside-project-write", false)).code, "error.root.unsafe", "project toggle refuses a linked .dsh/skills root");
  eq((await deleteSkill(unsafeDefinition, "outside-project-write")).code, "error.root.unsafe", "project delete refuses a linked .dsh/skills root");
  ok((await resolveEntry(unsafeProjectTarget, "outside-project-write")) !== null, "unsafe project mutations leave the linked external target unchanged");
} else {
  ok(true, "project mutation root-link test skipped because this environment cannot create links");
}
const overlapProject = join(tmp, "overlap-project");
await mkdir(join(overlapProject, ".git"), { recursive: true });
const overlapDefinition = (await projectRoots([overlapProject])).find((root) => root.kind === "project-dsh");
const originalDshHome = process.env.DSH_HOME;
const originalAgentsHome = process.env.DSH_AGENTS_HOME;
process.env.DSH_HOME = join(overlapProject, ".dsh");
process.env.DSH_AGENTS_HOME = join(overlapProject, ".agents");
try {
  const overlapRoots = await projectRoots([overlapProject]);
  eq(overlapRoots.length, 0, "project discovery hides project roots that overlap user DSH and Agent roots");
  eq((await state({ projectCwds: [overlapProject] })).roots.filter((root) => root.scope === "project").length, 0, "state exposes only the user roots when a dotfiles project overlaps them");
  eq((await createSkill({ name: "Overlap Write", description: "Must not write.", body: "Denied." }, null, { root: overlapDefinition })).code, "error.root.unsafe", "write validation rejects a previously resolved project root after it overlaps the user DSH root");
} finally {
  process.env.DSH_HOME = originalDshHome;
  process.env.DSH_AGENTS_HOME = originalAgentsHome;
}
const unavailableProjectSnap = await state({ projectCwds: [join(tmp, "missing-workspace")] });
eq(unavailableProjectSnap.warnings.find((warning) => warning.code === "warning.project.unavailable").params.path, join(tmp, "missing-workspace"), "unreadable active workspaces produce an observable project-discovery warning");
ok(registeredTool && registeredTool.name === "create_skill", "host registers the conversational create_skill tool");

// 清理
await rm(tmp, { recursive: true, force: true });
delete process.env.DSH_HOME;
delete process.env.DSH_AGENTS_HOME;
delete process.env.DSH_CODEX_HOME;
delete process.env.DSH_CLAUDE_HOME;
delete process.env.DSH_GEMINI_HOME;
delete process.env.DSH_OPENCODE_HOME;

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
