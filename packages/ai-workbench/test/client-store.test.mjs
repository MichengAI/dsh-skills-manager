import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reduceWorkbench } from "../lib/client/store.js";

test("switching modes preserves separate drafts", () => {
  let state = reduceWorkbench(initialState(), { type: "draft/change", mode: "work", text: "汇总日报" });
  state = reduceWorkbench(state, { type: "mode/change", mode: "chat" });
  state = reduceWorkbench(state, { type: "draft/change", mode: "chat", text: "解释概念" });
  state = reduceWorkbench(state, { type: "mode/change", mode: "work" });

  assert.equal(state.drafts.work.text, "汇总日报");
  assert.equal(state.drafts.chat.text, "解释概念");
});

test("mode changes navigate to the selected mode home", () => {
  const state = reduceWorkbench(initialState(), { type: "mode/change", mode: "chat" });

  assert.equal(state.mode, "chat");
  assert.deepEqual(state.route, { name: "home", mode: "chat" });
});

test("bootstrap success stores only the selected mode draft and history", () => {
  let state = reduceWorkbench(initialState(), { type: "bootstrap/start" });
  state = reduceWorkbench(state, {
    type: "bootstrap/success",
    mode: "chat",
    data: {
      draft: { mode: "chat", text: "待发送", attachments: [] },
      history: [{ sessionId: "chat-1", title: "问答" }],
    },
  });

  assert.equal(state.loading, false);
  assert.equal(state.error, null);
  assert.deepEqual(state.drafts.chat, { mode: "chat", text: "待发送", attachments: [] });
  assert.deepEqual(state.history.chat, [{ sessionId: "chat-1", title: "问答" }]);
  assert.deepEqual(state.drafts.work, { text: "", attachments: [], capabilityIds: [] });
  assert.deepEqual(state.history.work, []);
});

test("bootstrap error stops loading and exposes the error", () => {
  const error = new Error("服务不可用");
  let state = reduceWorkbench(initialState(), { type: "bootstrap/start" });
  state = reduceWorkbench(state, { type: "bootstrap/error", error });

  assert.equal(state.loading, false);
  assert.equal(state.error, error);
});

test("draft replace replaces only the requested mode", () => {
  const originalChatDraft = initialState().drafts.chat;
  const replacement = { mode: "work", text: "替换", attachments: [], capabilityIds: [] };
  const state = reduceWorkbench(initialState(), { type: "draft/replace", mode: "work", draft: replacement });

  assert.deepEqual(state.drafts.work, replacement);
  assert.deepEqual(state.drafts.chat, originalChatDraft);
});

test("navigation clears an open dialog", () => {
  let state = reduceWorkbench(initialState(), {
    type: "dialog/open",
    dialog: { title: "提示", message: "功能暂未开发" },
  });
  state = reduceWorkbench(state, {
    type: "navigate",
    route: { name: "capabilities", mode: "work" },
  });

  assert.deepEqual(state.route, { name: "capabilities", mode: "work" });
  assert.equal(state.dialog, null);
});

test("dialog open and close update dialog state", () => {
  const dialog = { title: "提示", message: "功能暂未开发" };
  let state = reduceWorkbench(initialState(), { type: "dialog/open", dialog });
  assert.deepEqual(state.dialog, dialog);

  state = reduceWorkbench(state, { type: "dialog/close" });
  assert.equal(state.dialog, null);
});

test("sidebar toggle flips the collapsed state", () => {
  const first = reduceWorkbench(initialState(), { type: "sidebar/toggle" });
  const second = reduceWorkbench(first, { type: "sidebar/toggle" });

  assert.equal(first.sidebarCollapsed, true);
  assert.equal(second.sidebarCollapsed, false);
});
