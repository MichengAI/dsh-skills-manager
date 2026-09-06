import test from "node:test";
import assert from "node:assert/strict";
import { probeChatContracts, probeClientContracts, probeHostContracts } from "../lib/shared/compatibility.js";
import { apply as applyPlugin } from "../lib/index.js";

const CLIENT_FAILURES = ["slot:shell.overlay", "slots:register", "slots:inject", "sessions:open"];

test("client probe accepts the additive overlay and session-opening faces", () => {
  const result = probeClientContracts({
    slots: {
      spec: (name) => ({ "shell.overlay": {} })[name],
      register() {},
      inject() {},
    },
    sessions: { open() {} },
  });
  assert.deepEqual(result, { ok: true, failures: [] });
});

test("client probe accepts an injected overlay registration face", () => {
  const result = probeClientContracts({
    slots: {
      spec: () => ({}),
      register() {},
      inject() {},
    },
    sessions: { open() {} },
  });
  assert.deepEqual(result, { ok: true, failures: [] });
});

test("client probe reports missing contracts without throwing", () => {
  const result = probeClientContracts({ slots: { spec: () => undefined } });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("slot:shell.overlay"));
  assert.ok(result.failures.includes("slots:inject"));
});

test("client probe fails closed when the context is missing", () => {
  const result = probeClientContracts(null);
  assert.deepEqual(result, {
    ok: false,
    failures: CLIENT_FAILURES,
  });
});

test("client probe fails closed when a slot spec throws", () => {
  const result = probeClientContracts({
    slots: {
      spec() {
        throw new Error("boom");
      },
    },
  });
  assert.deepEqual(result, {
    ok: false,
    failures: CLIENT_FAILURES,
  });
});

test("client probe fails closed for an undefined context", () => {
  assert.deepEqual(probeClientContracts(undefined), {
    ok: false,
    failures: CLIENT_FAILURES,
  });
});

test("native client probe fails closed when root and native input services are missing", () => {
  const result = probeClientContracts({
    slots: {
      spec: (name) => ({ "shell.overlay": {} })[name],
      register() {},
      inject() {},
    },
    sessions: { open() {} },
  }, { nativeConversation: true });

  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("slot:root"));
  assert.ok(result.failures.includes("layout:attachPanels"));
  assert.ok(result.failures.includes("inputTriggers:registerSource"));
  assert.ok(result.failures.includes("commandUi:register"));
});

test("native client probe accepts the verified root, layout, input, and command faces", () => {
  const result = probeClientContracts({
    slots: {
      spec: () => ({}),
      register() {},
      inject() {},
    },
    layout: { attachPanels() {} },
    sessions: { open() {} },
    inputTriggers: { registerSource() {} },
    commandUi: { register() {} },
  }, { nativeConversation: true });

  assert.deepEqual(result, { ok: true, failures: [] });
});

test("client probe fails closed when context and nested service reads throw", () => {
  const throwingService = (name) => new Proxy({}, {
    get() {
      throw new Error(`${name} trap`);
    },
  });

  assert.deepEqual(probeClientContracts(new Proxy({}, {
    get() {
      throw new Error("context trap");
    },
  })), {
    ok: false,
    failures: CLIENT_FAILURES,
  });

  const result = probeClientContracts({
    slots: {
      get spec() {
        throw new Error("slots.spec getter");
      },
      get register() {
        throw new Error("slots.register getter");
      },
    },
    layout: throwingService("layout"),
    sessions: throwingService("sessions"),
  });
  assert.deepEqual(result, {
    ok: false,
    failures: CLIENT_FAILURES,
  });
});

test("host probe requires the gateway, query, title query, and storage faces", () => {
  const result = probeHostContracts({
    apiProxy: { sessions: { create() {}, prompt() {}, models() {}, selectModel() {} }, llm: { models() {} } },
    sessions: { get() {} },
    permissionPresets: { set() {} },
    sessionQuery: { listSessions() {}, readTitleSnapshots() {} },
    storage: { backend: { get() {} } },
    setTimeout() {},
  });
  assert.equal(result.ok, true);
});

test("host probe accepts Cordis-bound methods from the trusted host context", () => {
  const bound = (method) => method.bind({});
  const result = probeHostContracts({
    get() {},
    reflect: { get() {} },
    apiProxy: {
      sessions: {
        create: bound(function create() {}),
        prompt: bound(function prompt() {}),
        models: bound(function models() {}),
        selectModel: bound(function selectModel() {}),
      },
      llm: { models: bound(function models() {}) },
    },
    sessions: { get: bound(function get() {}) },
    permissionPresets: { set: bound(function set() {}) },
    sessionQuery: {
      listSessions: bound(function listSessions() {}),
      readTitleSnapshots: bound(function readTitleSnapshots() {}),
    },
    storage: { backend: { get: bound(function get() {}) } },
  });

  assert.deepEqual(result, { ok: true, failures: [] });
});

