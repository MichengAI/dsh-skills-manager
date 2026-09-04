import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("workbench publishes independent host and client entries", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.name, "@michengai/dsh-ai-workbench");
  assert.equal(pkg.exports["."], "./lib/index.js");
  assert.equal(pkg.exports["./client"], "./lib/client.js");
  assert.deepEqual(pkg.files, ["lib", "assets", "presets", "cordis.patch.yml", "README.md"]);
  assert.equal(pkg.dsh.client.platform, "web");
  assert.ok(pkg.dsh.client.inject.includes("@deepseek-ai/dsh-client-runtime"));
});

test("repository keeps both packages", async () => {
  const workspace = await readFile(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8");
  assert.match(workspace, /packages:\n  - '\.'\n  - 'packages\/\*'/);
  const rootPkg = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  assert.equal(rootPkg.name, "@michengai/dsh-skills-manager");
  assert.equal(rootPkg.scripts["workbench:test"], "pnpm --dir packages/ai-workbench test");
});
