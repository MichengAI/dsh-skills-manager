import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbenchShell } from "../lib/client/shell.js";
import { createSidebar } from "../lib/client/sidebar.js";

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
    { type: "navigate", route: { name: "conversation", mode: "chat" } },
  ]);

  const navButtons = findAllByClassName(tree, "daw-nav-button");
  navButtons[0].props.onClick();
  assert.deepEqual(cleared, ["clear"]);
});
