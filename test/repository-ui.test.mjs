// 验证真实 hooks/事件的筛选、折叠、安装位置选择、回收站卸载和更新行为。
import assert from "node:assert/strict";
import { mock } from "node:test";
// 文件内所有 setTimeout 均受控（含未来请求超时，需显式 tick），setImmediate 保持真实以驱动异步渲染。
mock.timers.enable({ apis: ["setTimeout"] });
import { readFile } from "node:fs/promises";
import { createRepositoryUI, repositoryLocales } from "../src/repository-ui.ts";
import { createDestinationKit, destinationLocales } from "../src/destination-picker.ts";
let values = [], cursor = 0, effects = [], dependencies = [], cleanups = [];
let active = true;
function flushEffects() { effects.splice(0).forEach(({ i, fn }) => { cleanups[i]?.(); cleanups[i] = fn(); }); }
function unmount() { effects = []; cleanups.forEach(cleanup => cleanup?.()); cleanups = []; }
function resetMount() { unmount(); values = []; cursor = 0; dependencies = []; active = true; }
const react = {
  createElement(type, props, ...children) {
    if (props?.className === "dssm-catalog-sentinel" && props.ref) props.ref.current = {};
    return { type, props: props || {}, children: children.flat(Infinity).filter((v) => v != null && typeof v !== "boolean") };
  },
  useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], (v) => { values[i] = typeof v === "function" ? v(values[i]) : v; }]; },
  useRef(initial) { const i = cursor++; return values[i] || (values[i] = { current: initial }); },
  useEffect(fn, deps) { const i = cursor++; if (!dependencies[i] || deps.some((v, n) => dependencies[i][n] !== v)) { effects.push({ i, fn }); dependencies[i] = deps; } },
};
const repos = [{ id: "one", owner: "example", name: "skills", skills: [
  { path: "skills/pdf", name: "pdf", description: "PDF 文档", status: "available", installedRoot: null, canUninstall: false },
  { path: "skills/docx", name: "docx", description: "Word 文档", status: "conflict", installedRoot: null, canUninstall: false },
] }];
// 故意使用非默认、包含空格的配置路径，防止界面重新硬编码用户目录。
const configuredRoots = [
  { key: "dsh", path: "/configured/DSH Home/skills", label: "Backend DSH", available: true },
  { key: "agents", path: "/configured/shared agent/skills", label: "Backend Shared", available: true },
  { key: "codex", path: "/configured/codex-user/skills", label: "Backend Codex", available: true },
  { key: "claude", path: "/configured/claude-user/skills", label: "Backend Claude", available: true },
  { key: "gemini", path: "/configured/unsafe-gemini/skills", label: "Gemini configured", available: false, error: { code: "error.repo.invalid", error: "Unsafe configured Gemini path" } },
  { key: "windsurf", path: "/configured/windsurf-user/skills", label: "Backend Windsurf", localeKey: "windsurf-user", available: true },
];
let installRoots = structuredClone(configuredRoots);
const calls = [];
const catalogCalls = [];
const catalogSearchCalls = [];
let failCatalogRanking = false;
const skillshCalls = [];
const skillshResults = [{ id: "owner/skills/react-skill", source: "owner/skills", skillId: "react-skill", name: "React Skill", installs: 123456 }];
const catalogFetch = async (input) => {
  const url = new URL(input);
  if (url.pathname === "/clawhub/search") {
    catalogSearchCalls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: [
        { source: "clawhub", id: "clawhub:gill-helper", slug: "gill-helper", displayName: "Gill Helper", ownerHandle: "owner-gill", summary: "A real keyword result", downloads: 21 },
        { source: "skills-sh", id: "skills-sh:gill-guide", slug: "gill-guide", displayName: "Unrelated federated result", ownerHandle: "owner-other", summary: "Not part of ClawHub", downloads: 9000 },
      ] }),
    };
  }
  catalogCalls.push(url);
  if (failCatalogRanking) throw new Error("模拟榜单首次请求失败");
  const offset = Number(url.searchParams.get("cursor") || 0);
  const items = Array.from({ length: 10 }, (_value, index) => {
    const rank = offset + index + 1;
    return {
      ownerHandle: "owner-" + rank,
      slug: "skill-" + String(rank).padStart(3, "0"),
      displayName: "Skill " + String(rank).padStart(3, "0"),
      summary: "Live ClawHub summary " + rank,
      stats: { downloads: 1000 - rank, installs: rank, stars: rank },
    };
  });
  return {
    ok: true,
    status: 200,
    json: async () => ({ items, nextCursor: offset + 10 < 100 ? String(offset + 10) : null }),
  };
};
globalThis.fetch = async () => { throw new Error("目录客户端不得直连外部网络"); };
let workspaceRows = [];
let finishInstall, finishUninstall;
let failInstall = false, failUninstall = false;
let finishRefresh, finishDetail;
let holdRefresh = false, failRefresh = false;
let installedCalls = 0, failInstalledRefresh = false, failRepositoryList = false;
let mockCatalogInstalls = ["clawhub:owner-2/skill-002"];
let mockCatalogCopies = [{ id: "clawhub:owner-2/skill-002", name: "Skill 002", installedRoot: "dsh", canUninstall: true }];
let mockCatalogUnknownIds = [], mockCatalogWarnings = [];
let holdCatalogPath = "", pendingCatalog = [];
const api = async (path, options) => {
  if (holdCatalogPath && path.startsWith(holdCatalogPath)) return new Promise(resolve => pendingCatalog.push({ path, signal: options?.signal, resolve }));
  const body = options?.body ? JSON.parse(options.body) : undefined;
  calls.push({ path, body });
  if (path === "/repositories" && failRepositoryList) throw new Error("目录列表刷新失败");
  if (path.startsWith("/clawhub/")) return (await catalogFetch("http://localhost" + path)).json();
  if (path.startsWith("/skills-sh/search")) {
    const url = new URL(path, "http://localhost");
    skillshCalls.push(url);
    return { skills: url.searchParams.get("q") === "react" ? structuredClone(skillshResults) : [] };
  }
  if (path === "/workspaces") return { items: structuredClone(workspaceRows) };
  if (path === "/catalog/detail") return { name: body.name, description: "目录技能说明", body: "# " + body.name, origin: body.catalog === "skillsh" ? body.source + "/" + body.skillId : body.owner + "/" + body.slug };
  if (path === "/catalog/install") {
    const catalogId = body.catalog === "skillsh" ? `skillsh:${body.source}/${body.skillId}` : `clawhub:${body.owner}/${body.slug}`;
        if (!mockCatalogInstalls.includes(catalogId)) mockCatalogInstalls.push(catalogId);
    const installedRoot = body.root || "dsh";
    const installedName = body.catalog === "clawhub" ? body.slug : body.skillId;
    if (!mockCatalogCopies.some(copy => copy.id === catalogId && copy.installedRoot === installedRoot && copy.installedWorkspace === body.workspace)) mockCatalogCopies.push({ id: catalogId, name: installedName, installedRoot, ...(body.workspace ? { installedWorkspace: body.workspace } : {}), canUninstall: true });
    return { name: installedName, root: installedRoot };
  }
  if (path.endsWith("/install")) {
    await new Promise((resolve) => { finishInstall = resolve; });
    if (failInstall) throw new Error("下载超时，请重试");
    Object.assign(repos[0].skills[0], { status: "installed", tracked: true, installedRoot: body.root, canUninstall: true });
  }
  if (path.endsWith("/uninstall")) {
    await new Promise((resolve) => { finishUninstall = resolve; });
    if (failUninstall) throw new Error("回收站写入失败");
    Object.assign(repos[0].skills[0], { status: "available", tracked: false, installedRoot: null, canUninstall: false, updateAvailable: false, canRollback: false });
  }
  if (path.endsWith("/add")) return { id: "two" };
  if (path.endsWith("/refresh")) { if (holdRefresh) await new Promise(resolve => { finishRefresh = resolve; }); if (failRefresh) throw new Error("仓库网络失败"); return { error: null }; }
  if (path.endsWith("/detail")) { await new Promise(resolve => { finishDetail = resolve; }); return { name: "pdf", body: "说明", commit: "abc", path: "skills/pdf" }; }
  if (path.endsWith("/preview")) return { token: "checked", commit: "a".repeat(40), localModified: true, changes: [{ kind: "modified", path: "SKILL.md" }] };
  if (path.endsWith("/update") || path.endsWith("/rollback")) repos[0].skills[0].status = "installed";
  // 每次返回独立快照，安装/卸载必须真正 reload 才能改变 UI。
  return structuredClone({ repositories: repos, installRoots, catalogInstalls: mockCatalogInstalls, catalogCopies: mockCatalogCopies, catalogUnknownIds: mockCatalogUnknownIds, catalogWarnings: mockCatalogWarnings });
};
const Input = Object.assign(() => {}, { TextArea: Symbol("官方只读说明框") });
const Button = Symbol("官方按钮");
const isAction = (node, key) => (node.type === "button" || node.type === Button) && (node.children.includes(key) || node.props["aria-label"] === key);
const OfficialSelect = Symbol("官方筛选");
let hostLocale;
const Collapse = (props) => {
  const items = props.items || [];
  const active = [].concat(props.activeKey ?? []);
  return react.createElement("div", { className: props.className }, items.map((item) => {
    const open = active.includes(item.key);
    return react.createElement("div", { key: item.key },
      react.createElement("button", { type: "button", "aria-expanded": open, onClick: () => props.onChange(open ? [] : [item.key]) }, item.label, item.extra),
      open ? item.children : null);
  }));
};
const useUI = createRepositoryUI({ react, Modal: "modal", Input, Button, Collapse, SourceSelect: OfficialSelect, destination: createDestinationKit({ react, SourceSelect: OfficialSelect, translateError: (_t, error) => error.error || error.message }), api, headers: {}, getLocale: () => hostLocale, translateError: (_t, e) => e.code === "error.repo.invalid" ? "已翻译的仓库错误" : e.error || e.message });
let languagePrefix = "";
const rootTranslations = { "root.codex": "Codex", "root.claude": "Claude", "root.windsurf-user": "Windsurf User" };
const t = (key) => key === "format.locale" ? "zh-CN" : languagePrefix + (rootTranslations[key] || key);
let ui;
function render() { cursor = 0; ui = useUI({ active, t, onInstalled: async () => { installedCalls++; if (failInstalledRefresh) throw new Error("本地列表刷新失败"); } }); }
// 目标选择器是函数组件：带 userDestinations 的节点展开成它渲染出的子树，其余沿用原遍历。
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function" && node.props && ("userDestinations" in node.props || Array.isArray(node.props.items))) return nodes(node.type(node.props));
  return [node, ...node.children.flatMap(nodes)];
}
const all = () => [...nodes(ui.actions), ...nodes(ui.content)];
const find = (predicate) => all().find(predicate);
const dialog = () => find(n => n.type === "modal");
const modalNodes = () => nodes(dialog());
const modalAction = key => modalNodes().find(n => isAction(n, key));
const rowAction = key => all().filter(n => n.props.className === "dssm-repo-row").flatMap(nodes).find(n => isAction(n, key));
const countCalls = path => calls.filter(call => call.path === path).length;
const settle = async () => {
  for (let cycle = 0; cycle < 4; cycle++) {
    await new Promise(setImmediate);
    flushEffects();
    render();
  }
  await new Promise(setImmediate);
  render();
};
const clickNode = async node => { assert.ok(node, "必须找到可点击元素"); assert.ok(!node.props.disabled, "真实点击不能触发禁用按钮"); node.props.onClick(); await settle(); };
const click = key => clickNode(find(n => isAction(n, key)));
const clickModal = key => clickNode(modalAction(key));
// 位置是并排在范围右侧的官方下拉：label 为翻译后的「位置」，选项为后端允许的位置。
const locationSelect = () => modalNodes().find(n => n.type === OfficialSelect && n.props.label === "dest.location");
const locationOption = root => locationSelect()?.props.options.find(o => o.value === root);
// 与旧单选框同名的辅助：返回该位置的选项（不存在则 undefined），disabled 来自下拉选项
const radio = root => { const option = locationOption(root); return option && { props: { disabled: option.disabled === true || locationSelect().props.disabled === true, checked: locationSelect().props.value === root, value: root, onChange: () => locationSelect().props.onChange(root) } }; };
const chooseRoot = root => { const option = locationOption(root); assert.ok(option, "所选位置必须可见"); assert.ok(!option.disabled, "真实选择不能触发不可用位置"); locationSelect().props.onChange(root); render(); };
const checkedRoots = () => { const select = locationSelect(); return select && select.props.value ? [select.props.value] : []; };
const destinationLabels = () => locationSelect()?.props.options ?? [];
const pathLines = () => modalNodes().filter(n => n.type === "code").map(n => n.children.join(""));

