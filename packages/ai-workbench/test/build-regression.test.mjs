import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workbenchLib = join(packageRoot, "lib");
const rootLib = join(repositoryRoot, "lib");

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

function runBuild(env = {}) {
  return spawnSync(process.execPath, ["packages/ai-workbench/scripts/build.mjs"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("root-invoked build publishes atomically without touching root lib", async () => {
  const rootLibBefore = await snapshotTree(rootLib);
  const build = runBuild();
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const workbenchFiles = await snapshotTree(workbenchLib);
  assert.deepEqual(workbenchFiles.map(([path]) => path).sort(), [
    "client.js",
    "index.js",
    "shared/compatibility.js",
  ]);
  assert.deepEqual(await snapshotTree(rootLib), rootLibBefore);

  const publishedBeforeFailure = workbenchFiles;
  const failedBuild = runBuild({ DSH_AI_WORKBENCH_TEST_FAIL_BEFORE_PUBLISH: "1" });
  assert.notEqual(failedBuild.status, 0, `${failedBuild.stdout}\n${failedBuild.stderr}`);
  assert.deepEqual(await snapshotTree(workbenchLib), publishedBeforeFailure);
});
