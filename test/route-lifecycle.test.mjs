// Exercise Cordis itself: direct apply() mocks do not model constructor-style
// plugin startup or effect disposal during restart and failed activation.
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import * as plugin from "../lib/index.js";

const prefix = "/api/dsh-skills-manager";
const updater = "/api/michengai/dsh-skills-manager/update";
const ctx = new Context();
const server = {
  exact: new Map(),
  prefixes: new Map(),
  register: WebServer.prototype.register,
};
for (const [name, value] of Object.entries({
  webServer: server,
  webRuntime: { trustedHosts: [] },
  skills: { registerProvider() { return () => {}; } },
  tools: {},
  sessions: {},
})) ctx.provide(name, value);

try {
  const fiber = ctx.plugin(plugin);
  await fiber.await();
  let previous = server.prefixes.get(prefix);
  assert.ok(previous);
  for (let cycle = 0; cycle < 3; cycle++) {
    await fiber.restart();
    assert.equal(server.prefixes.size, 1);
    assert.equal(server.exact.size, 1);
    assert.notEqual(server.prefixes.get(prefix), previous, "restart installs a fresh handler");
    previous = server.prefixes.get(prefix);
  }
  await fiber.dispose();
  await fiber.await();
  assert.equal(server.prefixes.size, 0, "unload releases the main API route");
  assert.equal(server.exact.size, 0, "unload releases the update route");

  // A later startup error must also release an already registered main route.
  const failing = ctx.plugin({
    inject: plugin.inject,
    apply(scope) {
      plugin.apply(scope);
      throw new Error("failure after route registration");
    },
  });
  await assert.rejects(failing.await(), /failure after route registration/);
  assert.equal(server.prefixes.size, 0);
  assert.equal(server.exact.size, 0);
  await failing.dispose();

  // A real collision must not silently reuse or replace another owner's route.
  const foreign = { kind: "prefix", path: prefix, handler() {} };
  const releaseForeign = server.register(foreign);
  const conflict = ctx.plugin(plugin);
  await assert.rejects(conflict.await(), /duplicate prefix route/);
  assert.equal(server.prefixes.get(prefix), foreign);
  assert.equal(server.exact.has(updater), false);
  await conflict.dispose();
  releaseForeign();

  const reactivated = ctx.plugin(plugin);
  await reactivated.await();
  assert.equal(server.prefixes.size, 1);
  assert.equal(server.exact.size, 1);
  await reactivated.dispose();
  await reactivated.await();
  assert.equal(server.prefixes.size, 0);
  assert.equal(server.exact.size, 0);
} finally {
  await ctx.fiber.dispose();
}

console.log("Cordis route lifecycle: restart, unload, failed activation, collision and reactivation passed");
