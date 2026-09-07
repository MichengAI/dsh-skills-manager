import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { foundationCss } from "../lib/client/styles.js";

async function loadDefinition() {
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  let definition;
  new Function("window", source)({
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  });
  return definition;
}

test("loader factory preserves host-owned seats and contributes only an additive overlay", async () => {
  const definition = await loadDefinition();
  const required = [];
  const effects = [];
  const registrations = [];
  const injections = [];
  let runtime;

  const bundle = definition.factory((id) => {
    required.push(id);
    if (id === "react") return { createElement() {} };
    if (id === "@deepseek-ai/dsh-client-runtime/client") {
      runtime = { defineStore() {} };
      return runtime;
    }
    throw new Error(`unexpected require: ${id}`);
  });

  assert.equal(typeof runtime?.defineStore, "function");
  assert.deepEqual(required, ["react", "@deepseek-ai/dsh-client-runtime/client"]);

  const ctx = {
    slots: {
      spec: () => ({}),
      register(...args) {
        registrations.push(args);
      },
      inject(name, callback) {
        injections.push(name);
        return callback();
      },
    },
    layout: {
      toggleSidebar() {},
      openDetails() {},
      closeDetails() {},
      attachPanels() {},
    },
    sessions: { open() {}, binding() {}, subscribe() {} },
    inputTriggers: { registerSource() {} },
    commandUi: { register() {} },
    effect(callback) {
      effects.push(callback);
    },
  };

  assert.doesNotThrow(() => bundle.apply(ctx));
  assert.equal(effects.length, 1);
  assert.deepEqual(injections, ["sidebar", "shell.overlay"]);
  assert.equal(registrations.length, 2);
  assert.deepEqual(registrations.map(([registration]) => registration.name), ["sidebar", "shell.overlay"]);
  assert.equal(typeof registrations[0][1], "function");
  assert.equal(registrations[0][0].id, "dsh-ai-workbench");
  assert.equal("children" in registrations[0][0], false);
  assert.equal(typeof registrations[1][1], "function");
  assert.equal(registrations[1][0].id, "dsh-ai-workbench-overlay");
  assert.equal("children" in registrations[1][0], false);
});

test("workbench frame establishes the containing block for its overlay", () => {
  assert.match(foundationCss, /\.daw-frame\{[^}]*position:relative/);
});

test("provider exposes only explicitly injected session and workspace services", async () => {
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(source, /sessions:\s*getService\("sessions",\s*ctx\.sessions\)/);
  assert.match(source, /workspaces:\s*getService\("workspaces",\s*ctx\.workspaces\)/);
  assert.match(source, /const inject = \["slots", "sessions", "workspaces", "layout", "inputTriggers", "commandUi", "conversation", "connection"\]/);
  assert.match(source, /probeClientContracts\(ctx, \{ nativeConversation: true \}\)/);
  assert.match(source, /speech:\s*speech\.current/);
  assert.doesNotMatch(source, /ctx\.(speech|voice|imageLimits|capabilities|useWorkspaces|workspaceFeed)/);
});

test("provider loads the capability catalog for Work task selection", async () => {
  const source = await readFile(new URL("../src/client.js", import.meta.url), "utf8");

  assert.match(source, /import \{ loadCapabilitySources \} from "\.\/client\/capability-source\.js"/);
  assert.match(source, /loadCapabilitySources\(\)/);
  assert.match(source, /capabilities:\s*capabilitySnapshot\?\.items/);
});

test("client bundles its brand images instead of relying on host-global asset paths", async () => {
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /[\"']\/assets\/(?:ai-orb|logo-source)\.png[\"']/);
  assert.match(source, /data:image\/png;base64,/);
});

test("overlay provider does not probe optional un-injected host services", async () => {
  let useStateCalls = 0;
  const React = {
    createElement(type, props, ...children) {
      return {
        type,
        props: { ...props, children: children.length === 1 ? children[0] : children },
      };
    },
    createContext() {
      return { Provider: () => null };
    },
    useEffect() {},
    useReducer(reducer, argument, initializer) {
      return [initializer(argument), () => {}];
    },
    useRef(value) {
      return { current: value };
    },
    useState(value) {
      const next = useStateCalls === 0 ? true : value;
      useStateCalls += 1;
      return [next, () => {}];
    },
  };
  const definition = await loadDefinition();
  const registrations = [];
  const allowed = {
    effect() {},
    layout: { attachPanels() {} },
    sessions: { open() {} },
    inputTriggers: { registerSource() {} },
    commandUi: { register() {} },
    conversation: { input: { for() {} } },
    workspaces: { getSnapshot() { return { items: [] }; }, subscribe() { return () => {}; } },
    slots: {
      spec: () => ({}),
      inject(_name, callback) { return callback(); },
      register(...args) { registrations.push(args); },
    },
  };
  const ctx = new Proxy(allowed, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      throw new Error(`cannot get property ${String(property)} without inject`);
    },
  });
  const bundle = definition.factory((id) => {
    if (id === "react") return React;
    if (id === "@deepseek-ai/dsh-client-runtime/client") return { defineStore() {} };
    throw new Error(`unexpected require: ${id}`);
  });

  bundle.apply(ctx);
  const Overlay = registrations.find(([registration]) => registration.name === "shell.overlay")[1];
  const provider = Overlay();
  const workbenchProvider = provider.type(provider.props);

  assert.doesNotThrow(() => workbenchProvider.type(workbenchProvider.props));
});

test("Work and Chat open created sessions through the injected provider service", async () => {
  const [workSource, chatSource] = await Promise.all([
    readFile(new URL("../src/client/work-home.js", import.meta.url), "utf8"),
    readFile(new URL("../src/client/chat-home.js", import.meta.url), "utf8"),
  ]);

  for (const source of [workSource, chatSource]) {
    assert.match(source, /createNativeComposerBridge/);
    assert.match(source, /api\.prepareSession/);
    assert.match(source, /bridge\.transfer/);
    assert.match(source, /bridge\.submit/);
    assert.doesNotMatch(source, /workbench\?\.ctx\?\.sessions/);
  }
});
