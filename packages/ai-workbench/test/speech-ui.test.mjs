import test from "node:test";
import assert from "node:assert/strict";
import { createChatHome } from "../lib/client/chat-home.js";
import { createWorkHome } from "../lib/client/work-home.js";

function fakeReact() {
  const effects = [];
  return {
    effects,
    React: {
      createElement(type, props, ...children) {
        return { type, props: props || {}, children: children.flat().filter((child) => child !== null && child !== undefined) };
      },
      useState(value) {
        return [value, () => {}];
      },
      useEffect(effect) {
        effects.push(effect());
      },
      useRef(value) {
        return { current: value };
      },
    },
  };
}

function findByLabel(node, label) {
  if (!node || typeof node !== "object") return null;
  if (node.props?.["aria-label"] === label) return node;
  for (const child of node.children || []) {
    const result = findByLabel(child, label);
    if (result) return result;
  }
  return null;
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

function speechAdapter() {
  return {
    supported: true,
    starts: [],
    stops: 0,
    start(options) {
      this.starts.push(options);
    },
    stop() {
      this.stops += 1;
    },
  };
}

test("Work renders supported speech control, appends final transcript, and stops on cleanup", () => {
  const fake = fakeReact();
  const speech = speechAdapter();
  const actions = [];
  const WorkHome = createWorkHome(fake.React, { api: { listModels: async () => ({ groups: [] }), startSession: async () => ({ sessionId: "s1" }) } });
  const tree = WorkHome({
    state: { drafts: { work: { text: "已有任务", attachments: [], workspaceId: null, capabilityIds: [] } } },
    dispatch: (action) => actions.push(action),
    workbench: { ctx: { speech } },
  });

  const button = findByLabel(tree, "语音输入");
  assert.ok(button);
  button.props.onClick();
  assert.equal(speech.starts.length, 1);
  speech.starts[0].onText("最终转写");
  speech.starts[0].onText("第二段");
  assert.equal(actions.at(-1).draft.text, "已有任务\n最终转写\n第二段");
  for (const cleanup of fake.effects) cleanup?.();
  assert.equal(speech.stops, 1);
});

test("Chat hides unsupported speech and shows adapter permission errors without submitting", () => {
  const fake = fakeReact();
  const speech = speechAdapter();
  const actions = [];
  const ChatHome = createChatHome(fake.React, { config: { guesses: [], popular: [], navigation: [] }, api: { startSession: async () => ({ sessionId: "unexpected" }) } });
  const tree = ChatHome({
    state: { drafts: { chat: { text: "问题", attachments: [] } } },
    dispatch: (action) => actions.push(action),
    workbench: { ctx: { speech: { supported: false } } },
  });
  assert.equal(findByLabel(tree, "语音输入"), null);

  const supportedTree = ChatHome({
    state: { drafts: { chat: { text: "问题", attachments: [] } } },
    dispatch: (action) => actions.push(action),
    workbench: { ctx: { speech } },
  });
  const button = findByLabel(supportedTree, "语音输入");
  assert.ok(button);
  button.props.onClick();
  speech.starts[0].onError("未获得麦克风权限");
  assert.equal(actions.some((action) => action.type === "session/start"), false);
  assert.ok(findByLabel(supportedTree, "语音输入"));
});

test("Work echoes the selected runtime workspace", () => {
  const fake = fakeReact();
  const WorkHome = createWorkHome(fake.React, { api: { listModels: async () => ({ groups: [] }) } });
  const tree = WorkHome({
    state: { drafts: { work: { text: "", attachments: [], workspaceId: "w1", capabilityIds: [] } } },
    dispatch() {},
    workbench: {
      useWorkspaces: () => ({ workspaceId: "w1", items: [{ path: "/tmp/selected", title: "已选工作空间" }] }),
    },
  });
  assert.equal(findByClassName(tree, "daw-selected-path").children[0], "/tmp/selected");
});