test("host probe does not require the optional Cordis timer service", () => {
  const result = probeHostContracts({
    apiProxy: { sessions: { create() {}, prompt() {}, models() {}, selectModel() {} }, llm: { models() {} } },
    sessions: { get() {} },
    permissionPresets: { set() {} },
    sessionQuery: { listSessions() {}, readTitleSnapshots() {} },
    storage: { backend: { get() {} } },
  });

  assert.deepEqual(result, { ok: true, failures: [] });
});

test("host probe reports a missing permission preset face explicitly", () => {
  const result = probeHostContracts({
    apiProxy: { sessions: { create() {}, prompt() {}, models() {}, selectModel() {} }, llm: { models() {} } },
    sessions: { get() {} },
    sessionQuery: { listSessions() {}, readTitleSnapshots() {} },
    storage: { backend: { get() {} } },
    setTimeout() {},
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, ["permissionPresets:set"]);
});

test("Chat probe reports the same missing permission preset face explicitly", () => {
  const result = probeChatContracts({
    agentPresets: { list() {}, read() {}, copy() {}, resolve() {}, remove() {} },
  });
  assert.deepEqual(result, { ok: false, failures: ["permissionPresets:set"] });
});

test("host probe rejects a session query without title snapshots", () => {
  const result = probeHostContracts({
    apiProxy: { sessions: { create() {}, prompt() {}, models() {}, selectModel() {} }, llm: { models() {} } },
    sessions: { get() {} },
    permissionPresets: { set() {} },
    sessionQuery: { listSessions() {} },
    storage: { backend: { get() {} } },
    setTimeout() {},
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("sessionQuery:readTitleSnapshots"));
});

test("host probe fails closed when the context is missing", () => {
  const result = probeHostContracts(null);
  assert.deepEqual(result, {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "apiProxy.sessions:models",
      "apiProxy.sessions:selectModel",
      "apiProxy.llm:models",
      "sessions:get",
      "permissionPresets:set",
      "sessionQuery:listSessions",
      "sessionQuery:readTitleSnapshots",
      "storage.backend:get",
    ],
  });
});

test("host probe fails closed for an undefined context", () => {
  assert.deepEqual(probeHostContracts(undefined), {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "apiProxy.sessions:models",
      "apiProxy.sessions:selectModel",
      "apiProxy.llm:models",
      "sessions:get",
      "permissionPresets:set",
      "sessionQuery:listSessions",
      "sessionQuery:readTitleSnapshots",
      "storage.backend:get",
    ],
  });
});

test("host probe fails closed when context and nested service reads throw", () => {
  const throwingService = (name) => new Proxy({}, {
    get() {
      throw new Error(`${name} trap`);
    },
  });

  assert.deepEqual(probeHostContracts(new Proxy({}, {
    get() {
      throw new Error("context trap");
    },
  })), {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "apiProxy.sessions:models",
      "apiProxy.sessions:selectModel",
      "apiProxy.llm:models",
      "sessions:get",
      "permissionPresets:set",
      "sessionQuery:listSessions",
      "sessionQuery:readTitleSnapshots",
      "storage.backend:get",
    ],
  });

  const result = probeHostContracts({
    apiProxy: {
      get sessions() {
        throw new Error("apiProxy.sessions getter");
      },
    },
    permissionPresets: throwingService("permissionPresets"),
    sessionQuery: throwingService("sessionQuery"),
    storage: {
      get backend() {
        throw new Error("storage.backend getter");
      },
    },
    get setTimeout() {
      throw new Error("timer getter");
    },
  });
  assert.deepEqual(result, {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "apiProxy.sessions:models",
      "apiProxy.sessions:selectModel",
      "apiProxy.llm:models",
      "sessions:get",
      "permissionPresets:set",
      "sessionQuery:listSessions",
      "sessionQuery:readTitleSnapshots",
      "storage.backend:get",
    ],
  });
});

test("host probe rejects callable proxies whose apply trap throws", () => {
  let applyCalls = 0;
  const throwingCallable = (name) => new Proxy(() => undefined, {
    apply() {
      applyCalls += 1;
      throw new Error(`${name} apply trap`);
    },
  });

  const result = probeHostContracts({
    apiProxy: {
      sessions: {
        create: throwingCallable("create"),
        prompt: throwingCallable("prompt"),
        models: throwingCallable("models"),
        selectModel: throwingCallable("selectModel"),
      },
      llm: { models: throwingCallable("llm.models") },
    },
    sessions: { get: throwingCallable("sessions.get") },
    permissionPresets: { set: throwingCallable("permissionPresets.set") },
    sessionQuery: {
      listSessions: throwingCallable("listSessions"),
      readTitleSnapshots: throwingCallable("readTitleSnapshots"),
    },
    storage: { backend: { get: throwingCallable("get") } },
    setTimeout: throwingCallable("setTimeout"),
  });

  assert.deepEqual(result, {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "apiProxy.sessions:models",
      "apiProxy.sessions:selectModel",
      "apiProxy.llm:models",
      "sessions:get",
      "permissionPresets:set",
      "sessionQuery:listSessions",
      "sessionQuery:readTitleSnapshots",
      "storage.backend:get",
    ],
  });
  assert.equal(applyCalls, 0);
});

