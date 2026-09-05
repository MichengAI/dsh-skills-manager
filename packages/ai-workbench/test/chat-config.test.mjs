import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_CHAT_CONFIG, buildChatSessionInput, keyboardAction, rotateBatch, validateChatConfig } from "../lib/shared/chat-config.js";

test("shortcuts prefill and service navigation uses safe links", () => {
  const result = validateChatConfig({
    guesses: [{ id: "q1", label: "一周安排", prompt: "查询我的一周安排", sortOrder: 1, enabled: true }],
    popular: [{ id: "p1", label: "理发预约", prompt: "如何进行理发预约？", sortOrder: 1, enabled: true }],
    navigation: [{ id: "n1", title: "融合门户", category: "服务导航", icon: "portal", sortOrder: 1, enabled: true, url: "https://portal.example.edu" }],
  });
  assert.equal(result.guesses[0].action, "prefill");
  assert.equal(result.popular[0].action, "prefill");
  assert.equal(result.navigation[0].action, "open-link");
  assert.deepEqual(rotateBatch([1, 2, 3, 4, 5], 3, 1), [4, 5, 1]);
});

test("empty navigation URLs stay disabled and smaller batches do not duplicate", () => {
  const result = validateChatConfig({
    guesses: [],
    popular: [],
    navigation: [{ id: "n1", title: "融合门户", category: "服务导航", icon: "portal", sortOrder: 1, enabled: true, url: "" }],
  });
  assert.equal(result.navigation[0].action, "disabled");
  assert.deepEqual(rotateBatch([1, 2], 5, 0), [1, 2]);
});

test("unsafe navigation protocols are rejected", () => {
  assert.throws(() => validateChatConfig({
    guesses: [],
    popular: [],
    navigation: [{ id: "x", title: "x", category: "服务导航", icon: "portal", sortOrder: 1, enabled: true, url: "javascript:alert(1)" }],
  }), /unsafe-url/);
});

test("bundled Chat home configuration keeps navigation destinations empty", async () => {
  const config = JSON.parse(await readFile(new URL("../assets/chat-home.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(config), ["guesses", "popular", "navigation"]);
  assert.ok(config.guesses.length > 0);
  assert.ok(config.popular.length > 0);
  assert.ok(config.navigation.every((item) => item.url === ""));
  assert.deepEqual(DEFAULT_CHAT_CONFIG, config);
  assert.doesNotThrow(() => validateChatConfig(config));
});

test("Chat payload keeps deep thinking and web search isolated from Work fields", () => {
  assert.deepEqual(buildChatSessionInput({
    text: "解释 RAG",
    attachments: [{ type: "image", mediaType: "image/png", data: "QQ==", name: "a.png" }],
    deepThinking: true,
    webSearch: false,
    clientTimeZone: "Asia/Shanghai",
  }), {
    mode: "chat",
    text: "解释 RAG",
    attachments: [{ type: "image", mediaType: "image/png", data: "QQ==", name: "a.png" }],
    deepThinking: true,
    webSearch: false,
    clientTimeZone: "Asia/Shanghai",
  });
});

test("Chat composer sends Enter and reserves Ctrl+Enter for a newline", () => {
  assert.equal(keyboardAction({ key: "Enter", ctrlKey: false, metaKey: false }), "send");
  assert.equal(keyboardAction({ key: "Enter", ctrlKey: true, metaKey: false }), "newline");
  assert.equal(keyboardAction({ key: "Enter", ctrlKey: false, metaKey: true }), "newline");
  assert.equal(keyboardAction({ key: "a", ctrlKey: false, metaKey: false }), null);
});
