import assert from "node:assert/strict";
import test from "node:test";

const {
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

  hasAttribute(name) {
    return Object.hasOwn(this.attrs, name);
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
    if (selector === ":scope > svg") {
      return this.children.filter((child) => child.tagName === "SVG");
    }
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
  assert.equal(button.hasAttribute(NAV_ICON_MARKER), false, "非本插件导航行不能被打上 marker");
});

test("对齐 dshmarket：使用纯属性标记与 ::before 伪元素渲染图标，不向 button 插入 DOM 节点", () => {
  const { doc } = createDom();
  const { button, svg, label } = fakeButton(doc, "技能");
  svg.setAttribute("data-orca-link-icon", "gear");

  assert.equal(applySettingsNavIcon(button, () => "技能"), true);
  assert.equal(svg.innerHTML, "<path d=\"gear\"/>", "宿主 svg 内容必须保持原样");
  assert.equal(button.getAttribute(NAV_ICON_MARKER), "");
  assert.equal(button.children.length, 2, "禁止插入额外的 span 节点");
  assert.equal(button.children[0], svg, "svg 保持首位");
  assert.equal(button.children[1], label, "标签保持末位");

  assert.equal(applySettingsNavIcon(button, () => "技能"), false, "重复调用应保持幂等");

  assert.equal(applySettingsNavIcon(button, () => "其他"), true, "切换非本插件入口时清除 marker");
  assert.equal(button.hasAttribute(NAV_ICON_MARKER), false);
  assert.equal(applySettingsNavIcon(button, () => "其他"), false);
});

test("当宿主已使用原生插槽容器渲染图标时，不打 marker 避免双图标", () => {
  const { doc } = createDom();
  const button = doc.createElement("button");
  button.textContent = "技能";
  const navSpan = doc.createElement("span");
  navSpan.className = "navIcon";
  navSpan.setAttribute("aria-hidden", "true");
  const svg = doc.createElement("svg");
  navSpan.appendChild(svg);
  button.appendChild(navSpan);
  const label = doc.createElement("span");
  label.textContent = "技能";
  button.appendChild(label);

  assert.equal(applySettingsNavIcon(button, () => "技能"), false, "不打 marker");
  assert.equal(button.getAttribute(NAV_ICON_MARKER), null);
});

test("老版本宿主图标包在普通 aria-hidden span 里时，仍正常打 marker 渲染图标", () => {
  const { doc } = createDom();
  const button = doc.createElement("button");
  button.textContent = "技能";
  const hostIconSpan = doc.createElement("span");
  hostIconSpan.className = "host-icon-wrapper";
  hostIconSpan.setAttribute("aria-hidden", "true");
  const svg = doc.createElement("svg");
  hostIconSpan.appendChild(svg);
  button.appendChild(hostIconSpan);
  const label = doc.createElement("span");
  label.textContent = "技能";
  button.appendChild(label);

  assert.equal(applySettingsNavIcon(button, () => "技能"), true, "老宿主应正常打 marker");
  assert.equal(button.getAttribute(NAV_ICON_MARKER), "");
});

test("卸载后移除 marker 属性，宿主齿轮与内容保持不变", () => {
  const { doc } = createDom();
  const { button, svg } = fakeButton(doc, "技能");
  svg.setAttribute("data-orca-link-icon", "gear");
  applySettingsNavIcon(button, () => "技能");

  assert.equal(restoreSettingsNavIcon(button), true);
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
  assert.equal(button.getAttribute(NAV_ICON_MARKER), "");
  assert.ok(doc.getElementById("dssm-settings-nav-icon-style"));

  // 再次安装不应重复注入样式
  installSettingsNavIcon({ effect(run) { run(); } }, () => "技能");
  assert.equal(doc.documentElement.querySelectorAll("style").length, 1);

  cleanup();
  assert.equal(button.getAttribute(NAV_ICON_MARKER), null);
  assert.equal(svg.innerHTML, "<path d=\"gear\"/>");
  globalThis.document = previousDocument;
  globalThis.MutationObserver = previousObserver;
});

