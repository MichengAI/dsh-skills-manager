import assert from "node:assert/strict";
import { apply, inject } from "../lib/index.js";

// 用例 1: 验证插件声明的 inject 包含 connection，且不依赖私有/未声明服务
assert.ok(inject.includes("connection"), "inject 必须包含 connection 服务");
assert.ok(!inject.includes("webStartup"), "inject 绝不能依赖 webStartup");
assert.ok(!inject.includes("webRuntime"), "inject 绝不能依赖 webRuntime");

// 用例 2: 模拟严格的 Cordis Context Proxy，只要访问未 inject 的属性一律抛错
const accessedProperties = new Set();
const strictTarget = {
  connection: {
    fetch: {
      register(route) {
        return () => {};
      },
    },
  },
  skills: {
    registerProvider() {
      return () => {};
    },
  },
  tools: {
    register() {
      return () => {};
    },
  },
  sessions: {},
  effect(fn) {
    return fn();
  },
};

const proxyCtx = new Proxy(strictTarget, {
  get(target, prop, receiver) {
    accessedProperties.add(String(prop));
    if (prop === "webRuntime" || prop === "webStartup") {
      throw new Error(`cannot get property "${String(prop)}" without inject`);
    }
    return Reflect.get(target, prop, receiver);
  },
});

// 执行 apply，验证不会触发任何未注入属性的访问异常
assert.doesNotThrow(() => {
  apply(proxyCtx);
}, "在严格 Cordis Proxy 下执行 apply 绝不能访问 webRuntime 或 webStartup");

assert.equal(accessedProperties.has("webRuntime"), false, "绝不读取 webRuntime");
assert.equal(accessedProperties.has("webStartup"), false, "绝不读取 webStartup");

console.log("host-fence.test.mjs passed");
