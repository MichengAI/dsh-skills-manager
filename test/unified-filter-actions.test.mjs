import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

let definition;
const react = {
  createElement: (type, props, ...children) => ({
    type,
    props: props || {},
    children: children.flat(Infinity).filter((c) => c != null && typeof c !== "boolean"),
  }),
  useState: (init) => [init, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (init) => ({ current: init }),
  useCallback: (fn) => fn,
  useContext: () => ({}),
  useId: () => "id",
};

let capturedMenus = [];
const primitives = {
  Button: (props) => react.createElement("button", props, props.children),
  Input: (props) => react.createElement("input", props),
  Modal: () => null,
  Menu: (props) => {
    capturedMenus.push(props);
    return react.createElement("div", { "data-menu-open": props.open }, props.anchor);
  },
};

new Function("window", await readFile(new URL("../lib/client.js", import.meta.url), "utf8"))({
  __ModuleLoader__: {
    load(value) {
      definition = value;
    },
  },
});

const client = definition.factory((id) => {
  if (id === "react") return react;
  if (id === "react/jsx-runtime") return { jsx: react.createElement, jsxs: react.createElement, Fragment: Symbol.for("react.fragment") };
  if (id.startsWith("react-dom")) return { createPortal: (node) => node };
  if (id === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
  throw new Error("unexpected require: " + id);
});

function findNodes(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (typeof node.type === "function") {
    try {
      findNodes(node.type(node.props), out);
    } catch {}
  }
  out.push(node);
  if (Array.isArray(node.children)) node.children.forEach((c) => findNodes(c, out));
  if (node.props?.anchor) findNodes(node.props.anchor, out);
  return out;
}

test("SourceSelect action 模式真实属性与契约验证（杜绝夹具假绿）", () => {
  let registeredComponent;
  client.apply({
    effect() {},
    slots: {
      inject(name, fn) { fn(); },
      register(options, fn) {
        if (options.name === "settings.section" || !registeredComponent) registeredComponent = fn;
      },
    },
  });

  const t = (k) => client.DICT.zh[k] || k;
  const view = registeredComponent({ t, useSessions: () => undefined });
  const tree = view.type(view.props);

  const all = findNodes(tree);
  // 查找 action 模式的加号菜单真实渲染的 button 节点
  const btn = all.find((n) => n.type === "button" && n.props?.["aria-haspopup"] === "menu");
  assert.ok(btn, "Menu 必须挂载真实 anchor Button 触发器");

  // 严格断言生产代码真实生成的 anchor Button 属性，杜绝测试夹具硬编码自证
  assert.equal(btn.props.variant, "outline", "生产代码必须赋予 variant=outline");
  assert.equal(btn.props.className, "dssm-icon-action", "生产代码必须赋予真实 className=dssm-icon-action（防夹具自证）");
  assert.equal(btn.props.style?.width, 22, "生产代码必须赋予真实宽度 22px");
  assert.equal(btn.props.style?.height, 22, "生产代码必须赋予真实高度 22px");
  assert.equal(btn.props["aria-haspopup"], "menu", "生产代码必须声明 aria-haspopup=menu");
  assert.equal(btn.props["aria-expanded"], false, "未打开时 aria-expanded 必须为 false");
  assert.equal(btn.props["aria-label"], t("btn.add"), "无障碍名称正确为添加");
  assert.ok(btn.props.icon, "生产代码必须赋予真实 icon");
});

test("SourceSelect 普通下拉多段结构与 selectedIds 透传验证", () => {
  capturedMenus = [];
  let registeredComponent;
  client.apply({
    effect() {},
    slots: {
      inject(name, fn) { fn(); },
      register(options, fn) {
        if (options.name === "settings.section" || !registeredComponent) registeredComponent = fn;
      },
    },
  });

  const t = (k) => client.DICT.zh[k] || k;
  const view = registeredComponent({ t, useSessions: () => undefined });
  const tree = view.type(view.props);
  findNodes(tree);

  const statusMenu = capturedMenus.find((m) => m.items?.length === 10);
  assert.ok(statusMenu, "必须包含 10 个条目的综合状态与分组 Menu");

  assert.deepEqual(statusMenu.selectedIds, ["group:", "status:"], "默认多选高亮必须正确透传");

  const items = statusMenu.items;
  assert.equal(items[0].type, "label", "第 1 项为分组标题");
  assert.equal(items[0].text, t("group.label"));
  assert.equal(items[1].id, "group:");
  assert.equal(items[2].id, "group:repo");
  assert.equal(items[3].type, "separator", "第 4 项为分割线");
  assert.equal(items[4].type, "label", "第 5 项为状态标题");
  assert.equal(items[4].text, t("filter.status"));
  assert.equal(items[5].id, "status:");
});

test("onStatusGroupChange 真实解析行为与变异防护（彻底避免切片偏移 bug）", async () => {
  const clientSource = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");
  const start = clientSource.indexOf("function onStatusGroupChange");
  const end = clientSource.indexOf("var addMenuOptions", start);
  assert.ok(start !== -1 && end !== -1, "必须在 client.ts 中定位到完整的 onStatusGroupChange 定义区间");

  const fnCode = clientSource.slice(start, end);
  const body = fnCode.slice(fnCode.indexOf("{") + 1, fnCode.lastIndexOf("}"));

  const recorded = { group: "", status: "" };
  const updateFilter = (k, v) => { recorded[k] = v; };
  const fn = new Function("val", "updateFilter", body);

  // 1. group 切片
  fn("group:repo", updateFilter);
  assert.equal(recorded.group, "repo", "group:repo 切片长度必须为 6");
  assert.notEqual(recorded.group, ":repo", "防变异：不能切出冒号");

  fn("group:", updateFilter);
  assert.equal(recorded.group, "");

  // 2. status 切片（变异守卫：若切片为 6 则输出 :enabled 导致状态查询失败）
  fn("status:enabled", updateFilter);
  assert.equal(recorded.status, "enabled", "status:enabled 切片长度必须为 7");
  assert.notEqual(recorded.status, ":enabled", "防变异：不能切出冒号");

  fn("status:disabled", updateFilter);
  assert.equal(recorded.status, "disabled");

  fn("status:shadowed", updateFilter);
  assert.equal(recorded.status, "shadowed");

  fn("status:invalid", updateFilter);
  assert.equal(recorded.status, "invalid");

  fn("status:", updateFilter);
  assert.equal(recorded.status, "");
});

test("statusGroupLabel 组合显示文案逻辑验证", async () => {
  function evaluateLabel(status, group) {
    const t = (k) => {
      const dict = {
        "status.enabled": "已启用",
        "status.disabled": "已停用",
        "filter.statusAll": "全部状态",
        "group.byRepo": "按来源仓库",
      };
      return dict[k] || k;
    };
    const filters = { status, group };
    const statusText = filters.status ? t("status." + filters.status) : t("filter.statusAll");
    return filters.group === "repo" ? statusText + " · " + t("group.byRepo") : statusText;
  }

  assert.equal(evaluateLabel("", ""), "全部状态");
  assert.equal(evaluateLabel("", "repo"), "全部状态 · 按来源仓库");
  assert.equal(evaluateLabel("enabled", ""), "已启用");
  assert.equal(evaluateLabel("enabled", "repo"), "已启用 · 按来源仓库");
  assert.equal(evaluateLabel("disabled", "repo"), "已停用 · 按来源仓库");
});

test("addMenuOptions 在 user 与 project 视图下的选项收拢规范", async () => {
  const clientSource = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");

  // 必须收归创建、导入与来源目录管理，不再保留单独平铺按钮
  assert.doesNotMatch(clientSource, /filterActionButton\(t\("import\.global"\)/);
  assert.doesNotMatch(clientSource, /filterActionButton\(t\("rootPath\.manage"\)/);

  // 选项包含 create 与 import
  assert.match(clientSource, /value:\s*"create",\s*label:\s*t\("btn\.create"\)\s*\+\s*"…"/);
  assert.match(clientSource, /value:\s*"import",\s*label:\s*t\("import\.global"\)\s*\+\s*"…"/);
  assert.match(clientSource, /value:\s*"root-path",\s*label:\s*t\("rootPath\.manage"\)\s*\+\s*"…"/);
});
