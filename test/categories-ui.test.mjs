// 分类嵌在每个来源里；浏览下拉包含空工作区，写入目标仍需单独点选。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let definition, component, cursor = 0, state = [];
const effects = [], outerState = [];
let innerState = [], mountedKey;
const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((child) => child != null && typeof child !== "boolean") }),
  useState(initial) { const index = cursor++, store = state; if (!(index in store)) store[index] = initial; return [store[index], (next) => { store[index] = typeof next === "function" ? next(store[index]) : next; }]; },
  useRef(value) { const index = cursor++; return state[index] || (state[index] = { current: value }); },
  useEffect(effect) { const index = cursor++; if (!(index in state)) { state[index] = true; effects.push(effect); } },
  useLayoutEffect() { cursor++; },
  forwardRef(render) { return render; },
  createContext() { return { Provider() {}, Consumer() {} }; },
  useMemo(fn) { return fn(); }, useCallback(fn) { return fn; }, useContext() { return {}; }, useId() { return "id"; }, memo(c) { return c; },
  Fragment: Symbol.for("react.fragment"), version: "18.3.1",
  Children: { map(children, fn) { return [].concat(children ?? []).filter((c) => c != null).map(fn); }, forEach() {}, count: () => 0, toArray: (c) => [].concat(c ?? []), only: (c) => c },
  isValidElement: (v) => !!v && typeof v === "object", cloneElement: (e) => e, createRef: () => ({ current: null }),
  Component: class { constructor(props) { this.props = props; } }, PureComponent: class { constructor(props) { this.props = props; } },
};

const skill = (name, extra = {}) => ({ name, description: "DESC_" + name, enabled: true, loadable: true, ...extra });
const globalData = {
  writeDestinations: [{ key: "dsh", path: "C:/u/.dsh/skills", label: "DSH", available: true }],
  projects: [], trash: [], warnings: [],
  roots: [
    { key: "dsh", mutable: true, path: "C:/u/.dsh/skills", categories: [{ id: "work", name: "工作" }], categoryOrder: { work: ["kept", "other"], "": ["loose"] }, skills: [skill("kept", { categoryId: "work" }), skill("other", { categoryId: "work", enabled: false }), skill("loose")] },
    { key: "codex", exists: true, mutable: true, toggleable: true, enabled: true, path: "C:/u/.codex/skills", categories: [], categoryOrder: { "": ["codex-two", "codex-one"] }, skills: [skill("codex-one"), skill("codex-two"), skill("ordinary"), skill("constructor")] },
  ],
};
const workspaces = [
  { name: "alpha", path: "D:/work/alpha", projectRoot: "D:/work/alpha", registeredPaths: ["D:/work/alpha"], available: true, skillCount: 2 },
  { name: "empty-notes", path: "D:/work/empty", projectRoot: "D:/work/empty", registeredPaths: ["D:/work/empty"], available: true, skillCount: 0 },
];
const details = {
  "D:/work/empty": { warnings: [], roots: [] },
  "D:/work/alpha": { warnings: [], roots: [
    { key: "project-dsh:a", scope: "project", kind: "project-dsh", localeKey: "projectDsh", mutable: true, path: "D:/work/alpha/.dsh/skills", projectRoot: "D:/work/alpha", categories: [{ id: "pwork", name: "项目工作" }], skills: [skill("alpha-one", { categoryId: "pwork" }), skill("alpha-two", { enabled: false })] },
  ] },
};
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const body = options.body ? JSON.parse(options.body) : undefined;
  calls.push({ url: String(url), method: options.method || "GET", body });
  const path = String(url).replace("/api/michengai/dsh-skills-manager", "");
  const data = path === "/state" ? globalData : path === "/workspaces" ? { items: workspaces } : path === "/workspace-skills" ? details[body.workspace] : { name: body?.name || "ok" };
  return { ok: true, json: async () => ({ ok: true, data }) };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

