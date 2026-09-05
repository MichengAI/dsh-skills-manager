import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const buildScript = join(packageRoot, "scripts/build.mjs");
const requiredOutputs = [
  "lib/index.js",
  "lib/client.js",
  "lib/shared/compatibility.js",
  "lib/host/http.js",
  "lib/client/root.js",
  "lib/client/styles.js",
];

function runBuild(cwd, env = {}) {
  return spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

async function assertFilesExist(root, paths) {
  for (const path of paths) {
    await assert.doesNotReject(stat(join(root, path)), `expected ${path} to exist`);
  }
}

async function createBuildFixture() {
  const fixtureRoot = await mkdtemp(join(packageRoot, ".generated-output-test-"));
  await cp(join(packageRoot, "src"), join(fixtureRoot, "src"), { recursive: true });
  await mkdir(join(fixtureRoot, "scripts"), { recursive: true });
  await cp(buildScript, join(fixtureRoot, "scripts/build.mjs"));
  return fixtureRoot;
}

test("package-cwd build publishes the required generated outputs", async () => {
  await assertFilesExist(packageRoot, requiredOutputs);

  const clientSource = await readFile(join(packageRoot, "lib/client.js"), "utf8");
  assert.match(clientSource, /@michengai\/dsh-ai-workbench/);
  assert.doesNotMatch(clientSource, /sourceMappingURL/);
  await assert.rejects(stat(join(packageRoot, "lib/client/client.js")), { code: "ENOENT" });
});

test("a forced pre-publish failure leaves the published client unchanged", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    const initialBuild = runBuild(fixtureRoot);
    assert.equal(initialBuild.status, 0, `${initialBuild.stdout}\n${initialBuild.stderr}`);

    const clientPath = join(fixtureRoot, "lib/client.js");
    const publishedBeforeFailure = await readFile(clientPath);
    const metadataBeforeFailure = await stat(clientPath, { bigint: true });

    const failedBuild = runBuild(fixtureRoot, { DSH_AI_WORKBENCH_TEST_FAIL_BEFORE_PUBLISH: "1" });
    assert.notEqual(failedBuild.status, 0, `${failedBuild.stdout}\n${failedBuild.stderr}`);
    assert.deepEqual(await readFile(clientPath), publishedBeforeFailure);
    assert.equal((await stat(clientPath, { bigint: true })).mtimeNs, metadataBeforeFailure.mtimeNs);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("build recursively discovers nested host, shared, and client modules", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    const fixtures = [
      ["src/host/nested/fixture.js", "export const hostFixture = true;\n"],
      ["src/shared/nested/fixture.js", "export const sharedFixture = true;\n"],
      ["src/client/nested/fixture.js", "export const clientFixture = true;\n"],
    ];
    for (const [path, source] of fixtures) {
      const fullPath = join(fixtureRoot, path);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, source);
    }

    const build = runBuild(fixtureRoot);
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    await assertFilesExist(fixtureRoot, [
      "lib/host/nested/fixture.js",
      "lib/shared/nested/fixture.js",
      "lib/client/nested/fixture.js",
    ]);
    await assert.rejects(stat(join(fixtureRoot, "lib/client/client.js")), { code: "ENOENT" });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
