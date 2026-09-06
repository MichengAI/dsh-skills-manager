import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("workbench overlay renders global dialogs from workbench state", async () => {
  const source = await readFile(new URL("../src/client/workbench-overlay.js", import.meta.url), "utf8");

  assert.match(source, /import \{ createDialog \} from "\.\/dialog\.js"/);
  assert.match(source, /state\.dialog \? h\(Dialog/);
  assert.match(source, /type: "dialog\/close"/);
});

test("overlay forwards sidebar collapse state instead of a no-op toggle", async () => {
  const source = await readFile(new URL("../src/client/workbench-overlay.js", import.meta.url), "utf8");

  assert.match(source, /collapsed:\s*state\.sidebarCollapsed/);
  assert.match(source, /type: "sidebar\/toggle"/);
  assert.match(source, /data-expanded/);
});