try {
  new Function("window", await readFile(process.env.DSH_CLIENT_TEST_BUNDLE || new URL("../lib/client.js", import.meta.url), "utf8"))({ __ModuleLoader__: { load(value) { definition = value; } } });
  const client = definition.factory((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx: react.createElement, jsxs: react.createElement, Fragment: react.Fragment };
    if (id.startsWith("react-dom")) return { createPortal: (node) => node };
    if (id === "@deepseek-ai/dsh-client-ui-primitives") {
      return {
        Button: (props) => react.createElement("button", props, props.children),
        Checkbox: (props) => react.createElement("label", { className: props.className }, react.createElement("input", { type: "checkbox", checked: props.checked }), react.createElement("span", null, props.label)),
        Input: (props) => react.createElement("span", { className: props.className }, react.createElement("input", props)),
        Modal: (props) => props.open ? react.createElement("div", { role: "dialog", title: props.title }, props.children, props.footer) : null,
        Menu: (props) => react.createElement("div", { "data-menu-open": props.open }, props.anchor, props.open ? props.items?.map(it => react.createElement("button", { key: it.id, onClick: () => props.onSelect(it.id) }, it.label)) : null),
        Switch: function Switch(props) {
          return react.createElement("button", {
            type: "button",
            role: "switch",
            "aria-checked": props.checked,
            "aria-label": props.label,
            disabled: props.disabled,
            onClick: () => props.onChange?.(!props.checked),
          });
        },
      };
    }
    throw new Error("unexpected require: " + id);
  });
  client.apply({ effect() {}, slots: { inject(name, fn) { fn(); }, register(options, fn) { component = fn; } } });
  const t = (key, params = {}) => (client.DICT.zh[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? "{" + name + "}"));
  let tree;
  function render() {
    state = outerState; cursor = 0;
    const view = component({ t, useSessions: (selector) => selector({ current: undefined }) });
    if (mountedKey !== view.props.key) { mountedKey = view.props.key; innerState = []; }
    state = innerState; cursor = 0; tree = view.type(view.props);
  }
  function linkedNodes(value, out = []) {
    if (value == null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return out;
    if (Array.isArray(value)) { value.forEach((item) => linkedNodes(item, out)); return out; }
    out.push(value); return out;
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    if (typeof node.type === "function" && Array.isArray(node.props?.options) && node.props.label && node.props.onChange && !node.props.action) {
      return [{
        type: "select-fixture",
        props: {
          "aria-label": node.props.ariaLabel || node.props.label,
          label: node.props.label,
          options: node.props.options,
          disabled: node.props.disabled,
          onChange: (event) => node.props.onChange(event?.target ? event.target.value : event)
        },
        children: []
      }];
    }
    if (typeof node.type === "function" && node.props?.action) {
      return [{
        type: "action-button-fixture",
        props: {
          "aria-label": node.props.ariaLabel || node.props.label,
          title: node.props.label,
          disabled: node.props.disabled,
          icon: node.props.icon,
          options: node.props.options,
          style: { width: 22 },
          variant: "outline",
          className: node.props.icon ? "dssm-icon-action" : undefined,
          onClick: (actionId) => {
            if (typeof actionId === "string") node.props.onChange(actionId);
            else node.props.onChange(node.props.options?.[0]?.value || "");
          },
          onChange: (event) => node.props.onChange(event?.target ? event.target.value : event),
        },
        children: []
      }];
    }
    if (node.type?.name === "SkillSwitch" || node.type?.name === "Switch" || node.props?.closeLabel || (typeof node.type === "function" && node.props && "on" in node.props && typeof node.props.label === "string")) return nodes(node.type({ ...node.props, children: node.children }));
    if (typeof node.type === "function" && node.props && "userDestinations" in node.props) return nodes(node.type(node.props));
    const nested = linkedNodes(node.children);
    if (typeof node.type === "function") {
      for (const key of ["header", "extra", "actions", "title", "description"]) linkedNodes(node.props?.[key], nested);
      if (Array.isArray(node.props?.items)) node.props.items.forEach((item) => { linkedNodes(item?.label, nested); linkedNodes(item?.extra, nested); linkedNodes(item?.children, nested); });
    }
    return [node, ...nested.flatMap((child) => nodes(child))];
  }
  const find = (predicate) => nodes().find(predicate);
  const rows = () => nodes().filter((node) => node.props.className === "dssm-name").map((node) => node.children[0]);
  const settle = async () => { render(); effects.splice(0).forEach((effect) => effect()); await tick(); await tick(); render(); };
  const tab = async (name) => {
    const tabs = find((node) => node.props?.className === "dssm-scope-tabs" && Array.isArray(node.props.items));
    tabs.props.onChange(tabs.props.items.find((item) => item.label === name || (Array.isArray(item.label) && item.label.includes(name))).value);
    await settle();
  };
  const sources = () => nodes().filter((node) => node.props.className === "dssm-source");
  const expand = (group) => { const toggle = nodes(group).find((node) => node.props.className === "dssm-source-toggle"); if (toggle?.props["aria-expanded"] !== true) toggle.props.onClick(); render(); };
  const textOf = (node) => JSON.stringify(nodes(node).flatMap((item) => item.children.filter((child) => typeof child === "string")));

  await settle();
  sources().forEach(expand);
  nodes().filter((node) => node.props.className === "dssm-cat-main").forEach((btn) => btn.props.onClick());
  render();

  const dsh = sources().find((node) => textOf(node).includes("kept"));
  const codex = sources().find((node) => textOf(node).includes("codex-one"));
  assert.deepEqual(nodes(codex).filter((node) => node.props.className === "dssm-name").map((node) => node.children[0]), ["codex-two", "codex-one", "ordinary", "constructor"], "已保存顺序优先；未排序的 constructor 不得命中继承属性而插队");
  const codexRows = nodes(codex).filter((node) => node.props.className === "dssm-skill-row");
  const codexTwo = codexRows.find((node) => nodes(node).some((child) => child.props.className === "dssm-name" && child.children[0] === "codex-two"));
  const codexOne = codexRows.find((node) => nodes(node).some((child) => child.props.className === "dssm-name" && child.children[0] === "codex-one"));
  codexTwo.props.onDragStart({ dataTransfer: { setData() {}, effectAllowed: "" }, currentTarget: { classList: { add() {} } } });
  codexOne.props.onDrop({ preventDefault() {}, stopPropagation() {}, clientY: 1, currentTarget: { classList: { remove() {}, add() {}, toggle() {} }, closest: () => ({ querySelectorAll: () => [] }), getBoundingClientRect: () => ({ top: 0, height: 20 }) } });
  await tick(); await tick(); render();
  assert.equal(calls.filter((call) => call.url.endsWith("/category-move")).at(-1).body.category, "", "没有分类时也可排序未分类技能");
  assert.equal(nodes(codex).some((node) => node.props.className === "dssm-cat"), false, "没建分类时不套分类层");
  assert.ok(rows().includes("codex-one"), "没建分类时技能仍平铺");
  assert.ok(nodes(codex).some((node) => String(node.props["aria-label"] || "").includes(t("source.toggle"))), "已有来源开关的来源仍用那颗开关");
  assert.equal(nodes(dsh).some((node) => String(node.props["aria-label"] || "").includes(t("source.toggle"))), true, "DSH 打开来源级总开关");
  assert.equal(nodes(dsh).some((node) => node.children.includes(t("category.enableAll")) || node.children.includes(t("category.disableAll"))), false, "DSH 不再用全部开启和全部关闭");
  assert.ok(nodes(dsh).some((node) => node.props.className === "dssm-skill-row"), "技能行有独立容器");
  assert.ok(nodes(dsh).some((node) => node.props.className === "dssm-cat" && node.props["aria-label"] === "工作"), "分类嵌在来源里");
  const work = nodes(dsh).find((node) => node.props.className === "dssm-cat" && node.props["aria-label"] === "工作");
  assert.deepEqual(nodes(work).filter((node) => node.props.className === "dssm-name").map((node) => node.children[0]), ["kept", "other"], "只列出归入该分类的技能");
  const workSwitch = nodes(work).find((node) => node.props["aria-label"] === t("category.toggle") + " 工作");
  assert.equal(workSwitch.props["aria-checked"], false, "没有全部开启时分类开关显示关");
  assert.equal(workSwitch.props.role, "switch", "分类启停用 switch 角色");
  assert.ok(textOf(work).includes(t("category.progress", { count: 2, enabled: 1, usable: 2 })), "部分开启写在数量里");
  const loose = nodes(dsh).find((node) => node.props.className === "dssm-cat" && node.props["aria-label"] === t("category.uncategorized"));
  assert.deepEqual(nodes(loose).filter((node) => node.props.className === "dssm-name").map((node) => node.children[0]), ["loose"]);
  const more = nodes(loose).find((node) => node.props["aria-label"] === t("btn.more"));
  assert.ok(more.props.options.some((option) => option.label === t("category.assign", { name: "工作" })), "归类放进已有的更多");
  assert.ok(more.props.options.some((option) => option.value === "detail"), "查看详情放进更多");
  assert.ok(more.props.options.some((option) => option.value === "trash" && option.danger), "删除技能放进更多");
  const create = nodes(dsh).find((node) => node.props["aria-label"] === t("category.create"));
  assert.ok(create && create.props.icon, "新建分类是图标");
  assert.equal((create.children || []).includes(t("category.create")), false);
  const rename = nodes(work).find((node) => node.props["aria-label"] === t("category.rename"));
  const remove = nodes(work).find((node) => node.props["aria-label"] === t("category.delete"));
  assert.ok(rename && rename.props.icon && remove && remove.props.icon, "重命名和删除分类是图标");
  const add = nodes(work).find((node) => node.props["aria-label"] === t("category.addSkills"));
  assert.ok(add && add.props.icon, "批量归入是图标");

  // 点击批量添加弹窗测试：连续打开分类 1 和分类 2，验证状态隔离
  add.props.onClick();
  render();
  const addModal = find(node => node.props?.title === t("category.selectSkills", { name: "工作" }));
  assert.ok(addModal, "能弹出选择归类弹窗");
  assert.ok(nodes(addModal).some(node => node.props.className === "dssm-batch-item" && textOf(node).includes("loose")), "可选列表中包含未归类的 loose 技能");
  const looseBox = () => nodes(addModal).find(node => node.props?.className === "dssm-batch-check");
  assert.ok(looseBox(), "可选列表使用宿主复选框而非原生 input");
  assert.equal(typeof looseBox().type, "function", "复选框来自宿主原语");
  assert.equal(looseBox().props.checked, false);
  assert.ok(looseBox().props.label.includes("loose"), "复选框带可读名称");

  // 勾选 loose
  const looseItem = nodes(addModal).find(node => node.props.className === "dssm-batch-item" && textOf(node).includes("loose"));
  looseItem.props.onClick();
  render();
  let addModalAfterCheck = find(node => node.props?.title === t("category.selectSkills", { name: "工作" }));
  assert.ok(nodes(addModalAfterCheck).some(node => node.props.className === "dssm-batch-item selected"), "选中项展示激活态");
  assert.equal(nodes(addModalAfterCheck).find(node => node.props?.className === "dssm-batch-check").props.checked, true, "选中后复选框同步勾选");

  // 关闭弹窗
  nodes(addModalAfterCheck).find(node => node.children?.includes(t("btn.cancel")) && node.props?.onClick).props.onClick();
  render();

  // 再次打开该弹窗，检查之前勾选的状态已被重置清空，不发生残留
  add.props.onClick();
  render();
  const addModalReopened = find(node => node.props?.title === t("category.selectSkills", { name: "工作" }));
  assert.equal(nodes(addModalReopened).some(node => node.props.className === "dssm-batch-item selected"), false, "重新打开弹窗勾选已被重置");
  nodes(addModalReopened).find(node => node.children?.includes(t("btn.cancel")) && node.props?.onClick).props.onClick();
  render();
  const categoryRows = nodes(work).filter((node) => node.props.className === "dssm-skill-row");
  const keptRow = categoryRows.find((node) => nodes(node).some((child) => child.props.className === "dssm-name" && child.children[0] === "kept"));
  const otherRow = categoryRows.find((node) => nodes(node).some((child) => child.props.className === "dssm-name" && child.children[0] === "other"));
  const categoryGroup = nodes(dsh).find((node) => node.props.className === "dssm-cat" && node.props["aria-label"] === "工作");
  const categoryClasses = new Set();
  const categoryElement = { classList: { add: (name) => categoryClasses.add(name), remove: (name) => categoryClasses.delete(name) } };
  keptRow.props.onDragStart({ dataTransfer: { setData() {}, effectAllowed: "" }, currentTarget: { classList: { add() {} } } });
  categoryGroup.props.onDragOver({ preventDefault() {}, currentTarget: categoryElement });
  assert.equal(categoryClasses.has("drag-over"), false, "同分类内部拖动不高亮分类外框");
  const sectionElement = { querySelectorAll: () => [{ classList: { remove: (name) => categoryClasses.delete(name) } }] };
  categoryClasses.add("drag-over");
  otherRow.props.onDrop({ preventDefault() {}, stopPropagation() {}, clientY: 1, currentTarget: { classList: { remove() {}, add() {}, toggle() {} }, closest: () => sectionElement, getBoundingClientRect: () => ({ top: 0, height: 20 }) } });
  assert.equal(categoryClasses.has("drag-over"), false, "技能行内部 drop 后清理分类外框高亮");
  await tick(); await tick(); render();
  const orderCalls = calls.filter((call) => call.url.endsWith("/category-move"));
  assert.ok(orderCalls.length > 0, "技能行之间拖放触发排序请求");
  assert.equal(orderCalls.at(-1).body.name, "kept", "排序请求移动拖拽技能");
  assert.equal(orderCalls.at(-1).body.targetName, "other", "排序请求以目标技能定位");
  assert.equal(orderCalls.at(-1).body.category, "work", "同分类排序不改变分类");
  assert.equal(orderCalls.at(-1).body.position, "before", "根据拖放位置计算插入前后");
  // 验证拖拽落点：模拟在分类上 drop 触发归类请求
  const looseCat = nodes(dsh).find((node) => node.props.className === "dssm-cat" && node.props["aria-label"] === t("category.uncategorized"));
  looseCat.props.onDrop({
    preventDefault() {},
    currentTarget: { classList: { remove() {} }, closest: () => sectionElement },
    dataTransfer: {
      getData(type) {
        if (type === "text/plain") return JSON.stringify({ root: "dsh", name: "kept", currentCategoryId: "work" });
        return "";
      }
    }
  });
  await tick(); await tick(); render();
  const assignCalls = calls.filter((call) => call.url.endsWith("/category-assign"));
  assert.ok(assignCalls.length > 0, "拖拽触发归类请求");
  assert.equal(assignCalls.at(-1).body.name, "kept", "拖拽移动的是 kept 技能");
  assert.equal(assignCalls.at(-1).body.category, "", "拖拽落点为未分类");

  assert.ok(nodes(work).some((node) => node.props.className === "dssm-skill-desc" && node.children[0] === "DESC_kept"), "第二行只有描述");
  assert.equal(nodes(work).some((node) => node.props.className === "dssm-row-source"), false, "技能行不再另起来源标签");

  // 验证更多操作菜单中存在「编辑备注」入口
  const moreSelect = nodes(loose).find((node) => node.props["aria-label"] === t("btn.more") && Array.isArray(node.props.options));
  assert.ok(moreSelect, "技能行应包含更多操作菜单");
  assert.ok(moreSelect.props.options.some((opt) => opt.value === "note" && opt.label === t("skill.editNote")), "菜单应包含编辑备注项");

  // 触发打开编辑备注弹窗
  moreSelect.props.onChange("note");
  render();
  const noteModalTitle = nodes().find((node) => node.props.title === t("note.title"));
  assert.ok(noteModalTitle, "应弹出自定义简介 / 备注弹窗");
  const noteTextarea = find((node) => node.props["aria-label"] === t("note.label"));
  assert.ok(noteTextarea, "弹窗内应有备注文本输入框");
  noteTextarea.props.onChange({ target: { value: "我的自定义中文备注" } });
  render();
  const confirmNoteBtn = nodes().filter((node) => node.children.includes(t("btn.confirm")) && node.props.onClick).at(-1);
  assert.ok(confirmNoteBtn, "找到确定提交按钮");
  confirmNoteBtn.props.onClick();
  await settle();
  const noteCall = calls.filter((call) => call.url.endsWith("/skill-note")).at(-1);
  assert.ok(noteCall, "应发起 /skill-note 请求");
  assert.equal(noteCall.body.root, "dsh");
  assert.equal(noteCall.body.name, "loose");
  assert.equal(noteCall.body.note, "我的自定义中文备注");

  const keptToggle = nodes(work).find((node) => node.props["aria-label"] === t("skill.toggle") + " kept");
  assert.equal(keptToggle.props.role, "switch", "技能启停使用 switch 角色");
  assert.equal(keptToggle.props["aria-checked"], true, "已启用的技能开关 aria 状态为 true");
  const css = nodes().filter((node) => node.type === "style").map((node) => node.children.join("")).join("");
  assert.doesNotMatch(css, /\.dssm-enable-switch/, "不再手绘开关样式，改用官方 Switch 原语");
  assert.match(css, /\.dssm-skill-row\{[^}]*padding:11px 13px/, "技能行留白对齐仓库行");
  assert.match(css, /\.dssm-skill-desc\{[^}]*--dsw-alias-label-tertiary/, "描述用次级文字色");
  assert.match(css, /\.dssm-icon-action\{[^}]*background:transparent[^}]*border-color:var\(--dsw-alias-border-l2/, "行内描边使用宿主主题令牌和透明底色");
  assert.match(css, /\.dssm-icon-action:not\(:disabled\):not\(\.dssm-icon-danger\):hover\{[^}]*color:var\(--dsw-alias-link/, "普通图标悬停优先使用宿主链接色，危险按钮排除");
  assert.doesNotMatch(css, /ant-btn|ant-select|ant-collapse|dssm-antd-select|dssm-icon-btn/, "样式不再保留 ant 选择器或旧图标按钮类");
  assert.doesNotMatch(css, /#1677ff\b|rgba?\(\s*22\s*[, ]\s*119\s*[, ]\s*255\b/i, "禁止重新引入 antd 默认蓝色");
  assert.match(css, /\.dssm-stat\{[^}]*padding:4px 10px/, "顶部统计格子更矮");

  await tab("项目技能");
  const picker = find(node => node.props["aria-label"] === t("filter.workspace"));
  assert.ok(picker, "项目页使用顶部工作区选择器");
  assert.ok(picker.props.options.some(option => option.label === "empty-notes"), "空工作区也列在浏览下拉中");
  assert.equal(nodes().some(node => node.props.className === "dssm-workspace"), false, "移除外层工作区折叠");
  const projectSource = sources().find((node) => node.props["data-source-key"] === "project-dsh:a");
  assert.ok(projectSource, "找到项目来源卡片");
  assert.equal(projectSource.props.className, "dssm-source", "项目来源仍是来源卡片");
  assert.ok(nodes(projectSource).some((node) => node.props.className === "dssm-cat" && node.props["aria-label"] === "项目工作"), "项目来源内部再套分类");
  nodes(projectSource).find((node) => node.props["aria-label"] === t("category.toggle") + " 项目工作").props.onClick();
  await tick(); await tick(); render();
  const projectToggle = calls.filter((call) => call.url.endsWith("/category-disable")).at(-1);
  assert.equal(projectToggle.body.root, "project-dsh:a");
  assert.equal(projectToggle.body.category, "pwork");
  assert.equal(projectToggle.body.workspace, "D:/work/alpha");

  // 模态确认必须保留发起来源的工作区，不能改用当前所选项或 session。
  const modalFailures = [];
  for (const [action, route] of [["category.create", "/category-create"], ["category.rename", "/category-rename"], ["category.delete", "/category-delete"]]) {
    const source = sources().find(node => textOf(node).includes("alpha-one"));
    nodes(source).find(node => node.props["aria-label"] === t(action)).props.onClick();
    render();
    if (action !== "category.delete") {
      find(node => node.props["aria-label"] === t("category.name")).props.onChange({ target: { value: "新的分类" } });
      render();
    }
    find(node => node.props["aria-label"] === t("filter.workspace")).props.onChange("D:/work/empty");
    await settle();
    const expectedConfirmText = action === "category.rename" ? t("btn.confirm") : t(action);
    const confirmBtn = nodes().filter(node => node.children.includes(expectedConfirmText) && node.props.onClick).at(-1);
    assert.ok(confirmBtn, `应严格找到文案为「${expectedConfirmText}」的模态确认按钮`);
    confirmBtn.props.onClick();
    await settle();
    const call = calls.filter(call => call.url.endsWith(route)).at(-1);
    try { assert.equal(call?.body.workspace, "D:/work/alpha", route + " 保留原工作区"); }
    catch (error) { modalFailures.push(error.message); }
    assert.equal(call?.body.root, "project-dsh:a");
    find(node => node.props["aria-label"] === t("filter.workspace")).props.onChange("D:/work/alpha");
    await settle();
  }
  assert.deepEqual(modalFailures, [], "分类创建/重命名/删除均携带原工作区登记路径");

  // 分类创建弹窗：输入框按 Enter 键必须触发提交（使用标准 onKeyDown，杜绝宿主未实现的 onPressEnter）
  {
    const source = sources().find(node => textOf(node).includes("alpha-one"));
    nodes(source).find(node => node.props["aria-label"] === t("category.create")).props.onClick();
    render();
    const input = find(node => node.props["aria-label"] === t("category.name"));
    assert.ok(input, "应展示分类输入框");
    input.props.onChange({ target: { value: "回车创建分类" } });
    render();
    const updatedInput = find(node => node.props["aria-label"] === t("category.name"));
    assert.equal(typeof updatedInput.props.onKeyDown, "function", "分类输入框必须提供原生的 onKeyDown 处理器");
    let prevented = false;
    updatedInput.props.onKeyDown({
      key: "Enter",
      preventDefault: () => { prevented = true; },
      nativeEvent: { isComposing: false },
    });
    await settle();
    const call = calls.filter(c => c.url.endsWith("/category-create")).at(-1);
    assert.equal(call?.body.name, "回车创建分类", "按 Enter 键应发起创建请求");
    assert.equal(prevented, true, "按 Enter 键应阻止表单默认行为");

    // 输入法正在组合输入（isComposing: true）时不应触发提交，也不阻止事件默认行为
    const callsCountBefore = calls.length;
    let composingPrevented = false;
    updatedInput.props.onKeyDown({
      key: "Enter",
      preventDefault: () => { composingPrevented = true; },
      nativeEvent: { isComposing: true },
    });
    await settle();
    assert.equal(calls.length, callsCountBefore, "输入法输入中按 Enter 不应触发提交");
    assert.equal(composingPrevented, false, "输入法输入中按 Enter 不应阻止事件默认行为");
  }

  await tab("全局技能");
  find((node) => node.props["aria-label"] === t("btn.add") || node.props["aria-label"] === t("btn.create")).props.onClick();
  await settle();
  find((node) => node.props["aria-label"] === t("dest.scope")).props.onChange("workspace");
  render();
  const workspaceOptions = find((node) => node.props["aria-label"] === t("dest.workspace")).props.options.map((option) => option.label);
  assert.ok(workspaceOptions.includes("empty-notes"), "创建下拉仍列出没有技能的已登记工作区");
  assert.ok(workspaceOptions.includes("alpha"));

  find((node) => node.props.placeholder === t("search.placeholder")).props.onChange({ target: { value: "kept" } });
  render();
  const searched = nodes(sources().find((node) => textOf(node).includes("kept"))).find((node) => node.props.className === "dssm-cat" && node.props["aria-label"] === "工作");
  assert.deepEqual(nodes(searched).filter((node) => node.props.className === "dssm-name").map((node) => node.children[0]), ["kept"], "搜索只显示匹配技能");
  assert.equal(nodes(searched).find((node) => node.props["aria-label"] === t("category.toggle") + " 工作").props["aria-checked"], false, "搜索不能把分类开关显示成整组已开启");
  assert.ok(textOf(searched).includes(t("category.progress", { count: 2, enabled: 1, usable: 2 })), "分类数量仍按整组计算");

  // 验证分类长标题截断保护结构与 title 提示
  const catTitleNode = nodes(searched).find((node) => node.props.className === "dssm-cat-title");
  assert.ok(catTitleNode, "分类标题节点存在");
  assert.equal(catTitleNode.props.title, "工作", "分类标题需提供原生 title 悬浮提示完整名称");
  assert.ok(nodes(catTitleNode).some((node) => node.props.className === "dssm-cat-title-text" && node.children.includes("工作")), "分类标题内部使用 dssm-cat-title-text 实现长文字截断保护");

  // 验证分类创建输入框 maxLength 为 64
  const dshSource = sources().find(node => node.props["data-source-key"] === "dsh");
  nodes(dshSource).find(node => node.props["aria-label"] === t("category.create")).props.onClick();
  render();
  const catInput = find(node => node.props["aria-label"] === t("category.name"));
  assert.equal(catInput.props.maxLength, 64, "分类输入框 maxLength 限制应放宽至 64");
  nodes().filter(node => node.children && node.children.includes(t("btn.cancel")) && node.props.onClick).at(-1)?.props?.onClick();
  render();

  // 测试多分类下的分类重排按钮与一键按名称排序
  find((node) => node.props.placeholder === t("search.placeholder")).props.onChange({ target: { value: "" } });
  globalData.roots[0].categories = [
    { id: "cat-b", name: "Beta分类" },
    { id: "cat-a", name: "Alpha分类" }
  ];
  render();
  const dshCard = sources().find(node => node.props["data-source-key"] === "dsh");
  // 来源头部的按名称排序按钮
  const sortBtn = nodes(dshCard).find(node => node.props["aria-label"] === t("category.sortByName"));
  assert.ok(sortBtn, "分类数大于等于2时展示按名称排序按钮");
  sortBtn.props.onClick();
  await settle();
  const sortCall = calls.filter(c => c.url.endsWith("/category-reorder")).at(-1);
  assert.ok(sortCall, "点击触发 /category-reorder");
  assert.equal(sortCall.body.root, "dsh");
  assert.equal(sortCall.body.direction, "asc");

  // 分类卡片内的上移/下移按钮（带分类名称的无障碍 aria-label）
  const betaCat = nodes(dshCard).find(node => node.props.className === "dssm-cat" && node.props["aria-label"] === "Beta分类");
  assert.ok(betaCat, "找到 Beta 分类卡片");
  const betaMoveUp = nodes(betaCat).find(node => node.props["aria-label"] === t("category.moveUp") + " Beta分类");
  assert.ok(betaMoveUp, "Beta 分类有上移按钮");
  assert.equal(betaMoveUp.props.disabled, true, "首个分类的上移按钮为 disabled");
  const betaMoveDown = nodes(betaCat).find(node => node.props["aria-label"] === t("category.moveDown") + " Beta分类");
  assert.ok(betaMoveDown, "Beta 分类有下移按钮");
  assert.equal(!betaMoveDown.props.disabled, true, "非末尾分类下移按钮可用");
  betaMoveDown.props.onClick();
  await settle();
  const moveDownCall = calls.filter(c => c.url.endsWith("/category-reorder")).at(-1);
  assert.equal(moveDownCall.body.root, "dsh");
  assert.equal(moveDownCall.body.id, "cat-b");
  assert.equal(moveDownCall.body.targetId, "cat-a");
  assert.equal(moveDownCall.body.position, "after");

  // 末项分类（Alpha分类）的上移与下移校验
  const alphaCat = nodes(dshCard).find(node => node.props.className === "dssm-cat" && node.props["aria-label"] === "Alpha分类");
  assert.ok(alphaCat, "找到 Alpha 分类卡片");
  const alphaMoveDown = nodes(alphaCat).find(node => node.props["aria-label"] === t("category.moveDown") + " Alpha分类");
  assert.ok(alphaMoveDown, "Alpha 分类有下移按钮");
  assert.equal(alphaMoveDown.props.disabled, true, "末尾分类的下移按钮为 disabled");
  const alphaMoveUp = nodes(alphaCat).find(node => node.props["aria-label"] === t("category.moveUp") + " Alpha分类");
  assert.ok(alphaMoveUp, "Alpha 分类有上移按钮");
  assert.equal(!alphaMoveUp.props.disabled, true, "非首项分类上移按钮可用");
  alphaMoveUp.props.onClick();
  await settle();
  const moveUpCall = calls.filter(c => c.url.endsWith("/category-reorder")).at(-1);
  assert.equal(moveUpCall.body.root, "dsh");
  assert.equal(moveUpCall.body.id, "cat-a");
  assert.equal(moveUpCall.body.targetId, "cat-b");
  assert.equal(moveUpCall.body.position, "before");

  console.log("categories ui ok");
} finally { globalThis.fetch = originalFetch; }
