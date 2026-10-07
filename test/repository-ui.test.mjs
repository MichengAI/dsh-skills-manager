// 验证真实 hooks/事件的筛选、折叠、安装位置选择、回收站卸载和更新行为。
import assert from "node:assert/strict";
import { createRepositoryUI, repositoryLocales } from "../src/repository-ui.ts";
let values = [], cursor = 0, effects = [], dependencies = [];
const react = {
  createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity).filter((v) => v != null && typeof v !== "boolean") }; },
  useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], (v) => { values[i] = typeof v === "function" ? v(values[i]) : v; }]; },
  useRef(initial) { const i = cursor++; return values[i] || (values[i] = { current: initial }); },
  useEffect(fn, deps) { const i = cursor++; if (!dependencies[i] || deps.some((v, n) => dependencies[i][n] !== v)) { effects.push(fn); dependencies[i] = deps; } },
};
const repos = [{ id: "one", owner: "example", name: "skills", skills: [
  { path: "skills/pdf", name: "pdf", description: "PDF 文档", status: "available", installedRoot: null, canUninstall: false },
  { path: "skills/docx", name: "docx", description: "Word 文档", status: "conflict", installedRoot: null, canUninstall: false },
] }];
const calls = [];
let finishInstall, finishUninstall;
let failInstall = false, failUninstall = false;
let finishRefresh, finishDetail;
let holdRefresh = false, failRefresh = false;
let installedCalls = 0, failInstalledRefresh = false;
const api = async (path, options) => {
  const body = options?.body ? JSON.parse(options.body) : undefined;
  calls.push({ path, body });
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
  return structuredClone({ repositories: repos });
};
const Input = Symbol("官方输入框");
const Button = Symbol("官方按钮");
const isAction = (node, key) => (node.type === "button" || node.type === Button) && node.children.includes(key);
const useUI = createRepositoryUI({ react, Modal: "modal", Input, Button, SourceSelect: Symbol("官方筛选"), api, headers: {}, translateError: (_t, e) => e.error || e.message });
let languagePrefix = "";
const t = (key) => languagePrefix + key;
let ui;
function render() { cursor = 0; ui = useUI({ active: true, t, onInstalled: async () => { installedCalls++; if (failInstalledRefresh) throw new Error("本地列表刷新失败"); } }); }
function nodes(node) { return !node || typeof node !== "object" ? [] : [node, ...node.children.flatMap(nodes)]; }
const all = () => [...nodes(ui.actions), ...nodes(ui.content)];
const find = (predicate) => all().find(predicate);
const dialog = () => find(n => n.type === "modal");
const modalNodes = () => nodes(dialog());
const modalAction = key => modalNodes().find(n => isAction(n, key));
const rowAction = key => all().filter(n => n.props.className === "dssm-repo-row").flatMap(nodes).find(n => isAction(n, key));
const countCalls = path => calls.filter(call => call.path === path).length;
const settle = async () => { await new Promise(setImmediate); render(); };
const clickNode = async node => { assert.ok(node, "必须找到可点击元素"); assert.ok(!node.props.disabled, "真实点击不能触发禁用按钮"); node.props.onClick(); await settle(); };
const click = key => clickNode(find(n => isAction(n, key)));
const clickModal = key => clickNode(modalAction(key));
const radio = root => modalNodes().find(n => n.type === "input" && n.props.type === "radio" && n.props.value === root);
const chooseRoot = root => { radio(root).props.onChange(); render(); };

