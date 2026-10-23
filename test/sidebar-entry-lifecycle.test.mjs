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
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Switch: function Switch() {}, Button: () => null, Input: () => null, Modal: () => null, SegmentedTabs: () => null };
    throw new Error("未知测试依赖：" + id);
  });
  const gets = { "/sidebar-entry": deferred(), "/online-update": deferred() };
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
    onOnlineUpdateChange: (enabled) => changes.push(enabled),
    callApi: (path, options) => {
      if (options?.method === "POST") {
        writes.push(path);
        return writeResult?.promise || Promise.resolve({ enabled: JSON.parse(options.body).enabled });
      }
      return gets[path].promise;
    },
  });
  injections.get("plugins.bundle.config")();
  injections.get("sidebar.panellist")();
  return {
    controller, gets, registrations, injections, writes, changes,
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

function onlineRow(card) {
  const tree = card.type(card.props);
  return React.Children.toArray(tree.props.children).find((row) => row.key.endsWith("online-update"));
}

test("销毁后忽略初始化请求与迟到槽位，不恢复入口或通知", async () => {
  const f = fixture();
  try {
    f.controller.destroy();
    f.controller.destroy();
    const before = [...f.registrations.keys()];
    f.gets["/sidebar-entry"].resolve({ enabled: true });
    f.gets["/online-update"].resolve({ enabled: false, locked: true });
    await flush();
    assert.deepEqual([...f.registrations.keys()], before, "初始化请求不能在销毁后重新注册入口");
    assert.deepEqual(f.changes, [], "初始化响应不能在销毁后触发更新 UI");
    f.injections.get("sidebar.panellist")();
    f.injections.get("plugins.bundle.config")();
    assert.deepEqual([...f.registrations.keys()], before, "迟到的槽位依赖不能注册新内容");
    await f.controller.setEnabled(true);
    await f.controller.setOnlineUpdate(false);
    assert.deepEqual(f.writes, [], "销毁后的旧控制器不能再写配置");
  } finally { f.dispose(); }
});

for (const path of ["/sidebar-entry", "/online-update"]) {
  test(`销毁后忽略 ${path} 保存失败的回滚副作用`, async () => {
    const f = fixture();
    try {
      f.gets["/sidebar-entry"].resolve({ enabled: true });
      f.gets["/online-update"].resolve({ enabled: true });
      await flush();
      const pending = deferred();
      f.setWriteResult(pending);
      const operation = path === "/sidebar-entry" ? f.controller.setEnabled(false) : f.controller.setOnlineUpdate(false);
      const rejected = assert.rejects(operation, /保存失败/);
      f.controller.destroy();
      const before = [...f.registrations.keys()], notifications = f.changes.length;
      pending.reject(new Error("保存失败"));
      await rejected;
      assert.deepEqual([...f.registrations.keys()], before);
      assert.equal(f.changes.length, notifications, "销毁后不能再发回滚通知");
    } finally { f.dispose(); }
  });
}

test("未锁定时可保存开关，保存失败恢复界面状态", async () => {
  const f = fixture();
  try {
    f.gets["/online-update"].resolve({ enabled: true, locked: false });
    await flush();
    const render = f.mount();
    let card = render();
    assert.equal(card.props.onlineUpdateDisabled, false);
    card.props.onToggleOnlineUpdate(false);
    await flush();
    card = render();
    assert.equal(card.props.onlineUpdateEnabled, false);
    assert.equal(card.props.onlineUpdateDisabled, false);
    assert.equal(f.controller.isOnlineUpdateEnabled(), false);
    const pending = deferred();
    f.setWriteResult(pending);
    card.props.onToggleOnlineUpdate(true);
    assert.equal(render().props.onlineUpdateDisabled, true, "保存期间禁用开关");
    pending.reject(new Error("保存失败"));
    await flush();
    card = render();
    assert.equal(card.props.onlineUpdateEnabled, false, "失败后恢复原来的关闭状态");
    assert.equal(card.props.onlineUpdateDisabled, false);
    assert.deepEqual(f.writes, ["/online-update", "/online-update"]);
  } finally { f.dispose(); }
});

test("初始化读取失败后，保存返回宿主禁用错误仍能恢复关闭和锁定状态", async () => {
  const f = fixture();
  try {
    const render = f.mount();
    render();
    f.gets["/online-update"].reject(new Error("初始化读取失败"));
    await flush();
    const pending = deferred();
    f.setWriteResult(pending);
    const oldToggle = render().props.onToggleOnlineUpdate;
    oldToggle(false);
    pending.reject({ ok: false, code: "error.update.disabled", error: "在线更新已被宿主配置锁定禁用" });
    await flush();
    const card = render();
    assert.equal(card.props.onlineUpdateLocked, true, "明确禁用错误必须补齐锁定状态");
    assert.equal(card.props.onlineUpdateEnabled, false, "锁定后不能回滚成开启");
    assert.equal(card.props.onlineUpdateDisabled, true);
    const row = onlineRow(card);
    assert.ok(row, "配置行仍须可见");
    assert.match(JSON.stringify(row), /在线更新已被宿主配置禁用/);
    assert.equal(f.controller.isOnlineUpdateEnabled(), false);
    assert.equal(f.changes.at(-1), false, "通知更新入口隐藏，而不是恢复显示");
    oldToggle(true);
    await f.controller.setOnlineUpdate(true);
    await flush();
    assert.deepEqual(f.writes, ["/online-update"], "锁定后旧回调和控制器都不能继续发起请求");
  } finally { f.dispose(); }
});

for (const [name, error] of [
  ["网络失败", new Error("网络不可用")],
  ["其他拒绝错误", { code: "error.proto.forbidden" }],
  ["空错误值", null],
]) {
  test(`${name}不能被误判为宿主锁定`, async () => {
    const f = fixture();
    try {
      const render = f.mount();
      render();
      f.gets["/online-update"].reject(new Error("初始化读取失败"));
      await flush();
      const pending = deferred();
      f.setWriteResult(pending);
      render().props.onToggleOnlineUpdate(false);
      pending.reject(error);
      await flush();
      const card = render();
      assert.equal(card.props.onlineUpdateLocked, false);
      assert.equal(card.props.onlineUpdateDisabled, false);
      assert.equal(card.props.onlineUpdateEnabled, true, "普通错误仍回滚到原值");
    } finally { f.dispose(); }
  });
}

test("销毁后晚到的宿主禁用错误不能改变状态或通知", async () => {
  const f = fixture();
  try {
    const pending = deferred();
    f.setWriteResult(pending);
    const operation = f.controller.setOnlineUpdate(true);
    const rejected = assert.rejects(operation, (error) => error.code === "error.update.disabled");
    f.controller.destroy();
    const notifications = f.changes.length;
    pending.reject({ code: "error.update.disabled" });
    await rejected;
    assert.equal(f.controller.isOnlineUpdateEnabled(), true, "销毁后的回调不再更新状态");
    assert.equal(f.changes.length, notifications);
  } finally { f.dispose(); }
});

test("开启更新的通知必须等待服务端保存成功，避免重试仍命中旧禁用状态", async () => {
  const f = fixture();
  try {
    f.gets["/online-update"].resolve({ enabled: false, locked: false });
    await flush();
    const before = f.changes.length;
    const pending = deferred();
    f.setWriteResult(pending);
    const operation = f.controller.setOnlineUpdate(true);
    assert.equal(f.changes.length, before, "写入完成前不能触发更新状态读取");
    pending.resolve({ enabled: true });
    await operation;
    assert.equal(f.changes.at(-1), true);
  } finally { f.dispose(); }
});

test("已挂载配置卡片在初始化响应后同步宿主锁定状态", async () => {
  const f = fixture();
  try {
    const render = f.mount();
    render();
    f.gets["/online-update"].resolve({ enabled: false, locked: true });
    await flush();
    const card = render();
    assert.equal(card.props.onlineUpdateDisabled, true, "同一份卡片 props 必须通过订阅读到锁定状态");
  } finally { f.dispose(); }
});

test("宿主锁定后保留在线更新行并显示禁用原因，不能发起写请求", async () => {
  const f = fixture();
  try {
    f.gets["/online-update"].resolve({ enabled: false, locked: true });
    await flush();
    const card = f.mount()();
    const row = onlineRow(card);
    assert.ok(row, "锁定时在线更新整行不能消失");
    const toggle = React.Children.toArray(row.props.children).find((node) => node.props.label === "切换在线更新");
    assert.equal(toggle.props.disabled, true);
    assert.equal(toggle.props.title, "在线更新已被宿主配置禁用");
    assert.match(JSON.stringify(row), /在线更新已被宿主配置禁用/);
    toggle.props.onChange(true);
    await flush();
    assert.deepEqual(f.writes, [], "即使直接触发回调也不能写入宿主锁定的配置");
    assert.equal(f.controller.isOnlineUpdateEnabled(), false);
  } finally { f.dispose(); }
});
