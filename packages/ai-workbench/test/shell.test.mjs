import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbenchShell } from "../lib/client/shell.js";
import { createNativeSession, createSidebar, resolveDefaultWorkspaceId } from "../lib/client/sidebar.js";

function fakeReact() {
  const effects = [];
  return {
    effects,
    React: {
      createElement(type, props, ...children) {
        return { type, props: props || {}, children: children.flat().filter((child) => child !== null && child !== undefined) };
      },
      useEffect(effect) {
        effects.push(effect);
      },
      useState(value) {
        return [value, () => {}];
      },
    },
  };
}

function findByClassName(node, className) {
  if (!node || typeof node !== "object") return null;
  if (node.props?.className === className) return node;
  for (const child of node.children || []) {
    const result = findByClassName(child, className);
    if (result) return result;
  }
  return null;
}

function findAllByClassName(node, className, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node.props?.className === className) result.push(node);
  for (const child of node.children || []) findAllByClassName(child, className, result);
  return result;
}

test("home route wins over a stale current session and clears it", () => {
  const fake = fakeReact();
  const cleared = [];
  const Shell = createWorkbenchShell(fake.React);
  const tree = Shell({
    state: { mode: "chat", route: { name: "home", mode: "chat" }, drafts: { chat: {} } },
    useSessions: () => ({ current: "stale-session" }),
    workbench: { sessions: { clear: () => cleared.push("clear") } },
    renderSlot: () => ({ type: "conversation" }),
  });

  assert.equal(tree.type.name, "ChatHome");
  assert.equal(fake.effects.length, 1);
  fake.effects[0]();
  assert.deepEqual(cleared, ["clear"]);
});

test("history opens conversation route while new mode navigation clears sessions", () => {
  const fake = fakeReact();
  const actions = [];
  const cleared = [];
  const Sidebar = createSidebar(fake.React);
  const tree = Sidebar({
    state: { mode: "chat", route: { name: "home", mode: "chat" }, history: { chat: [{ sessionId: "s1", title: "历史问题" }] } },
    settings: {},
    dispatch: (action) => actions.push(action),
    sessions: { open: (id) => actions.push({ type: "session/open", id }), clear: () => cleared.push("clear") },
    renderSlot() { return null; },
    collapsed: false,
    toggleSidebar() {},
  });

  const historyButton = findByClassName(tree, "daw-history-item");
  historyButton.props.onClick();
  assert.deepEqual(actions, [
    { type: "session/open", id: "s1" },
    { type: "navigate", route: { name: "conversation", mode: "chat", sessionId: "s1" } },
  ]);

  const navButtons = findAllByClassName(tree, "daw-nav-button");
  navButtons[0].props.onClick();
  assert.deepEqual(cleared, ["clear"]);
});

test("new Work navigation prepares a DSH session before showing the native composer", async () => {
  const fake = fakeReact();
  const actions = [];
  const opened = [];
  const Sidebar = createSidebar(fake.React);
  const tree = Sidebar({
    state: { mode: "work", route: { name: "home", mode: "work" }, history: { work: [] } },
    settings: {},
    dispatch: (action) => actions.push(action),
    sessions: { open: (id) => opened.push(id), clear() {} },
    api: { prepareSession: async (input) => ({ sessionId: "prepared-work", ...input }) },
    renderSlot() { return null; },
    collapsed: false,
    toggleSidebar() {},
  });

  const newButton = findAllByClassName(tree, "daw-nav-button")[0];
  await newButton.props.onClick();

  assert.deepEqual(opened, ["prepared-work"]);
  assert.deepEqual(actions.at(-1), {
    type: "navigate",
    route: { name: "conversation", mode: "work", sessionId: "prepared-work" },
  });
});