const repoSource = await readFile(new URL("../src/repository-ui.ts", import.meta.url), "utf8");
assert.match(repositoryLocales.zh["repo.subsource.catalogNote"], /仅.*当前显示条目.*排序/, "明确排序仅限当前显示的下载榜");
assert.match(repositoryLocales.en["repo.subsource.catalogNote"], /sort.*displayed/i, "英文同样说明排序范围");
assert.equal(typeof repositoryLocales.zh["error.repo.capacity"], "string", "容量错误必须有中文文案");
assert.doesNotMatch(repositoryLocales.en["error.repo.capacity"], /[\u4e00-\u9fff]/, "英文界面不能回落成中文容量错误");
assert.doesNotMatch(repoSource, /InstalledCatalogSkill|installedSkills\?/, "删除无效 installedSkills 参数及类型");
const clientSource = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");
assert.doesNotMatch(clientSource, /installedSkills:\s*allRoots\.flatMap/, "客户端渲染不再为死参数遍历全部技能");
assert.equal(repoSource.includes('.dssm-repo-row:first-child{border-top:0}'), false, "仓库第一条技能必须保留标题下方分隔线");
assert.equal(/\.dssm-repo-description\{[^}]*line-height:18px/.test(repoSource), true, "仓库描述行高与全局技能的 18px 一致");
assert.equal(repoSource.includes("▾") || repoSource.includes("▸"), false, "仓库折叠不再用文字三角");
assert.match(repoSource, /h\(Collapse,/, "仓库折叠使用和全局技能相同的 Collapse，带箭头和展开动画");
assert.deepEqual(Object.keys(repositoryLocales.en).sort(), Object.keys(repositoryLocales.zh).sort(), "中英文词条必须同步");
assert.equal(repoSource.includes("SKILLSH_TOP10") || repoSource.includes("CLAWHUB_TOP10"), false, "线上目录榜单不再硬编码静态条目");
const allowedDestinationKeys = ["dsh", "agents"];
for (const locale of Object.values(repositoryLocales)) {
  for (const name of ["DSH skills", "Shared Agent"]) assert.ok(locale["repo.hint"].includes(name), "全局提示必须介绍可选安装位置：" + name);
  for (const name of ["Codex", "Claude"]) assert.equal(locale["repo.hint"].includes(name), false, "安装提示不能把只读 Agent 目录说成可选位置：" + name);
  assert.ok(locale["repo.uninstallSuccess"] && locale["repo.uninstallExternalWarning"]);
  assert.equal(locale["repo.uninstallSharedWarning"], undefined, "删除仅 Shared Agent 专用的旧警告词条");
}
assert.match(repositoryLocales.en["repo.hint"], /DSH skills or Shared Agent/);
assert.match(repositoryLocales.zh["repo.hint"], /DSH skills 或 Shared Agent/);
assert.match(repositoryLocales.en["repo.hint"], /project.*\.dsh\/skills/i, "仓库提示说明项目写入边界");
assert.match(repositoryLocales.zh["repo.hint"], /项目.*\.dsh\/skills/, "中文仓库提示说明项目写入边界");
assert.match(repositoryLocales.en["repo.installLocationsHint"], /User.*DSH skills or Shared Agent/);
assert.match(repositoryLocales.en["repo.installLocationsHint"], /[Pp]roject.*only.*\.dsh\/skills/);
assert.match(repositoryLocales.en["repo.installLocationsHint"], /Missing directories are created after confirmation/);
assert.match(repositoryLocales.zh["repo.installLocationsHint"], /用户目录.*DSH skills 或 Shared Agent/);
assert.match(repositoryLocales.zh["repo.installLocationsHint"], /项目.*仅.*\.dsh\/skills/);
assert.match(repositoryLocales.zh["repo.installLocationsHint"], /缺少的目录会在确认安装后创建/);
render(); flushEffects(); await settle();
assert.equal(countCalls("/repositories"), 1, "进入仓库只读取一次列表");
assert.equal(find(n => isAction(n, "repo.check")), undefined, "不再提供重复的检查更新按钮");
assert.equal(find(n => n.props["aria-label"] === "repo.search").type, Input, "仓库搜索必须使用官方输入框");
const toolbar = find(n => n.props.className === "dssm-filters");
assert.ok(toolbar, "仓库筛选和搜索必须复用全局技能的同一个 dssm-filters 工具栏");
assert.deepEqual(toolbar.children.map(n => n.props.className), ["dssm-source-filter", "dssm-status-filter", "dssm-search", "dssm-filter-actions"], "筛选在左、搜索居中、图标操作紧跟搜索");
assert.ok(toolbar.children[3].children.every(button => button.children.length === 0 && button.props.icon && button.props.title === button.props["aria-label"]), "发现技能仓库操作按钮与搜索同排且仅显示带悬停提示的图标");
assert.equal(toolbar.children[0].children[0].type, OfficialSelect);
assert.equal(toolbar.children[0].children[0].props.label, "repo.all");
assert.deepEqual(toolbar.children[0].children[0].props.options, [{ value: "", label: "repo.all" }, { value: "one", label: "example/skills" }]);
assert.equal(toolbar.children[1].children[0].type, OfficialSelect);
assert.equal(toolbar.children[1].children[0].props.label, "repo.states");
assert.deepEqual(toolbar.children[1].children[0].props.options.map(o => o.value), ["", "available", "installed", "update", "conflict", "invalid"]);
assert.equal(toolbar.children[2].type, Input);
assert.equal(toolbar.children[2].props.allowClear, true, "保留搜索清空按钮");
for (const action of toolbar.children[3].children) {
  assert.equal(action.props.type, "text", "发现页搜索旁按钮使用中性图标样式");
  assert.equal(action.props.style.backgroundColor, undefined, "发现页搜索旁按钮不设置强调底色");
  assert.equal(action.props.style.width, 28, "发现页搜索旁按钮尺寸统一");
  assert.equal(action.props.style.color, "var(--dsw-alias-label-secondary, #b9b9b9)", "发现页搜索旁按钮不使用强调色");
}
assert.equal(ui.content.children.some(n => n.props?.className === "dssm-search"), false, "搜索不再独占工具栏外的一行");
const selectSubsource = async (key) => {
  const sourceButton = find(n => n.props.className?.includes("dssm-subsource-btn") && n.children.some(child => typeof child === "string" && child.includes(key)));
  assert.ok(sourceButton, "必须找到目录来源切换按钮");
  sourceButton.props.onClick();
  render();
  await settle();
};
const sourceButtons = () => all().filter(n => n.props.className?.includes("dssm-subsource-btn"));
assert.deepEqual(sourceButtons().map(n => n.children.join("")), ["repo.subsource.github (1)", "repo.subsource.clawhub", "repo.subsource.skillsh"], "ClawHub 来源紧跟 GitHub 排在第二位");
assert.equal(catalogCalls.length, 0, "默认进入发现页不请求在线目录");
await selectSubsource("repo.subsource.skillsh");
assert.equal(catalogCalls.length, 0, "打开 skills.sh 来源不加载热门榜");
assert.equal(skillshCalls.length, 0, "未输入关键词前不查询 skills.sh");
assert.deepEqual(all().filter(n => n.props.className === "dssm-name"), [], "未查询时不显示静态或虚构技能数据");
const skillshToolbar = find(n => n.props.className === "dssm-filters dssm-catalog-filters dssm-skillsh-filters");
assert.deepEqual(skillshToolbar.children.map(n => n.props.className), ["dssm-catalog-status-filter", "dssm-search"], "skills.sh 是状态下拉加搜索，不放仓库工具栏按钮");
const skillshStatus = nodes(skillshToolbar).find(n => n.type === OfficialSelect);
assert.deepEqual(skillshStatus.props.options.map(option => option.value), ["", "available", "installed"], "skills.sh 状态筛选是未安装和已安装");
assert.equal(skillshStatus.props.options[1].label, "repo.catalog.uninstalled", "未安装使用目录文案，不复用仓库的可安装");
const skillshSearch = find(n => n.props["aria-label"] === "repo.catalog.searchSkillsh");
assert.equal(skillshSearch.type, Input, "skills.sh 使用官方输入框查询目录结果");
skillshSearch.props.onChange({ target: { value: "react" } }); render();
mock.timers.tick(300); await settle();
assert.equal(skillshCalls.length, 1, "输入关键词后调用本地安全代理查询一次");
assert.equal(skillshCalls[0].searchParams.get("q"), "react", "查询关键词正确传递");
assert.deepEqual(all().filter(n => n.props.className === "dssm-name").map(n => n.children.join("")), ["React Skill"], "列表展示 skills.sh 查询接口返回的数据");
skillshStatus.props.onChange("installed"); render();
assert.deepEqual(all().filter(n => n.props.className === "dssm-name").map(n => n.children.join("")), [], "已安装筛选排除尚未安装的 skills.sh 结果");
skillshStatus.props.onChange("available"); render();
assert.deepEqual(all().filter(n => n.props.className === "dssm-name").map(n => n.children.join("")), ["React Skill"], "未安装筛选保留尚未安装的 skills.sh 结果");
skillshStatus.props.onChange(""); render();
assert.ok(all().some(n => n.props.className === "dssm-meta-origin" && n.children.join("").includes("owner/skills · 123,456 repo.catalog.installs")), "仅显示 skills.sh 响应中的来源和安装量");
const skillshRow = all().find(n => n.props.className === "dssm-repo-row" && nodes(n).some(child => child.props.className === "dssm-name" && child.children.join("") === "React Skill"));
const skillshActions = nodes(skillshRow).filter(n => n.props["aria-label"] === "repo.detail" || n.props["aria-label"] === "repo.install");
assert.deepEqual(skillshActions.map(n => n.props["aria-label"]), ["repo.detail", "repo.install"], "skills.sh 每一行右侧是详情和安装");
assert.ok(skillshActions.every(button => button.props.icon && button.children.length === 0 && button.props.type !== "text" && button.props.size === "small" && button.props.className === "dssm-row-icon" && button.props.style.width === 22 && button.props.style.height === 22), "目录行操作使用和图2相同的描边图标按钮");
assert.match(repoSource, /\.dssm-repo-head \.dssm-repo-actions\{[^}]*gap:8px/, "发现页行内按钮间距和回收站一样是 8px");
assert.match(repoSource, /\.dssm-repo-actions>\.dssm-repo-copy-actions\{display:contents\}/, "卸载不能再套一层掉到安装位置下一行");
assert.doesNotMatch(repoSource, /\.dssm-repo-head \.dssm-repo-actions\{[^}]*align-self:flex-start/, "行内按钮和标题说明垂直居中，不贴在标题顶上");
assert.doesNotMatch(repoSource, /\.dssm-repo-row:has\(\.dssm-repo-head\)\{[^}]*padding-right:8px/, "发现页右侧留白和回收站一样，不收成 8px");
assert.match(repoSource, /\.dssm-row-icon\.ant-btn:not\(:disabled\):not\(\.dssm-icon-danger\):hover\{[^}]*--dsw-alias-link/, "行内图标悬停变蓝");
await clickNode(skillshActions[0]);
assert.deepEqual(calls.at(-1), { path: "/catalog/detail", body: { catalog: "skillsh", source: "owner/skills", skillId: "react-skill", name: "React Skill" } }, "详情读取这一条 skills.sh 技能，不订阅仓库");
assert.equal(modalNodes().find(n => n.type === Input.TextArea)?.props.value, "# React Skill", "详情展示该技能的真实说明");
assert.equal(all().some(n => n.props.className === "dssm-empty" && n.props.role === "status"), false, "不显示多余授权提示");
await selectSubsource("repo.subsource.clawhub");
assert.equal(catalogCalls.length, 1, "选择 ClawHub 后才请求第一页");
assert.equal(catalogCalls[0].searchParams.get("sort"), "downloads", "热门榜由 ClawHub 下载量排序");
assert.equal(catalogCalls[0].searchParams.get("limit"), "10", "首屏只请求一页，后续由滚动触发");
const catalogToolbar = find(n => n.props.className === "dssm-filters dssm-catalog-filters");
assert.deepEqual(catalogToolbar.children.map(n => n.props.className), ["dssm-catalog-sort-filter", "dssm-catalog-status-filter", "dssm-search"], "ClawHub 搜索和下拉在同一行");
assert.equal(find(n => n.props.className === "dssm-catalog-search-row"), undefined, "搜索不再单独占一行");
const catalogSelects = nodes(catalogToolbar).filter(n => n.type === OfficialSelect);
assert.deepEqual(catalogSelects.map(n => n.props.value), ["", ""], "目录默认热门排序且不筛选状态");
assert.deepEqual(catalogSelects[0].props.options.map(option => option.value), ["", "installs", "name"], "热门榜由下拉默认项表示，不能重复添加同名选项");
assert.equal(new Set(catalogSelects[0].props.options.map(option => option.label)).size, catalogSelects[0].props.options.length, "排序下拉的可见标签不能重复");
assert.deepEqual(catalogSelects[1].props.options.map(option => option.value), ["", "available", "installed"], "状态筛选区分可安装与已安装");
catalogSelects[1].props.onChange("installed"); render();
assert.deepEqual(all().filter(n => n.props.className === "dssm-name").map(n => n.children.join("")), ["Skill 002"], "已安装只认本次目录安装记录，不因同名本地技能点亮其他来源");
catalogSelects[1].props.onChange("available"); render();
assert.equal(all().some(n => n.props.className === "dssm-name" && n.children.join("") === "Skill 002"), false, "可安装筛选排除已安装技能");
catalogSelects[1].props.onChange(""); render();
assert.deepEqual(all().filter(n => n.props.className === "dssm-name").map(n => n.children.join("")), Array.from({ length: 10 }, (_value, index) => "Skill " + String(index + 1).padStart(3, "0")), "首屏严格显示真实 API 返回的 10 条记录");
assert.ok(all().some(n => n.props.className === "dssm-meta-origin" && n.children.join("").includes("999 repo.catalog.downloads")), "下载量直接显示 API 的真实数值");
const catalogRow = name => all().find(n => n.props.className === "dssm-repo-row" && nodes(n).some(child => child.props.className === "dssm-name" && child.children.join("") === name));
const rowActions = row => nodes(row).filter(n => n.props["aria-label"] === "repo.detail" || n.props["aria-label"] === "repo.install");
assert.deepEqual(rowActions(catalogRow("Skill 001")).map(n => n.props["aria-label"]), ["repo.detail", "repo.install"], "未安装的 ClawHub 技能行右侧是详情和安装");
assert.deepEqual(rowActions(catalogRow("Skill 002")).map(n => n.props["aria-label"]), ["repo.detail"], "已安装技能行不重复放安装按钮");
assert.equal(nodes(catalogRow("Skill 002")).find(n => n.props.className === "dssm-catalog-installed"), undefined, "已安装目录技能不再只用一行绿色文字代替副本");
assert.ok(nodes(catalogRow("Skill 002")).some(n => isAction(n, "repo.installElsewhere")), "已安装目录技能仍可安装到其他位置");
assert.ok(nodes(catalogRow("Skill 002")).some(n => n.props.className === "dssm-repo-metadata" && String(n.children.join("")).includes("repo.rootDsh")), "目录副本显示安装位置");
assert.ok(nodes(catalogRow("Skill 002")).some(n => isAction(n, "repo.uninstall")), "每个目录安装位置都可以卸载");
await clickNode(rowActions(catalogRow("Skill 001"))[0]);
assert.deepEqual(calls.at(-1), { path: "/catalog/detail", body: { catalog: "clawhub", owner: "owner-1", slug: "skill-001", name: "Skill 001" } }, "详情按作者和 slug 读取这一条 ClawHub 技能");
assert.equal(modalNodes().find(n => n.type === Input.TextArea)?.props.value, "# Skill 001", "详情展示 ClawHub 返回的技能说明");
await clickNode(rowActions(catalogRow("Skill 001"))[1]);
assert.equal(dialog()?.props.title, "repo.install", "安装沿用现有安装位置选择");
assert.equal(radio("dsh").props.checked, true, "目录安装默认仍是 DSH，不改动后续仓库安装的选择");
failInstalledRefresh = true;
failRepositoryList = true;
await clickModal("repo.install");
failInstalledRefresh = false;
failRepositoryList = false;
assert.ok(find(node => node.props.role === "status" && node.children.some(child => typeof child === "string" && child.includes("repo.catalog.installRefreshWarning"))), "目录安装成功但刷新失败时只提示刷新警告，不误报安装失败");
const catalogInstallCall = calls.findLast(c => c.path === "/catalog/install");
assert.ok(catalogInstallCall, "确认后安装这一条目录技能，不把目录订阅成仓库");
assert.equal(catalogInstallCall.body.catalog, "clawhub");
assert.equal(catalogInstallCall.body.owner, "owner-1");
assert.equal(catalogInstallCall.body.slug, "skill-001");
assert.equal(catalogInstallCall.body.root, "dsh");
assert.equal(installedCalls, 1, "目录安装完成后刷新已安装技能");
installedCalls = 0;
assert.ok(nodes(catalogRow("Skill 001")).some(n => isAction(n, "repo.installElsewhere")), "安装完成后仍可安装到其他位置");
assert.ok(nodes(catalogRow("Skill 001")).some(n => isAction(n, "repo.uninstall")), "安装完成后显示该位置的卸载");
installedCalls = 0;
await clickNode(nodes(catalogRow("Skill 001")).find(n => isAction(n, "repo.uninstall")));
failInstalledRefresh = true;
await clickModal("repo.confirmUninstall");
failInstalledRefresh = false;
assert.ok(find(node => node.props.role === "status" && node.children.some(child => typeof child === "string" && child.includes("repo.catalog.uninstallRefreshWarning"))), "卸载成功但刷新失败只能提示卸载刷新警告");
assert.equal(calls.findLast(c => c.path === "/delete").body.name, "skill-001", "刷新失败时仍按安装响应的实际落盘名卸载，而不是展示名");
assert.equal(installedCalls, 1, "目录卸载完成后刷新宿主列表和回收站");
installedCalls = 0;
const catalogSortSelect = () => nodes(find(n => n.props.className === "dssm-filters dssm-catalog-filters")).find(n => n.type === OfficialSelect && n.props.label === "repo.subsource.popular");
catalogSortSelect().props.onChange("installs"); render();
assert.equal(all().find(n => n.props.className === "dssm-name").children.join(""), "Skill 010", "安装量排序按 API 返回的真实计数排序");
catalogSortSelect().props.onChange("name"); render();
const names = all().filter(n => n.props.className === "dssm-name").map(n => n.children.join(""));
assert.deepEqual(names, [...names].sort((left, right) => left.localeCompare(right)), "名称排序按技能名称升序");
const catalogSearch = find(n => n.props["aria-label"] === "repo.catalog.searchClawhub");
assert.equal(catalogSearch.props.maxLength, 100, "ClawHub 关键词受长度限制");
catalogSearch.props.onChange({ target: { value: "gi" } }); render(); flushEffects();
mock.timers.tick(200);
catalogSearch.props.onChange({ target: { value: "gill" } }); render(); flushEffects();
mock.timers.tick(299); await settle();
assert.equal(catalogSearchCalls.length, 0, "连续输入取消旧 timer，最新输入满 300ms 前不请求");
mock.timers.tick(1); await settle();
assert.equal(catalogSearchCalls.length, 1, "输入关键词后调用 ClawHub 搜索接口，而非筛选已加载榜单");
assert.equal(catalogSearchCalls[0].searchParams.get("q"), "gill", "真实搜索接口收到完整关键词");
assert.equal(catalogSearchCalls[0].searchParams.get("limit"), "100", "ClawHub 搜索结果请求上限为 100 条");
assert.equal(catalogCalls.length, 1, "搜索不会继续分页下载榜数据");
assert.deepEqual(all().filter(n => n.props.className === "dssm-name").map(n => n.children.join("")), ["Gill Helper"], "只显示 ClawHub 关键词检索返回的真实结果，不混入联邦搜索的其他来源");
assert.ok(all().some(n => n.props.className === "dssm-meta-origin" && n.children.join("").includes("owner-gill/gill-helper · 21 repo.catalog.downloads")), "搜索结果使用 ClawHub 返回的作者和下载量");
const searchFilters = find(n => n.props.className === "dssm-filters dssm-catalog-filters");
assert.deepEqual(searchFilters.children.map(n => n.props.className), ["dssm-search"], "搜索结果模式不显示排行榜排序和状态控件");
assert.equal(all().some(n => n.type === "p" && n.children.includes("repo.subsource.catalogNote")), false, "关键词搜索时不显示下载榜标题说明");
assert.equal(catalogSearchCalls.length, 1, "输入一次只发出一次防抖搜索");
catalogSearch.props.onChange({ target: { value: "" } }); render(); await settle();
assert.deepEqual(all().filter(n => n.props.className === "dssm-name").map(n => n.children.join("")), Array.from({ length: 10 }, (_value, index) => "Skill " + String(index + 1).padStart(3, "0")), "清空关键词返回排行榜，而不是保留查询结果");
const sentinel = () => find(n => n.props.className === "dssm-catalog-sentinel");
assert.equal(catalogCalls.length, 1, "进入榜单后只自动加载第一页");
assert.doesNotMatch(repoSource, /IntersectionObserver/, "目录不再依赖观察器自动翻页");
await settle();
assert.equal(catalogCalls.length, 1, "哨兵出现在视口内不能自动连翻，必须等用户向下滚动");
const catalogWheel = (deltaY, overrides = {}) => {
  const target = {};
  const node = find(n => n.props.className === "dssm-catalog-list");
  assert.equal(typeof node.props.onWheel, "function", "滚轮监听应绑定目录列表，而不是 window");
  return node.props.onWheel({ deltaY, target, currentTarget: { contains: candidate => candidate === target }, ...overrides });
};
const savedWindow = globalThis.window;
const prepareSentinel = () => {
  sentinel().props.ref.current = { parentElement: null, getBoundingClientRect: () => ({ top: 700, bottom: 701 }) };
};
globalThis.window = { innerHeight: 800 };
prepareSentinel();
catalogWheel(24, { target: {} });
catalogWheel(24, { defaultPrevented: true });
await settle();
assert.equal(catalogCalls.length, 1, "目录外和已处理的滚轮不触发翻页");
assert.doesNotMatch(repoSource, /window\.addEventListener\(["']wheel/, "不再注册 window 级滚轮监听");
prepareSentinel();
sentinel().props.ref.current.getBoundingClientRect = () => ({ top: 1000, bottom: 1001 });
catalogWheel(24);
await settle();
assert.equal(catalogCalls.length, 1, "目录底部未接近视口时不翻页");
await click("repo.detail");
prepareSentinel();
catalogWheel(24);
await settle();
assert.equal(catalogCalls.length, 1, "详情弹窗打开时不在后台翻页");
dialog().props.onClose(); render();
prepareSentinel();
catalogWheel(-20);
await settle();
assert.equal(catalogCalls.length, 1, "向上滚动不加载下一页");
prepareSentinel(); catalogWheel(24);
render();
const loadingRow = nodes(find(n => n.props.className === "dssm-catalog-list")).find(n => n.props.className === "dssm-catalog-loading");
assert.ok(loadingRow, "继续加载显示在目录列表内部");
assert.ok(nodes(loadingRow).some(n => n.props.className === "dssm-repo-spinner"), "加载使用现有转圈，而不是列表外的纯文字");
assert.equal(loadingRow.children.some(child => child === "repo.catalog.loadingMore"), true, "继续加载保留原有文案");
await settle();
assert.equal(catalogCalls.length, 2, "一次向下滚动只再加载 10 条");
assert.equal(catalogCalls.at(-1).searchParams.get("limit"), "10");
assert.equal(catalogCalls.at(-1).searchParams.get("cursor"), "10");
const manualMore = find(node => isAction(node, "repo.catalog.loadMore"));
assert.ok(manualMore, "榜单提供可触控和键盘激活的显式下一页入口");
await clickNode(manualMore);
assert.equal(catalogCalls.length, 3, "显式加载也只加载一页，不靠自动哨兵");
for (let page = catalogCalls.length; page < 10; page++) {
  prepareSentinel(); catalogWheel(24);
  await settle();
}
assert.equal(catalogCalls.length, 10, "每次向下滚动一页，最多 10 页");
assert.equal(catalogCalls.at(-1).searchParams.get("cursor"), "90", "分页请求携带服务端 cursor");
assert.equal(all().filter(n => n.props.className === "dssm-name").length, 100, "列表最多加载真实榜单前 100 条");
assert.equal(sentinel(), undefined, "满 100 条后不再保留继续加载的滚动哨兵");
assert.equal(catalogCalls.length, 10, "达到 100 条后不再请求");
globalThis.window = savedWindow;
await selectSubsource("repo.subsource.github");

const toolbarCss = all().filter(n => n.type === "style").map(n => n.children.join("")).join("");
assert.match(toolbarCss, /\.dssm-catalog-list\{[^}]*border:1px solid var\(--dsw-alias-border-l2[^}]*border-radius:10px[^}]*background:transparent/, "目录结果列表沿用来源面板的边框、圆角与透明底色");
assert.doesNotMatch(toolbarCss, /\.dssm-repo-filters/, "删除旧仓库等宽筛选 CSS，而不是叠加覆盖");
assert.match(toolbarCss, /\.dssm-filters\.dssm-catalog-filters \.dssm-search\{flex:1 1 160px;min-width:0;max-width:none\}/, "目录搜索填满筛选下拉后的剩余宽度，不受工具栏 180px 上限");
assert.doesNotMatch(toolbarCss, /\.dssm-catalog-search-row/, "目录搜索不再单独成行");
assert.match(toolbarCss, /\.dssm-catalog-loading\{[^}]*display:flex[^}]*justify-content:center[^}]*var\(--dsw-alias-label-tertiary/, "目录加载行在列表内居中，使用次级文字色");
assert.match(toolbarCss, /\.dssm-subsources\{[^}]*margin:0[^}]*padding-bottom:6px/, "来源选项上方不再保留多余外边距");
assert.match(toolbarCss, /\.dssm-subsource-btn\.on\{[^}]*var\(--dsw-alias-bg-layer-2[^}]*var\(--dsw-alias-label-primary[^}]*var\(--dsw-alias-border-l3/, "来源选中态改用中性色");
assert.doesNotMatch(toolbarCss, /\.dssm-subsource-btn\.on\{[^}]*rgba\(59,130,246|\.dssm-subsource-btn\.on\{[^}]*#93c5fd/, "来源选中态不再显示蓝色");
assert.match(toolbarCss, /\.dssm-subsource-btn:focus-visible\{outline:2px solid var\(--dsw-alias-border-l3/, "键盘焦点保留中性色轮廓");
assert.doesNotMatch(toolbarCss, /(?:^|\n)\.dssm-(?:filters|source-filter|status-filter)(?=[\s.{:>])|(?:^|\n)\.dssm-search(?=[\s,{])/, "工具栏通用布局直接继承全局 CSS，只为目录搜索保留单独伸展规则");
// 原筛选与搜索事件保留：来源、状态和搜索可组合，且不会增加后端请求。
const beforeFilterCalls = calls.length;
find(n => n.props.label === "repo.all").props.onChange("missing"); render();
assert.equal(find(n => n.props.className === "dssm-source"), undefined, "来源筛选仍过滤仓库");
find(n => n.props.label === "repo.all").props.onChange("one"); render();
find(n => n.props.label === "repo.states").props.onChange("conflict"); render();
assert.deepEqual(all().filter(n => n.props.className === "dssm-name").map(n => n.children.join("")), ["docx"], "状态筛选仍自动展开匹配技能");
find(n => n.props["aria-label"] === "repo.search").props.onChange({ target: { value: " PDF " } }); render();
assert.equal(all().filter(n => n.props.className === "dssm-repo-row").length, 0, "搜索与状态筛选仍取交集");
find(n => n.props["aria-label"] === "repo.search").props.onChange({ target: { value: "" } }); render();
assert.equal(all().filter(n => n.props.className === "dssm-repo-row").length, 1, "清空搜索保留状态筛选");
find(n => n.props.label === "repo.states").props.onChange(""); render();
find(n => n.props.label === "repo.all").props.onChange(""); render();
assert.equal(calls.length, beforeFilterCalls, "筛选和搜索仍为本地操作");
assert.equal(find(n => n.props.className === "dssm-repo-row"), undefined, "默认折叠");
find(n => n.props["aria-expanded"] === false).props.onClick(); render();
assert.equal(all().filter(n => n.props.className === "dssm-repo-row").length, 2);
assert.notEqual(rowAction("repo.install").props.type, "primary", "安装按钮不用蓝色主按钮");
assert.ok(rowAction("repo.detail").props.icon && rowAction("repo.install").props.icon, "仓库行的详情和安装是图标");
assert.equal(rowAction("repo.detail").children.includes("repo.detail"), false, "详情不显示文字");
assert.equal(rowAction("repo.install").children.includes("repo.install"), false, "安装不显示文字");
assert.equal(toolbar.children[3].children.find(n => isAction(n, "repo.add")).props.type, "text", "搜索旁添加仓库按钮使用中性图标样式");
assert.doesNotMatch(all().filter(n => n.type === "style").map(n => n.children.join("")).join(""), /\.dssm-repo-emphasis/, "主按钮不再套灰描边");
assert.ok(rowAction("repo.conflict").props.disabled, "未跟踪的同名冲突不能卸载");
assert.equal(rowAction("repo.uninstall"), undefined);
// 服务端对每个技能都会返回 installations 数组；本地有同名技能但没有安装记录时是空数组，
// 界面仍要显示「同名冲突」并禁用安装，不能把空数组当成可安装。
repos[0].skills[1].installations = [];
render();
const conflictRow = all().filter(n => n.props.className === "dssm-repo-row").find(n => nodes(n).some(c => c.props.className === "dssm-name" && c.children.includes("docx")));
assert.ok(nodes(conflictRow).some(n => isAction(n, "repo.conflict") && n.props.disabled), "空 installations 的同名冲突仍显示同名冲突并禁用");
assert.equal(nodes(conflictRow).find(n => isAction(n, "repo.install")), undefined, "同名冲突行不显示可点的「安装」");
delete repos[0].skills[1].installations;
render();
find(n => n.props["aria-label"] === "repo.search").props.onChange({ target: { value: "PDF" } }); render();
assert.equal(all().filter(n => n.props.className === "dssm-repo-row").length, 1);
const listCalls = countCalls("/repositories");
await click("repo.detail");
assert.ok(dialog(), "详情应立即打开加载弹窗");
assert.equal(ui.content.props["aria-busy"], false, "读取详情不切换背景列表忙碌状态");
finishDetail(); await settle();
assert.equal(countCalls("/repositories"), listCalls, "只读详情不刷新背景列表");
assert.ok(modalNodes().some(n => n.type === Input.TextArea && n.props.readOnly && n.props.value === "说明"), "详情使用官方只读说明框");
dialog().props.onClose(); render();
holdRefresh = true;
await click("repo.refresh");
assert.ok(find(n => n.props.className === "dssm-repo-spinner"), "刷新过程中有动画图标");
assert.ok(find(n => n.props.role === "status" && n.children.some(c => typeof c === "string" && c.includes("example/skills"))), "刷新显示当前仓库");
finishRefresh(); await settle(); holdRefresh = false;
assert.equal(find(n => n.props.className === "dssm-repo-spinner"), undefined, "完成后停止动画");
await click("repo.manage");
const manageRow = modalNodes().find(n => n.props.className === "dssm-repo-row dssm-repo-manage-row");
const manageActions = nodes(manageRow).find(n => n.props.className === "dssm-repo-actions");
assert.ok(manageActions, "管理仓库的刷新和移除必须在标题右侧操作区");
assert.equal(manageRow.children.at(-1), manageActions, "按钮不能单独堆在说明下面");
for (const key of ["repo.refresh", "repo.remove"]) assert.ok(manageActions.children.some(n => isAction(n, key)), key + " 必须和仓库信息同一行");
assert.match(repoSource, /\.dssm-repo-manage-row\{[^}]*flex-direction:row/, "管理仓库行横向排列，按钮不能被拉成整行");
holdRefresh = true; failRefresh = true;
await clickModal("repo.refresh");
assert.ok(modalNodes().some(n => n.props.className === "dssm-repo-spinner"), "管理弹窗中的当前仓库也显示动画");
finishRefresh(); await settle(); holdRefresh = false; failRefresh = false;
assert.equal(find(n => n.props.className === "dssm-repo-spinner"), undefined, "失败后停止动画");
assert.ok(find(n => n.props.role === "alert" && n.children.includes("仓库网络失败")), "失败提示保留");
dialog().props.onClose(); render();

// Install 先打开带原生单选框的无障碍 modal；取消没有写请求。
await click("repo.install");
assert.equal(dialog().props.title, "repo.install");
assert.equal(countCalls("/repositories/install"), 0, "打开安装选择框不安装");
assert.equal(radio("dsh").props.checked, true, "默认安装到 DSH");
assert.equal(radio("agents").props.checked, false);
assert.equal(locationSelect().props.label, "dest.location", "位置下拉有名称");
assert.equal(destinationLabels().length, allowedDestinationKeys.length, "后端返回的 Codex/Claude 等位置不能出现在选择器");
assert.deepEqual(destinationLabels().map(o => o.value), allowedDestinationKeys);
assert.equal(modalNodes().some(n => n.type === "input" && n.props.type === "radio"), false, "不再使用单选框");
for (const root of configuredRoots.filter(root => allowedDestinationKeys.includes(root.key))) {
  chooseRoot(root.key);
  assert.deepEqual(pathLines(), [root.path], "路径只显示所选位置的实际配置路径：" + root.key);
}
chooseRoot("dsh");
for (const key of ["codex", "claude", "gemini", "windsurf"]) assert.equal(radio(key), undefined, "只读 Agent 目录不可选：" + key);
assert.ok(!modalNodes().some(n => n.type === "code" && n.children.some(c => c === "$DSH_HOME/skills" || c === "~/.agents/skills")), "不展示硬编码默认路径");
assert.ok(modalNodes().some(n => n.children.includes("repo.installLocationsHint")));
assert.equal(countCalls("/repositories/install"), 0, "选择位置不会提交安装");
await clickModal("repo.cancel");
assert.equal(dialog(), undefined);
assert.equal(countCalls("/repositories/install"), 0);
await click("repo.install"); chooseRoot("agents");
const installConfirm = modalAction("repo.install");
const beforeInstallList = countCalls("/repositories");
await clickNode(installConfirm);
installConfirm.props.onClick(); await settle();
assert.equal(countCalls("/repositories/install"), 1, "双击确认只安装一次");
assert.equal(ui.content.props["aria-busy"], true);
assert.ok(rowAction("repo.installing").props.disabled, "当前行应立即显示安装中并禁用");
assert.ok(modalAction("repo.installing").props.disabled);
assert.ok(allowedDestinationKeys.every(key => radio(key).props.disabled), "安装期间可选位置不可改变");
radio("dsh").props.onChange(); render();
assert.deepEqual(checkedRoots(), ["agents"], "安装期间合成事件也不能改变选中位置");
assert.ok(modalNodes().some(n => n.props.role === "status" && n.children.includes("repo.installProgress")));
dialog().props.onClose(); render(); assert.ok(dialog(), "忙碌期间不能关闭弹窗");
finishInstall(); await settle();
assert.deepEqual(calls.find(c => c.path === "/repositories/install").body, { id: "one", path: "skills/pdf", root: "agents" });
assert.equal(countCalls("/repositories"), beforeInstallList + 1, "安装完成必须 reload 仓库");
assert.equal(installedCalls, 1, "安装完成刷新宿主列表");
assert.equal(dialog(), undefined);
assert.equal(rowAction("repo.installed"), undefined, "可卸载副本不再显示禁用 Installed");
assert.ok(rowAction("repo.uninstall").props.icon, "已安装副本的卸载是图标，不是红框文字按钮");
assert.equal(rowAction("repo.uninstall").props.danger, true, "卸载图标使用红色垃圾桶，和回收站删除一致");
assert.match(String(rowAction("repo.uninstall").props.style.color), /state-error-primary/, "卸载图标颜色不能被次级灰覆盖");
assert.equal(rowAction("repo.detail").props.danger, undefined, "详情图标保持次级色");
assert.equal(rowAction("repo.uninstall").children.includes("repo.uninstall"), false, "卸载不显示文字");
assert.equal(rowAction("repo.uninstall").props.disabled, false);
const singleCopyRow = all().find(n => n.props.className === "dssm-repo-row" && nodes(n).some(c => isAction(c, "repo.uninstall")));
const singleCopyActions = nodes(singleCopyRow).find(n => n.props.className === "dssm-repo-actions");
const singleCopyLocation = nodes(singleCopyRow).find(n => n.props.className === "dssm-repo-copy");
assert.ok(singleCopyActions, "详情和再安装留在标题行");
assert.ok(nodes(singleCopyActions).some(n => isAction(n, "repo.detail")) && nodes(singleCopyActions).some(n => isAction(n, "repo.installElsewhere")), "标题行只放详情和安装到其他位置");
assert.equal(nodes(singleCopyActions).some(n => isAction(n, "repo.uninstall")), false, "卸载不留在标题行，避免和位置脱节");
assert.ok(singleCopyLocation && nodes(singleCopyLocation).some(n => isAction(n, "repo.uninstall")) && nodes(singleCopyLocation).some(n => n.props.className === "dssm-repo-metadata"), "每个安装位置和自己的卸载在同一行");
assert.match(repoSource, /\.dssm-repo-copy\{[^}]*width:100%/, "安装位置行铺满，按钮跟在该行右侧");
assert.ok(find(n => n.props.className === "dssm-repo-main").children.some(n => n.props?.role === "status" && n.children.join("").includes("repo.installSuccess")), "成功结果留在当前行");
languagePrefix = "en:"; render();
assert.ok(find(n => n.props.role === "status" && n.children.includes("en:repo.installSuccess")), "切换语言后已完成提示重新翻译");
languagePrefix = ""; render();

// Shared Agent 卸载须确认，告知跨 Agent 影响和回收站恢复。
await click("repo.uninstall");
assert.equal(countCalls("/repositories/uninstall"), 0, "打开卸载确认不删除");
assert.equal(dialog().props.title, "repo.uninstall");
assert.ok(modalNodes().some(n => n.props.className === "dssm-repo-metadata" && n.children.includes("repo.rootAgents")), "共享位置元数据显示正确名称");
assert.ok(modalNodes().some(n => n.props.role === "alert" && n.children.includes("repo.uninstallExternalWarning")));
assert.ok(modalNodes().some(n => n.children.includes("repo.uninstallHint")), "提示仅删除跟踪副本且可以恢复");
assert.ok(modalAction("repo.confirmUninstall").props.danger);
await clickModal("repo.cancel");
assert.equal(countCalls("/repositories/uninstall"), 0);
await click("repo.uninstall");
const uninstallConfirm = modalAction("repo.confirmUninstall");
const beforeUninstallList = countCalls("/repositories");
await clickNode(uninstallConfirm);
uninstallConfirm.props.onClick(); await settle();
assert.equal(countCalls("/repositories/uninstall"), 1, "双击确认只卸载一次");
assert.equal(ui.content.props["aria-busy"], true);
assert.ok(rowAction("repo.uninstalling").props.disabled && rowAction("repo.uninstalling").props.icon, "卸载中仍是禁用图标");
assert.equal(rowAction("repo.uninstalling").props.danger, true, "卸载中的垃圾桶也保持红色");
assert.ok(modalAction("repo.uninstalling").props.disabled);
assert.ok(modalNodes().some(n => n.props.role === "status" && n.children.includes("repo.uninstallProgress")));
dialog().props.onClose(); render(); assert.ok(dialog(), "卸载期间不能关闭弹窗");
finishUninstall(); await settle();
assert.deepEqual(calls.find(c => c.path === "/repositories/uninstall").body, { id: "one", path: "skills/pdf", root: "agents" }, "卸载显式指向确认的用户副本");
assert.equal(countCalls("/repositories"), beforeUninstallList + 1, "卸载完成必须 reload 仓库");
assert.equal(installedCalls, 2, "卸载完成刷新宿主列表及回收站");
assert.equal(dialog(), undefined);
assert.equal(rowAction("repo.uninstall"), undefined);
assert.equal(rowAction("repo.install").props.disabled, false, "卸载后 Install 立即恢复，无需手工刷新");
assert.ok(find(n => n.props.role === "status" && n.children.includes("repo.uninstallSuccess")));

// 记住选择；错误显示在弹窗/当前行，失败后可重试。
await click("repo.install");
assert.equal(radio("agents").props.checked, true, "后续安装记住最近位置");
chooseRoot("dsh"); failInstall = true;
const beforeFailedInstallList = countCalls("/repositories");
await clickModal("repo.install"); finishInstall(); await settle();
assert.ok(dialog(), "失败后弹窗保持打开");
assert.ok(modalNodes().some(n => n.props.role === "alert" && n.children.includes("下载超时，请重试")));
assert.ok(find(n => n.props.className === "dssm-repo-main").children.some(n => n.props?.role === "alert" && n.children.includes("下载超时，请重试")), "失败在当前行明确提示");
assert.equal(modalAction("repo.install").props.disabled, false, "失败后可以重试");
assert.equal(countCalls("/repositories"), beforeFailedInstallList);
assert.equal(installedCalls, 2, "失败的安装不报告安装完成");
failInstall = false; failInstalledRefresh = true;
await clickModal("repo.install"); finishInstall(); await settle();
assert.deepEqual(calls.filter(c => c.path === "/repositories/install").at(-1).body, { id: "one", path: "skills/pdf", root: "dsh" });
assert.equal(countCalls("/repositories"), beforeFailedInstallList + 1, "宿主刷新失败不能阻止仓库 reload");
assert.equal(rowAction("repo.uninstall").props.disabled, false);
assert.ok(find(n => n.props.role === "alert" && n.children.includes("本地列表刷新失败")));
assert.ok(find(n => n.props.className === "dssm-repo-main").children.some(n => n.props?.role === "status" && n.children.includes("repo.installSuccess")), "刷新错误不误报安装失败");
failInstalledRefresh = false;
await click("repo.uninstall");
assert.ok(!modalNodes().some(n => n.children.includes("repo.uninstallExternalWarning")), "DSH 卸载不误报共享目录影响");
failUninstall = true;
const beforeFailedUninstallList = countCalls("/repositories");
const beforeFailedUninstallCallback = installedCalls;
await clickModal("repo.confirmUninstall"); finishUninstall(); await settle();
assert.ok(modalNodes().some(n => n.props.role === "alert" && n.children.includes("回收站写入失败")));
assert.ok(find(n => n.props.className === "dssm-repo-main").children.some(n => n.props?.role === "alert" && n.children.includes("回收站写入失败")));
assert.equal(modalAction("repo.confirmUninstall").props.disabled, false);
assert.equal(rowAction("repo.uninstall").props.disabled, false);
assert.equal(countCalls("/repositories"), beforeFailedUninstallList);
assert.equal(installedCalls, beforeFailedUninstallCallback);
failUninstall = false; failInstalledRefresh = true;
await clickModal("repo.confirmUninstall"); finishUninstall(); await settle();
assert.equal(countCalls("/repositories"), beforeFailedUninstallList + 1, "宿主刷新失败也不能阻止卸载后 reload");
assert.equal(rowAction("repo.install").props.disabled, false);
assert.ok(find(n => n.props.className === "dssm-repo-main").children.some(n => n.props?.role === "status" && n.children.includes("repo.uninstallSuccess")));
failInstalledRefresh = false;

// 后端多返回的只读目录不能安装，也不能在刷新后变成可选项。
await click("repo.install");
assert.equal(radio("codex"), undefined, "刷新后 Codex 仍然不可见");
installRoots = configuredRoots.filter(root => root.key !== "agents").map(root => ({ ...root, available: root.key === "dsh" ? false : root.available }));
await click("repo.refresh");
assert.equal(radio("agents"), undefined, "reload 后消失的公共 Agent 不再可见");
assert.equal(radio("codex"), undefined, "消失的公共 Agent 不能改选 Codex");
assert.equal(destinationLabels().length, 1);
assert.equal(modalAction("repo.install").props.disabled, true, "剩余位置不可用时不能确认");
await clickModal("repo.cancel");
installRoots = structuredClone(configuredRoots); await click("repo.refresh");

// 已选公共 Agent 变为不可用时必须重置到 DSH，不能改选只读目录。
await click("repo.install"); chooseRoot("agents");
installRoots = configuredRoots.map(root => ({ ...root,
  available: root.key === "agents" ? false : root.key === "dsh" ? true : root.available,
  ...(root.key === "agents" ? { path: "/configured/rejected-agents/skills", error: { error: "Shared Agent root became unsafe" } } : {}),
}));
await click("repo.refresh");
assert.deepEqual(checkedRoots(), ["dsh"], "公共 Agent 不可用后重置到 DSH");
assert.equal(radio("agents").props.disabled, true);
assert.equal(radio("claude"), undefined);
const unavailableText = modalNodes().flatMap(n => n.children.filter(c => typeof c === "string"));
assert.ok(unavailableText.includes("Shared Agent root became unsafe"), "不可用原因写在下方");
assert.ok(pathLines().includes("/configured/rejected-agents/skills"), "不可用位置的路径写在下方");
locationSelect().props.onChange("agents"); render();
assert.deepEqual(checkedRoots(), ["dsh"], "合成事件不能重新选择变为不可用的位置");
await clickModal("repo.install");
assert.equal(calls.filter(c => c.path === "/repositories/install").at(-1).body.root, "dsh", "不提交已经不可用的公共 Agent");
finishInstall(); await settle();
await click("repo.uninstall");
assert.ok(!modalNodes().some(n => n.children.includes("repo.uninstallExternalWarning")), "回到 DSH 后不误报外部目录影响");
await clickModal("repo.confirmUninstall"); finishUninstall(); await settle();
installRoots = structuredClone(configuredRoots); await click("repo.refresh");

await click("repo.add");
find(n => n.props["aria-label"] === "repo.url").props.onChange({ target: { value: "a/b" } }); render();
await clickModal("repo.save");
assert.ok(calls.some(c => c.path.endsWith("/add") && c.body.url === "a/b"));
assert.ok(calls.some(c => c.path.endsWith("/refresh") && c.body.id === "two"));
Object.assign(repos[0].skills[0], { status: "update", tracked: true, updateAvailable: true, canRollback: true, canUninstall: true, installedRoot: "dsh" });
await click("repo.refresh");
assert.equal(rowAction("repo.uninstall").props.disabled, false, "有更新的已跟踪副本仍可卸载");
assert.ok(rowAction("repo.rollback"), "卸载按钮不替代 rollback");
await click("repo.review");
assert.ok(find(n => n.props.role === "alert" && n.children.includes("repo.modified")), "预览必须提示本地修改");
assert.ok(!calls.some(c => c.path.endsWith("/update")), "打开预览不执行更新");
await clickModal("repo.overwrite");
assert.deepEqual(calls.find(c => c.path.endsWith("/update")).body, { id: "one", path: "skills/pdf", root: "dsh", token: "checked", overwrite: true });
assert.ok(find(n => n.props.role === "status" && n.children.includes("repo.updateSuccess")), "更新后显示完成提示");
assert.equal(rowAction("repo.uninstall").props.disabled, false);
await click("repo.rollback");
assert.equal(calls.filter(c => c.path.endsWith("/preview")).at(-1).body.rollback, true);
await clickModal("repo.overwrite");
assert.ok(find(n => n.props.role === "status" && n.children.includes("repo.rollbackSuccess")), "恢复上一版保持可用");
Object.assign(repos[0].skills[0], { status: "conflict", updateAvailable: false });
await click("repo.refresh");
assert.equal(rowAction("repo.uninstall").props.disabled, false, "含本地修改的完整跟踪副本仍可卸载");
assert.ok(rowAction("repo.review"), "本地修改仍可预览更新");
await click("repo.uninstall");
assert.ok(modalNodes().some(n => n.children.includes("repo.uninstallHint")));
await clickModal("repo.cancel");
Object.assign(repos[0].skills[0], { status: "installed", canUninstall: false, installedRoot: null, canRollback: false });
await click("repo.refresh");
assert.equal(rowAction("repo.uninstall"), undefined, "缺失/不完整跟踪副本没有卸载操作");
assert.ok(rowAction("repo.installed").props.disabled);

// 从本地来源跳回仓库时，真实 hooks 同步来源、搜索及展开状态。
ui.focusSource({ id: "one" }, "docx"); render();
assert.equal(find(n => n.props.label === "repo.all").props.value, "one");
assert.equal(find(n => n.props["aria-label"] === "repo.search").props.value, "docx");
assert.equal(find(n => n.props.label === "repo.states").props.value, "");
assert.equal(all().filter(n => n.props.className === "dssm-repo-row").length, 1);
assert.ok(find(n => n.props.className === "dssm-name" && n.children.includes("docx")));
assert.equal(find(n => n.props["aria-expanded"] !== undefined).props["aria-expanded"], true);
ui.focusSource({ id: "one" }, "pdf"); render();

// 仓库提供的名称必须作为文本呈现，而不是 HTML。
Object.assign(repos[0].skills[0], { status: "available", name: '<img src=x onerror="alert(1)">', description: "PDF 文档", tracked: false });
await click("repo.refresh"); await click("repo.install");
assert.ok(modalNodes().some(n => n.props.className === "dssm-name" && n.children.includes(repos[0].skills[0].name)));
assert.ok(!all().some(n => n.type === "img" || n.props.dangerouslySetInnerHTML), "不使用危险 HTML 渲染仓库文本");
await clickModal("repo.cancel");

// 全新 mount：缺少目的地字段、空列表或全部不可用时不能确认安装。
for (const roots of [undefined, [], configuredRoots.map(root => ({ ...root, available: false, error: { error: "Root unavailable" } }))]) {
  installRoots = roots;
  resetMount();
  render(); flushEffects(); await settle();
  find(n => n.props["aria-expanded"] === false).props.onClick(); render();
  const beforeInstall = countCalls("/repositories/install");
  await click("repo.install");
  const allowed = (roots || []).filter(root => allowedDestinationKeys.includes(root.key));
  assert.equal(destinationLabels().length, allowed.length, "没有允许的后端位置时不制造默认目录，也不展示只读目录");
  assert.equal(modalAction("repo.install").props.disabled, true, "没有可用位置时确认按钮禁用");
  modalAction("repo.install").props.onClick(); await settle();
  assert.equal(countCalls("/repositories/install"), beforeInstall, "合成确认也不能提交不可用目的地");
  assert.ok(!modalNodes().some(n => n.type === "input" && n.props.type === "radio" && n.props.checked && !n.props.disabled));
  if (allowed.length) {
    assert.ok(allowed.every(root => radio(root.key).props.disabled));
    for (const root of allowed) radio(root.key).props.onChange();
    render();
    assert.equal(modalAction("repo.install").props.disabled, true, "合成选择不能绕过全部位置禁用");
  }
  assert.equal(radio("codex"), undefined);
  await clickModal("repo.cancel");
  assert.equal(countCalls("/repositories/install"), beforeInstall, "无可用目的地不发出写请求");
}
repos[0].error = { code: "error.repo.invalid", params: { path: "C:/bad" }, error: "EACCES: permission denied, open C:/bad" };
installRoots = structuredClone(configuredRoots);
await click("repo.refresh");
assert.ok(all().some(n => n.props.role === "alert" && n.children.includes("已翻译的仓库错误 · C:/bad")), "中文 invalid 诊断也必须走统一翻译并保留有用参数");
assert.equal(all().some(n => n.children.includes(repos[0].error.error)), false, "不能用英文系统原文覆盖中文翻译");
delete repos[0].error;
hostLocale = "en-GB";
repos[0].refreshedAt = "2026-09-12T13:04:05Z";
await click("repo.refresh"); await click("repo.manage");
assert.ok(modalNodes().some(n => n.children.includes("repo.updated · " + new Date(repos[0].refreshedAt).toLocaleString("en-GB"))), "仓库刷新日期使用有效宿主 en-GB，不被词典区域覆盖");
dialog().props.onClose(); render();

// 多副本同一技能：两个用户目标、两个项目和未登记项目分别有独立管理动作。
workspaceRows = [
  { name: "alpha", path: "D:/work/alpha", projectRoot: "D:/work/alpha", registeredPaths: ["D:/work/alpha/packages/web"], available: true, skillCount: 1 },
  { name: "beta", path: "D:/work/beta", projectRoot: "D:/work/beta", registeredPaths: ["D:/work/beta/sub"], available: true, skillCount: 1 },
];
const copy = (installedRoot, installedWorkspace) => ({ installedRoot, ...(installedWorkspace ? { installedWorkspace } : {}), tracked: true, status: "update", updateAvailable: true, canRollback: true, canUninstall: true });
Object.assign(repos[0].skills[0], { name: "pdf", status: "update", installedRoot: "dsh", tracked: true, canUninstall: true, installations: [copy("dsh"), copy("agents"), copy("dsh", "d:/WORK/alpha/"), copy("dsh", "D:/work/beta"), copy("dsh", "D:/gone"), { installedRoot: "dsh", installedWorkspace: "D:/missing", tracked: false, status: "available", canUninstall: false }] });
await click("repo.refresh");
const copies = () => all().filter(n => n.props.className === "dssm-repo-copy");
assert.equal(copies().length, 5, "文件已不在的安装记录不能再显示成已安装位置");
const installedRow = all().find(n => n.props.className === "dssm-repo-row" && nodes(n).some(c => c.props.className === "dssm-repo-copy"));
assert.equal(nodes(installedRow).find(n => n.props.className === "dssm-repo-main").children.some(n => n?.props?.className === "dssm-repo-copies"), false, "已安装位置不塞进文字列，才能和右侧图标对齐");
const copyCss = all().filter(n => n.type === "style").map(n => n.children.join("")).join("");
assert.doesNotMatch(copyCss, /\.dssm-repo-copy\{[^}]*border:1px/, "已安装副本不再套一层卡片边框");
assert.match(copyCss, /\.dssm-repo-copy\{[^}]*background:transparent/, "已安装副本透出技能行底色");
assert.match(copyCss, /\.dssm-repo-row\{[^}]*flex-direction:column/, "技能行分成标题区和安装位置行");
assert.match(copyCss, /\.dssm-repo-copy-actions\{[^}]*margin-left:auto/, "卸载图标贴齐行右缘");
for (const node of copies().slice(0, 4)) {
  for (const action of ["repo.review", "repo.rollback", "repo.uninstall"]) assert.equal(nodes(node).find(n => isAction(n, action)).props.disabled, false, "每个目标都有独立按钮");
}
for (const action of ["repo.review", "repo.rollback", "repo.uninstall"]) {
  const orphanAction = nodes(copies()[4]).find(n => isAction(n, action));
  assert.equal(orphanAction.props.disabled, true, "没有登记路径的项目不能管理");
  const before = calls.length;
  orphanAction.props.onClick(); await settle();
  assert.equal(calls.length, before, "合成事件也不允许退回用户级管理");
}
assert.ok(nodes(copies()[4]).some(n => n.children.includes("repo.destinationUnavailable")), "无法管理的原因必须有双语提示");
const copyAction = (index, key) => nodes(copies()[index]).find(n => isAction(n, key));
const targets = [{ root: "dsh" }, { root: "agents" }, { workspace: "D:/work/alpha/packages/web" }, { workspace: "D:/work/beta/sub" }];
for (let index = 0; index < targets.length; index++) {
  await clickNode(copyAction(index, "repo.review"));
  assert.deepEqual(calls.filter(c => c.path === "/repositories/preview").at(-1).body, { id: "one", path: "skills/pdf", ...targets[index], rollback: false });
  await clickModal("repo.overwrite");
  assert.deepEqual(calls.filter(c => c.path === "/repositories/update").at(-1).body, { id: "one", path: "skills/pdf", ...targets[index], token: "checked", overwrite: true });
  await clickNode(copyAction(index, "repo.rollback"));
  assert.deepEqual(calls.filter(c => c.path === "/repositories/preview").at(-1).body, { id: "one", path: "skills/pdf", ...targets[index], rollback: true });
  await clickModal("repo.overwrite");
  assert.deepEqual(calls.filter(c => c.path === "/repositories/rollback").at(-1).body, { id: "one", path: "skills/pdf", ...targets[index], token: "checked", overwrite: true });
  await clickNode(copyAction(index, "repo.uninstall")); await clickModal("repo.confirmUninstall");
  assert.deepEqual(calls.filter(c => c.path === "/repositories/uninstall").at(-1).body, { id: "one", path: "skills/pdf", ...targets[index] });
  finishUninstall(); await settle();
}
await click("repo.installElsewhere");
const scopeSelect = modalNodes().find(n => n.props.label === "dest.scope");
scopeSelect.props.onChange("workspace"); render();
assert.equal(modalAction("repo.install").props.disabled, true, "另一位置安装仍不预选项目");
const workspaceSelect = modalNodes().find(n => n.props.label === "dest.workspace");
workspaceSelect.props.onChange("D:/work/beta/sub"); render();
await clickModal("repo.install");
assert.deepEqual(calls.filter(c => c.path === "/repositories/install").at(-1).body, { id: "one", path: "skills/pdf", workspace: "D:/work/beta/sub" }, "已安装技能还能指定另一项目，冲突由服务端处理");
finishInstall(); await settle();
// 未知旧身份不猜安装位置：两种目录行均保留显式重关联安装入口。
mockCatalogUnknownIds = ["clawhub:owner-3/skill-003", "skillsh:owner/skills/react-skill", "clawhub:not-loaded/old"];
mockCatalogWarnings = [{ id: "clawhub:broken/recovery", code: "error.repo.installState", error: "恢复记录失败" }];
resetMount(); render(); flushEffects(); await settle();
assert.ok(find(n => n.props.role === "alert" && n.children.join("").includes("clawhub:broken/recovery") && n.children.join("").includes("恢复记录失败")), "恢复诊断必须可见且保留身份和错误");
assert.ok(find(n => n.props.role === "status" && n.children.includes("repo.catalog.unknownHint")), "未知身份即使未加载到目录行也有简短提示");
await selectSubsource("repo.subsource.clawhub");
assert.ok(nodes(catalogRow("Skill 003")).some(n => n.children.includes("repo.catalog.unknownLocation")), "ClawHub 旧身份标注位置未知");
assert.ok(nodes(catalogRow("Skill 003")).some(n => isAction(n, "repo.catalog.reassociate") && !n.props.disabled), "未知身份保留显式重关联安装入口");
assert.equal(nodes(catalogRow("Skill 003")).some(n => n.children.includes("repo.installed")), false, "未知身份不能冒充已定位安装");
await clickNode(nodes(catalogRow("Skill 003")).find(n => isAction(n, "repo.catalog.reassociate")));
assert.ok(dialog() && locationSelect(), "重关联必须先选择明确安装位置");
await clickModal("repo.cancel");
await selectSubsource("repo.subsource.skillsh");
find(n => n.props["aria-label"] === "repo.catalog.searchSkillsh").props.onChange({ target: { value: "react" } }); render();
mock.timers.tick(300); await settle();
assert.ok(nodes(catalogRow("React Skill")).some(n => n.children.includes("repo.catalog.unknownLocation")), "skills.sh 旧身份标注位置未知");
assert.ok(nodes(catalogRow("React Skill")).some(n => isAction(n, "repo.catalog.reassociate") && !n.props.disabled), "skills.sh 未知身份也保留重关联");
mockCatalogUnknownIds = []; mockCatalogWarnings = [];
// 榜单失败后，经关键词搜索再清空，必须重试榜单而不是保留旧错误态。
resetMount(); render(); flushEffects(); await settle();
failCatalogRanking = true;
await selectSubsource("repo.subsource.clawhub");
const failedRankingCalls = catalogCalls.length;
failCatalogRanking = false;
find(n => n.props["aria-label"] === "repo.catalog.searchClawhub").props.onChange({ target: { value: "gill" } }); render();
mock.timers.tick(300); await settle();
find(n => n.props["aria-label"] === "repo.catalog.searchClawhub").props.onChange({ target: { value: "" } }); render(); await settle();
assert.equal(catalogCalls.length, failedRankingCalls + 1, "清空搜索使用新关键词状态重试失败的榜单");
assert.equal(all().filter(n => n.props.className === "dssm-repo-row").length, 10, "清空后恢复真实榜单第一页");
// 通过真实 effect 依赖切换及卸载执行 cleanup，不手调生产取消函数。
for (const kind of ["list", "clawhub", "skillsh"]) {
  for (const exit of ["source", "inactive", "unmount"]) {
    resetMount(); render(); flushEffects(); await settle();
    holdCatalogPath = kind === "list" ? "/clawhub/list" : kind === "clawhub" ? "/clawhub/search" : "/skills-sh/search";
    pendingCatalog = [];
    await selectSubsource(kind === "skillsh" ? "repo.subsource.skillsh" : "repo.subsource.clawhub");
    if (kind !== "list") {
      find(n => n.props["aria-label"] === (kind === "skillsh" ? "repo.catalog.searchSkillsh" : "repo.catalog.searchClawhub")).props.onChange({ target: { value: "held" } });
      render(); mock.timers.tick(300); await settle();
    }
    const old = pendingCatalog.at(-1);
    assert.ok(old, "必须启动真实请求");
    if (exit === "source") await selectSubsource("repo.subsource.github");
    else if (exit === "inactive") { active = false; render(); flushEffects(); await settle(); }
    else unmount();
    assert.equal(old.signal?.aborted, true, `${kind}/${exit} 必须 abort`);
    if (exit === "unmount") { values = []; dependencies = []; active = true; render(); flushEffects(); await settle(); }
    else { active = true; render(); flushEffects(); await settle(); }
    await selectSubsource("repo.subsource.github");
    await selectSubsource(kind === "skillsh" ? "repo.subsource.skillsh" : "repo.subsource.clawhub");
    mock.timers.tick(300); await settle();
    if (exit === "unmount" && kind !== "list") {
      find(n => n.props["aria-label"] === (kind === "skillsh" ? "repo.catalog.searchSkillsh" : "repo.catalog.searchClawhub")).props.onChange({ target: { value: "held" } }); render();
      mock.timers.tick(300); await settle();
    }
    const fresh = pendingCatalog.at(-1);
    assert.notEqual(fresh, old, "旧请求不能阻挡重新进入");
    old.resolve(kind === "list" ? { items: [{ ownerHandle: "stale", slug: "stale", displayName: "STALE" }], nextCursor: "bad" } : kind === "skillsh" ? { skills: [{ id: "stale", name: "STALE", source: "stale", skillId: "stale" }] } : { results: [{ ownerHandle: "stale", slug: "stale", displayName: "STALE" }] });
    await settle();
    assert.equal(all().some(n => n.children.includes("STALE")), false, "陈旧响应不可更新列表");
    assert.equal(fresh.signal.aborted, false, "陈旧 finally 不可取消新请求");
    assert.ok(find(n => n.props.role === "status" && n.children.includes(kind === "list" ? "repo.catalog.loading" : kind === "skillsh" ? "repo.catalog.skillshLoading" : "repo.catalog.searchLoading")), "陈旧 finally 不可清除新请求的加载状态");
    holdCatalogPath = "";
    fresh.resolve(kind === "list" ? { items: [], nextCursor: null } : kind === "skillsh" ? { skills: [] } : { results: [] });
    await settle();
  }
}
for (const kind of ["clawhub", "skillsh"]) {
  for (const exit of ["source", "inactive", "unmount"]) {
    resetMount(); render(); flushEffects(); await settle();
    await selectSubsource(kind === "skillsh" ? "repo.subsource.skillsh" : "repo.subsource.clawhub");
    const before = kind === "skillsh" ? skillshCalls.length : catalogSearchCalls.length;
    find(n => n.props["aria-label"] === (kind === "skillsh" ? "repo.catalog.searchSkillsh" : "repo.catalog.searchClawhub")).props.onChange({ target: { value: "cancel-timer" } }); render();
    if (exit === "source") await selectSubsource("repo.subsource.github");
    else if (exit === "inactive") { active = false; render(); flushEffects(); }
    else unmount();
    mock.timers.tick(300);
    assert.equal(kind === "skillsh" ? skillshCalls.length : catalogSearchCalls.length, before, `${kind}/${exit} 必须清理防抖 timer`);
  }
}
unmount();
mock.timers.reset();
console.log("仓库界面及目录生命周期专项测试通过");