assert.deepEqual(Object.keys(repositoryLocales.en).sort(), Object.keys(repositoryLocales.zh).sort(), "中英文词条必须同步");
for (const locale of Object.values(repositoryLocales)) {
  assert.ok(locale["repo.hint"].includes("DSH skills") && locale["repo.hint"].includes("Shared Agent"), "全局提示必须介绍两个安装位置");
  assert.ok(locale["repo.uninstallSuccess"] && locale["repo.uninstallSharedWarning"]);
}
render(); effects.splice(0).forEach((f) => f()); await settle();
assert.equal(countCalls("/repositories"), 1, "进入仓库只读取一次列表");
assert.equal(find(n => isAction(n, "repo.check")), undefined, "不再提供重复的检查更新按钮");
assert.equal(find(n => n.props["aria-label"] === "repo.search").type, Input, "仓库搜索必须使用官方输入框");
assert.equal(find(n => n.props.className === "dssm-repo-row"), undefined, "默认折叠");
find(n => n.props["aria-expanded"] === false).props.onClick(); render();
assert.equal(all().filter(n => n.props.className === "dssm-repo-row").length, 2);
assert.ok(rowAction("repo.conflict").props.disabled, "未跟踪的同名冲突不能卸载");
assert.equal(rowAction("repo.uninstall"), undefined);
find(n => n.props["aria-label"] === "repo.search").props.onChange({ target: { value: "PDF" } }); render();
assert.equal(all().filter(n => n.props.className === "dssm-repo-row").length, 1);
const listCalls = countCalls("/repositories");
await click("repo.detail");
assert.ok(dialog(), "详情应立即打开加载弹窗");
assert.equal(ui.content.props["aria-busy"], false, "读取详情不切换背景列表忙碌状态");
finishDetail(); await settle();
assert.equal(countCalls("/repositories"), listCalls, "只读详情不刷新背景列表");
dialog().props.onClose(); render();
holdRefresh = true;
await click("repo.refresh");
assert.ok(find(n => n.props.className === "dssm-repo-spinner"), "刷新过程中有动画图标");
assert.ok(find(n => n.props.role === "status" && n.children.some(c => typeof c === "string" && c.includes("example/skills"))), "刷新显示当前仓库");
finishRefresh(); await settle(); holdRefresh = false;
assert.equal(find(n => n.props.className === "dssm-repo-spinner"), undefined, "完成后停止动画");
await click("repo.manage");
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
assert.ok(modalNodes().find(n => n.type === "fieldset").children.some(n => n.type === "legend" && n.children.includes("repo.installDestination")), "单选组有名称");
assert.equal(modalNodes().filter(n => n.type === "label" && nodes(n).some(child => child.type === "input")).length, 2, "两个选项有可点击 label");
assert.ok(modalNodes().some(n => n.type === "code" && n.children.includes("$DSH_HOME/skills")));
assert.ok(modalNodes().some(n => n.type === "code" && n.children.includes("~/.agents/skills")));
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
assert.ok(radio("dsh").props.disabled && radio("agents").props.disabled, "安装期间不可改变位置");
assert.ok(modalNodes().some(n => n.props.role === "status" && n.children.includes("repo.installProgress")));
dialog().props.onClose(); render(); assert.ok(dialog(), "忙碌期间不能关闭弹窗");
finishInstall(); await settle();
assert.deepEqual(calls.find(c => c.path === "/repositories/install").body, { id: "one", path: "skills/pdf", root: "agents" });
assert.equal(countCalls("/repositories"), beforeInstallList + 1, "安装完成必须 reload 仓库");
assert.equal(installedCalls, 1, "安装完成刷新宿主列表");
assert.equal(dialog(), undefined);
assert.equal(rowAction("repo.installed"), undefined, "可卸载副本不再显示禁用 Installed");
assert.ok(rowAction("repo.uninstall").props.danger, "卸载按钮为红色 danger");
assert.equal(rowAction("repo.uninstall").props.disabled, false);
assert.ok(find(n => n.props.className === "dssm-repo-main").children.some(n => n.props?.role === "status" && n.children.join("").includes("repo.installSuccess")), "成功结果留在当前行");
languagePrefix = "en:"; render();
assert.ok(find(n => n.props.role === "status" && n.children.includes("en:repo.installSuccess")), "切换语言后已完成提示重新翻译");
languagePrefix = ""; render();

// Shared Agent 卸载须确认，告知跨 Agent 影响和回收站恢复。
await click("repo.uninstall");
assert.equal(countCalls("/repositories/uninstall"), 0, "打开卸载确认不删除");
assert.equal(dialog().props.title, "repo.uninstall");
assert.ok(modalNodes().some(n => n.props.role === "alert" && n.children.includes("repo.uninstallSharedWarning")));
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
assert.ok(rowAction("repo.uninstalling").props.disabled && rowAction("repo.uninstalling").props.danger);
assert.ok(modalAction("repo.uninstalling").props.disabled);
assert.ok(modalNodes().some(n => n.props.role === "status" && n.children.includes("repo.uninstallProgress")));
dialog().props.onClose(); render(); assert.ok(dialog(), "卸载期间不能关闭弹窗");
finishUninstall(); await settle();
assert.deepEqual(calls.find(c => c.path === "/repositories/uninstall").body, { id: "one", path: "skills/pdf" }, "卸载不接受客户端目录选择");
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
assert.ok(!modalNodes().some(n => n.children.includes("repo.uninstallSharedWarning")), "DSH 卸载不误报共享目录影响");
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
assert.deepEqual(calls.find(c => c.path.endsWith("/update")).body, { id: "one", path: "skills/pdf", token: "checked", overwrite: true });
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

// 仓库提供的名称必须作为文本呈现，而不是 HTML。
Object.assign(repos[0].skills[0], { status: "available", name: '<img src=x onerror="alert(1)">', description: "PDF 文档", tracked: false });
await click("repo.refresh"); await click("repo.install");
assert.ok(modalNodes().some(n => n.props.className === "dssm-name" && n.children.includes(repos[0].skills[0].name)));
assert.ok(!all().some(n => n.type === "img" || n.props.dangerouslySetInnerHTML), "不使用危险 HTML 渲染仓库文本");
await clickModal("repo.cancel");
console.log("仓库界面折叠、搜索、安装位置、回收站卸载、错误重试、更新与恢复测试通过");
