// 通过实际组件事件验证作用域与筛选，不依赖实现源码的字符串形状。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let definition, component, cursor = 0;
const state = [], effects = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((child) => child != null && typeof child !== "boolean") }),
  useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; },
  useRef(value) { const index = cursor++; return state[index] || (state[index] = { current: value }); },
  useEffect(effect) { const index = cursor++; if (!(index in state)) { state[index] = true; effects.push(effect); } },
};
const skill = (name) => ({ name, description: name, enabled: true, loadable: true });
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
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ data }) });
try {
  new Function("window", await readFile(new URL("../lib/client.js", import.meta.url), "utf8"))({ __ModuleLoader__: { load(value) { definition = value; } } });
  const client = definition.factory((id) => id === "react" ? react : {});
  client.apply({ effect() {}, slots: { inject(name, fn) { fn(); }, register(options, fn) { component = fn; } } });
  const t = (key) => client.DICT.zh[key] || key;
  let tree;
  function render() { cursor = 0; tree = component({ t }); }
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
  assert.deepEqual(rows(), ["global-one", "global-two"]);
  change(t("search"), "two");
  assert.deepEqual(rows(), ["global-two"]);
  tab("项目技能");
  assert.deepEqual(rows(), [], "多个项目未选择时不猜测当前项目");
  change("选择项目", "/a");
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
  change("选择项目", "/b");
  assert.deepEqual(rows(), ["project-b"], "不同项目保存独立筛选");
  tab("全局技能");
  assert.deepEqual(rows(), ["global-two"], "返回全局保留搜索");
  tab("项目技能");
  change("选择项目", "/a");
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
    return { ok: true, json: async () => ({ data }) };
  };
  shadowedSwitch.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(toggleRequest.url.endsWith("/disable"));
  assert.deepEqual(toggleRequest.body, { root: "a-copilot", name: "project-a" }, "只停用对应来源，不修改赢家策略");
  delete projectCopy.shadowedBy;
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
    return { ok: true, json: async () => ({ data }) };
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
  assert.equal(find((node) => node.props.className === "dssm-trash-count").children[0], 0);
  tab("全局技能");
  assert.deepEqual(rows(), ["global-two"], "经过回收站仍保留全局筛选");
  tab("项目技能");
  assert.deepEqual(rows(), ["project-a"], "经过回收站仍保留所选项目与筛选");
  const create = find((node) => node.type === "button" && node.children.includes(t("btn.create")));
  assert.equal(create.props.disabled, false, "空项目 DSH 仍支持创建");
  create.props.onClick(); render();
  const target = find((node) => node.props["aria-label"] === t("create.target"));
  assert.equal(target.props.value, "a-dsh", "创建默认落到所选项目 DSH");
  assert.deepEqual(target.children.map((option) => option.props.value), ["a-dsh"]);
  console.log("Tab、项目隔离、筛选记忆和创建目标交互回归通过");
} finally { globalThis.fetch = originalFetch; }
