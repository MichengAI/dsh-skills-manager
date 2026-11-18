// 宿主 Input 没有清除按钮；本插件的 allowClear 包装要补上 ×，清空后调用方照常收到空值。
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((child) => child != null && typeof child !== "boolean") }) };
const HostInput = function HostInput() {};
const bundled = await build({ entryPoints: [new URL("../src/plugin-ui.ts", import.meta.url).pathname], bundle: true, write: false, format: "cjs", platform: "browser", external: ["react", "@deepseek-ai/dsh-client-ui-primitives"] });
const module = { exports: {} };
new Function("require", "module", "exports", bundled.outputFiles[0].text)((id) => {
  if (id === "react") return { default: react, ...react };
  if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Input: HostInput };
  throw new Error("unexpected require: " + id);
}, module, module.exports);
const { createInput, inputCss } = module.exports;

class FakeInput {
  constructor() { this.events = []; this.focused = false; this.current = "keyword"; }
  get value() { return this.current; }
  set value(next) { this.current = next; }
  dispatchEvent(event) { this.events.push({ type: event.type, bubbles: event.bubbles, value: this.current }); return true; }
  focus() { this.focused = true; }
}
globalThis.HTMLInputElement = FakeInput;

const Input = createInput(() => "Clear search");
const field = (node) => node.children.find((child) => child.type === HostInput);
const clearButton = (node) => node.children.find((child) => child.type === "button");

test("without allowClear the host Input is used unchanged", () => {
  const node = Input({ className: "x", value: "a", placeholder: "p" });
  assert.equal(node.type, HostInput);
  assert.deepEqual(node.props, { className: "x", value: "a", placeholder: "p" });
});

test("allowClear keeps the field mounted and only shows × when there is text", () => {
  const empty = Input({ allowClear: true, className: "dssm-search", value: "" });
  assert.equal(empty.type, "span");
  assert.equal(empty.props.className, "dssm-input-clearable dssm-search");
  assert.equal(field(empty).props.className, "dssm-input-clearable-field");
  assert.equal("allowClear" in field(empty).props, false, "allowClear must not leak to the native input");
  assert.equal(clearButton(empty), undefined);

  const filled = Input({ allowClear: true, className: "dssm-search", value: "pdf" });
  assert.equal(filled.props.className, "dssm-input-clearable has-value dssm-search");
  const button = clearButton(filled);
  assert.equal(button.props.type, "button");
  assert.equal(button.props["aria-label"], "Clear search");
  assert.equal(button.props.title, "Clear search");

  assert.equal(clearButton(Input({ allowClear: true, value: "pdf", disabled: true })), undefined);
  assert.equal(clearButton(Input({ allowClear: true, value: "pdf", readOnly: true })), undefined);
});

test("clicking × empties the input through a native input event and refocuses it", () => {
  const input = new FakeInput();
  const button = clearButton(Input({ allowClear: true, value: "pdf" }));
  let prevented = false;
  button.props.onMouseDown({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, "mousedown must not steal focus from the input");
  button.props.onClick({ currentTarget: { parentElement: { querySelector: (selector) => (selector === "input" ? input : null) } } });
  assert.equal(input.value, "");
  assert.deepEqual(input.events, [{ type: "input", bubbles: true, value: "" }]);
  assert.equal(input.focused, true);
});

test("Esc clears only when there is text and keeps the caller's onKeyDown", () => {
  const seen = [];
  const keyEvent = (key, input) => ({ key, currentTarget: input, defaultPrevented: false, nativeEvent: { isComposing: false }, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } });
  const input = new FakeInput();
  const event = keyEvent("Escape", input);
  field(Input({ allowClear: true, value: "pdf", onKeyDown: (e) => seen.push(e.key) })).props.onKeyDown(event);
  assert.deepEqual(seen, ["Escape"]);
  assert.equal(input.value, "");
  assert.equal(event.stopped, true, "the first Esc clears instead of closing a surrounding modal");

  const idle = new FakeInput();
  const idleEvent = keyEvent("Escape", idle);
  field(Input({ allowClear: true, value: "" })).props.onKeyDown(idleEvent);
  assert.equal(idle.value, "keyword");
  assert.equal(idleEvent.stopped, undefined);
});

test("clear button styles use host theme tokens", () => {
  assert.match(inputCss, /\.dssm-input-clear\{[^}]*var\(--dsw-alias-label-tertiary\)/);
  assert.match(inputCss, /\.dssm-input-clear:hover\{[^}]*var\(--dsw-alias-interactive-bg-hover\)/);
});
