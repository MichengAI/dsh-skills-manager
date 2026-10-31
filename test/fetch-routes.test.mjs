import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    "/api/michengai/dsh-skills-manager/skill-note",
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

  // 测试 POST 非法 JSON：捕获并返回 400 与 error.proto.invalidJson
  const invalidJsonReq = new Request("http://localhost/api/michengai/dsh-skills-manager/create", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dsh-skills-manager": "1" },
    body: "not a json string {",
  });
  const invalidJsonRes = await createRoute.fetch(invalidJsonReq);
  assert.equal(invalidJsonRes.status, 400);
  const invalidJsonBody = await invalidJsonRes.json();
  assert.equal(invalidJsonBody.code, "error.proto.invalidJson");

  // 测试 POST 超限 Payload：捕获并返回 413 与 error.proto.bodyTooLarge
  const tooLargeReq = new Request("http://localhost/api/michengai/dsh-skills-manager/create", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dsh-skills-manager": "1" },
    body: JSON.stringify({ name: "a".repeat(1 << 20) }),
  });
  const tooLargeRes = await createRoute.fetch(tooLargeReq);
  assert.equal(tooLargeRes.status, 413);
  const tooLargeBody = await tooLargeRes.json();
  assert.equal(tooLargeBody.code, "error.proto.bodyTooLarge");

  // 测试清理函数释放所有路由
  for (const cleanup of effects) cleanup();
  assert.equal(registeredRoutes.size, 0, "disposer 必须清空所有 Fetch 路由");
  assert.ok(disposersCalled.length > 0, "所有注册路由注销回调均已被触发");
});

test("方案 A import 路由：dryRun 试跑绝不触发 afterWrite 刷新通知", async () => {
  let broadcastCalled = 0;
  const registeredRoutes = new Map();

  const mockCtx = {
    connection: {
      fetch: {
        register(route) {
          registeredRoutes.set(route.path, route);
          return () => {};
        },
      },
    },
    skills: { registerProvider() { return () => {}; } },
    tools: { register() { return () => {}; } },
    sessions: {},
    effect(fn) {
      return fn();
    },
    emit(event) {
      if (event === "commands/change" || event === "agent-preset/selected") broadcastCalled++;
    },
  };

  plugin.apply(mockCtx);
  const importRoute = registeredRoutes.get("/api/michengai/dsh-skills-manager/import");
  assert.ok(importRoute);

  // 构造真实合法的本地 skill 目录与隔离的 DSH_HOME，绝不污染真实用户目录
  const tmp = await mkdtemp(join(tmpdir(), "fetch-dryrun-"));
  const originalDshHome = process.env.DSH_HOME;
  process.env.DSH_HOME = join(tmp, "dsh-home");
  await mkdir(join(tmp, "dsh-home", "skills"), { recursive: true });
  const skillDir = join(tmp, "valid-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: valid-skill\ndescription: valid skill\n---\nbody\n");

  try {
    // 1. 发送 dryRun: true 请求，必须成功（200），但绝对不触发 commands/change 广播
    const dryReq = new Request("http://localhost/api/michengai/dsh-skills-manager/import", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dsh-skills-manager": "1" },
      body: JSON.stringify({ source: skillDir, dryRun: true }),
    });

    const res = await importRoute.fetch(dryReq);
    assert.equal(res.status, 200, "dryRun 校验通过必须返回 200");
    const body = await res.json();
    assert.equal(body.ok, true, "dryRun 业务必须执行成功");
    assert.equal(broadcastCalled, 0, "dryRun 试跑成功也绝不能触发广播");

    // 2. 发送真实的写入请求（dryRun: false），必须成功且必须触发广播
    const writeReq = new Request("http://localhost/api/michengai/dsh-skills-manager/import", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dsh-skills-manager": "1" },
      body: JSON.stringify({ source: skillDir, dryRun: false }),
    });
    const writeRes = await importRoute.fetch(writeReq);
    assert.equal(writeRes.status, 200);
    const writeBody = await writeRes.json();
    assert.equal(writeBody.ok, true);
    assert.ok(broadcastCalled > 0, "真正写入时必须触发刷新广播");
  } finally {
    if (originalDshHome !== undefined) process.env.DSH_HOME = originalDshHome;
    else delete process.env.DSH_HOME;
    await rm(tmp, { recursive: true, force: true });
  }
});
