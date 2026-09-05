import test from "node:test";
import assert from "node:assert/strict";
import { createSidebar, navigationFor } from "../lib/client/sidebar.js";

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat() };
    },
    useState(value) {
      return [value, () => {}];
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

test("Work navigation exposes only the approved Work entries", () => {
  assert.deepEqual(navigationFor("work").map((item) => [item.id, item.available]), [
    ["new-work", true], ["workspace", false], ["capabilities", true], ["dashboard", false], ["automations", true], ["results", false],
  ]);
});

test("Chat navigation leaves future pages unavailable", () => {
  assert.deepEqual(navigationFor("chat").map((item) => [item.id, item.available]), [
    ["new-chat", true], ["agents", false], ["ai-tools", false],
  ]);
});

test("expanded and collapsed sidebars both expose a toggle button", () => {
  const Sidebar = createSidebar(fakeReact());
  const toggles = [];
  const props = {
    state: { mode: "work", route: { name: "home" }, history: { work: [] } },
    settings: null,
    dispatch() {},
    sessions: null,
    renderSlot() { return null; },
    toggleSidebar: () => toggles.push("toggle"),
  };

  const expanded = Sidebar({ ...props, collapsed: false });
  const collapsed = Sidebar({ ...props, collapsed: true });
  const expandedToggle = findByClassName(expanded, "daw-sidebar-toggle");
  const collapsedToggle = findByClassName(collapsed, "daw-sidebar-toggle");

  assert.ok(expandedToggle);
  assert.ok(collapsedToggle);
  assert.equal(expandedToggle.props["aria-label"], "收起侧边栏");
  assert.equal(collapsedToggle.props["aria-label"], "展开侧边栏");
  expandedToggle.props.onClick();
  collapsedToggle.props.onClick();
  assert.deepEqual(toggles, ["toggle", "toggle"]);
});
