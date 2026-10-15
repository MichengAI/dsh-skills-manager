// 目标选择器：用户目录默认、工作区必须点选、位置随范围联动，三个入口共用。
import assert from "node:assert/strict";
import { createDestinationPicker, destinationCss, destinationLocales, destinationPayload, destinationReady } from "../src/destination-picker.ts";

let values = [], cursor = 0;
const react = {
  createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity).filter((v) => v != null && typeof v !== "boolean") }; },
  useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], (v) => { values[i] = typeof v === "function" ? v(values[i]) : v; }]; },
};
const SourceSelect = Symbol("官方选择框");
const t = (key, params) => (destinationLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, n) => String(params?.[n] ?? ""));
const picker = createDestinationPicker({ react, SourceSelect, translateError: (_t, error) => error.error || error.message });
const workspaces = [
  { name: "alpha", path: "D:\\work\\alpha", registeredPaths: ["D:\\work\\alpha"], available: true, skillCount: 2 },
  { name: "beta", path: "D:\\work\\beta", registeredPaths: ["D:\\work\\beta"], available: true, skillCount: 0 },
  { name: "ghost", path: "D:\\work\\ghost", registeredPaths: ["D:\\work\\ghost"], available: false, skillCount: 0 },
];
const user = [
  { key: "dsh", path: "C:\\Users\\me\\.dsh\\skills", available: true, label: "DSH" },
  { key: "agents", path: "C:\\Users\\me\\.agents\\skills", available: true, label: "Shared" },
];
let selection = { scope: "user", location: "dsh", workspace: "" };
const change = (next) => { selection = { ...selection, ...next }; };
const nodes = (node) => (!node || typeof node !== "object" ? [] : [node, ...node.children.flatMap(nodes)]);
const render = (extra = {}) => { cursor = 0; return picker({ t, value: selection, onChange: change, workspaces, userDestinations: user, allowAgents: true, ...extra }); };
// SourceSelect 的 label 就是它的可访问名称。
const byLabel = (tree, label) => nodes(tree).find((n) => n.props.label === label);
const text = (tree) => nodes(tree).flatMap((n) => n.children.filter((c) => typeof c === "string")).join("|");

// 1. 语言包：中英文词条同步，且不出现「添加工作区」入口。
assert.deepEqual(Object.keys(destinationLocales.en).sort(), Object.keys(destinationLocales.zh).sort());
for (const locale of Object.values(destinationLocales)) assert.equal(Object.keys(locale).some((key) => /add/i.test(key)), false, "下拉里不提供添加工作区");

