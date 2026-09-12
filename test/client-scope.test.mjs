// 通过实际组件事件验证作用域与筛选，不依赖实现源码的字符串形状。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let definition, component, cursor = 0;
const state = [], effects = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(Boolean) }),
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
  const create = find((node) => node.type === "button" && node.children.includes(t("btn.create")));
  assert.equal(create.props.disabled, false, "空项目 DSH 仍支持创建");
  create.props.onClick(); render();
  const target = find((node) => node.props["aria-label"] === t("create.target"));
  assert.equal(target.props.value, "a-dsh", "创建默认落到所选项目 DSH");
  assert.deepEqual(target.children.map((option) => option.props.value), ["a-dsh"]);
  console.log("Tab、项目隔离、筛选记忆和创建目标交互回归通过");
} finally { globalThis.fetch = originalFetch; }