/** 加载真实构建产物（bundle 的 require 桩只提供最小原语集合） */
async function loadClientBundle() {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  let definition;
  new Function("window", source)({ __ModuleLoader__: { load(value) { definition = value; } } });
  const react = await import("react");
  // primitives 用 Proxy 兜底：缺任一宿主原语都会让组件渲染直接抛错，与本次要验证的槽位行为无关
  const primitives = new Proxy({}, {
    get(_target, key) {
      if (key === "Input") return Object.assign(() => null, { TextArea: () => null });
      return () => null;
    },
  });
  const client = definition.factory((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx: react.createElement, jsxs: react.createElement, Fragment: react.Fragment };
    if (id.startsWith("react-dom")) return {};
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
    throw new Error("unexpected require: " + id);
  });
  return { client, react };
}

/** 老宿主：声明了 settings.section 但完全没有 settings.section.icon 这个子槽位 */
function createLegacyCtx(registered) {
  return {
    locale: {
      register: () => () => {},
      bind: () => (k) => k,
      getLocale: () => ({ active: "zh", revision: 1, locales: [] }),
    },
    effect: (fn) => fn(),
    slots: {
      inject(name, fn) {
        // 老宿主有 settings.section 与 plugins.bundle.config，但完全不声明 settings.section.icon
        if (name === "settings.section" || name === "plugins.bundle.config") return fn();
      },
      register(options, component) {
        if (options.name === "settings.section.icon") {
          throw new Error('slot "settings.section.icon" is not declared (a parent entry\'s children table must declare it)');
        }
        registered.set(options.name, { options, component });
        return () => registered.delete(options.name);
      },
    },
  };
}

test("老宿主未声明 settings.section.icon 时，设置分区仍成功注册且不崩溃", async () => {
  const { client } = await loadClientBundle();
  const registered = new Map();
  client.apply(createLegacyCtx(registered));
  assert.ok(registered.has("settings.section"), "老宿主未声明 settings.section.icon 时，settings.section 必须注册成功");
});

test("老宿主切换入口位置后设置分区不丢失（回归：图标槽位注册抛错曾连带吞掉正文注册）", async () => {
  const { client } = await loadClientBundle();
  const registered = new Map();
  const warnings = [];
  const previousWarn = console.warn;
  const previousFetch = globalThis.fetch;
  console.warn = (...args) => { warnings.push(args.map((item) => String(item)).join(" ")); };
  // 控制器保存入口位置会 POST /sidebar-entry，这里让保存成功，避免走回滚分支
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: { location: "sidebar" } }),
  });
  try {
    client.apply(createLegacyCtx(registered));
    const card = registered.get("plugins.bundle.config");
    assert.ok(card, "插件管理页配置卡必须注册成功");
    // 配置卡的 occupant 返回元素而不执行 hooks，可直接取到生产控制器的 setLocation
    const setLocation = card.component({ view: "page" }).props.setLocation;
    assert.equal(typeof setLocation, "function", "配置卡必须暴露入口位置切换入口");

    await setLocation("sidebar");
    assert.equal(registered.has("settings.section"), false, "切到「仅侧边栏」后设置分区应注销");

    await setLocation("settings");
    assert.ok(registered.has("settings.section"), "切回「仅设置」后设置分区必须重新注册");
    assert.deepEqual(warnings, [], "老宿主不应在执行路径上产生注册失败日志");
  } finally {
    console.warn = previousWarn;
    globalThis.fetch = previousFetch;
  }
});

// 粗粒度哨兵：只证明构建产物里存在声明式门控写法，改写成别名或动态取值可绕过，
// 真正的行为约束由上面「老宿主切换入口位置后设置分区不丢失」用例守住。
test("源码契约：必须通过 slots.inject 声明式门控注册 settings.section.icon", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(source, /slots\.inject\(["']settings\.section\.icon["']/, "必须包含 settings.section.icon 的 inject 门控");
});
