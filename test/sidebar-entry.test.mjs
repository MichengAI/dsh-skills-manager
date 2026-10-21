import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

const temporary = await mkdtemp(join(tmpdir(), "dssm-sidebar-test-"));
process.env.DSH_HOME = join(temporary, "home");
process.env.DSH_AGENTS_HOME = join(temporary, "agents");
process.env.HOME = process.env.USERPROFILE = join(temporary, "user");

try {
  const core = await import("../lib/core.js");
  const { apply } = await import("../lib/index.js");

  // 1. 默认值与 core 方法测试
  assert.equal(typeof core.getSidebarEntry, "function", "core 导出 getSidebarEntry");
  assert.equal(typeof core.setSidebarEntry, "function", "core 导出 setSidebarEntry");

  const defaultVal = await core.getSidebarEntry();
  assert.equal(defaultVal, false, "sidebarEntry 默认关闭");

  const enabled = await core.setSidebarEntry(true);
  assert.equal(enabled, true, "setSidebarEntry(true) 返回 true");
  assert.equal(await core.getSidebarEntry(), true, "getSidebarEntry() 返回已更新的值 true");

  const disabled = await core.setSidebarEntry(false);
  assert.equal(disabled, false, "setSidebarEntry(false) 返回 false");
  assert.equal(await core.getSidebarEntry(), false, "getSidebarEntry() 返回已更新的值 false");

  // 参数非法校验
  await assert.rejects(
    async () => core.setSidebarEntry("true"),
    (err) => err.code === "error.proto.invalidParams",
    "非布尔值拒绝写入"
  );

  // 2. HTTP 路由测试
  let route;
  apply({
    effect(fn) { return fn(); },
    skills: { registerProvider() { return () => {}; } },
    webRuntime: { trustedHosts: [] },
    webServer: {
      register(value) {
        if (value.kind === "prefix") route = value;
        return () => {};
      },
    },
  });

  const server = createServer((req, res) => route.handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/dsh-skills-manager/sidebar-entry`;
  const headers = { "content-type": "application/json", "x-dsh-skills-manager": "1" };

  try {
    // GET 初始状态
    const getRes = await fetch(baseUrl);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.ok, true);
    assert.equal(getData.data.enabled, false);

    // POST 更新开启
    const postRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.ok, true);
    assert.equal(postData.data.enabled, true);

    // GET 验证已更新
    const getRes2 = await fetch(baseUrl);
    const getData2 = await getRes2.json();
    assert.equal(getData2.data.enabled, true);

    // POST 非法参数校验
    const postInvalid = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ enabled: "yes" }),
    });
    assert.equal(postInvalid.status, 400);

    // 缺少 client marker
    const postForbidden = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(postForbidden.status, 403);

    // HEAD 请求
    const headRes = await fetch(baseUrl, { method: "HEAD" });
    assert.equal(headRes.status, 200);

    // 不支持的方法 (PUT)
    const putRes = await fetch(baseUrl, { method: "PUT" });
    assert.equal(putRes.status, 405);
  } finally {
    server.close();
  }

  // 3. 客户端槽位与门控测试
  const { readFile } = await import("node:fs/promises");
  const react = await import("react");

  let definition;
  new Function("window", await readFile(new URL("../lib/client.js", import.meta.url), "utf8"))({
    __ModuleLoader__: { load(value) { definition = value; } },
  });
  const client = definition.factory((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx: react.createElement, jsxs: react.createElement, Fragment: react.Fragment };
    if (id.startsWith("react-dom")) return { createPortal: (node) => node };
    if (id === "@deepseek-ai/dsh-client-ui-primitives") {
      return {
        Button: (props) => react.createElement("button", props, props.children),
        Input: (props) => react.createElement("input", props),
        Modal: (props) => null,
        SegmentedTabs: (props) => null,
        Switch: (props) => react.createElement("input", { type: "checkbox", checked: props.checked, onChange: (e) => props.onChange(e.target.checked) }),
      };
    }
    throw new Error("unexpected require: " + id);
  });

  const { setupSidebarEntry } = client;
  assert.equal(typeof setupSidebarEntry, "function", "client 导出 setupSidebarEntry");

  const slotRegistrations = new Map();
  const slotInjections = new Map();
  let selectedPanel = "skills-manager";

  const mockCtx = {
    locale: {
      bind: () => (key) => key,
    },
    slots: {
      inject(name, fn) {
        slotInjections.set(name, fn);
      },
      register(meta, component) {
        slotRegistrations.set(meta.name, { meta, component });
        return () => {
          slotRegistrations.delete(meta.name);
        };
      },
    },
    inject(deps, fn) {
      if (deps.includes("layout")) {
        fn({
          layout: {
            panelInfo: { getSnapshot: () => ({ activePanelId: selectedPanel }) },
            selectPanel: (id) => { selectedPanel = id; },
          },
        });
      }
    },
  };

  let clientEnabled = false;
  const controller = setupSidebarEntry(mockCtx, {
    callApi: async (path, options) => {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        clientEnabled = body.enabled;
        return { enabled: clientEnabled };
      }
      return { enabled: clientEnabled };
    },
    headers: {},
    renderPanel: () => "panel-element",
    ns: "skills-manager",
  });

  // 默认关闭且尚未 inject 槽位时
  assert.equal(controller.isEnabled(), false);
  assert.equal(controller.isSupported(), false);
  assert.equal(slotRegistrations.has("main"), false);
  assert.equal(slotRegistrations.has("sidebar.panellist"), false);

  // plugins.bundle.config 应该已经触发 inject
  assert.ok(slotInjections.has("plugins.bundle.config"));
  // 执行 bundle config 注入
  slotInjections.get("plugins.bundle.config")();
  assert.ok(slotRegistrations.has("plugins.bundle.config"));
  assert.equal(slotRegistrations.get("plugins.bundle.config").meta.key, "@michengai/dsh-skills-manager");

  // 触发 sidebar.panellist 槽位注入（代表宿主支持侧边栏）
  assert.ok(slotInjections.has("sidebar.panellist"));
  slotInjections.get("sidebar.panellist")();
  assert.equal(controller.isSupported(), true);
  // 开关仍为关闭，所以侧栏和 main 仍未注册
  assert.equal(slotRegistrations.has("main"), false);
  assert.equal(slotRegistrations.has("sidebar.panellist"), false);

  // 打开开关
  await controller.setEnabled(true);
  assert.equal(controller.isEnabled(), true);
  assert.ok(slotRegistrations.has("main"), "开启后注册 main 槽位");
  assert.equal(slotRegistrations.get("main").meta.key, "skills-manager");
  assert.ok(slotRegistrations.has("sidebar.panellist"), "开启后注册 sidebar.panellist 槽位");
  assert.equal(slotRegistrations.get("sidebar.panellist").meta.id, "skills-manager");
  assert.equal(slotRegistrations.get("sidebar.panellist").meta.order, 2);

  // 关闭开关：验证安全切走当前激活面板并注销槽位
  selectedPanel = "skills-manager";
  await controller.setEnabled(false);
  assert.equal(controller.isEnabled(), false);
  assert.equal(selectedPanel, null, "关闭开关时如果当前在该面板，安全重置选中的面板");
  assert.equal(slotRegistrations.has("main"), false, "关闭后注销 main");
  assert.equal(slotRegistrations.has("sidebar.panellist"), false, "关闭后注销 sidebar.panellist");

  controller.destroy();

  console.log("sidebar-entry.test.mjs passed");
} finally {
  await rm(temporary, { recursive: true, force: true }).catch(() => {});
}
