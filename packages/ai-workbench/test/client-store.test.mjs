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

test("draft replace deep clones the action draft payload", () => {
  const draft = {
    mode: "work",
    text: "原始文本",
    attachments: [{ mediaType: "image/png", data: "aA==", name: "原始文件" }],
    execution: { provider: "provider-a", model: "model-a" },
  };
  const state = reduceWorkbench(initialState(), { type: "draft/replace", mode: "work", draft });

  draft.text = "外部修改";
  draft.attachments[0].name = "外部文件修改";
  draft.execution.model = "外部模型修改";
  assert.equal(state.drafts.work.text, "原始文本");
  assert.equal(state.drafts.work.attachments[0].name, "原始文件");
  assert.equal(state.drafts.work.execution.model, "model-a");

  state.drafts.work.attachments[0].name = "state 修改";
  assert.equal(draft.attachments[0].name, "外部文件修改");
});

test("bootstrap success deep clones draft and history action payloads", () => {
  const data = {
    draft: {
      mode: "chat",
      text: "初始问题",
      attachments: [{ mediaType: "image/png", data: "aA==", name: "资料" }],
    },
    history: [{ sessionId: "chat-1", title: "初始标题", labels: ["问答"] }],
  };
  const state = reduceWorkbench(initialState(), { type: "bootstrap/success", mode: "chat", data });

  data.draft.attachments[0].name = "外部资料修改";
  data.history[0].labels[0] = "外部标签修改";
  assert.equal(state.drafts.chat.attachments[0].name, "资料");
  assert.equal(state.history.chat[0].labels[0], "问答");

  state.history.chat[0].labels[0] = "state 修改";
  assert.equal(data.history[0].labels[0], "外部标签修改");
});

test("mode-bearing reducer actions fail closed for unsupported modes", () => {
  const state = initialState();
  const invalidActions = [
    { type: "mode/change", mode: "admin" },
    { type: "draft/change", mode: "admin", text: "不应写入" },
    { type: "draft/replace", mode: "admin", draft: { text: "不应写入" } },
    { type: "bootstrap/start", mode: "admin" },
    { type: "bootstrap/success", mode: "admin", data: { draft: {}, history: [] } },
    { type: "bootstrap/error", mode: "admin", error: new Error("不应写入") },
    { type: "navigate", route: { name: "home", mode: "admin" } },
  ];

  for (const action of invalidActions) {
    assert.strictEqual(reduceWorkbench(state, action), state, action.type);
  }
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
