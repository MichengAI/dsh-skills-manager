import test from "node:test";
import assert from "node:assert/strict";
import { navigationFor } from "../lib/client/sidebar.js";

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
