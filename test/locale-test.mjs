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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
