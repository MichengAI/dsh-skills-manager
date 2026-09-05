import test from "node:test";
import assert from "node:assert/strict";
import { createWorkbenchOverlay } from "../lib/client/workbench-overlay.js";

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat().filter((child) => child !== null && child !== undefined) };
    },
    useState(value) {
      return [value, () => {}];
    },
    useContext() {
      return null;
    },
    useEffect() {},
  };
}

test("workbench overlay renders a launcher before it covers the host workspace", () => {
  const React = fakeReact();
  const Overlay = createWorkbenchOverlay(React, {
    context: {},
    provider: ({ children }) => children,
  });

  const tree = Overlay({});

  assert.equal(tree.type, "button");
  assert.equal(tree.props["aria-label"], "打开正方 AI 工作台");
});
