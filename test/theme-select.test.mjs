// 筛选下拉和操作菜单走 Ant Design，不再自绘触发器。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleSourceMenuEscape } from "../src/source-select-model.ts";
import { antdThemeConfig, antdThemeCss } from "../src/antd-theme.ts";

assert.deepEqual(antdThemeConfig.cssVar, { key: "dssm-theme", prefix: "dssm-ant" }, "Ant 变量必须隔离于宿主及其他插件");
assert.deepEqual([antdThemeConfig.token.borderRadiusXS, antdThemeConfig.token.borderRadiusSM, antdThemeConfig.token.borderRadius, antdThemeConfig.token.borderRadiusLG], [4, 8, 12, 16], "兜底圆角显式采用官方尺度，不依赖 Ant 自动派生");
assert.ok(!/data-dsh-glass|data-ds-dark-theme/.test(antdThemeCss), "适配层不认领第三方主题作用域，也不新增独立明暗配色");
assert.ok(antdThemeCss.includes("--dsw-menu-surface-fill") && antdThemeCss.includes("--dsw-elevation-panel"), "浮层材质归宿主主题所有");

const selectSource = await readFile(new URL("../src/source-select.ts", import.meta.url), "utf8");
assert.ok(selectSource.includes("align: \"start\""), "筛选下拉对齐触发器起始边缘展开");
assert.ok(selectSource.includes("danger: opt.danger"), "操作菜单保留危险标记");
assert.ok(selectSource.includes("handleSourceMenuEscape"), "打开的筛选或操作菜单把 Escape 交给独立处理函数");
assert.ok(selectSource.includes("@deepseek-ai/dsh-client-ui-primitives"), "下拉使用宿主官方 Menu 原语");

const escapeCalls = [];
assert.equal(handleSourceMenuEscape({
  key: "Escape",
  preventDefault: () => escapeCalls.push("prevent"),
  stopPropagation: () => escapeCalls.push("stop"),
  stopImmediatePropagation: () => escapeCalls.push("stopImmediate"),
}, () => escapeCalls.push("close")), true, "Escape 关闭打开的菜单");
assert.deepEqual(escapeCalls, ["prevent", "stop", "stopImmediate", "close"], "菜单 Escape 不再传到宿主设置页");
assert.equal(handleSourceMenuEscape({
  key: "Tab",
  preventDefault: () => escapeCalls.push("prevent"),
  stopPropagation: () => escapeCalls.push("stop"),
  stopImmediatePropagation: () => escapeCalls.push("stopImmediate"),
}, () => escapeCalls.push("close")), false, "其它按键不关闭菜单");

const source = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");
assert.ok(source.includes('className: "dssm-search"'), "搜索框使用 Ant Design 输入框");
assert.ok(!source.includes('h("input", { className: "dssm-control'), "可见文本输入不能继续使用自定义控件");
assert.ok(!source.includes("dssm-fallback-switch"), "开关不再保留自绘兜底");
assert.ok(!source.includes("dssm-host-modal"), "弹窗不再套一层自绘外壳");
assert.ok(source.includes('className: "dssm-row-state"'), "状态与开关必须在同一组");
assert.ok(!source.includes("dsh-client-ui-primitives"), "设置页不再依赖宿主界面组件");
const updater = await readFile(new URL("../src/plugin-update-ui.ts", import.meta.url), "utf8");
assert.ok(updater.includes("handlePluginUpdateEscape"), "更新弹窗仍拦截 Escape");
assert.match(
  source,
  /\.dssm-source\{[^}]*background:transparent/,
  "来源卡片背景与技能列表一致，透出页面底色，不再另铺 layer-2",
);
const repository = await readFile(new URL("../src/repository-ui.ts", import.meta.url), "utf8");
const destination = await readFile(new URL("../src/destination-picker.ts", import.meta.url), "utf8");
assert.match(source, /\.dssm-source\{[^}]*border-radius:var\(--dsw-radius-xl/, "独立来源卡片采用官方卡片档位");
assert.match(source, /\.dssm-summary\{[^}]*background:var\(--dsw-alias-bg-layer-1\)/, "统计条直接使用当前作用域的背景层，不能用 body 上已解析成实色的设置卡片填充");
assert.doesNotMatch(source, /\.dssm-summary\{[^}]*settings-card-fill/, "统计条不能回退到实心设置卡片填充");
assert.match(repository, /\.dssm-catalog-list\{[^}]*border-radius:var\(--dsw-radius-xl/, "发现列表与来源容器采用同一档位");
assert.match(destination, /\.dssm-destination-path\{[^}]*border-radius:var\(--dsw-radius-lg/, "路径预览与嵌套内容使用同一档位");
assert.match(updater, /\.mpi-command\{[^}]*border-radius:var\(--dsw-radius-lg/, "更新弹窗代码框采用官方代码块档位");
assert.ok(!/background:var\(--dsw-alias-bg-layer-\d,#[\da-f]+\)/i.test(source + repository + destination + updater), "背景不再引入独立的深色实心兜底");
assert.ok(!/borderRadius: 6/.test(source + selectSource + repository), "行内按钮不能以内联值绕过统一圆角");
console.log("Ant Design 筛选与宿主样式契约检查通过");
