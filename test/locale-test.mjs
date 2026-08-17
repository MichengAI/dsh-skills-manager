// dsh-skills-manager 双语词典对齐测试（零第三方依赖）
// 断言：zh/en 词典 key 集合完全一致；每个模板的 {xxx} 占位符集合完全一致。
// 运行：node test/locale-test.mjs

import { readFile } from "node:fs/promises";

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

/** 提取模板字符串中的 {xxx} 占位符集合（顺序无关）。 */
function placeholders(template) {
  const set = new Set();
  const re = /\{(\w+)\}/g;
  let match;
  while ((match = re.exec(template)) !== null) set.add(match[1]);
  return set;
}
/** 集合比较：与顺序无关，仅比对成员。 */
function sameSet(a, b, msg) {
  const av = JSON.stringify([...a].sort());
  const bv = JSON.stringify([...b].sort());
  ok(av === bv, msg + " (got " + av + ", want " + bv + ")");
}

const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");

// 模拟宿主 AMD 加载器：执行 bundle，捕获 load 定义，再调用 factory 读取导出。
let loaded = null;
const fakeWindow = {
  __ModuleLoader__: {
    load(definition) { loaded = definition; },
  },
};
new Function("window", source)(fakeWindow);
ok(loaded !== null && typeof loaded.factory === "function", "client bundle registers via window.__ModuleLoader__.load with a factory");

const bundle = loaded.factory((id) => {
  if (id === "react") return { createElement: function () {} };
  throw new Error("unexpected require: " + id);
});

const DICT = bundle.DICT;
ok(DICT !== undefined && DICT.zh !== undefined && DICT.en !== undefined, "factory exports the zh/en dictionaries");

const zhKeys = Object.keys(DICT.zh).sort();
const enKeys = Object.keys(DICT.en).sort();
eq(zhKeys.length, enKeys.length, "zh and en dictionaries have the same key count");
for (let i = 0; i < Math.max(zhKeys.length, enKeys.length); i++) {
  eq(zhKeys[i], enKeys[i], "dictionary key " + (i + 1) + " is aligned");
}

// 命名约定：点分小写为主（如 btn.refresh、status.enabled）；业务错误码段允许 camelCase
// （如 error.skill.notFound、error.source.tooDeep），首段仍必须小写字母开头。
for (const key of zhKeys) {
  ok(/^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*$/.test(key), "key uses dot-lowercase naming: " + key);
}

// 占位符对齐：每个 key 的模板在 zh/en 中引用完全相同的参数名。
for (const key of zhKeys) {
  sameSet(placeholders(DICT.zh[key]), placeholders(DICT.en[key]), "placeholder set of \"" + key + "\" matches across zh/en");
  ok(typeof DICT.zh[key] === "string" && DICT.zh[key].length > 0, "zh value of \"" + key + "\" is a non-empty string");
  ok(typeof DICT.en[key] === "string" && DICT.en[key].length > 0, "en value of \"" + key + "\" is a non-empty string");
}

