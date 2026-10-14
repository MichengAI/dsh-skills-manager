// 项目页顶部选择已登记工作区：只读取所选项，来源与技能复用全局绘制及显式工作区操作。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projectCss = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");
function assertSourceCleanup() {
  assert.doesNotMatch(projectCss, /dssm-workspace|renderWorkspace|project\.searchHint/, "删除旧工作区折叠渲染、CSS和展开搜索提示");
  assert.doesNotMatch(projectCss, /\.dssm-filters \.dssm-search\{[^}]*margin-left:auto/, "搜索框紧跟筛选，不被推到工具栏最右侧");
  assert.match(projectCss, /\.dssm-filter-actions\{[^}]*margin-left:auto/, "搜索旁按钮组对齐到工具栏最右侧");
  assert.match(projectCss, /\.dssm-filter-actions\{[^}]*display:flex[^}]*gap:8px;flex:none/, "搜索右侧图标按钮组间距稳定");
  assert.match(projectCss, /\.dssm-source\.ant-collapse\{[^}]*background:transparent/, "复用全局来源卡片背景");
}

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

const skill = (name) => ({ name, description: "DESC_" + name, enabled: true, loadable: true });
const globalData = { projects: [], trash: [], roots: [{ key: "dsh", mutable: true, path: "C:/u/.dsh/skills", skills: [skill("global-one")] }] };
const workspaces = [
  { name: "alpha", path: "D:/work/alpha", projectRoot: "D:/work/alpha", registeredPaths: ["D:/work/alpha/packages/web", "D:/work/alpha"], available: true, skillCount: 2 },
  { name: "beta", path: "D:/work/beta", projectRoot: "D:/work/beta", registeredPaths: ["D:/work/beta"], available: true, skillCount: 0 },
  { name: "ghost", path: "D:/work/ghost", registeredPaths: ["D:/work/ghost"], available: false, skillCount: 0 },
];
const details = {
  "D:/work/alpha": { project: { root: "D:/work/alpha", name: "alpha" }, warnings: [], roots: [
    { key: "project-dsh:a", scope: "project", kind: "project-dsh", localeKey: "projectDsh", label: "Project DSH", mutable: true, path: "D:/work/alpha/.dsh/skills", projectRoot: "D:/work/alpha", skills: [skill("alpha-one")] },
    { key: "project-claude:a", scope: "project", kind: "project-claude", localeKey: "claude", label: "Claude", exists: true, toggleable: true, enabled: true, path: "D:/work/alpha/.claude/skills", projectRoot: "D:/work/alpha", skills: [skill("alpha-two")] },
  ] },
  "D:/work/beta": { project: { root: "D:/work/beta", name: "beta" }, warnings: [], roots: [
    { key: "project-dsh:b", scope: "project", kind: "project-dsh", localeKey: "projectDsh", label: "Project DSH", mutable: true, path: "D:/work/beta/.dsh/skills", projectRoot: "D:/work/beta", skills: [] },
  ] },
};
const calls = [];
let holdDetails = false, holdLists = false;
const detailResponses = [], listResponses = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const body = options.body ? JSON.parse(options.body) : undefined;
  calls.push({ url: String(url), method: options.method || "GET", body, headers: options.headers });
  const path = String(url).replace("/api/dsh-skills-manager", "");
  let data;
  if (path === "/state") data = globalData;
  else if (path === "/workspaces") {
    if (holdLists) return new Promise(resolve => listResponses.push({ resolve }));
    data = { items: workspaces.slice() };
  }
  else if (path === "/workspace-skills") {
    if (holdDetails) return new Promise(resolve => detailResponses.push({ workspace: body.workspace, resolve }));
    if (body.workspace === "D:/work/ghost") return { ok: false, status: 400, json: async () => ({ ok: false, code: "error.workspace.unavailable", error: "工作区目录不可用", params: { path: body.workspace } }) };
    if (!["D:/work/alpha/packages/web", "D:/work/alpha", "D:/work/beta"].includes(body.workspace)) return { ok: false, status: 400, json: async () => ({ ok: false, code: "error.workspace.unregistered", error: "请选择已登记的工作区" }) };
    data = details[body.workspace === "D:/work/alpha/packages/web" ? "D:/work/alpha" : body.workspace];
  } else data = { name: "ok" };
  return { ok: true, json: async () => ({ ok: true, data }) };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

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
  let tree, currentSession = undefined;
  function render() {
    state = outerState; cursor = 0;
    const view = component({ t, useSessions: (selector) => selector({ current: currentSession }) });
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
    if (typeof node.type === "function" && Array.isArray(node.props?.options) && node.props.label && node.props.onChange) return [{ type: "select-fixture", props: { "aria-label": node.props.label, value: node.props.value, disabled: node.props.disabled, options: node.props.options, onChange: (event) => node.props.onChange(event.target.value) }, children: [] }];
    if (node.type?.name === "SkillSwitch" || node.props?.closeLabel || (typeof node.type === "function" && node.props && "on" in node.props && typeof node.props.label === "string")) return nodes(node.type({ ...node.props, children: node.children }));
    // 目标选择器是普通函数组件：渲染出它的子树，才能断言其中的控件。
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
    const tabs = find((node) => node.props?.block === true && Array.isArray(node.props.options));
    const option = tabs.props.options.find((item) => item.label === name || (Array.isArray(item.label) && item.label.includes(name)));
    tabs.props.onChange(option.value); await settle();
  };
  const workspaceGroups = () => nodes().filter((node) => node.props.className === "dssm-workspace");
  const picker = () => find(node => node.props["aria-label"] === t("filter.workspace"));
  const choose = async (path) => { picker().props.onChange({ target: { value: path } }); await settle(); };
  const textOf = (node) => JSON.stringify(nodes(node).flatMap((n) => n.children.filter((c) => typeof c === "string")));

  await settle();
  const globalFilters = find(node => node.props.className === "dssm-filters");
  const globalActions = nodes(globalFilters).find(node => node.props.className === "dssm-filter-actions");
  assert.ok(globalActions, "全局技能的操作按钮与搜索同排");
  for (const action of nodes(globalActions).filter(node => node.props["aria-label"])) {
    assert.ok(action.props.icon, "全局技能操作按钮使用图标");
    assert.equal(action.children.length, 0, "全局技能操作按钮不显示可见文字");
    assert.ok(action.props.title, "全局技能图标按钮保留悬停提示");
    assert.equal(action.props.style.width, 28, "工具栏图标按钮尺寸一致");
  }
  const createAction = nodes(globalActions).find(node => node.props["aria-label"] === t("btn.create"));
  assert.equal(createAction.props.type, "text", "搜索旁的创建按钮使用中性图标样式");
  assert.equal(createAction.props.style.backgroundColor, undefined, "搜索旁的创建按钮不覆盖主题背景色");
  assert.equal(createAction.props.style.color, "var(--dsw-alias-label-secondary, #b9b9b9)", "搜索旁的按钮不使用强调色");
  await tab("项目技能");

  // 默认只读选择首个可用登记项，不依赖当前会话，不扫其他项目。
  assert.equal(currentSession, undefined);
  assert.ok(picker(), "顶部有工作区下拉");
  assert.equal(workspaceGroups().length, 0, "不再有外层工作区折叠");
  assert.deepEqual(picker().props.options.map(o => o.value), workspaces.map(w => w.registeredPaths[0]), "包括空工作区和不可用工作区");
  assert.equal(picker().props.options.find(o => o.value === "D:/work/ghost").disabled, true);
  assert.ok(picker().props.options.find(o => o.value === "D:/work/ghost").label.includes(t("workspace.unavailable")));
  assert.deepEqual(rows(), ["alpha-one", "alpha-two"]);
  const scans = calls.filter(c => c.url.endsWith("/workspace-skills"));
  assert.equal(scans.length, 1);
  assert.deepEqual(scans[0].body, { workspace: "D:/work/alpha/packages/web" }, "只请求登记路径，不推导项目根");
  assert.equal(find(node => node.props.className === "dssm-summary"), undefined);
  assert.equal(find(node => node.props.className === "dssm-source-filter"), undefined);
  const filters = find(node => node.props.className === "dssm-filters");
  const controls = nodes(filters);
  assert.deepEqual(controls.filter(node => [t("filter.status"), t("filter.workspace"), t("search")].includes(node.props["aria-label"])).map(node => node.props["aria-label"]), [t("filter.status"), t("filter.workspace"), t("search")]);
  const filterActions = nodes(filters).find(node => node.props.className === "dssm-filter-actions");
  assert.ok(filterActions, "项目技能的操作按钮与搜索同排");
  for (const action of nodes(filterActions).filter(node => node.props["aria-label"])) {
    assert.ok(action.props.icon, "操作按钮使用图标");
    assert.equal(action.children.length, 0, "操作按钮不再显示可见文字");
    assert.ok(action.props.title, "图标按钮保留悬停提示");
    assert.equal(action.props.style.width, 28, "项目页工具栏图标按钮尺寸一致");
    assert.equal(action.props.type, "text", "项目页搜索旁按钮使用中性样式");
    assert.equal(action.props.style.backgroundColor, undefined, "项目页搜索旁按钮不设置强调底色");
  }
  await choose("D:/work/ghost");
  await choose("D:/unregistered");
  assert.deepEqual(rows(), ["alpha-one", "alpha-two"], "合成事件也不能选择不可用或未登记项");
  assert.equal(calls.filter(c => c.url.endsWith("/workspace-skills")).length, 1);
  await choose("D:/work/beta");
  assert.deepEqual(rows(), [], "切换空工作区不泄漏 alpha 技能");
  assert.ok(find(node => node.children.includes(t("workspace.noSkills"))));
  await choose("D:/work/alpha/packages/web");
  assert.deepEqual(rows(), ["alpha-one", "alpha-two"]);
  assert.equal(calls.filter(c => c.url.endsWith("/workspace-skills")).length, 2, "切回已缓存工作区不重复扫描");

  // 刷新只重读所选项目，不清缓存后永远停在 loading。
  const beforeRefresh = calls.filter(c => c.url.endsWith("/workspace-skills")).length;
  details["D:/work/alpha"].roots[0].skills.push(skill("alpha-new"));
  find(node => node.props["aria-label"] === t("btn.refresh") && node.props.onClick).props.onClick();
  await settle();
  assert.equal(calls.filter(c => c.url.endsWith("/workspace-skills")).length, beforeRefresh + 1, "刷新重新读取所选工作区");
  assert.ok(rows().includes("alpha-new"), "刷新后所选项显示新详情");
  assert.deepEqual(rows().slice(0, 2), ["alpha-one", "alpha-new"], "刷新保持所选工作区");
  details["D:/work/alpha"].roots[0].skills.pop();

  // 5. 连续刷新：只读所选工作区，最新响应获胜；旧失败不能覆盖新成功。
  holdDetails = true;
  const refreshProjects = async () => { find(node => node.props["aria-label"] === t("btn.refresh") && node.props.onClick).props.onClick(); await settle(); };
  await refreshProjects();
  assert.ok(find(node => node.children.includes(t("workspace.loading"))), "刷新时所选项目有 loading 提示");
  assert.equal(detailResponses.length, 1, "只重读所选工作区");
  await refreshProjects();
  assert.equal(detailResponses.length, 2, "再次刷新发起新请求");
  const response = (roots) => ({ ok: true, json: async () => ({ ok: true, data: { roots } }) });
  detailResponses[1].resolve(response(details["D:/work/alpha"].roots));
  await settle();
  assert.ok(rows().includes("alpha-one"), "最新详情返回后正常显示");
  detailResponses[0].resolve({ ok: false, status: 400, json: async () => ({ ok: false, error: "stale failure" }) });
  await settle();
  assert.equal(find(node => JSON.stringify(node.children).includes("stale failure")), undefined, "过期错误不能覆盖最新成功");
  await refreshProjects();
  detailResponses[2].resolve({ ok: false, status: 400, json: async () => ({ ok: false, error: "fresh failure" }) });
  await settle();
  assert.ok(find(node => node.props.role === "alert" && JSON.stringify(node.children).includes("fresh failure")), "最新错误可见且不永远 loading");
  holdDetails = false;
  await refreshProjects();
  assert.ok(rows().includes("alpha-one"), "错误后刷新可恢复");

  // 6. 启停带 workspace，只改所选工作区的副本；完成后只刷新这个工作区。
  const sw = find((node) => node.props["aria-label"] === t("skill.toggle") + " alpha-one");
  sw.props.onChange(); await tick(); await tick(); render();
  const toggle = calls.filter((c) => c.method === "POST" && c.url.endsWith("/disable")).at(-1);
  assert.deepEqual(toggle.body, { root: "project-dsh:a", name: "alpha-one", workspace: "D:/work/alpha/packages/web" }, "启停请求带所选工作区的登记路径");
  assert.ok(calls.filter((c) => c.url.endsWith("/workspace-skills")).length >= 2, "操作后重新读取该工作区");

  // 7. 来源总开关同样带 workspace。
  const sourceSwitch = find((node) => String(node.props["aria-label"] || "").includes(t("source.toggle")));
  sourceSwitch.props.onChange(); await tick(); await tick(); render();
  const sourceCall = calls.filter((c) => c.method === "POST" && /\/source-(en|dis)able$/.test(c.url)).at(-1);
  assert.equal(sourceCall.body.workspace, "D:/work/alpha/packages/web");
  assert.equal(sourceCall.body.root, "project-claude:a");

  // 被覆盖副本仍可独立启停；项目停用后显示由谁接管；提示只在发起操作的页签出现。
  const alphaClaude = details["D:/work/alpha"].roots.find((r) => r.kind === "project-claude").skills[0];
  alphaClaude.shadowedBy = { root: "project-dsh:a", name: "alpha-two" };
  await settle();
  const shadowedSwitch = find((node) => node.props["aria-label"] === t("skill.toggle") + " alpha-two");
  assert.equal(shadowedSwitch.props.disabled, false, "被覆盖副本仍允许独立设置启停");
  delete alphaClaude.shadowedBy;
  alphaClaude.enabled = false;
  alphaClaude.fallbackTo = { root: "dsh", name: "alpha-two", scope: "user" };
  await settle();
  details["D:/work/alpha"].roots.find((r) => r.kind === "project-claude").skills[0] = alphaClaude;
  // 重新读取以拿到被修改后的详情
  await refreshProjects();
  const fallbackNote = find((node) => node.props.className === "dssm-note dssm-fallback");
  assert.ok(fallbackNote, "项目停用行显示接管来源");
  assert.ok(String(fallbackNote.children[0]).startsWith("当前使用全局 ") && String(fallbackNote.children[0]).endsWith(" 副本。"), "文案来自翻译，指向用户级来源");
  assert.equal(find((node) => node.props["aria-label"] === t("skill.toggle") + " alpha-two").props.checked, false, "提示不改变副本的停用状态");

  const feedback = () => find((node) => node.props.className === "dssm-feedback" && node.children.includes(t("result.updated")));
  find((node) => node.props["aria-label"] === t("skill.toggle") + " alpha-one").props.onChange(); await tick(); await tick(); render();
  assert.ok(feedback(), "操作结果显示在发起操作的页面");
  await tab("发现技能");
  assert.equal(feedback(), undefined, "仓库页不显示项目页的操作结果");
  await tab("回收站");
  assert.equal(feedback(), undefined, "回收站不显示项目页的操作结果");
  await tab("项目技能");

  // 8. 搜索只筛选所选工作区的技能。
  const search = find((node) => node.props["aria-label"] === t("search"));
  search.props.onChange({ target: { value: "alpha-two" } }); await settle();
  assert.deepEqual(rows(), ["alpha-two"], "搜索只留命中的技能");
  search.props.onChange({ target: { value: "" } }); await settle();

  // 8b. 回收站里的项目条目：恢复请求带上该项目的登记路径，不依赖当前会话。
  globalData.trash = [
    { id: "trash-proj", name: "removed-proj", deletedAt: "2026-09-12T00:00:00Z", root: { scope: "project", projectName: "alpha", projectRoot: "D:/work/alpha" } },
    { id: "trash-orphan", name: "removed-orphan", deletedAt: "2026-09-12T00:00:00Z", root: { scope: "project", projectName: "gone", projectRoot: "D:/work/gone" } },
    { id: "trash-user", name: "removed-user", deletedAt: "2026-09-12T00:00:00Z", root: { scope: "user" } },
  ];
  await tab("项目技能"); await tab("回收站");
  assert.equal(nodes().some((node) => node.children.some((child) => typeof child === "string" && child.includes("待处理技能"))), false, "回收站列表不再重复待处理数量，页签徽标已经显示数量");
  // 回收站条目有独立容器与信息层级，操作区成组，不改变恢复请求的授权范围。
  const trashCards = nodes().filter((node) => node.props.className === "dssm-trash-item");
  assert.equal(trashCards.length, 3);
  assert.equal(trashCards[0].props.role, "group", "每个回收站条目独立成组");
  assert.equal(trashCards[0].props["aria-label"], "removed-proj");
  const trashMeta = nodes(trashCards[0]).find((node) => node.props.className === "dssm-trash-meta");
  assert.ok(trashMeta, "名称与次级信息分层");
  const trashTime = nodes(trashMeta).find((node) => node.type === "time");
  assert.equal(trashTime?.props.dateTime, globalData.trash[0].deletedAt, "删除时间保留机器可读值");
  assert.ok(nodes(trashMeta).some((node) => node.props.className === "dssm-trash-source"), "来源单独显示为次级标签");
  const trashActions = nodes(trashCards[0]).find((node) => node.props.className === "dssm-trash-actions");
  assert.ok(trashActions, "恢复与删除集中在独立操作区");
  const restoreIcon = nodes(trashActions).find((node) => node.props["aria-label"] === t("btn.restore"));
  const deleteIcon = nodes(trashActions).find((node) => node.props["aria-label"] === t("btn.delete.forever"));
  assert.ok(restoreIcon && deleteIcon, "回收站行操作统一为带可访问标签的图标按钮");
  for (const button of [restoreIcon, deleteIcon]) {
    assert.notEqual(button.props.type, "text", "行内使用描边图标，不回退为工具栏 text 按钮");
    assert.match(button.props.className, /\bdssm-row-icon\b/);
    assert.equal(button.props.size, "small");
    assert.ok(button.props.icon, "复用 16px 描边图标");
    assert.equal(button.props.style.width, 22, "操作盒与全局技能图标一致");
    assert.equal(button.props.title, button.props["aria-label"], "悬停与无障碍名称保留原动作说明");
    assert.equal(button.children.length, 0, "行内不再绘制文字按钮");
  }
  assert.equal(deleteIcon.props.danger, true, "永久删除保留危险图标语义");
  const css = nodes().filter((node) => node.type === "style").map((node) => node.children.join("")).join("");
  assert.match(css, /\.dssm-trash-item\{[^}]*border:1px solid var\(--dsw-alias-border-l2/, "回收站条目有宿主主题细边框");
  assert.match(css, /\.dssm-trash-item\{[^}]*background:transparent/, "回收站和全局技能一样使用透明背景");
  assert.match(css, /\.dssm-trash-item\{[^}]*padding:11px 13px/, "回收站留白与技能行一致");
  assert.match(css, /\.dssm-trash-source\{[^}]*background:transparent/, "来源信息不再另铺偏亮的标签底色");
  assert.match(css, /\.dssm-trash-meta\{[^}]*color:var\(--dsw-alias-label-tertiary/, "时间等次级信息降低亮度");
  assert.match(css, /@container\(max-width:520px\)\{\.dssm-trash-item\{grid-template-columns:minmax\(0,1fr\)\}/, "窄面板操作区换行");
  const restoreButtons = () => nodes().filter((node) => node.props["aria-label"] === t("btn.restore"));
  assert.equal(restoreButtons().length, 3);
  const callsBefore = calls.length;
  restoreButtons()[0].props.onClick(); await tick(); await tick(); render();
  const restoreProj = calls.slice(callsBefore).find((c) => c.url.endsWith("/trash-restore"));
  assert.deepEqual(restoreProj.body, { id: "trash-proj", workspace: "D:/work/alpha/packages/web" }, "项目条目带原项目的登记路径");
  const afterFirst = calls.length;
  restoreButtons()[1].props.onClick(); await tick(); await tick(); render();
  const restoreOrphan = calls.slice(afterFirst).find((c) => c.url.endsWith("/trash-restore"));
  assert.deepEqual(restoreOrphan.body, { id: "trash-orphan" }, "找不到登记路径时不编造 workspace，交给服务端按当前会话判断并报错");
  const afterSecond = calls.length;
  restoreButtons()[2].props.onClick(); await tick(); await tick(); render();
  const restoreUser = calls.slice(afterSecond).find((c) => c.url.endsWith("/trash-restore"));
  assert.deepEqual(restoreUser.body, { id: "trash-user" }, "用户级条目不带 workspace");

  // 切换工作区时只显示自己的缓存/加载态，旧 alpha 响应不能盖过 beta。
  await tab("项目技能");
  holdDetails = true;
  const raceStart = detailResponses.length;
  await refreshProjects();
  await choose("D:/work/beta");
  assert.deepEqual(rows(), []);
  assert.ok(find(node => node.children.includes(t("workspace.loading"))));
  assert.equal(detailResponses.length, raceStart + 2);
  detailResponses[raceStart + 1].resolve(response([{ ...details["D:/work/beta"].roots[0], skills: [skill("beta-one")] }]));
  await settle();
  assert.deepEqual(rows(), ["beta-one"]);
  detailResponses[raceStart].resolve(response(details["D:/work/alpha"].roots));
  await settle();
  assert.deepEqual(rows(), ["beta-one"], "旧工作区响应只写自己的缓存");
  find(node => node.props["aria-label"] === t("search")).props.onChange({ target: { value: "alpha-one" } });
  await settle();
  assert.deepEqual(rows(), [], "搜索不会读未选中的 alpha 缓存");
  assert.ok(find(node => node.children.includes(t("empty.search"))));
  find(node => node.props["aria-label"] === t("search")).props.onChange({ target: { value: "" } });
  await settle();
  await tab("全局技能"); await tab("项目技能");
  assert.equal(picker().props.value, "D:/work/beta", "重读列表保留当前选择");
  await choose("D:/work/alpha/packages/web");
  assert.deepEqual(rows(), ["alpha-one", "alpha-two"]);
  holdDetails = false;

  // 刷新列表进行中打开写入弹窗：新列表请求接管后也不能让项目页卡在 loading。
  await tab("项目技能");
  holdLists = true;
  const pendingStart = listResponses.length;
  await refreshProjects();
  find(node => node.props["aria-label"] === t("btn.create") && node.props.onClick).props.onClick();
  await settle();
  assert.equal(listResponses.length, pendingStart + 2);
  listResponses[pendingStart + 1].resolve({ ok: true, json: async () => ({ ok: true, data: { items: workspaces.slice() } }) });
  await settle();
  find(node => node.children.includes(t("btn.cancel")) && node.props.onClick).props.onClick();
  await settle();
  assert.deepEqual(rows(), ["alpha-one", "alpha-two"], "写入弹窗列表接管刷新后仍加载当前所选工作区");
  listResponses[pendingStart].resolve({ ok: false, status: 500, json: async () => ({ ok: false, error: "stale list failure" }) });
  await settle();
  assert.equal(find(node => node.props.role === "alert" && textOf(node).includes("stale list failure")), undefined);
  holdLists = false;

  // 重名用登记路径区分；失效/删除回落可用项，不请求失效路径。
  const originalWorkspaces = workspaces.slice();
  workspaces.push({ name: "alpha", path: "D:/work/other", registeredPaths: ["D:/work/other"], available: false, skillCount: 0 });
  await refreshProjects();
  assert.ok(picker().props.options.filter(option => option.label.startsWith("alpha")).every(option => option.label.includes(option.value)), "重名选项附登记路径");
  const beforeInvalid = calls.filter(call => call.url.endsWith("/workspace-skills")).length;
  workspaces[0] = { ...workspaces[0], available: false };
  await refreshProjects();
  assert.equal(picker().props.value, "D:/work/beta");
  assert.equal(calls.filter(call => call.url.endsWith("/workspace-skills")).length, beforeInvalid + 1, "只读回落后的可用项");
  assert.deepEqual(calls.filter(call => call.url.endsWith("/workspace-skills")).at(-1).body, { workspace: "D:/work/beta" });
  workspaces.splice(0, workspaces.length, originalWorkspaces[2]);
  const beforeNoUsable = calls.filter(call => call.url.endsWith("/workspace-skills")).length;
  await refreshProjects();
  assert.equal(picker().props.value, "");
  assert.ok(find(node => node.children.includes(t("workspace.unavailable"))));
  assert.equal(calls.filter(call => call.url.endsWith("/workspace-skills")).length, beforeNoUsable);
  workspaces.length = 0;
  await refreshProjects();
  assert.equal(picker().props.value, "");
  assert.ok(find(node => node.children.includes(t("project.empty"))));
  assert.deepEqual(rows(), []);
  workspaces.push(...originalWorkspaces);
  await refreshProjects();
  assert.deepEqual(rows(), ["alpha-one", "alpha-two"], "列表恢复后重新选择首个可用项");

  // 连续刷新列表也采用最新响应，旧成功不能把被删除的选择复活。
  holdLists = true;
  const listRaceStart = listResponses.length;
  await refreshProjects(); await refreshProjects();
  listResponses[listRaceStart + 1].resolve({ ok: true, json: async () => ({ ok: true, data: { items: [] } }) });
  await settle();
  listResponses[listRaceStart].resolve({ ok: true, json: async () => ({ ok: true, data: { items: originalWorkspaces } }) });
  await settle();
  assert.deepEqual(picker().props.options, [], "旧列表响应不能复活删除的工作区");
  assert.deepEqual(rows(), []);
  holdLists = false;
  await refreshProjects();

  // 9. 全局页不受影响，仍是用户级来源。
  await tab("全局技能");
  assert.equal(workspaceGroups().length, 0);
  assert.equal(find((node) => node.props.className === "dssm-source" && Array.isArray(node.props.items)) !== undefined, true);

  // 10. 登记列表读取失败：项目页提示，不抛错、不回退到当前会话。
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => String(url).endsWith("/workspaces") ? { ok: false, status: 500, json: async () => ({ ok: false, error: "boom" }) } : previous(url, options);
  await tab("项目技能");
  assert.equal(workspaceGroups().length, 0);
  assert.ok(find((node) => node.props.className === "dssm-empty" || String(node.props.className || "").includes("dssm-error")), "失败时有明确提示");
  assert.equal(picker().props.value, "", "列表失败清空选择，不使用当前 session 或旧选择");
  assert.deepEqual(rows(), []);
  globalThis.fetch = previous;
  await refreshProjects();
  assert.deepEqual(rows(), ["alpha-one", "alpha-two"], "列表失败后可刷新恢复");

  assertSourceCleanup();
  console.log("项目页：顶部工作区选择、所选项取数、带工作区操作、搜索与失败处理均通过");
} finally { globalThis.fetch = originalFetch; }
