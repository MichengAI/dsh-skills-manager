import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home screens keep the product-facing copy in Chinese", async () => {
  const files = ["work-home.js", "chat-home.js", "capability-library.js"];
  const sources = await Promise.all(files.map((file) => readFile(new URL(`../src/client/${file}`, import.meta.url), "utf8")));

  assert.doesNotMatch(sources.join("\n"), /WORK MODE|CHAT MODE|WORK CAPABILITIES/);
});
