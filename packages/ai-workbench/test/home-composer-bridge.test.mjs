import test from "node:test";
import assert from "node:assert/strict";
import { createNativeComposerBridge } from "../lib/client/home-composer-bridge.js";

function createFakeRuntime() {
  const listeners = new Set();
  const menuListeners = new Set();
  const shellState = { draft: "", draftRev: 0, phase: "plain", imageIds: [] };
  const shell = {
    state: {
      getSnapshot: () => shellState,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    snapshot: shellState,
    setDraft(text) {
      shellState.draft = text;
      shellState.draftRev += 1;
      for (const listener of listeners) listener();
    },
    addImages(ids) {
      shellState.imageIds.push(...ids);
      return true;
    },
    submitCalls: 0,
    submit() {
      shell.submitCalls += 1;
    },
  };
  const controller = {
    menu: {
      getSnapshot: () => ({ open: true, groups: [] }),
      subscribe(listener) {
        menuListeners.add(listener);
        return () => menuListeners.delete(listener);
      },
    },
    trackCalls: [],
    track(...args) {
      controller.trackCalls.push(args);
    },
    toggleSourceCalls: [],
    toggleSource(...args) {
      controller.toggleSourceCalls.push(args);
    },
  };
  const binding = { ctx: { id: "scope" } };
  const sessions = {
    opened: [],
    refreshCalls: 0,
    createCalls: 0,
    open(id) { this.opened.push(id); },
    async refresh() { this.refreshCalls += 1; },
    async create() { this.createCalls += 1; return "created-session"; },
    binding() { return binding; },
  };
  const agentPresetSelections = [];
  const ctx = {
    conversation: {
      input: { for() { return shell; } },
      createDraftImages() { return []; },
    },
    inputTriggers: { sessionOf() { return controller; } },
    get(name) {
      if (name !== "connection") return undefined;
      return {
        api: {
          agentPresets: {
            async select(input) {
              agentPresetSelections.push(input);
              return { result: { ok: true, value: input } };
            },
          },
        },
      };
    },
  };
  return { ctx, sessions, shell, controller, agentPresetSelections };
}

test("native composer bridge prepares one session and exposes the host input shell", async () => {
  const runtime = createFakeRuntime();
  const prepareCalls = [];
  const bridge = createNativeComposerBridge({
    ...runtime,
    mode: "work",
    draftKey: "draft-1",
    workspaceId: "workspace-1",
    prepareSession(input) {
      prepareCalls.push(input);
      return Promise.resolve({ sessionId: "session-1", lifecycle: "prepared" });
    },
  });

  const first = await bridge.prepare();
  const second = await bridge.prepare();

  assert.equal(first.sessionId, "session-1");
  assert.equal(second.sessionId, "session-1");
  assert.deepEqual(prepareCalls, [{ mode: "work", draftKey: "draft-1", workspaceId: "workspace-1" }]);
  assert.equal(runtime.sessions.refreshCalls, 1);
  assert.deepEqual(runtime.sessions.opened, ["session-1"]);
  assert.equal(bridge.sessionId, "session-1");
  bridge.dispose();
});

test("native composer bridge creates the listed DSH session before attaching workbench metadata", async () => {
  const runtime = createFakeRuntime();
  const prepareCalls = [];
  const bridge = createNativeComposerBridge({
    ...runtime,
    mode: "chat",
    draftKey: "draft-native-create",
    createSession: (input) => runtime.sessions.create(input),
    prepareSession(input) {
      prepareCalls.push(input);
      return Promise.resolve({ sessionId: input.sessionId, lifecycle: "prepared" });
    },
  });

  await bridge.prepare();

  assert.equal(runtime.sessions.createCalls, 1);
  assert.deepEqual(prepareCalls, [{ mode: "chat", draftKey: "draft-native-create", workspaceId: null, sessionId: "created-session" }]);
  bridge.dispose();
});

test("native composer bridge selects the Chat preset before attaching workbench metadata", async () => {
  const runtime = createFakeRuntime();
  const bridge = createNativeComposerBridge({
    ...runtime,
    mode: "chat",
    agentPreset: "zf-chat-workbench-v1",
    draftKey: "draft-chat-preset",
    createSession: (input) => runtime.sessions.create(input),
    prepareSession: async (input) => ({ sessionId: input.sessionId, lifecycle: "prepared" }),
  });

  await bridge.prepare();

  assert.deepEqual(runtime.agentPresetSelections, [{
    sessionId: "created-session",
    agentPreset: "zf-chat-workbench-v1",
  }]);
  bridge.dispose();
});

test("native composer bridge transfers draft and routes command menu through DSH", async () => {
  const runtime = createFakeRuntime();
  const bridge = createNativeComposerBridge({
    ...runtime,
    mode: "chat",
    draftKey: "draft-2",
    prepareSession: async () => ({ sessionId: "session-2", lifecycle: "prepared" }),
  });

  await bridge.transfer({ text: "/model", attachments: [] });
  bridge.track("/model", 6);
  bridge.openSource("command", { start: 0, end: 6 });

  assert.equal(runtime.shell.snapshot.draft, "/model");
  assert.deepEqual(runtime.controller.trackCalls[0], ["/model", 6, { tier: "plain" }, 1]);
  assert.equal(runtime.controller.toggleSourceCalls.length, 1);
  assert.equal(runtime.controller.toggleSourceCalls[0][0], "command");
  assert.deepEqual(runtime.controller.toggleSourceCalls[0][1].span, { start: 0, end: 6, draftRev: 1 });
  bridge.dispose();
});

test("native composer bridge prevents duplicate native submits while one is pending", async () => {
  const runtime = createFakeRuntime();
  const bridge = createNativeComposerBridge({
    ...runtime,
    mode: "work",
    draftKey: "draft-3",
    prepareSession: async () => ({ sessionId: "session-3", lifecycle: "prepared" }),
  });

  await bridge.submit();
  await bridge.submit();

  assert.equal(runtime.shell.submitCalls, 1);
  bridge.dispose();
});
