import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const rootLib = join(repositoryRoot, "lib");
const buildScript = join(packageRoot, "scripts/build.mjs");

async function snapshotTree(directory) {
  const entries = [];

  async function visit(currentDirectory) {
    let children;
    try {
      children = await readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }

    for (const child of children) {
      const path = join(currentDirectory, child.name);
      if (child.isDirectory()) {
        await visit(path);
      } else if (child.isFile()) {
        const metadata = await stat(path, { bigint: true });
        entries.push([
          relative(directory, path),
          (await readFile(path)).toString("base64"),
          metadata.mtimeNs.toString(),
        ]);
      }
    }
  }

  await visit(directory);
  entries.sort(([left], [right]) => left.localeCompare(right));
  return entries;
}

async function createBuildFixture() {
  const fixtureRoot = await mkdtemp(join(packageRoot, ".generated-output-test-"));
  try {
    await cp(join(packageRoot, "src"), join(fixtureRoot, "src"), { recursive: true });
    await cp(join(packageRoot, "assets"), join(fixtureRoot, "assets"), { recursive: true });
    await mkdir(join(fixtureRoot, "scripts"), { recursive: true });
    await cp(buildScript, join(fixtureRoot, "scripts/build.mjs"));
    return fixtureRoot;
  } catch (error) {
    await rm(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
}

function runBuild(fixtureRoot, env = {}) {
  return spawnSync(process.execPath, [join(fixtureRoot, "scripts/build.mjs")], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("root-invoked build uses crash-recoverable transactional publish without touching root lib", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    const rootLibBefore = await snapshotTree(rootLib);
    const build = runBuild(fixtureRoot);
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

    const workbenchLib = join(fixtureRoot, "lib");
    const workbenchFiles = await snapshotTree(workbenchLib);
    assert.deepEqual(workbenchFiles.map(([path]) => path).sort(), [
      "client.js",
      "client/api.js",
      "client/brand.js",
      "client/chat-home.js",
      "client/dialog.js",
      "client/image-input.js",
      "client/root.js",
      "client/shell.js",
      "client/sidebar.js",
      "client/speech-input.js",
      "client/store.js",
      "client/styles.js",
      "client/work-home.js",
      "host/chat-preset.js",
      "host/diagnostics.js",
      "host/http.js",
      "host/mode-service.js",
      "host/repository.js",
      "host/session-gateway.js",
      "index.js",
      "shared/auto-select.js",
      "shared/capabilities.js",
      "shared/chat-config.js",
      "shared/compatibility.js",
      "shared/contracts.js",
      "shared/work-templates.js",
    ]);
    assert.deepEqual(await snapshotTree(rootLib), rootLibBefore);

    const publishedBeforeFailure = workbenchFiles;
    const failedBuild = runBuild(fixtureRoot, { DSH_AI_WORKBENCH_TEST_FAIL_BEFORE_PUBLISH: "1" });
    assert.notEqual(failedBuild.status, 0, `${failedBuild.stdout}\n${failedBuild.stderr}`);
    assert.deepEqual(await snapshotTree(workbenchLib), publishedBeforeFailure);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
