import assert from "node:assert/strict";
import test from "node:test";

const {
  NAV_ICON_CLASS,
  NAV_ICON_MARKER,
  NAV_ROW_SELECTOR,
  isOwnNavRow,
  applySettingsNavIcon,
  restoreSettingsNavIcon,
  installSettingsNavIcon,
} = await import("../src/settings-nav-icon.ts");

/** 最小 DOM 桩：覆盖导航图标补丁实际用到的 API */
class FakeElement {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.attrs = {};
    this.children = [];
    this.parent = null;
    this.id = "";
    this.className = "";
    this.textContent = "";
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  appendChild(child) {
    child.parent?.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    child.parent?.remove();
    child.parent = this;
    this.children.unshift(child);
    return child;
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  querySelector(selector) {
    const [match] = this.querySelectorAll(selector);
    return match ?? null;
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matches(child, selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

function matches(element, selector) {
  if (selector.startsWith(".")) {
    return element.className.split(/\s+/).includes(selector.slice(1));
  }
  if (selector.startsWith("[") && selector.endsWith("]")) {
    const name = selector.slice(1, -1);
    return element.getAttribute(name) != null;
  }
  return element.tagName === selector.toUpperCase();
}

function createDom() {
  const doc = {};
  doc.createElement = (tag) => new FakeElement(doc, tag);
  doc.documentElement = new FakeElement(doc, "html");
  doc.head = new FakeElement(doc, "head");
  doc.documentElement.appendChild(doc.head);
  doc.body = new FakeElement(doc, "body");
  doc.documentElement.appendChild(doc.body);

  const dialog = doc.createElement("div");
  dialog.setAttribute("role", "dialog");
  const nav = doc.createElement("nav");
  dialog.appendChild(nav);
  doc.body.appendChild(dialog);

  doc.getElementById = (id) => {
    const visit = (node) => {
      for (const child of node.children) {
        if (child.id === id) return child;
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(doc.documentElement);
  };
  doc.querySelectorAll = (selector) => {
    if (selector === NAV_ROW_SELECTOR) return nav.querySelectorAll("button");
    if (selector === `[${NAV_ICON_MARKER}]`) {
      return doc.documentElement.querySelectorAll(`[${NAV_ICON_MARKER}]`);
    }
    return [];
  };
  return { doc, nav };
}

function fakeButton(doc, text, innerHTML = "<path d=\"gear\"/>") {
  const button = doc.createElement("button");
  button.textContent = text;
  const svg = doc.createElement("svg");
  svg.innerHTML = innerHTML;
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "currentColor");
  button.appendChild(svg);
  const label = doc.createElement("span");
  label.textContent = text;
  button.appendChild(label);
  return { button, svg, label };
}

test("别的对话框里同名 Skills 行不会被当成技能导航", () => {
  assert.equal(isOwnNavRow("Skills", "技能"), false, "中文标签时不能靠硬编码 Skills 命中");
  assert.equal(isOwnNavRow("技能", "Skills"), false, "英文标签时不能靠硬编码 技能 命中");
  assert.equal(isOwnNavRow("技能", "技能"), true);
  assert.equal(isOwnNavRow(" Skills ", "Skills"), true, "只按宿主当前标签精确匹配，允许首尾空白");

  const { doc } = createDom();
  const { button, svg } = fakeButton(doc, "Skills", "<path d=\"other\"/>");
  assert.equal(applySettingsNavIcon(button, () => "技能"), false);
  assert.equal(svg.innerHTML, "<path d=\"other\"/>", "非本插件导航行的图标不能被替换");
  assert.equal(button.querySelector(`.${NAV_ICON_CLASS}`), null);
});

test("用独立 mask span 补图标，不改写宿主 svg (#49)", () => {
  const { doc } = createDom();
  const { button, svg, label } = fakeButton(doc, "技能");
  // 模拟皮肤已完成识别并打上自己的标记
  svg.setAttribute("data-orca-link-icon", "gear");

  assert.equal(applySettingsNavIcon(button, () => "技能"), true);
  assert.equal(svg.innerHTML, "<path d=\"gear\"/>", "宿主 svg 内容必须保持原样");
  assert.equal(svg.getAttribute("data-orca-link-icon"), "gear", "皮肤标记不能被清除");
  assert.equal(button.getAttribute(NAV_ICON_MARKER), "skills");

  const icon = button.querySelector(`.${NAV_ICON_CLASS}`);
  assert.ok(icon, "应插入独立的 mask 图标");
  assert.equal(icon.getAttribute("aria-hidden"), "true");
  assert.equal(button.children[0], icon, "图标应排在 svg 与标签之前");
  assert.equal(button.children.at(-1), label, "标签保持在末尾");

  assert.equal(applySettingsNavIcon(button, () => "技能"), false, "重复调用应保持幂等");
  assert.equal(button.querySelectorAll(`.${NAV_ICON_CLASS}`).length, 1);
});

test("宿主没有 svg 时不凭空插入图标", () => {
  const { doc } = createDom();
  const button = doc.createElement("button");
  button.textContent = "技能";
  assert.equal(applySettingsNavIcon(button, () => "技能"), false);
  assert.equal(button.querySelector(`.${NAV_ICON_CLASS}`), null);
});

test("卸载后只移除本插件图标，宿主齿轮保持不变", () => {
  const { doc } = createDom();
  const { button, svg } = fakeButton(doc, "技能");
  svg.setAttribute("data-orca-link-icon", "gear");
  applySettingsNavIcon(button, () => "技能");

  assert.equal(restoreSettingsNavIcon(button), true);
  assert.equal(button.querySelector(`.${NAV_ICON_CLASS}`), null);
  assert.equal(button.getAttribute(NAV_ICON_MARKER), null);
  assert.equal(svg.innerHTML, "<path d=\"gear\"/>");
  assert.equal(svg.getAttribute("data-orca-link-icon"), "gear");
});

test("插件卸载时的清理回调会移除图标并保留样式单例", async () => {
  const { doc, nav } = createDom();
  const { button, svg } = fakeButton(doc, "技能");
  nav.appendChild(button);

  const previousDocument = globalThis.document;
  const previousObserver = globalThis.MutationObserver;
  globalThis.document = doc;
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };

  let cleanup = () => {};
  installSettingsNavIcon({ effect(run) { cleanup = run(); } }, () => "技能");
  assert.ok(button.querySelector(`.${NAV_ICON_CLASS}`));
  assert.ok(doc.getElementById("dssm-settings-nav-icon-style"));

  // 再次安装不应重复注入样式
  installSettingsNavIcon({ effect(run) { run(); } }, () => "技能");
  assert.equal(doc.documentElement.querySelectorAll("style").length, 1);

  cleanup();
  assert.equal(button.querySelector(`.${NAV_ICON_CLASS}`), null);
  assert.equal(button.getAttribute(NAV_ICON_MARKER), null);
  assert.equal(svg.innerHTML, "<path d=\"gear\"/>");
  globalThis.document = previousDocument;
  globalThis.MutationObserver = previousObserver;
});
