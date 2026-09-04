import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dshPeerNames = [
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-runtime",
  "@deepseek-ai/dsh-client-ui-layout",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-host-apiproxy",
  "@deepseek-ai/dsh-host-webserver",
  "@deepseek-ai/dsh-session",
  "@deepseek-ai/dsh-session-query",
  "@deepseek-ai/dsh-storage",
];

test("workbench publishes independent host and client entries", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.name, "@michengai/dsh-ai-workbench");
  assert.equal(pkg.exports["."], "./lib/index.js");
  assert.equal(pkg.exports["./client"], "./lib/client.js");
  assert.equal(pkg.exports["./package.json"], "./package.json");
  assert.deepEqual(pkg.files, ["lib", "assets", "presets", "cordis.patch.yml", "README.md"]);
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.deepEqual(pkg.dsh.client.inject, [
    "@deepseek-ai/dsh-client-runtime",
    "@deepseek-ai/dsh-client-ui-primitives",
    "@deepseek-ai/dsh-client-ui-layout",
    "@deepseek-ai/dsh-client-locale",
  ]);
  assert.equal(pkg.dsh.client.platform, "web");
  assert.equal(pkg.peerDependencies["@deepseek-ai/cordis"], ">=4.0.1 <5.0.0");
  for (const name of dshPeerNames) {
    assert.equal(pkg.peerDependencies[name], "0.1.1-rc.2");
  }
});

test("repository keeps both packages", async () => {
  const workspace = await readFile(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8");
  assert.match(workspace, /packages:\n  - '\.'\n  - 'packages\/\*'/);
  const rootPkg = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  assert.equal(rootPkg.name, "@michengai/dsh-skills-manager");
  assert.equal(rootPkg.scripts["workbench:test"], "pnpm --dir packages/ai-workbench test");
});
