import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";

const source = await readFile(process.env.DSH_CLIENT_TEST_BUNDLE || new URL("../lib/client.js", import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// 保留 hook 状态和 effect 订阅，验证同一份 props 在异步通知后的重渲染。
function fixture() {
  let cursor = 0;
  const states = [], effects = [], subscriptions = [];
  const react = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!states[index] || deps.some((value, i) => value !== states[index][i])) {
        states[index] = deps;
        effects.push(() => { subscriptions[index]?.(); subscriptions[index] = effect(); });
      }
    },
  };
  let definition;
  new Function("window", source)({ __ModuleLoader__: { load(value) { definition = value; } } });
  const client = definition.factory((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx: react.createElement, jsxs: react.createElement, Fragment: react.Fragment };
    if (id.startsWith("react-dom")) return {};
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Switch: function Switch() {}, SegmentedControl: () => null, Button: () => null, Input: () => null, Modal: () => null, SegmentedTabs: () => null };
    throw new Error("未知测试依赖：" + id);
  });
  const gets = { "/sidebar-entry": deferred() };
  const requestedPaths = [];
  const injections = new Map(), registrations = new Map(), writes = [], changes = [];
  let writeResult;
  const ctx = {
    locale: { bind: () => (key) => client.DICT.zh[key] || key },
    slots: {
      inject(name, callback) { injections.set(name, callback); },
      register(meta, component) {
        registrations.set(meta.name, component);
        return () => registrations.delete(meta.name);
      },
    },
  };
  const controller = client.setupSidebarEntry(ctx, {
    ns: "skills-manager", headers: {}, renderPanel: () => null,
    onLocationChange: (location) => changes.push(location),
    callApi: (path, options) => {
      requestedPaths.push(path);
      if (options?.method === "POST") {
        writes.push(path);
        return writeResult?.promise || Promise.resolve({ location: JSON.parse(options.body).location });
      }
      return gets[path]?.promise || Promise.resolve({});
    },
  });
  injections.get("plugins.bundle.config")();
  injections.get("sidebar.panellist")();
  return {
    controller, gets, registrations, injections, writes, changes, requestedPaths,
    setWriteResult(value) { writeResult = value; },
    mount() {
      const element = registrations.get("plugins.bundle.config")({});
      return () => {
        cursor = 0;
        const card = element.type(element.props);
        effects.splice(0).forEach((effect) => effect());
        return card;
      };
    },
    dispose() { subscriptions.forEach((unsubscribe) => unsubscribe?.()); controller.destroy(); },
  };
}

test("销毁后忽略初始化请求与迟到槽位，不恢复入口或通知", async () => {
  const f = fixture();
  try {
    f.controller.destroy();
    f.controller.destroy();
    const before = [...f.registrations.keys()];
    f.gets["/sidebar-entry"].resolve({ location: "both" });
    await flush();
    assert.deepEqual([...f.registrations.keys()], before, "初始化请求不能在销毁后重新注册入口");
    assert.deepEqual(f.changes, [], "初始化响应不能在销毁后触发更新 UI");
    f.injections.get("sidebar.panellist")();
    f.injections.get("plugins.bundle.config")();
    assert.deepEqual([...f.registrations.keys()], before, "迟到的槽位依赖不能注册新内容");
    await f.controller.setEnabled(true);
    assert.deepEqual(f.writes, [], "销毁后的旧控制器不能再写配置");
  } finally { f.dispose(); }
});

test("销毁后忽略 /sidebar-entry 保存失败的回滚副作用", async () => {
  const f = fixture();
  try {
    f.gets["/sidebar-entry"].resolve({ location: "both" });
    await flush();
    const pending = deferred();
    f.setWriteResult(pending);
    const operation = f.controller.setEnabled(false);
    const rejected = assert.rejects(operation, /保存失败/);
    f.controller.destroy();
    const before = [...f.registrations.keys()], notifications = f.changes.length;
    pending.reject(new Error("保存失败"));
    await rejected;
    assert.deepEqual([...f.registrations.keys()], before);
    assert.equal(f.changes.length, notifications, "销毁后不能再发回滚通知");
  } finally { f.dispose(); }
});

test("配置卡片仅包含入口位置，防回归：不再渲染在线更新开关且不发起 /online-update 请求", async () => {
  const f = fixture();
  try {
    f.gets["/sidebar-entry"].resolve({ location: "both" });
    await flush();
    const render = f.mount();
    const card = render();
    const tree = card.type(card.props);
    const children = React.Children.toArray(tree.props.children);

    // 必须存在 entry-location 行
    const locationRow = children.find((row) => row.key && row.key.endsWith("entry-location"));
    assert.ok(locationRow, "入口展示位置行必须存在");

    // 绝不能存在 online-update 开关行
    const updateRow = children.find((row) => row.key && row.key.endsWith("online-update"));
    assert.equal(updateRow, undefined, "卡片中绝不得存在在线更新开关行");

    // 绝不能向服务端发起 /online-update 读取请求
    assert.equal(f.requestedPaths.includes("/online-update"), false, "客户端初始化绝不发起 /online-update 轮询");
  } finally { f.dispose(); }
});