test("new Chat navigation creates a listed native session before attaching metadata", async () => {
  const fake = fakeReact();
  const actions = [];
  const prepareCalls = [];
  const presetCalls = [];
  const Sidebar = createSidebar(fake.React);
  const tree = Sidebar({
    state: { mode: "chat", route: { name: "home", mode: "chat" }, history: { chat: [] } },
    settings: {},
    dispatch: (action) => actions.push(action),
    sessions: {
      create: async () => ({ ok: true, value: { sessionId: "native-sidebar-session" } }),
      refresh: async () => {},
      open: () => {},
    },
    ctx: {
      get(name) {
        if (name !== "connection") return undefined;
        return { api: { agentPresets: { select: async (input) => {
          presetCalls.push(input);
          return { result: { ok: true, value: input } };
        } } } };
      },
    },
    api: {
      prepareSession: async (input) => {
        prepareCalls.push(input);
        return { sessionId: input.sessionId, ...input };
      },
    },
    renderSlot() { return null; },
    collapsed: false,
    toggleSidebar() {},
  });

  await findAllByClassName(tree, "daw-nav-button")[0].props.onClick();

  assert.deepEqual(prepareCalls, [{ mode: "chat", draftKey: "sidebar:chat:0", workspaceId: null, sessionId: "native-sidebar-session" }]);
  assert.deepEqual(presetCalls, [{ sessionId: "native-sidebar-session", agentPreset: "zf-chat-workbench-v1" }]);
  assert.deepEqual(actions.at(-1), {
    type: "navigate",
    route: { name: "conversation", mode: "chat", sessionId: "native-sidebar-session" },
  });
});

test("workspace resolution waits for the DSH baseline before creating a native session", async () => {
  let ready = false;
  let refreshCalls = 0;
  setTimeout(() => { ready = true; }, 5);
  const workspaceId = await resolveDefaultWorkspaceId({
    list: {
      getSnapshot() {
        return ready
          ? { phase: "ready", items: [{ workspaceId: "workspace-1" }] }
        : { phase: "pending", items: [] };
      },
    },
    refresh: async () => { refreshCalls += 1; },
  });

  assert.equal(workspaceId, "workspace-1");
  assert.equal(refreshCalls, 1);
});

test("workspace resolution tolerates a ready projection before its workspace rows arrive", async () => {
  let ready = false;
  setTimeout(() => { ready = true; }, 5);
  const workspaceId = await resolveDefaultWorkspaceId({
    list: {
      getSnapshot() {
        return { phase: "ready", items: ready ? [{ workspaceId: "workspace-2" }] : [] };
      },
    },
  });

  assert.equal(workspaceId, "workspace-2");
});

test("workspace resolution falls back to the live DSH workspace API", async () => {
  const workspaceId = await resolveDefaultWorkspaceId(
    { list: { getSnapshot: () => ({ phase: "pending", state: "loading", items: [] }) } },
    { get: (name) => name === "connection" ? { api: { workspace: {
      list: async () => ({ result: { ok: true, value: { items: [{ workspaceId: "workspace-api" }] } } }),
    } } } : undefined },
  );

  assert.equal(workspaceId, "workspace-api");
});

test("native session creation uses the DSH workspace starter when a target is available", async () => {
  let current;
  const sessions = {
    list: { getSnapshot: () => ({ current }) },
  };
  const workspaces = {
    startSession() { setTimeout(() => { current = "workspace-session"; }, 5); },
  };

  const sessionId = await createNativeSession(sessions, workspaces, "chat", "workspace-1");

  assert.equal(sessionId, "workspace-session");
});

test("native Chat session creation connects directly to the selected DSH workspace", async () => {
  let connectCalls = 0;
  const sessionId = await createNativeSession(
    { list: { getSnapshot: () => ({ current: undefined }) } },
    { connectWorkspace: async () => { connectCalls += 1; return { ok: true, value: { sessionId: "chat-workspace-session" } }; } },
    "chat",
    "workspace-1",
  );

  assert.equal(sessionId, "chat-workspace-session");
  assert.equal(connectCalls, 1);
});

test("native session creation prefers a fresh workspace session over a stale blank reuse", async () => {
  const createCalls = [];
  const sessionId = await createNativeSession(
    {
      create: async (input) => {
        createCalls.push(input);
        return { ok: true, value: { sessionId: "fresh-workspace-session" } };
      },
    },
    { connectWorkspace: async () => "stale-blank-session" },
    "work",
    "workspace-1",
  );

  assert.equal(sessionId, "fresh-workspace-session");
  assert.deepEqual(createCalls, [{ workspaceId: "workspace-1" }]);
});

test("native session creation falls back to the native session API when the workspace projection is late", async () => {
  const createCalls = [];
  const sessionId = await createNativeSession(
    { create: async (input) => { createCalls.push(input); return "direct-session"; } },
    { connectWorkspace: async () => { throw new Error("workspace projection pending"); } },
    "work",
    "workspace-api",
  );

  assert.equal(sessionId, "direct-session");
  assert.deepEqual(createCalls, [{ workspaceId: "workspace-api" }]);
});