test("host probe rejects callable proxies without invoking a successful apply trap", () => {
  const calls = [];
  const safeCallable = (name) => new Proxy(() => {
    calls.push(name);
  }, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args);
    },
  });

  const result = probeHostContracts({
    apiProxy: {
      sessions: {
        create: safeCallable("create"),
        prompt: safeCallable("prompt"),
        models: safeCallable("models"),
        selectModel: safeCallable("selectModel"),
      },
      llm: { models: safeCallable("llm.models") },
    },
    sessions: { get: safeCallable("sessions.get") },
    permissionPresets: { set: safeCallable("permissionPresets.set") },
    sessionQuery: {
      listSessions: safeCallable("listSessions"),
      readTitleSnapshots: safeCallable("readTitleSnapshots"),
    },
    storage: { backend: { get: safeCallable("get") } },
    setTimeout: safeCallable("setTimeout"),
  });

  assert.deepEqual(result, {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "apiProxy.sessions:models",
      "apiProxy.sessions:selectModel",
      "apiProxy.llm:models",
      "sessions:get",
      "permissionPresets:set",
      "sessionQuery:listSessions",
      "sessionQuery:readTitleSnapshots",
      "storage.backend:get",
    ],
  });
  assert.deepEqual(calls, []);
});

test("host probe does not invoke real host methods while checking their callable faces", () => {
  let businessActions = 0;
  const hostMethod = () => {
    businessActions += 1;
  };

  const result = probeHostContracts({
    apiProxy: { sessions: { create: hostMethod, prompt: hostMethod, models: hostMethod, selectModel: hostMethod }, llm: { models: hostMethod } },
    sessions: { get: hostMethod },
    permissionPresets: { set: hostMethod },
    sessionQuery: { listSessions: hostMethod, readTitleSnapshots: hostMethod },
    storage: { backend: { get: hostMethod } },
    setTimeout: hostMethod,
  });

  assert.deepEqual(result, { ok: true, failures: [] });
  assert.equal(businessActions, 0);
});

test("host probe rejects bound host methods without invoking them", () => {
  let businessActions = 0;
  const hostMethod = () => {
    businessActions += 1;
  };
  const boundMethod = hostMethod.bind(null);

  const result = probeHostContracts({
    apiProxy: { sessions: { create: boundMethod, prompt: boundMethod, models: boundMethod, selectModel: boundMethod }, llm: { models: boundMethod } },
    sessions: { get: boundMethod },
    permissionPresets: { set: boundMethod },
    sessionQuery: { listSessions: boundMethod, readTitleSnapshots: boundMethod },
    storage: { backend: { get: boundMethod } },
    setTimeout: boundMethod,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    "apiProxy.sessions:create",
    "apiProxy.sessions:prompt",
    "apiProxy.sessions:models",
    "apiProxy.sessions:selectModel",
    "apiProxy.llm:models",
    "sessions:get",
    "permissionPresets:set",
    "sessionQuery:listSessions",
    "sessionQuery:readTitleSnapshots",
    "storage.backend:get",
  ]);
  assert.equal(businessActions, 0);
});

test("plugin registration does not invoke host business methods", async () => {
  let businessActions = 0;
  const hostMethod = () => {
    businessActions += 1;
  };
  let registrations = 0;
  let registeredOptions;
  const unit = {
    async loadAll() { return { tables: {}, global: null }; },
    async putRecord() {},
    async deleteRecord() {},
    async close() {},
  };

  const disposer = await applyPlugin({
    apiProxy: { sessions: { create: hostMethod, prompt: hostMethod, models: hostMethod, selectModel: hostMethod }, llm: { models: hostMethod } },
    sessions: { get: hostMethod },
    sessionQuery: { listSessions: hostMethod, readTitleSnapshots: hostMethod },
    storage: { backend: { get: () => ({ kv: { open: () => unit } }) } },
    setTimeout: hostMethod,
    webServer: {
      register(options) {
        registrations += 1;
        registeredOptions = options;
        return options;
      },
    },
  });

  assert.equal(registrations, 1);
  assert.equal(businessActions, 0);
  assert.equal(typeof registeredOptions.handler, "function");
  assert.equal(typeof disposer, "function");
  await disposer();
});

test("plugin closes an opened unit when repository initialization fails", async () => {
  const events = [];
  let releaseClose;
  const pendingClose = new Promise((resolve) => { releaseClose = resolve; });
  const unit = {
    async loadAll() {
      events.push("loadAll");
      throw new Error("load failed");
    },
    async close() {
      events.push("close-start");
      await pendingClose;
      events.push("close-end");
    },
  };

  const applying = applyPlugin({
    apiProxy: { sessions: { create() {}, prompt() {}, models() {}, selectModel() {} }, llm: { models() {} } },
    sessions: { get() {} },
    sessionQuery: { listSessions() {}, readTitleSnapshots() {} },
    storage: { backend: { get: () => ({ kv: { open: () => unit } }) } },
    setTimeout() {},
    webServer: { register() { events.push("register"); } },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["loadAll", "close-start"]);
  releaseClose();
  await assert.rejects(applying, /load failed/);
  assert.deepEqual(events, ["loadAll", "close-start", "close-end"]);
});
