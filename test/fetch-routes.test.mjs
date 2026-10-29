import assert from "node:assert/strict";
import test from "node:test";
import * as plugin from "../lib/index.js";

test("方案 A 契约检查：inject 必须包含 connection 服务", () => {
  assert.ok(plugin.inject.includes("connection"), "plugin.inject 必须包含 connection");
});

test("方案 A 契约检查：管理 API 必须全面通过 ctx.connection.fetch.register 注册", async () => {
  const registeredRoutes = new Map();
  const disposersCalled = [];

  const effects = [];
  const mockCtx = {
    connection: {
      fetch: {
        register(route) {
          registeredRoutes.set(route.path, route);
          return () => {
            disposersCalled.push(route.path);
            registeredRoutes.delete(route.path);
          };
        },
      },
    },
    skills: { registerProvider() { return () => {}; } },
    tools: { register() { return () => {}; } },
    sessions: {},
    effect(fn) {
      const cleanup = fn();
      if (typeof cleanup === "function") effects.push(cleanup);
      return cleanup;
    },
    get() {},
  };

  plugin.apply(mockCtx);

  // 必须注册核心端点
  const requiredPaths = [
    "/api/michengai/dsh-skills-manager/state",
    "/api/michengai/dsh-skills-manager/workspaces",
    "/api/michengai/dsh-skills-manager/repositories",
    "/api/michengai/dsh-skills-manager/sidebar-entry",
    "/api/michengai/dsh-skills-manager/online-update",
    "/api/michengai/dsh-skills-manager/create",
    "/api/michengai/dsh-skills-manager/import",
    "/api/michengai/dsh-skills-manager/upload",
    "/api/michengai/dsh-skills-manager/delete",
  ];

  for (const path of requiredPaths) {
    assert.ok(registeredRoutes.has(path), `必须注册 Fetch 路由: ${path}`);
    const route = registeredRoutes.get(path);
    assert.equal(typeof route.fetch, "function", `${path} 的 fetch 必须是函数`);
    assert.ok(Array.isArray(route.methods), `${path} 的 methods 必须是数组`);
  }

  // 测试 GET /state
  const stateRoute = registeredRoutes.get("/api/michengai/dsh-skills-manager/state");
  assert.ok(stateRoute.methods.includes("GET"));
  const stateReq = new Request("http://localhost/api/michengai/dsh-skills-manager/state", {
    method: "GET",
  });
  const stateRes = await stateRoute.fetch(stateReq);
  assert.equal(stateRes.status, 200);
  const stateData = await stateRes.json();
  assert.equal(stateData.ok, true);

  // 测试 POST 写请求业务防线：缺失客户端标记头返回 403
  const createRoute = registeredRoutes.get("/api/michengai/dsh-skills-manager/create");
  const badReq = new Request("http://localhost/api/michengai/dsh-skills-manager/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "test-skill" }),
  });
  const badRes = await createRoute.fetch(badReq);
  assert.equal(badRes.status, 403);
  const badBody = await badRes.json();
  assert.equal(badBody.code, "error.proto.forbidden");

  // 测试清理函数释放所有路由
  for (const cleanup of effects) cleanup();
  assert.equal(registeredRoutes.size, 0, "disposer 必须清空所有 Fetch 路由");
  assert.ok(disposersCalled.length > 0, "所有注册路由注销回调均已被触发");
});
