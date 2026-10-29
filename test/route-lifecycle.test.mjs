// Exercise Cordis itself: direct apply() mocks do not model constructor-style
// plugin startup or effect disposal during restart and failed activation.
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import * as plugin from "../lib/index.js";

const prefix = "/api/michengai/dsh-skills-manager";
const updater = "/api/michengai/dsh-skills-manager/update";
const ctx = new Context();
const fetchRoutes = new Map();
const connection = {
  fetch: {
    register(route) {
      if (fetchRoutes.has(route.path)) throw new Error(`duplicate fetch route: ${route.path}`);
      fetchRoutes.set(route.path, route);
      return () => {
        fetchRoutes.delete(route.path);
      };
    },
  },
};
for (const [name, value] of Object.entries({
  connection,
  skills: { registerProvider() { return () => {}; } },
  tools: {},
  sessions: {},
})) ctx.provide(name, value);

try {
  const fiber = ctx.plugin(plugin);
  await fiber.await();
  assert.ok(fetchRoutes.size > 0, "启动后成功注册所有 Fetch 路由");
  const initialSize = fetchRoutes.size;
  let previous = fetchRoutes.get(`${prefix}/state`);
  assert.ok(previous);
  for (let cycle = 0; cycle < 3; cycle++) {
    await fiber.restart();
    assert.equal(fetchRoutes.size, initialSize);
    assert.notEqual(fetchRoutes.get(`${prefix}/state`), previous, "restart installs a fresh handler");
    previous = fetchRoutes.get(`${prefix}/state`);
  }
  await fiber.dispose();
  await fiber.await();
  assert.equal(fetchRoutes.size, 0, "unload releases all Fetch routes");

  // A later startup error must also release an already registered main route.
  const failing = ctx.plugin({
    inject: plugin.inject,
    apply(scope) {
      plugin.apply(scope);
      throw new Error("failure after route registration");
    },
  });
  await assert.rejects(failing.await(), /failure after route registration/);
  assert.equal(fetchRoutes.size, 0);
  await failing.dispose();

  // A real collision must not silently reuse or replace another owner's route.
  const foreign = { path: `${prefix}/state`, methods: ["GET"], fetch: async () => new Response("ok") };
  const releaseForeign = connection.fetch.register(foreign);
  const conflict = ctx.plugin(plugin);
  await assert.rejects(conflict.await(), /duplicate fetch route/);
  assert.equal(fetchRoutes.get(`${prefix}/state`), foreign);
  await conflict.dispose();
  releaseForeign();

  const reactivated = ctx.plugin(plugin);
  await reactivated.await();
  assert.equal(fetchRoutes.size, initialSize);
  await reactivated.dispose();
  await reactivated.await();
  assert.equal(fetchRoutes.size, 0);
} finally {
  await ctx.fiber.dispose();
}

console.log("Cordis route lifecycle: restart, unload, failed activation, collision and reactivation passed");