const hostSources = await Promise.all([
  readFile(new URL("../lib/core.js", import.meta.url), "utf8"),
  readFile(new URL("../lib/index.js", import.meta.url), "utf8"),
]);
const hostCodes = new Set();
for (const hostSource of hostSources) {
  for (const match of hostSource.matchAll(/["']((?:error|warning)\.[A-Za-z]+(?:\.[A-Za-z]+)*)["']/g)) hostCodes.add(match[1]);
}
for (const code of hostCodes) {
  ok(code in DICT.zh && code in DICT.en, "host error code exists in both dictionaries: " + code);
}

// ── translateError 纯函数测试（模拟宿主 translate 行为：{name} 占位符，miss 返回 key 本身）──
const translateError = bundle.translateError;
ok(typeof translateError === "function", "factory exports translateError");
const isSkillEnabled = bundle.isSkillEnabled;
ok(typeof isSkillEnabled === "function", "factory exports the shared enabled-state predicate");
ok(isSkillEnabled({ invocationPolicyValid: true, modelInvocable: true, userInvocable: true }), "valid model and user invocation is enabled");
ok(!isSkillEnabled({ invocationPolicyValid: true, modelInvocable: true, userInvocable: false }), "user-disabled skill is not enabled");
ok(!isSkillEnabled({ invocationPolicyValid: false, modelInvocable: true, userInvocable: true }), "invalid invocation policy is not enabled");

// ── 技能列表检索：对齐专家插件的名称/简介包含匹配与分类收窄 ──
const normalizeSkillQuery = bundle.normalizeSkillQuery;
const matchSkillQuery = bundle.matchSkillQuery;
const filterSkills = bundle.filterSkills;
ok(typeof normalizeSkillQuery === "function", "factory exports normalizeSkillQuery");
ok(typeof matchSkillQuery === "function", "factory exports matchSkillQuery");
ok(typeof filterSkills === "function", "factory exports filterSkills");
eq(normalizeSkillQuery("  UI  "), "ui", "normalizeSkillQuery trims and lowercases");
eq(normalizeSkillQuery("   "), "", "normalizeSkillQuery treats whitespace-only as empty");
const sampleSkills = [
  { name: "travel-plan-viz", description: "把旅行行程做成网页", kind: "bundle", kindLabel: "目录插件", statusLabel: "已启用", rootKey: "dsh", rootLabel: "DSH skills" },
  { name: "photo-revival", description: "Turn photos into illustrations", kind: "single", kindLabel: "单文件", statusLabel: "已停用", rootKey: "agents", rootLabel: "Shared Agent skills" },
];
ok(matchSkillQuery(sampleSkills[0], ""), "empty query matches every skill");
ok(matchSkillQuery(sampleSkills[0], "  "), "whitespace-only query matches every skill");
ok(matchSkillQuery(sampleSkills[0], "行程"), "matchSkillQuery hits Chinese description");
ok(matchSkillQuery(sampleSkills[1], "Photo"), "matchSkillQuery is case-insensitive on name");
ok(matchSkillQuery(sampleSkills[0], "目录插件"), "matchSkillQuery hits localized kind label");
ok(matchSkillQuery(sampleSkills[1], "shared"), "matchSkillQuery hits root label");
ok(!matchSkillQuery(sampleSkills[0], "photo"), "unrelated query does not match");
eq(filterSkills(sampleSkills, { query: "   " }).length, 2, "blank query keeps the full list");
eq(filterSkills(sampleSkills, { query: "illustration" }).map(function (item) { return item.name; }).join(","), "photo-revival", "filterSkills matches English description");
eq(filterSkills(sampleSkills, { rootKey: "dsh" }).map(function (item) { return item.name; }).join(","), "travel-plan-viz", "filterSkills narrows by root category");
eq(filterSkills(sampleSkills, { rootKey: "dsh", query: "photo" }).length, 0, "category and query are combined");
eq(filterSkills(sampleSkills, { query: "SINGLE" }).map(function (item) { return item.name; }).join(","), "photo-revival", "filterSkills matches kind");

const parseApiResponse = bundle.parseApiResponse;
ok(typeof parseApiResponse === "function", "factory exports API response parsing for regression tests");
await parseApiResponse({ status: 502, json: function () { return Promise.reject(new SyntaxError("Unexpected token <")); } }).then(
  function () { ok(false, "non-JSON API response rejects"); },
  function (error) {
    eq(error.code, "error.proto.nonJson", "non-JSON API error carries a translatable code");
    eq(translateError(mockT, error), "Server returned a non-JSON response (HTTP 502)", "non-JSON API error uses the locale dictionary");
  }
);
const trapModalFocus = bundle.trapModalFocus;
ok(typeof trapModalFocus === "function", "factory exports modal focus trapping for regression tests");
let focused = "";
const firstButton = { focus: function () { focused = "first"; } };
const lastButton = { focus: function () { focused = "last"; } };
const fakeModal = { querySelectorAll: function () { return [firstButton, lastButton]; }, contains: function (node) { return node === firstButton || node === lastButton; } };
const previousDocument = globalThis.document;
globalThis.document = { activeElement: lastButton };
let focusPrevented = false;
trapModalFocus(fakeModal, { key: "Tab", shiftKey: false, preventDefault: function () { focusPrevented = true; } });
globalThis.document = previousDocument;
ok(focusPrevented && focused === "first", "modal focus trap wraps Tab from the last element");

function mockT(key, params) {
  const template = DICT.en[key] || key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

eq(
  translateError(mockT, { code: "error.skill.notFound", params: { name: "foo" }, error: "技能不存在: foo" }),
  "Skill not found: foo",
  "translateError translates a known error code with params"
);
eq(
  translateError(mockT, { code: "error.unknown", error: "原文错误" }),
  "原文错误",
  "translateError falls back to error text on an unknown code"
);
eq(
  translateError(mockT, { code: "error.root.readonly", params: { action: "toggle" }, error: "公共 Agent 技能目录不允许启用或停用" }),
  "The shared Agent skills directory does not allow enabling or disabling",
  "translateError maps the action param through the action.* dictionary"
);
eq(translateError(mockT, new Error("boom")), "boom", "translateError handles Error objects");
eq(translateError(mockT, "plain"), "plain", "translateError passes through plain strings");
eq(
  translateError(() => null, { code: "error.skill.notFound", params: {}, error: "原文" }),
  "原文",
  "translateError falls back when the host t returns null (not a string)"
);
eq(
  translateError(() => undefined, { code: "error.skill.notFound", params: {}, error: "原文" }),
  "原文",
  "translateError falls back when the host t returns undefined"
);
eq(
  translateError(mockT, { code: "error.proto.forbiddenHost", error: "forbidden host" }),
  "Forbidden request origin (invalid host)",
  "translateError maps illegal Host to forbiddenHost"
);
eq(
  translateError(mockT, { code: "error.import.rollbackFailed", params: { path: "C:\\bak", error: "EPERM" }, error: "覆盖导入回滚失败" }),
  "Overwrite import rollback failed; backups kept at: C:\\bak (EPERM)",
  "translateError translates rollback failure with params"
);
eq(
  translateError(mockT, { code: "warning.backupUncleaned", params: { path: "C:\\bak", error: "EPERM" }, error: "旧版本备份未清理" }),
  "Old version backup was not cleaned up: C:\\bak (EPERM)",
  "translateError translates backup cleanup warning"
);

// ── 注册契约断言：inject 声明 locale，settings.section 注册携带 locale 命名空间 ──
ok(Array.isArray(bundle.inject) && bundle.inject.includes("locale"), "bundle.inject declares the locale service");
ok(Array.isArray(bundle.inject) && bundle.inject.includes("slots"), "bundle.inject declares slots");

let registerOptions = null;
const fakeCtx = {
  effect(fn) { return fn(); },
  locale: {
    register() { return () => {}; },
    bind() { return () => "title"; },
  },
  slots: {
    inject(name, fn) { if (name === "settings.section") registerOptions = fn(); },
    register(opts) { return opts; },
  },
  workspaces: { pickDirectory() { return Promise.resolve(null); } },
};
bundle.apply(fakeCtx);
ok(registerOptions !== null && registerOptions.name === "settings.section", "apply registers the settings.section entry");
ok(registerOptions !== null && registerOptions.locale === "skills-manager", "settings.section registration declares the locale namespace");
ok(registerOptions !== null && typeof registerOptions.label === "function", "settings.section label is a thunk (re-read per locale revision)");
ok(registerOptions !== null && registerOptions.icon === "skill", "settings.section registers the skill nav icon");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

