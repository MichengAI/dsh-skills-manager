import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";

const temporary = await mkdtemp(join(tmpdir(), "dssm-update-test-"));
process.env.DSH_HOME = join(temporary, "home");
process.env.DSH_AGENTS_HOME = join(temporary, "agents");
process.env.HOME = process.env.USERPROFILE = join(temporary, "user");

try {
  const core = await import("../lib/core.js");
  const { apply } = await import("../lib/index.js");

  // 1. 默认值与 core 方法测试
  assert.equal(typeof core.getOnlineUpdate, "function", "core 导出 getOnlineUpdate");
  assert.equal(typeof core.setOnlineUpdate, "function", "core 导出 setOnlineUpdate");

  const defaultVal = await core.getOnlineUpdate();
  assert.equal(defaultVal, true, "onlineUpdate 默认开启（true）");

  const disabled = await core.setOnlineUpdate(false);
  assert.equal(disabled, false, "setOnlineUpdate(false) 返回 false");
  assert.equal(await core.getOnlineUpdate(), false, "getOnlineUpdate() 返回已更新的值 false");

  const enabled = await core.setOnlineUpdate(true);
  assert.equal(enabled, true, "setOnlineUpdate(true) 返回 true");
  assert.equal(await core.getOnlineUpdate(), true, "getOnlineUpdate() 返回已更新的值 true");

  // 参数非法校验
  await assert.rejects(
    async () => core.setOnlineUpdate("false"),
    (err) => err.code === "error.proto.invalidParams",
    "非布尔值拒绝写入"
  );

  // 2. HTTP 路由测试
  let prefixRoute;
  let exactRoutes = new Map();
  apply({
    effect(fn) { return fn(); },
    skills: { registerProvider() { return () => {}; } },
    webRuntime: { trustedHosts: [] },
    webServer: {
      register(value) {
        if (value.kind === "prefix") prefixRoute = value;
        if (value.kind === "exact") exactRoutes.set(value.path, value);
        return () => {};
      },
    },
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (exactRoutes.has(url.pathname)) {
      return exactRoutes.get(url.pathname).handler(req, res);
    }
    return prefixRoute.handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/dsh-skills-manager/online-update`;
  const updateUrl = `http://127.0.0.1:${server.address().port}/api/michengai/dsh-skills-manager/update`;
  const headers = { "content-type": "application/json", "x-dsh-skills-manager": "1" };

  try {
    // GET 初始状态（默认 true）
    const getRes = await fetch(baseUrl);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.ok, true);
    assert.equal(getData.data.enabled, true, "HTTP GET 默认 enabled: true");

    // POST 更新关闭
    const postRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.ok, true);
    assert.equal(postData.data.enabled, false);

    // GET 验证已更新为 false
    const getRes2 = await fetch(baseUrl);
    const getData2 = await getRes2.json();
    assert.equal(getData2.data.enabled, false);

    // 此时在线更新关闭，访问 update 路由应被拦截拒绝（403）
    const updateResDisabled = await fetch(updateUrl);
    assert.equal(updateResDisabled.status, 403, "在线更新关闭时 GET /update 应返回 403");

    // POST 重新开启
    const postRes2 = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(postRes2.status, 200);
    assert.equal((await postRes2.json()).data.enabled, true);

    // POST 非法参数校验
    const postInvalid = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ enabled: "no" }),
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

  // 3. 宿主 config 传入 updater: false 场景（满足 Issue 50 VibeDev bundle patch）
  let vibeExactRoutes = new Map();
  let vibePrefixRoute;
  apply({
    effect(fn) { return fn(); },
    skills: { registerProvider() { return () => {}; } },
    webRuntime: { trustedHosts: [] },
    webServer: {
      register(value) {
        if (value.kind === "prefix") vibePrefixRoute = value;
        if (value.kind === "exact") vibeExactRoutes.set(value.path, value);
        return () => {};
      },
    },
  }, { updater: false });

  const vibeServer = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (vibeExactRoutes.has(url.pathname)) {
      return vibeExactRoutes.get(url.pathname).handler(req, res);
    }
    return vibePrefixRoute.handler(req, res);
  });
  await new Promise((resolve) => vibeServer.listen(0, "127.0.0.1", resolve));
  const vibeBaseUrl = `http://127.0.0.1:${vibeServer.address().port}/api/dsh-skills-manager/online-update`;
  const vibeUpdateUrl = `http://127.0.0.1:${vibeServer.address().port}/api/michengai/dsh-skills-manager/update`;

  try {
    const vibeGet = await fetch(vibeBaseUrl);
    const vibeData = await vibeGet.json();
    assert.equal(vibeData.data.enabled, false, "宿主传入 updater: false 时 enabled 为 false");

    const vibeUpdateRes = await fetch(vibeUpdateUrl);
    assert.equal(vibeUpdateRes.status, 403, "宿主禁用更新时 update 接口返回 403");
  } finally {
    vibeServer.close();
  }

  // 4. 客户端槽位与配置测试
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

  const slotRegistrations = new Map();
  const slotInjections = new Map();

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
    inject(deps, fn) {},
  };

  let sidebarStatus = false;
  let updateStatus = true;
  const controller = client.setupSidebarEntry(mockCtx, {
    callApi: async (path, options) => {
      if (path === "/sidebar-entry") {
        if (options?.method === "POST") {
          const body = JSON.parse(options.body);
          sidebarStatus = body.enabled;
          return { enabled: sidebarStatus };
        }
        return { enabled: sidebarStatus };
      }
      if (path === "/online-update") {
        if (options?.method === "POST") {
          const body = JSON.parse(options.body);
          updateStatus = body.enabled;
          return { enabled: updateStatus };
        }
        return { enabled: updateStatus };
      }
      throw new Error("unexpected path: " + path);
    },
    headers: {},
    renderPanel: () => "panel-element",
    ns: "skills-manager",
  });

  assert.equal(controller.isOnlineUpdateEnabled(), true, "客户端默认 onlineUpdate 开启");

  // plugins.bundle.config 应该已经触发 inject
  assert.ok(slotInjections.has("plugins.bundle.config"));
  slotInjections.get("plugins.bundle.config")();
  assert.ok(slotRegistrations.has("plugins.bundle.config"));

  // 测试 setOnlineUpdate
  await controller.setOnlineUpdate(false);
  assert.equal(controller.isOnlineUpdateEnabled(), false, "setOnlineUpdate(false) 后更新为 false");
  assert.equal(updateStatus, false, "服务端 API 同步收到 false");

  await controller.setOnlineUpdate(true);
  assert.equal(controller.isOnlineUpdateEnabled(), true, "setOnlineUpdate(true) 后更新为 true");
  assert.equal(updateStatus, true, "服务端 API 同步收到 true");

  controller.destroy();

  console.log("online-update.test.mjs passed");
} finally {
  await rm(temporary, { recursive: true, force: true }).catch(() => {});
}
