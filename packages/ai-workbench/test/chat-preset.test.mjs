import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertChatComposition, ensureChatPreset } from "../lib/host/chat-preset.js";
import { probeChatContracts } from "../lib/shared/compatibility.js";
import { routeRequest } from "../lib/host/http.js";

test("bundled Chat composition contains web but no Work tools", async () => {
  const text = await readFile(new URL("../presets/zf-chat/agent.cordis.yml", import.meta.url), "utf8");
  assert.doesNotThrow(() => assertChatComposition(text));
  assert.match(text, /@deepseek-ai\/dsh-tool-web/);
  assert.doesNotMatch(text, /shell|terminal|filesystem|str-replace|skill|subagent|browser/);
});

test("an existing preset with different content is refused", async () => {
  const roster = {
    list: async () => [{ id: "zf-chat-workbench-v1" }],
    read: async () => "- id: shell\n  name: '@deepseek-ai/dsh-tool-bash-persistent'\n",
  };
  await assert.rejects(() => ensureChatPreset(roster, { bundledText: "- id: tool-web\n  name: '@deepseek-ai/dsh-tool-web'\n" }), /preset-content-conflict/);
});

test("Chat capability probe requires both preset and permission host faces", () => {
  assert.deepEqual(probeChatContracts({
    agentPresets: { list() {}, read() {}, copy() {}, resolve() {}, remove() {} },
    permissionPresets: { set() {} },
  }), { ok: true, failures: [] });
});

test("unavailable Chat session creation fails closed with 503", async () => {
  const result = await routeRequest({
    method: "POST",
    url: "/api/dsh-ai-workbench/sessions",
    headers: {
      host: "localhost",
      "x-dsh-workbench-action": "1",
      "content-type": "application/json",
    },
    body: JSON.stringify({ mode: "chat", text: "你好" }),
  }, { features: { chat: { available: false, reason: "preset-content-conflict" } } });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.code, "chat-preset-unavailable");
});
