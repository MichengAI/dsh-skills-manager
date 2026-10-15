// 真实 Ant 控件的隔离浏览器回归；不连接日常 profile，也不模拟业务接口。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = await import(pathToFileURL(process.env.DSH_PLAYWRIGHT_MODULE || require.resolve("playwright")).href);
} catch (error) {
  if (process.env.DSH_PLAYWRIGHT_MODULE) throw error;
  if (error.code !== "MODULE_NOT_FOUND" && error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

const fixtureCss = `
body{--dsw-radius-xs:4px;--dsw-radius-sm:8px;--dsw-radius-md:12px;--dsw-radius-lg:16px;--dsw-radius-xl:20px;--dsw-radius-panel:28px;
--dsw-font-family:Arial,sans-serif;--dsw-alias-label-primary:#202832;--dsw-alias-label-secondary:#54606b;--dsw-alias-label-tertiary:#718096;
--dsw-alias-label-primary-foreground:#fff;--dsw-alias-button-primary-fill:#254e76;--dsw-alias-button-primary-hover:#315f8c;
--dsw-alias-link:#4176e6;--dsw-alias-border-l1:#dce1e6;--dsw-alias-border-l2:#c6cdd4;--dsw-alias-border-l3:#b0bac5;--dsw-alias-border-l4:#9aa8b5;
--dsw-alias-bg-layer-1:rgba(220,230,240,.35);--dsw-alias-bg-layer-2:rgba(210,220,230,.5);
--dsw-alias-interactive-bg-hover:rgba(80,100,120,.1);--dsw-alias-interactive-bg-active:rgba(80,100,120,.2);
--dsw-alias-state-error-primary:#d43546;--dsw-alias-state-success-primary:#238051;--dsw-alias-state-warn-primary:#986208;
--dsw-alias-state-business-primary:#4176e6;--dsw-alias-state-business-tertiary:rgba(65,118,230,.15);
--dsw-menu-surface-fill:rgba(240,245,250,.75);--dsw-specific-menu:rgba(240,245,250,.75);--dsw-menu-backdrop-filter:blur(12px);
--dsw-elevation-panel:0 2px 12px rgba(0,0,0,.16);--dsw-alias-bg-mask-1:rgba(0,0,0,.5);padding:24px}
body[data-ds-dark-theme]{--dsw-alias-label-primary:#e1e8ef;--dsw-alias-label-secondary:#b3bfca;--dsw-alias-label-tertiary:#8795a2;--dsw-alias-bg-layer-1:rgba(35,45,55,.35);--dsw-menu-surface-fill:rgba(35,45,55,.75);--dsw-specific-menu:rgba(35,45,55,.75)}
`;

test("Ant 控件与 body 弹层跟随 DSH 圆角、颜色及实时主题变化", { skip: !playwright && "未安装 Playwright；可用 DSH_PLAYWRIGHT_MODULE 指定现有模块" }, async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';
import {AntdProvider,Button,Input,Select,Dropdown,Modal,Segmented} from './src/antd-ui.ts';
import PlainButton from 'antd/es/button/index.js';
function App(){const [open,setOpen]=React.useState(false);return React.createElement(AntdProvider,null,
React.createElement('div',null,
React.createElement(Button,{'aria-label':'普通按钮',onClick:()=>setOpen(true)},'普通按钮'),
React.createElement(Button,{'aria-label':'紧凑按钮',size:'small'},'紧凑按钮'),
React.createElement(Button,{'aria-label':'主要操作',type:'primary'},'主要操作'),
React.createElement(Input,{'aria-label':'搜索',placeholder:'搜索'}),
React.createElement(Select,{'aria-label':'筛选',options:[{value:'a',label:'来源 A'},{value:'b',label:'来源 B'}],value:'a',style:{width:160}}),
React.createElement(Dropdown,{menu:{items:[{key:'info',label:'查看详情'},{key:'delete',label:'删除',danger:true}]},trigger:['click']},React.createElement(Button,{'aria-label':'更多'},'更多')),
React.createElement(Segmented,{'aria-label':'范围',options:['全局','项目'],defaultValue:'全局'}),
React.createElement(Modal,{open,onCancel:()=>setOpen(false),title:'测试弹窗',footer:null},React.createElement(Input,{'aria-label':'弹窗输入'}))))}
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(App),React.createElement(PlainButton,{'aria-label':'其他插件按钮',type:'primary'},'其他插件按钮')));`,
      resolveDir: process.cwd(), sourcefile: "antd-theme-fixture.ts",
    },
    bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/app.js" ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
    response.end(request.url === "/app.js" ? bundle.outputFiles[0].text : `<!doctype html><meta charset="utf-8"><style>${fixtureCss}</style><div id="root"></div><script src="/app.js"></script>`);
  });
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("button", { name: "普通按钮", exact: true }).waitFor();
    const style = (locator) => locator.evaluate((element) => { const s = getComputedStyle(element); return { radius: s.borderRadius, height: s.height, color: s.color, background: s.backgroundColor, border: s.borderTopWidth, font: s.fontFamily }; });
    assert.equal((await style(page.getByRole("button", { name: "普通按钮", exact: true }))).radius, "12px", "常规按钮使用官方 R12，不默认胶囊化");
    assert.equal((await style(page.getByRole("button", { name: "紧凑按钮", exact: true }))).radius, "8px", "紧凑按钮使用官方 R8");
    assert.equal((await style(page.getByRole("button", { name: "普通按钮", exact: true }))).height, "36px");
    assert.equal((await style(page.getByRole("button", { name: "紧凑按钮", exact: true }))).height, "28px");
    const input = page.getByRole("textbox", { name: "搜索", exact: true });
    assert.equal((await style(input)).radius, "12px");
    assert.equal((await style(input)).color, "rgb(32, 40, 50)");
    assert.equal((await style(input)).background, "rgba(220, 230, 240, 0.35)", "背景保留宿主 token 的透明度");
    const hairline = await input.evaluate((element) => { const probe = document.createElement("div"); probe.style.border = ".5px solid"; document.body.append(probe); const width = getComputedStyle(probe).borderTopWidth; probe.remove(); return { width, token: getComputedStyle(element).getPropertyValue("--dssm-ant-line-width").trim() }; });
    assert.equal(hairline.token, "0.5px", "主题声明官方发丝线；浏览器可能按设备像素量化");
    assert.equal((await style(input)).border, hairline.width);
    assert.match((await style(input)).font, /Arial/);
    assert.equal((await style(page.getByRole("button", { name: "主要操作" }))).background, "rgb(37, 78, 118)", "主按钮消费宿主填充色而不是 Ant 默认蓝");
    assert.equal((await style(page.locator(".ant-select").first())).background, "rgba(220, 230, 240, 0.35)", "筛选下拉触发器跟随当前作用域背景，不能保持 Ant 实心白底");
    await page.getByRole("combobox", { name: "筛选", exact: true }).click();
    const selectBg = await page.locator(".ant-select").first().evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.equal(selectBg, "rgba(220, 230, 240, 0.35)", "展开或聚焦状态下，下拉框依然保持半透明背景不闪白");
    const popup = page.locator(".ant-select-dropdown:visible");
    await popup.waitFor();
    assert.equal((await style(popup)).radius, "16px");
    assert.equal(await popup.evaluate((e) => !!e.closest("#root")), false, "下拉保持 body portal，不被内容卡片裁剪");
    assert.equal(await popup.evaluate((e) => getComputedStyle(e, "::before").backgroundColor), "rgba(240, 245, 250, 0.75)");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "更多", exact: true }).click();
    await page.getByRole("menu").waitFor();
    assert.equal((await style(page.getByRole("menu"))).radius, "16px");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "普通按钮", exact: true }).click();
    await page.locator(".ant-modal-container").waitFor();
    assert.equal((await style(page.locator(".ant-modal-container"))).radius, "28px");
    assert.equal(await page.locator(".ant-modal-container").evaluate((e) => getComputedStyle(e, "::before").backgroundColor), "rgba(240, 245, 250, 0.75)", "弹窗材质绘制在独立背景层，不能让 blur 建立内容的包含块");
    assert.equal((await style(page.getByRole("textbox", { name: "弹窗输入" }))).color, "rgb(32, 40, 50)");
    await page.evaluate(() => document.body.setAttribute("data-ds-dark-theme", ""));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('input[aria-label="搜索"]')).color === "rgb(225, 232, 239)");
    assert.equal((await style(page.getByRole("textbox", { name: "弹窗输入" }))).color, "rgb(225, 232, 239)", "已打开的弹层也响应主题切换");
    await page.evaluate(() => document.body.style.setProperty("--dsw-alias-button-primary-fill", "rgb(93, 64, 145)"));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('button[aria-label="主要操作"]')).backgroundColor === "rgb(93, 64, 145)");
    assert.equal((await style(page.getByRole("button", { name: "其他插件按钮" }))).background, "rgb(22, 119, 255)", "样式桥接不污染 Provider 外的 Ant 控件");
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
