import assert from "node:assert/strict";
import test from "node:test";

const { isOwnNavRow, applySettingsNavIcon, restoreSettingsNavIcon } = await import("../src/settings-nav-icon.ts");

function fakeButton(text, innerHTML = "<path d=\"gear\"/>") {
  const svg = {
    attrs: { viewBox: "0 0 16 16", fill: "currentColor" },
    innerHTML,
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
  };
  return {
    textContent: text,
    attrs: {},
    svg,
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    querySelector(selector) { return selector === "svg" ? svg : null; },
  };
}

test("别的对话框里同名 Skills 行不会被当成技能导航", () => {
  assert.equal(isOwnNavRow("Skills", "技能"), false, "中文标签时不能靠硬编码 Skills 命中");
  assert.equal(isOwnNavRow("技能", "Skills"), false, "英文标签时不能靠硬编码 技能 命中");
  assert.equal(isOwnNavRow("技能", "技能"), true);
  assert.equal(isOwnNavRow(" Skills ", "Skills"), true, "只按宿主当前标签精确匹配，允许首尾空白");

  const other = fakeButton("Skills", "<path d=\"other\"/>");
  assert.equal(applySettingsNavIcon(other, () => "技能"), false);
  assert.equal(other.svg.innerHTML, "<path d=\"other\"/>", "非本插件导航行的图标不能被替换");
});

test("卸载后还原宿主原来的齿轮图标", () => {
  const button = fakeButton("技能", "<path d=\"gear\"/>");
  assert.equal(applySettingsNavIcon(button, () => "技能"), true);
  assert.notEqual(button.svg.innerHTML, "<path d=\"gear\"/>");
  assert.equal(restoreSettingsNavIcon(button), true);
  assert.equal(button.svg.innerHTML, "<path d=\"gear\"/>");
  assert.equal(button.svg.getAttribute("viewBox"), "0 0 16 16");
  assert.equal(button.svg.getAttribute("fill"), "currentColor");
  assert.equal(button.getAttribute("data-dssm-nav-icon"), null);
});

test("插件卸载时的清理回调会还原齿轮", async () => {
  const button = fakeButton("技能", "<path d=\"gear\"/>");
  const previousDocument = globalThis.document;
  const previousObserver = globalThis.MutationObserver;
  globalThis.document = {
    body: {},
    querySelectorAll(selector) {
      if (selector === "[role=\"dialog\"] nav button") return [button];
      if (selector === "[data-dssm-nav-icon]") return button.getAttribute("data-dssm-nav-icon") != null ? [button] : [];
      return [];
    },
  };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  const { installSettingsNavIcon } = await import("../src/settings-nav-icon.ts");
  let cleanup = () => {};
  installSettingsNavIcon({ effect(run) { cleanup = run(); } }, () => "技能");
  assert.notEqual(button.svg.innerHTML, "<path d=\"gear\"/>");
  cleanup();
  assert.equal(button.svg.innerHTML, "<path d=\"gear\"/>");
  assert.equal(button.getAttribute("data-dssm-nav-icon"), null);
  globalThis.document = previousDocument;
  globalThis.MutationObserver = previousObserver;
});
