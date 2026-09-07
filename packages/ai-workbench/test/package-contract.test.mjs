import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  assert.equal(pkg.scripts.prepack, "npm run build");
  assert.deepEqual(pkg.files, ["lib", "assets", "presets", "scripts", "docs", "cordis.patch.yml", "README.md"]);
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.deepEqual(pkg.dsh.client.inject, [
    "@deepseek-ai/dsh-client-runtime",
    "@deepseek-ai/dsh-client-ui-primitives",
    "@deepseek-ai/dsh-client-ui-layout",
    "@deepseek-ai/dsh-client-locale",
  ]);
  assert.equal(pkg.dsh.client.platform, "web");
  assert.equal(pkg.peerDependencies["@deepseek-ai/cordis"], ">=4.0.1 <5.0.0");
  assert.equal(pkg.peerDependencies["@deepseek-ai/dsh-agent-presets"], "0.1.2-rc.1");
  assert.equal(pkg.peerDependencies["@deepseek-ai/dsh-permission-presets"], "0.1.2-rc.1");
  for (const name of dshPeerNames) {
    assert.equal(pkg.peerDependencies[name], "0.1.1-rc.2");
  }
});

test("pack dry-run builds and includes the published lib entries", async () => {
  const npmCache = await mkdtemp(join(tmpdir(), "dsh-ai-workbench-npm-cache-"));
  try {
    const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: npmCache, npm_config_offline: "true" },
    });
    assert.equal(pack.status, 0, `${pack.stdout}\n${pack.stderr}`);
    const jsonStart = pack.stdout.lastIndexOf("\n[");
    assert.notEqual(jsonStart, -1, pack.stdout);
    const metadata = JSON.parse(pack.stdout.slice(jsonStart + 1))[0];
    const packedFiles = metadata.files.map(({ path }) => path);
    assert.ok(packedFiles.includes("lib/index.js"));
    assert.ok(packedFiles.includes("lib/client.js"));
  } finally {
    await rm(npmCache, { recursive: true, force: true });
  }
});

test("repository keeps both packages", async () => {
  const workspace = await readFile(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8");
  assert.match(workspace, /packages:\n  - '\.'\n  - 'packages\/\*'/);
  const rootPkg = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  assert.equal(rootPkg.name, "@michengai/dsh-skills-manager");
  assert.equal(rootPkg.scripts["workbench:test"], "npm run test --prefix packages/ai-workbench");
});