// 1b. 写入表单不是紧凑筛选栏：两列等宽，下拉铺满，实际路径保留独立框。
const rule = (selector) => destinationCss.slice(destinationCss.indexOf(selector + "{") + selector.length + 1).split("}")[0];
assert.match(rule(".dssm-destination-pair"), /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "两个下拉的表单列必须等宽");
const selectRule = rule(".dssm-destination-pair .dssm-antd-select");
assert.match(selectRule, /(?:^|;)width:100%(?:;|$)/, "目标下拉必须铺满各自列，不能按文字收缩");
assert.match(selectRule, /min-width:0(?:;|$)/, "长工作区名称不能撑破表单列");
const pathRule = rule(".dssm-destination-path");
assert.match(pathRule, /padding:8px 10px/, "路径框保留内边距");
assert.match(pathRule, /border:0\.5px solid/, "路径框采用官方发丝线边框");
assert.match(pathRule, /border-radius:var\(--dsw-radius-lg,16px\)/, "路径框采用官方嵌套内容圆角");
assert.match(pathRule, /background:var\(--dsw-alias-bg-layer-1/, "路径框使用宿主背景令牌");

// 2. 默认：用户目录、DSH，路径来自后端配置，不写死。
let tree = render();
assert.ok(text(tree).includes("C:\\Users\\me\\.dsh\\skills"), "展示配置的实际路径");
assert.equal(text(tree).includes("仅供 DSH 使用"), false, "位置只显示路径，不附加说明");
assert.equal(nodes(tree).some((n) => n.type === "input"), false, "不再使用单选框，二级选择器统一为下拉");
const pair = nodes(tree).find((n) => n.props.className === "dssm-destination-pair");
assert.deepEqual(pair.children.map((c) => c.children.find((x) => x.type === SourceSelect).props.label), [t("dest.scope"), t("dest.location")], "范围在左，位置在右，同一行");
const locationSelect = byLabel(tree, t("dest.location"));
assert.equal(locationSelect.type, SourceSelect, "位置使用官方下拉");
assert.deepEqual(locationSelect.props.options.map((o) => [o.value, o.label]), [["dsh", "DSH skills"], ["agents", "Shared Agent"]]);
assert.equal(locationSelect.props.value, "dsh");
assert.deepEqual(nodes(tree).filter((n) => n.type === "code").map((n) => n.children.join("")), ["C:\\Users\\me\\.dsh\\skills"], "路径只显示所选位置的一行");
assert.equal(byLabel(tree, t("dest.workspace")), undefined, "用户目录时不出现工作区下拉");
assert.equal(destinationReady(selection, workspaces), true);
assert.equal(destinationReady({ scope: "user", location: "dsh", workspace: "" }, workspaces, [{ key: "dsh", path: "C:/u/.dsh/skills", available: false }]), false, "用户位置不可用时不能提交");
assert.equal(destinationReady({ scope: "user", location: "agents", workspace: "" }, workspaces, [{ key: "dsh", path: "C:/u/.dsh/skills", available: false }, { key: "agents", path: "C:/u/.agents/skills", available: true }]), true, "换到可用的用户位置后可以提交");
assert.deepEqual(destinationPayload(selection), { root: "dsh" }, "用户目录显式带 root，且不带 workspace");

// 3. 切到指定工作区：出现下拉，不预选，当前会话不自动写入；未选时不可提交。
const scope = byLabel(tree, t("dest.scope"));
scope.props.onChange("workspace"); tree = render();
assert.equal(selection.scope, "workspace");
assert.equal(selection.workspace, "", "不预选任何工作区");
assert.equal(byLabel(tree, t("dest.location")), undefined, "工作区下右侧是工作区下拉，没有位置下拉");
const pair2 = nodes(tree).find((n) => n.props.className === "dssm-destination-pair");
assert.deepEqual(pair2.children.map((c) => c.children.find((x) => x.type === SourceSelect).props.label), [t("dest.scope"), t("dest.workspace")], "工作区下拉替换在范围右侧同一位置");
const dropdown = byLabel(tree, t("dest.workspace"));
assert.equal(dropdown.type, SourceSelect, "使用官方筛选组件");
assert.deepEqual(dropdown.props.options.map((o) => o.value), ["", "D:\\work\\alpha", "D:\\work\\beta", "D:\\work\\ghost"]);
assert.deepEqual(dropdown.props.options.slice(1, 3).map((o) => o.label), ["alpha", "beta"], "下拉里只显示工作区名称，不带路径");
const twin = picker({ t, value: { scope: "workspace", location: "dsh", workspace: "" }, onChange: change, workspaces: [
  { name: "app", path: "D:\\a\\app", registeredPaths: ["D:\\a\\app"], available: true, skillCount: 0 },
  { name: "app", path: "D:\\b\\app", registeredPaths: ["D:\\b\\app"], available: true, skillCount: 0 },
  { name: "solo", path: "D:\\c\\solo", registeredPaths: ["D:\\c\\solo"], available: true, skillCount: 0 },
], userDestinations: user, allowAgents: true });
assert.deepEqual(byLabel(twin, t("dest.workspace")).props.options.slice(1).map((o) => o.label), ["app · D:\\a\\app", "app · D:\\b\\app", "solo"], "只有重名时才附路径用来区分");
assert.equal(dropdown.props.options.find((o) => o.value === "D:\\work\\ghost").disabled, true, "失效路径不可选");
assert.equal(destinationReady(selection, workspaces), false, "未选择工作区不能提交");
assert.ok(text(tree).includes("dest.pickFirst") || text(tree).includes("先选择"), "未选时提示先选择");
assert.equal(text(tree).includes("D:\\work\\alpha\\.dsh"), false, "未选时不显示将写入的项目路径");

// 4. 点选后：路径预览是项目 .dsh/skills，不提供 Shared Agent 选项并说明边界。
dropdown.props.onChange("D:\\work\\alpha"); tree = render();
assert.equal(selection.workspace, "D:\\work\\alpha");
assert.equal(destinationReady(selection, workspaces), true);
const pathCodes = () => nodes(tree).filter((n) => n.type === "code").map((n) => n.children.join(""));
assert.deepEqual(pathCodes(), ["D:\\work\\alpha\\.dsh\\skills"], "位置只显示项目 .dsh/skills 路径，且只出现一次");
assert.deepEqual(destinationPayload(selection), { workspace: "D:\\work\\alpha" });
assert.equal(byLabel(tree, t("dest.location")), undefined, "工作区没有位置下拉，也就没有 Shared Agent 选项");
assert.ok(text(tree).includes("工作区只支持"), "用一句话说明为什么没有 Shared Agent");
assert.ok(text(tree).includes("可能被提交到仓库"), "提示项目文件可能进入仓库");

// 4b. 用户目录下后端标为不可用的位置：下拉里置灰，合成事件也不能选中，原因写在下方。
selection = { scope: "user", location: "dsh", workspace: "" };
const broken = picker({ t, value: selection, onChange: change, workspaces, userDestinations: [user[0], { ...user[1], available: false, error: { error: "目录不安全" } }], allowAgents: true });
const brokenSelect = byLabel(broken, t("dest.location"));
assert.equal(brokenSelect.props.options.find((o) => o.value === "agents").disabled, true, "不可用位置在下拉里置灰");
brokenSelect.props.onChange("agents");
assert.equal(selection.location, "dsh", "合成事件不能选中不可用位置");
brokenSelect.props.onChange("codex");
assert.equal(selection.location, "dsh", "合成事件也不能选下拉里根本没有的位置");
assert.ok(text(broken).includes("目录不安全") && text(broken).includes("C:\\Users\\me\\.agents\\skills"), "不可用原因与路径写在下方");
selection = { scope: "workspace", location: "dsh", workspace: "D:\\work\\alpha" }; tree = render();

// 5. 切回用户目录：清掉已选工作区，Shared Agent 恢复可选，payload 只带 root。
byLabel(tree, t("dest.scope")).props.onChange("user"); tree = render();
assert.equal(selection.workspace, "");
assert.deepEqual(destinationPayload(selection), { root: "dsh" });
assert.equal(byLabel(tree, t("dest.location")).props.options.find((o) => o.value === "agents").disabled, false, "Shared Agent 恢复可选");
byLabel(tree, t("dest.location")).props.onChange("agents");
assert.equal(selection.location, "agents", "用户目录下可以选 Shared Agent");
assert.deepEqual(destinationPayload(selection), { root: "agents" });
selection = { scope: "user", location: "dsh", workspace: "" }; tree = render();

// 6. 组件保留受限模式：allowAgents=false 时位置只有 DSH；三个写入入口均传 true。
tree = render({ allowAgents: false });
assert.deepEqual(byLabel(tree, t("dest.location")).props.options.map((o) => o.value), ["dsh"], "不允许 Shared Agent 的入口位置下拉只有 DSH");

// 7. 空登记列表：提示先在侧栏添加，不给添加入口，用户目录仍可用。
selection = { scope: "workspace", location: "dsh", workspace: "" };
tree = render({ workspaces: [] });
assert.ok(text(tree).includes("还没有已登记的工作区"), "空列表提示");
assert.equal(destinationReady(selection, []), false);
assert.equal(byLabel(tree, t("dest.workspace")).props.disabled, true, "没有登记工作区时右侧下拉置灰");
assert.equal(nodes(tree).some((n) => n.type === "button" && /add|添加/.test(n.children.join(""))), false, "不提供添加工作区按钮");

// 8. 已选工作区后来失效或从列表消失：不能提交，避免提交旧路径。
selection = { scope: "workspace", location: "dsh", workspace: "D:\\work\\gone" };
assert.equal(destinationReady(selection, workspaces), false);
selection = { scope: "workspace", location: "dsh", workspace: "D:\\work\\ghost" };
assert.equal(destinationReady(selection, workspaces), false, "不可用路径不能提交");

// 9. 请求体只带 workspace，不带 root/location，不信前端自定义位置。
selection = { scope: "workspace", location: "agents", workspace: "D:\\work\\beta" };
assert.deepEqual(destinationPayload(selection), { workspace: "D:\\work\\beta" }, "工作区一律不带 Shared Agent");
selection = { scope: "user", location: "agents", workspace: "" };
assert.deepEqual(destinationPayload(selection), { root: "agents" });

// 仅登记项目子目录：写请求仍用登记值，预览用规范项目根。
const childRow = { ...workspaces[0], projectRoot: "D:\\work\\alpha", registeredPaths: ["D:\\work\\alpha\\packages\\web"] };
selection = { scope: "workspace", location: "dsh", workspace: childRow.registeredPaths[0] };
tree = render({ workspaces: [childRow] });
assert.equal(byLabel(tree, t("dest.workspace")).props.options[1].value, childRow.registeredPaths[0], "选项必须使用实际登记的子目录");
assert.equal(destinationReady(selection, [childRow]), true, "ready 按实际登记路径判断");
assert.equal(destinationReady({ ...selection, workspace: childRow.path }, [childRow]), false, "规范项目根没有登记不能提交");
assert.deepEqual(nodes(tree).filter(n => n.type === "code").map(n => n.children.join("")), ["D:\\work\\alpha\\.dsh\\skills"]);
assert.deepEqual(destinationPayload(selection), { workspace: childRow.registeredPaths[0] });
// 合成事件不得绕过禁用、不可用选项或制造范围/工作区值；空选仍允许。
selection = { scope: "workspace", location: "dsh", workspace: workspaces[0].path };
for (const next of [workspaces[2].path, "D:\\unknown"]) {
  byLabel(render(), t("dest.workspace")).props.onChange(next);
  assert.equal(selection.workspace, workspaces[0].path, "拒绝不可用或未知工作区合成值");
}
byLabel(render({ disabled: true }), t("dest.workspace")).props.onChange(workspaces[1].path);
assert.equal(selection.workspace, workspaces[0].path, "disabled 时拒绝工作区事件");
byLabel(render({ disabled: true }), t("dest.scope")).props.onChange("user");
assert.equal(selection.scope, "workspace", "disabled 时拒绝范围事件");
byLabel(render(), t("dest.scope")).props.onChange("unknown");
assert.equal(selection.scope, "workspace", "未知范围不能被当成用户目录");
byLabel(render(), t("dest.workspace")).props.onChange("");
assert.equal(selection.workspace, "", "允许显式清空选择，不自动预选");
// 不可用目标保留 code/params 并调用统一错误翻译，不直接输出服务端中文。
let translatedDiagnostic;
const diagnostic = { code: "error.root.unsafe", params: { path: "C:/unsafe" }, error: "目录不安全" };
const englishPicker = createDestinationPicker({ react, SourceSelect, translateError: (_t, error) => { translatedDiagnostic = error; return "Unsafe directory: " + error.params.path; } });
const englishTree = englishPicker({ t: key => destinationLocales.en[key] || key, value: { scope: "user", location: "dsh", workspace: "" }, onChange: change, workspaces, userDestinations: [user[0], { ...user[1], available: false, error: diagnostic }], allowAgents: true });
assert.ok(text(englishTree).includes("Unsafe directory: C:/unsafe"), "英文界面使用注入的错误翻译");
assert.equal(text(englishTree).includes("目录不安全"), false);
assert.equal(translatedDiagnostic, diagnostic, "保留完整诊断对象与参数");
console.log("目标选择器：默认用户目录、工作区必须点选、联动位置、空列表与失效路径处理均通过");
