import test from "node:test";
import assert from "node:assert/strict";
import { probeClientContracts, probeHostContracts } from "../lib/shared/compatibility.js";
import { apply as applyPlugin } from "../lib/index.js";

test("client probe accepts the required DSH slot and layout faces", () => {
  const result = probeClientContracts({
    slots: {
      spec: (name) => ({ root: {}, sidebar: {}, conversation: {}, details: {}, "shell.overlay": {} })[name],
      register() {},
    },
    layout: { toggleSidebar() {}, openDetails() {}, closeDetails() {}, attachPanels() {} },
    sessions: { open() {}, binding() {}, subscribe() {} },
  });
  assert.deepEqual(result, { ok: true, failures: [] });
});

test("client probe reports missing contracts without throwing", () => {
  const result = probeClientContracts({ slots: { spec: () => undefined } });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("slot:conversation"));
  assert.ok(result.failures.includes("layout:attachPanels"));
});

test("client probe fails closed when the context is missing", () => {
  const result = probeClientContracts(null);
  assert.deepEqual(result, {
    ok: false,
    failures: [
      "slot:root",
      "slot:sidebar",
      "slot:conversation",
      "slot:details",
      "slot:shell.overlay",
      "slots:register",
      "layout:toggleSidebar",
      "layout:openDetails",
      "layout:closeDetails",
      "layout:attachPanels",
      "sessions:open",
      "sessions:binding",
      "sessions:subscribe",
    ],
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
    failures: [
      "slot:root",
      "slot:sidebar",
      "slot:conversation",
      "slot:details",
      "slot:shell.overlay",
      "slots:register",
      "layout:toggleSidebar",
      "layout:openDetails",
      "layout:closeDetails",
      "layout:attachPanels",
      "sessions:open",
      "sessions:binding",
      "sessions:subscribe",
    ],
  });
});

test("client probe fails closed for an undefined context", () => {
  assert.deepEqual(probeClientContracts(undefined), {
    ok: false,
    failures: [
      "slot:root",
      "slot:sidebar",
      "slot:conversation",
      "slot:details",
      "slot:shell.overlay",
      "slots:register",
      "layout:toggleSidebar",
      "layout:openDetails",
      "layout:closeDetails",
      "layout:attachPanels",
      "sessions:open",
      "sessions:binding",
      "sessions:subscribe",
    ],
  });
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
    failures: [
      "slot:root",
      "slot:sidebar",
      "slot:conversation",
      "slot:details",
      "slot:shell.overlay",
      "slots:register",
      "layout:toggleSidebar",
      "layout:openDetails",
      "layout:closeDetails",
      "layout:attachPanels",
      "sessions:open",
      "sessions:binding",
      "sessions:subscribe",
    ],
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
    failures: [
      "slot:root",
      "slot:sidebar",
      "slot:conversation",
      "slot:details",
      "slot:shell.overlay",
      "slots:register",
      "layout:toggleSidebar",
      "layout:openDetails",
      "layout:closeDetails",
      "layout:attachPanels",
      "sessions:open",
      "sessions:binding",
      "sessions:subscribe",
    ],
  });
});

test("host probe requires the gateway, query, storage, and timer faces", () => {
  const result = probeHostContracts({
    apiProxy: { sessions: { create() {}, prompt() {} } },
    sessionQuery: { listSessions() {} },
    storage: { backend: { get() {} } },
    setTimeout() {},
  });
  assert.equal(result.ok, true);
});

test("host probe fails closed when the context is missing", () => {
  const result = probeHostContracts(null);
  assert.deepEqual(result, {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "sessionQuery:listSessions",
      "storage.backend:get",
      "timer:setTimeout",
    ],
  });
});

test("host probe fails closed for an undefined context", () => {
  assert.deepEqual(probeHostContracts(undefined), {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "sessionQuery:listSessions",
      "storage.backend:get",
      "timer:setTimeout",
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
      "sessionQuery:listSessions",
      "storage.backend:get",
      "timer:setTimeout",
    ],
  });

  const result = probeHostContracts({
    apiProxy: {
      get sessions() {
        throw new Error("apiProxy.sessions getter");
      },
    },
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
      "sessionQuery:listSessions",
      "storage.backend:get",
      "timer:setTimeout",
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
      },
    },
    sessionQuery: { listSessions: throwingCallable("listSessions") },
    storage: { backend: { get: throwingCallable("get") } },
    setTimeout: throwingCallable("setTimeout"),
  });

  assert.deepEqual(result, {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "sessionQuery:listSessions",
      "storage.backend:get",
      "timer:setTimeout",
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
      },
    },
    sessionQuery: { listSessions: safeCallable("listSessions") },
    storage: { backend: { get: safeCallable("get") } },
    setTimeout: safeCallable("setTimeout"),
  });

  assert.deepEqual(result, {
    ok: false,
    failures: [
      "apiProxy.sessions:create",
      "apiProxy.sessions:prompt",
      "sessionQuery:listSessions",
      "storage.backend:get",
      "timer:setTimeout",
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
    apiProxy: { sessions: { create: hostMethod, prompt: hostMethod } },
    sessionQuery: { listSessions: hostMethod },
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
    apiProxy: { sessions: { create: boundMethod, prompt: boundMethod } },
    sessionQuery: { listSessions: boundMethod },
    storage: { backend: { get: boundMethod } },
    setTimeout: boundMethod,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    "apiProxy.sessions:create",
    "apiProxy.sessions:prompt",
    "sessionQuery:listSessions",
    "storage.backend:get",
    "timer:setTimeout",
  ]);
  assert.equal(businessActions, 0);
});

test("plugin registration does not invoke host business methods", () => {
  let businessActions = 0;
  const hostMethod = () => {
    businessActions += 1;
  };
  let registrations = 0;

  const result = applyPlugin({
    apiProxy: { sessions: { create: hostMethod, prompt: hostMethod } },
    sessionQuery: { listSessions: hostMethod },
    storage: { backend: { get: hostMethod } },
    setTimeout: hostMethod,
    webServer: {
      register(options) {
        registrations += 1;
        return options;
      },
    },
  });

  assert.equal(registrations, 1);
  assert.equal(businessActions, 0);
  assert.equal(typeof result.handler, "function");
});
