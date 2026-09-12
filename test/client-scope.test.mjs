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
};
const skill = (name) => ({ name, description: "LONG_DESCRIPTION_" + name, enabled: true, loadable: true });
const data = {
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
  new Function("window", await readFile(new URL("../lib/client.js", import.meta.url), "utf8"))({ __ModuleLoader__: { load(value) { definition = value; } } });
  const client = definition.factory((id) => id === "react" ? react : {});
  client.apply({ effect() {}, slots: { inject(name, fn) { fn(); }, register(options, fn) { component = fn; } } });
  const t = (key, params = {}) => (client.DICT.zh[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? "{" + name + "}"));
  let tree;
  function render() {
    state = outerState; cursor = 0;
    const view = component({ t, useSessions: (selector) => selector({ current: currentSession }) });
    if (mountedKey !== view.props.key) { mountedKey = view.props.key; innerState = []; }
    state = innerState; cursor = 0; tree = view.type(view.props);
  }
  async function selectSession(id) {
    currentSession = id; render();
    assert.equal(nodes().some((node) => node.props.className === "dssm-source"), false, "切换会话立即隐藏旧项目，等待新状态");
    effects.splice(0).forEach((effect) => effect());
    await new Promise((resolve) => setImmediate(resolve)); render();
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (typeof node.type === "function") return nodes(node.type({ ...node.props, children: node.children }));
    return [node, ...node.children.flatMap((child) => nodes(child))];
  }
  const find = (predicate) => nodes().find(predicate);
  const rows = () => nodes().filter((node) => node.props.className === "dssm-name").map((node) => node.children[0]);
  const change = (label, value) => { find((node) => node.props["aria-label"] === label).props.onChange({ target: { value } }); render(); };
  const tab = (name) => { find((node) => node.props.role === "tab" && node.children.includes(name)).props.onClick(); render(); };
  render(); effects.splice(0).forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve)); render();
  const groups = () => nodes().filter((node) => node.props.className === "dssm-source-head-main");
  const expandAll = () => { groups().filter((node) => !node.props["aria-expanded"]).forEach((node) => node.props.onClick()); render(); };
  assert.deepEqual(rows(), [], "来源默认折叠，不平铺所有技能");
  assert.equal(groups().length, 2, "全局按来源分组");
  assert.ok(nodes(groups()[0]).some((node) => node.children.includes("1 个技能")), "来源数量使用翻译文案");
  expandAll();
  assert.deepEqual(rows(), ["global-one", "global-two"]);
  assert.ok(!JSON.stringify(nodes()).includes("LONG_DESCRIPTION_global-one"), "展开来源后仍不显示长描述");
  groups()[0].props.onClick(); render();
  assert.deepEqual(rows(), ["global-two"], "来源可独立折叠");
  change(t("search"), "two");
  assert.deepEqual(rows(), ["global-two"]);
  tab("项目技能");
  assert.equal(find((node) => node.props["aria-label"] === "选择项目"), undefined, "没有项目选择框");
  assert.deepEqual(rows(), [], "项目来源默认折叠");
  assert.equal(groups().length, 2, "空的可写项目来源保留分组入口");
  expandAll();
  assert.deepEqual(rows(), ["project-a"]);
  change(t("filter.source"), "a-copilot");
  assert.ok(
    find((node) => node.props.role === "switch" && String(node.props["aria-label"] || "").includes(t("source.toggle"))),
    "项目 Tab 选中只读来源时显示来源开关",
  );
  change(t("filter.source"), "a-dsh");
  assert.equal(
    find((node) => node.props.role === "switch" && String(node.props["aria-label"] || "").includes(t("source.toggle"))),
    undefined,
    "项目 DSH 不显示来源总开关",
  );
  change(t("filter.source"), "");
  change(t("search"), "not-found");
  assert.deepEqual(rows(), []);
  await selectSession("session-b");
  assert.deepEqual(rows(), [], "项目展开状态独立");
  expandAll();
  assert.deepEqual(rows(), ["project-b"], "不同项目保存独立筛选");
  tab("全局技能");
  assert.deepEqual(rows(), ["global-two"], "返回全局保留搜索");
  tab("项目技能");
  await selectSession("session-a");
  assert.deepEqual(rows(), [], "返回原项目保留搜索");
  change(t("search"), "");
  const projectCopy = data.roots.find((r) => r.key === "a-copilot").skills[0];
  projectCopy.shadowedBy = { root: "a-dsh", name: "project-a" };
  render();
  const shadowedSwitch = find((node) => node.props.role === "switch" && node.props["aria-label"] === t("skill.toggle") + " project-a");
  assert.equal(shadowedSwitch.props.disabled, false, "被覆盖副本仍允许独立设置启停");
  let toggleRequest;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") toggleRequest = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ data: sessionData(options) }) };
  };
  shadowedSwitch.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(toggleRequest.url.endsWith("/disable"));
  assert.deepEqual(toggleRequest.body, { root: "a-copilot", name: "project-a" }, "只停用对应来源，不修改赢家策略");
  delete projectCopy.shadowedBy;
  projectCopy.enabled = false;
  projectCopy.fallbackTo = { root: "copilot", name: "project-a", scope: "user" };
  render();
  assert.ok(find((node) => node.props.className === "dssm-note dssm-fallback" && node.children.includes("当前使用全局 Copilot 副本。")), "项目停用行显示全局接管来源");
  assert.ok(find((node) => node.props.className === "dssm-status dssm-disabled" && node.children.includes("已停用")), "提示不改变副本的停用状态");
  projectCopy.fallbackTo = { root: "a-dsh", name: "project-a", scope: "project" };
  render();
  assert.ok(find((node) => node.props.className === "dssm-note dssm-fallback" && String(node.children[0]).includes("当前使用项目")));
  delete projectCopy.fallbackTo;
  render();
  assert.equal(find((node) => node.props.className === "dssm-note dssm-fallback"), undefined, "无接管来源时不显示提示");
  projectCopy.enabled = true;
  render();
  assert.equal(nodes().filter((node) => node.props.role === "tab").length, 3, "回收站与两个技能视图同级");
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
  assert.equal(find((node) => node.type === "button" && node.children.includes(t("btn.create"))), undefined);
  assert.equal(find((node) => node.props.role === "tabpanel").props["aria-labelledby"], "dssm-tab-trash");
  assert.equal(find((node) => node.props.className === "dssm-trash-count").children[0], 2);
  find((node) => node.type === "button" && node.children.includes(t("btn.restore"))).props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(toggleRequest.url.endsWith("/trash-restore"));
  assert.deepEqual(toggleRequest.body, { id: "trash-a" });
  assert.deepEqual(rows(), ["removed-b"]);
  find((node) => node.type === "button" && node.children.includes(t("btn.delete.forever"))).props.onClick(); render();
  assert.ok(find((node) => node.props.role === "dialog"), "永久删除仍需确认");
  find((node) => node.type === "button" && node.children.includes(t("btn.cancel"))).props.onClick(); render();
  assert.equal(find((node) => node.props.role === "dialog"), undefined, "取消后留在回收站 Tab");
  assert.deepEqual(rows(), ["removed-b"]);
  find((node) => node.type === "button" && node.children.includes(t("btn.delete.forever"))).props.onClick(); render();
  nodes().filter((node) => node.type === "button" && node.children.includes(t("btn.delete.forever"))).at(-1).props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(toggleRequest.url.endsWith("/trash-delete"));
  assert.deepEqual(toggleRequest.body, { id: "trash-b" });
  assert.equal(find((node) => node.props.role === "dialog"), undefined);
  assert.ok(find((node) => node.props.className === "dssm-empty" && node.children.includes(t("trash.empty"))));
  assert.equal(find((node) => node.props.className === "dssm-trash-count"), undefined, "空回收站不显示数量徽标");
  tab("全局技能");
  assert.deepEqual(rows(), ["global-two"], "经过回收站仍保留全局筛选");
  tab("项目技能");
  assert.deepEqual(rows(), ["project-a"], "经过回收站仍保留所选项目与筛选");
  const create = find((node) => node.type === "button" && node.children.includes(t("btn.create")));
  assert.equal(create.props.disabled, false, "项目页仍可创建全局技能");
  create.props.onClick(); render();
  assert.equal(find((node) => node.props["aria-label"] === t("create.target")), undefined, "创建位置没有下拉框");
  assert.ok(find((node) => node.props.className === "dssm-detail-path" && node.children.includes(t("create.globalTarget"))), "创建位置固定展示全局 DSH");
  for (const [key, value] of [["name", "new-global"], ["description", "description"], ["body", "body"]]) {
    find((node) => node.props.placeholder === t("create." + key + ".placeholder")).props.onChange({ target: { value } }); render();
  }
  nodes().filter((node) => node.type === "button" && node.children.includes(t("btn.create.now"))).at(-1).props.onClick();
  await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(toggleRequest.url.endsWith("/create"));
  assert.equal(toggleRequest.body.root, "dsh", "项目页创建也只提交全局 DSH 目标");
  create.props.onClick(); render();
  await selectSession(undefined);
  assert.equal(find((node) => node.props.role === "dialog"), undefined, "会话切换关闭旧项目创建表单");
  assert.equal(groups().length, 0, "无当前会话不回退其他项目");
  assert.ok(find((node) => node.children.includes(t("project.empty"))), "无当前项目显示空状态");
  assert.equal(find((node) => node.type === "button" && node.children.includes(t("btn.create"))).props.disabled, false, "无当前项目仍可创建全局技能");
  let resolveOld;
  globalThis.fetch = async (_, options) => {
    const snapshot = { data: sessionData(options) };
    if (options?.headers?.["x-dsh-skills-session"] === "session-a") await new Promise((resolve) => { resolveOld = resolve; });
    return { ok: true, json: async () => snapshot };
  };
  await selectSession("session-a");
  await selectSession("session-b");
  assert.ok(rows().includes("project-b"));
  resolveOld(); await new Promise((resolve) => setImmediate(resolve)); render();
  assert.ok(rows().includes("project-b") && !rows().includes("project-a"), "旧会话的慢响应不会覆盖当前会话");
  console.log("当前会话绑定、Tab、项目隔离、筛选记忆和创建目标交互回归通过");
} finally { globalThis.fetch = originalFetch; }
