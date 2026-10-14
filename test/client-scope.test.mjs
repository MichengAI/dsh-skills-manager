// 通过实际组件事件验证作用域与筛选，不依赖实现源码的字符串形状。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let definition, component, cursor = 0;
let state = [];
const outerState = [], effects = [];
let innerState = [], mountedKey, currentSession = "session-a";
const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((child) => child != null && typeof child !== "boolean") }),
  useState(initial) { const index = cursor++, store = state; if (!(index in store)) store[index] = initial; return [store[index], (next) => { store[index] = typeof next === "function" ? next(store[index]) : next; }]; },
  useRef(value) { const index = cursor++; return state[index] || (state[index] = { current: value }); },
  useEffect(effect) { const index = cursor++; if (!(index in state)) { state[index] = true; effects.push(effect); } },
  // 此测试不挂载 DOM；焦点恢复另由焦点单测与真实浏览器验证。
  useLayoutEffect() { cursor++; },
  forwardRef(render) { return render; },
  createContext() { return { Provider() {}, Consumer() {} }; },
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
  useContext() { return {}; },
  useId() { return "id"; },
  memo(component) { return component; },
  Fragment: Symbol.for("react.fragment"),
  version: "18.3.1",
  Children: { map(children, fn) { return [].concat(children ?? []).filter((child) => child != null).map(fn); }, forEach() {}, count: () => 0, toArray: (children) => [].concat(children ?? []), only: (child) => child },
  isValidElement: (value) => !!value && typeof value === "object",
  cloneElement: (element) => element,
  createRef: () => ({ current: null }),
  Component: class { constructor(props) { this.props = props; } },
  PureComponent: class { constructor(props) { this.props = props; } },
};
const skill = (name) => ({ name, description: "LONG_DESCRIPTION_" + name, enabled: true, loadable: true });
const data = {
  writeDestinations: [
    { key: "dsh", path: "C:/u/.dsh/skills", label: "DSH", available: true },
    { key: "agents", path: "C:/u/.agents/skills", label: "Shared", available: true },
  ],
  projects: [{ root: "/a", name: "A" }, { root: "/b", name: "B" }], trash: [],
  roots: [
    { key: "dsh", mutable: true, skills: [skill("global-one")] },
    { key: "copilot", exists: true, enabled: true, skills: [skill("global-two")] },
    { key: "a-dsh", scope: "project", kind: "project-dsh", projectRoot: "/a", localeKey: "projectDsh", mutable: true, skills: [] },
    { key: "a-copilot", scope: "project", kind: "project-copilot", projectRoot: "/a", localeKey: "copilot", exists: true, toggleable: true, skills: [skill("project-a")] },
    { key: "b-dsh", scope: "project", kind: "project-dsh", projectRoot: "/b", localeKey: "projectDsh", mutable: true, skills: [skill("project-b")] },
  ],
};
function sessionData(options) {
  const project = options?.headers?.["x-dsh-skills-session"] === "session-a" ? "/a" : options?.headers?.["x-dsh-skills-session"] === "session-b" ? "/b" : "";
  return { ...data, projects: data.projects.filter((p) => p.root === project), roots: data.roots.filter((root) => root.scope !== "project" || root.projectRoot === project) };
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_, options) => ({ ok: true, json: async () => ({ data: sessionData(options) }) });
try {
  new Function("window", await readFile(process.env.DSH_CLIENT_TEST_BUNDLE || new URL("../lib/client.js", import.meta.url), "utf8"))({ __ModuleLoader__: { load(value) { definition = value; } } });
  const client = definition.factory((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx: react.createElement, jsxs: react.createElement, Fragment: react.Fragment };
    if (id.startsWith("react-dom")) return { createPortal: (node) => node };
    throw new Error("unexpected require: " + id);
  });
  client.apply({ effect() {}, slots: { inject(name, fn) { fn(); }, register(options, fn) { component = fn; } } });
  const t = (key, params = {}) => (client.DICT.zh[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? "{" + name + "}"));
  let tree;
  let snapshotFor = (id) => ({ current: id });
  function render() {
    state = outerState; cursor = 0;
    const view = component({ t, useSessions: (selector) => selector(snapshotFor(currentSession)) });
    if (mountedKey !== view.props.key) { mountedKey = view.props.key; innerState = []; }
    state = innerState; cursor = 0; tree = view.type(view.props);
  }
  async function selectSession(id) {
    currentSession = id; render();
    assert.equal(nodes().some((node) => node.props.className === "dssm-source"), false, "切换会话立即隐藏旧项目，等待新状态");
    effects.splice(0).forEach((effect) => effect());
    await new Promise((resolve) => setImmediate(resolve)); render();
  }
  function linkedNodes(value, out = []) {
    if (value == null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return out;
    if (Array.isArray(value)) { value.forEach((item) => linkedNodes(item, out)); return out; }
    out.push(value);
    return out;
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    // 筛选业务测试只驱动受控值；官方菜单交互由专用测试与真实浏览器验证。
    if (typeof node.type === "function" && Array.isArray(node.props?.options) && node.props.label && node.props.onChange) return [{ type: "select-fixture", props: { "aria-label": node.props.label, options: node.props.options, onChange: (event) => node.props.onChange(event?.target ? event.target.value : event) }, children: [] }];
    if (node.type?.name === "SkillSwitch" || node.props?.closeLabel || (typeof node.type === "function" && node.props && "on" in node.props && typeof node.props.label === "string")) return nodes(node.type({ ...node.props, children: node.children }));
    // 目标选择器是普通函数组件：渲染出它的子树，才能断言其中的控件。
    if (typeof node.type === "function" && node.props && "userDestinations" in node.props) return nodes(node.type(node.props));
    const nested = linkedNodes(node.children);
    if (typeof node.type === "function") {
      linkedNodes(node.props?.header, nested);
      linkedNodes(node.props?.extra, nested);
      linkedNodes(node.props?.actions, nested);
      linkedNodes(node.props?.title, nested);
      linkedNodes(node.props?.description, nested);
      if (Array.isArray(node.props?.items)) node.props.items.forEach((item) => { linkedNodes(item?.label, nested); linkedNodes(item?.extra, nested); linkedNodes(item?.children, nested); });
    }
    return [node, ...nested.flatMap((child) => nodes(child))];
  }
  const find = (predicate) => nodes().find(predicate);
  const rows = () => nodes().filter((node) => node.props.className === "dssm-name").map((node) => node.children[0]);
  const change = (label, value) => { find((node) => node.props["aria-label"] === label).props.onChange({ target: { value } }); render(); };
  const tab = (name) => { const tabs = find((node) => node.props?.block === true && Array.isArray(node.props.options)); const option = tabs.props.options.find((item) => item.label === name || (Array.isArray(item.label) && item.label.includes(name))); tabs.props.onChange(option.value); render(); };
  render(); effects.splice(0).forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve)); render();
  const groups = () => nodes().filter((node) => node.props.className === "dssm-source" && Array.isArray(node.props.items));
  const expandAll = () => { groups().filter((node) => ![].concat(node.props.activeKey || []).includes(node.props.items[0].key)).forEach((node) => node.props.onChange([node.props.items[0].key])); render(); };
  assert.deepEqual(rows(), [], "来源默认折叠，不平铺所有技能");
  assert.equal(groups().length, 2, "全局按来源分组");
  assert.ok(nodes(groups()[0]).some((node) => node.children.includes("1 个技能")), "来源数量使用翻译文案");
  expandAll();
  assert.deepEqual(rows(), ["global-one", "global-two"]);
  const states = nodes().filter((node) => node.props.className === "dssm-row-state");
  assert.equal(states.length, 2, "每条技能都有独立状态操作组");
  assert.ok(nodes(states[0]).some((node) => String(node.props["aria-label"] || "").includes(t("skill.toggle"))), "开关和状态位于同一组");
  const skillActions = nodes().filter((node) => node.props.className === "dssm-skill-actions");
  assert.equal(skillActions.length, 2, "每条技能的操作在同一组");
  assert.ok(skillActions.every((node) => node.children.at(-1)?.props?.className === "dssm-row-state"), "技能开关在行的最右边");
  assert.equal(nodes().some((node) => node.props.className === "dssm-status dssm-enabled"), false, "启用状态由开关表示，不再重复文案");
  const more = find((node) => node.props["aria-label"] === t("btn.more"));
  assert.ok(more.props.options.some((option) => option.value === "detail"), "查看详情放进更多");
  assert.ok(more.props.options.some((option) => option.value === "trash" && option.danger), "删除技能放进更多");
  assert.equal(nodes().some((node) => node.props["aria-label"] === t("btn.detail") && node.props.icon), false, "技能行不再单独放详情图标");
  assert.equal(nodes().some((node) => node.props["aria-label"] === t("btn.trash") && node.props.icon), false, "技能行不再单独放删除图标");
  more.props.onChange({ target: { value: "trash" } }); render();
  assert.ok(find((node) => node.props.title === t("confirm.trash.title")), "回收菜单仍先打开确认弹窗");
  find((node) => node.children.includes(t("btn.cancel"))).props.onClick(); render();
  assert.ok(JSON.stringify(nodes()).includes("LONG_DESCRIPTION_global-one"), "展开来源后显示技能简介");
  groups()[0].props.onChange([]); render();
  assert.deepEqual(rows(), ["global-two"], "来源可独立折叠");
  change(t("search"), "two");
  assert.deepEqual(rows(), ["global-two"]);
  let toggleRequest;
  render();
  assert.equal(find((node) => node.props?.block === true).props.options.length, 4, "仓库、回收站与两个技能视图同级");
  data.trash.push(
    { id: "trash-a", name: "removed-a", deletedAt: "2026-09-12T00:00:00Z", root: { scope: "project", projectName: "A" } },
    { id: "trash-b", name: "removed-b", deletedAt: "2026-09-12T00:00:00Z", root: { scope: "user" } },
  );
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      toggleRequest = { url, body: JSON.parse(options.body) };
      data.trash = data.trash.filter((item) => item.id !== toggleRequest.body.id);
    }
    return { ok: true, json: async () => ({ data: sessionData(options) }) };
  };
  render(); tab("回收站");
  assert.deepEqual(rows(), ["removed-a", "removed-b"], "回收站直接展示全局和项目条目");
  assert.equal(find((node) => node.props["aria-label"] === t("search")), undefined, "回收站不显示技能筛选");
  assert.equal(find((node) => node.props.className === "dssm-summary"), undefined);
  assert.equal(find((node) => node.children.includes(t("btn.create"))), undefined);
  assert.equal(find((node) => node.props.role === "tabpanel").props["aria-labelledby"], "dssm-tab-trash");
  const trashTab = find((node) => node.props?.block === true).props.options.find((item) => item.value === "trash");
  assert.equal([].concat(trashTab.label).find((node) => node?.props?.className === "dssm-trash-count").children[0], 2);
  find((node) => node.props["aria-label"] === t("btn.restore")).props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(toggleRequest.url.endsWith("/trash-restore"));
  assert.deepEqual(toggleRequest.body, { id: "trash-a" });
  assert.deepEqual(rows(), ["removed-b"]);
  find((node) => node.props["aria-label"] === t("btn.delete.forever")).props.onClick(); render();
  assert.ok(find((node) => node.props.title === t("confirm.delete.title")), "永久删除仍需确认");
  find((node) => node.children.includes(t("btn.cancel"))).props.onClick(); render();
  assert.equal(find((node) => node.props.title === t("confirm.delete.title")), undefined, "取消后留在回收站 Tab");
  assert.deepEqual(rows(), ["removed-b"]);
  find((node) => node.props["aria-label"] === t("btn.delete.forever")).props.onClick(); render();
  nodes().filter((node) => node.children.includes(t("btn.delete.forever"))).at(-1).props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(toggleRequest.url.endsWith("/trash-delete"));
  assert.deepEqual(toggleRequest.body, { id: "trash-b" });
  assert.equal(find((node) => node.props.title === t("confirm.delete.title")), undefined);
  assert.ok(find((node) => node.props.className === "dssm-empty" && node.children.includes(t("trash.empty"))));
  assert.equal(find((node) => node.props.className === "dssm-trash-count"), undefined, "空回收站不显示数量徽标");
  tab("全局技能");
  assert.deepEqual(rows(), ["global-two"], "经过回收站仍保留全局筛选");
  const create = find((node) => node.props["aria-label"] === t("btn.create"));
  assert.equal(create.props.disabled, false, "全局页可创建技能");
  create.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(find((node) => node.props["aria-label"] === t("dest.scope")), "创建弹窗使用共用的范围选择器");
  assert.equal(find((node) => node.props["aria-label"] === t("dest.workspace")), undefined, "默认用户目录，不出现工作区下拉");
  const locationFixture = () => find((node) => node.props["aria-label"] === t("dest.location"));
  assert.deepEqual(locationFixture().props.options.map((o) => [o.value, o.disabled === true]), [["dsh", false], ["agents", false]], "创建开放 Shared Agent，位置是下拉");
  assert.ok(nodes().some((node) => node.type === "code" && node.children.includes("C:/u/.dsh/skills")), "路径只显示所选位置的后端校验路径");
  assert.equal(nodes().some((node) => node.type === "input" && node.props.type === "radio"), false, "不再使用单选框");
  for (const [key, value] of [["name", "new-global"], ["description", "description"], ["body", "body"]]) {
    find((node) => node.props.placeholder === t("create." + key + ".placeholder")).props.onChange({ target: { value } }); render();
  }
  nodes().filter((node) => node.children.includes(t("btn.create.now"))).at(-1).props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(toggleRequest.url.endsWith("/create"));
  assert.equal(toggleRequest.body.root, "dsh", "默认仍提交全局 DSH");
  assert.equal("workspace" in toggleRequest.body, false, "用户目录不带 workspace");
  create.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); render();
  locationFixture().props.onChange({ target: { value: "agents" } }); render();
  assert.ok(nodes().some((node) => node.type === "code" && node.children.includes("C:/u/.agents/skills")), "切到 Shared Agent 后路径跟着变");
  for (const [key, value] of [["name", "new-agents"], ["description", "description"], ["body", "body"]]) {
    find((node) => node.props.placeholder === t("create." + key + ".placeholder")).props.onChange({ target: { value } }); render();
  }
  nodes().filter((node) => node.children.includes(t("btn.create.now"))).at(-1).props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); render();
  assert.equal(toggleRequest.body.root, "agents", "选 Shared Agent 提交 root=agents");
  assert.equal("workspace" in toggleRequest.body, false);
  create.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); render();
  find((node) => node.props["aria-label"] === t("dest.scope")).props.onChange({ target: { value: "workspace" } }); render();
  assert.equal(nodes().filter((node) => node.children.includes(t("btn.create.now"))).at(-1).props.disabled, true, "这个夹具没有工作区列表，切到工作区后不能创建");
  await selectSession(undefined);
  assert.equal(find((node) => node.props.title === t("create.title")), undefined, "会话切换关闭旧创建表单");
  let resolveOld;
  globalThis.fetch = async (_, options) => {
    const snapshot = { data: sessionData(options) };
    if (options?.headers?.["x-dsh-skills-session"] === "session-a") await new Promise((resolve) => { resolveOld = resolve; });
    return { ok: true, json: async () => snapshot };
  };
  await selectSession("session-a");
  await selectSession("session-b");
  resolveOld(); await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(find((node) => node.props.className === "dssm-source"), "旧会话的慢响应不会让页面崩溃");
  console.log("全局页 Tab、筛选记忆、会话重挂载和创建目标交互回归通过");

  snapshotFor = (id) => id
    ? { ids: [id], byId: { [id]: { retainedBy: { mainView: 1 } } } }
    : { ids: [], byId: {} };
  outerState.length = 0;
  innerState = [];
  mountedKey = undefined;
  currentSession = "session-a";
  globalThis.fetch = async (_, options) => ({ ok: true, json: async () => ({ data: sessionData(options) }) });
  render(); effects.splice(0).forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve)); render();
  // 项目页不再依赖会话是否被主视图保留：全局页在 alpha.2 的会话形态下照常工作。
  assert.deepEqual(rows(), [], "alpha.2 会话形态下全局来源默认折叠");
  expandAll();
  assert.ok(rows().length > 0, "alpha.2 会话形态下全局技能照常展示");
  await selectSession("session-b");
  expandAll();
  assert.ok(rows().length > 0, "alpha.2 切换主视图会话后全局页仍可用");
  await selectSession(undefined);
  assert.ok(find((node) => node.props.className === "dssm-source"), "alpha.2 没有会话时全局页仍可用");
  console.log("alpha.2 retainedBy.mainView 会话形态通过");
} finally { globalThis.fetch = originalFetch; }
