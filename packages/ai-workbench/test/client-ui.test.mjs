import test from "node:test";
import assert from "node:assert/strict";
import { createDialog } from "../lib/client/dialog.js";

function createFakeReact() {
  const effects = [];
  const refs = [];
  return {
    effects,
    refs,
    React: {
      createElement(type, props, ...children) {
        return { type, props: props || {}, children: children.flat() };
      },
      useRef(value) {
        const ref = { current: value };
        refs.push(ref);
        return ref;
      },
      useEffect(effect) {
        effects.push(effect);
      },
    },
  };
}

function findByRole(node, role) {
  if (!node || typeof node !== "object") return null;
  if (node.props?.role === role) return node;
  for (const child of node.children || []) {
    const result = findByRole(child, role);
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

function findByText(node, text) {
  if (!node || typeof node !== "object") return null;
  if (node.children?.includes(text)) return node;
  for (const child of node.children || []) {
    const result = findByText(child, text);
    if (result) return result;
  }
  return null;
}

test("dialog Tab and Shift+Tab wrap focus inside the dialog", () => {
  const fake = createFakeReact();
  const Dialog = createDialog(fake.React);
  const previousFocus = { focus() {} };
  const originalDocument = globalThis.document;
  globalThis.document = { activeElement: previousFocus };

  try {
    const tree = Dialog({ dialog: { title: "提示", message: "内容" }, onClose() {} });
    const dialog = findByRole(tree, "dialog");
    const first = { focus() { globalThis.document.activeElement = first; } };
    const last = { focus() { globalThis.document.activeElement = last; } };
    dialog.querySelectorAll = () => [first, last];

    globalThis.document.activeElement = last;
    const forward = { key: "Tab", shiftKey: false, currentTarget: dialog, preventDefault() { this.prevented = true; } };
    dialog.props.onKeyDown(forward);
    assert.equal(forward.prevented, true);
    assert.strictEqual(globalThis.document.activeElement, first);

    globalThis.document.activeElement = first;
    const backward = { key: "Tab", shiftKey: true, currentTarget: dialog, preventDefault() { this.prevented = true; } };
    dialog.props.onKeyDown(backward);
    assert.equal(backward.prevented, true);
    assert.strictEqual(globalThis.document.activeElement, last);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("dialog Escape and close restore the focus that opened it", () => {
  const fake = createFakeReact();
  const Dialog = createDialog(fake.React);
  const focusCalls = [];
  const previousFocus = { focus() { focusCalls.push("restored"); } };
  const closed = [];
  const originalDocument = globalThis.document;
  globalThis.document = { activeElement: previousFocus };

  try {
    const tree = Dialog({ dialog: { title: "提示", message: "内容" }, onClose: () => closed.push("closed") });
    const dialog = findByRole(tree, "dialog");
    const closeButtonNode = findByClassName(tree, "daw-dialog-close");
    closeButtonNode.focus = () => {};
    fake.refs[0].current = closeButtonNode;
    const cleanup = fake.effects[0]();
    const closeButton = fake.refs[0].current;
    assert.ok(closeButton);

    const escape = { key: "Escape", currentTarget: dialog, preventDefault() { this.prevented = true; } };
    dialog.props.onKeyDown(escape);
    assert.equal(escape.prevented, true);
    assert.deepEqual(closed, ["closed"]);

    cleanup();
    assert.deepEqual(focusCalls, ["restored"]);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("dialog provides an explicit acknowledgement action", () => {
  const fake = createFakeReact();
  const Dialog = createDialog(fake.React);
  const closed = [];
  const originalDocument = globalThis.document;
  globalThis.document = { activeElement: null };

  try {
    const tree = Dialog({ dialog: { title: "功能暂未开发", message: "敬请期待" }, onClose: () => closed.push("closed") });
    const acknowledge = findByText(tree, "我知道了");
    assert.ok(acknowledge);
    assert.equal(acknowledge.type, "button");
    acknowledge.props.onClick();
    assert.deepEqual(closed, ["closed"]);
  } finally {
    globalThis.document = originalDocument;
  }
});
