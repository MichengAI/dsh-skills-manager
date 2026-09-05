import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = dirname(dirname(packageRoot));
const buildScript = join(packageRoot, "scripts/build.mjs");
const requiredOutputs = [
  "lib/index.js",
  "lib/client.js",
  "lib/shared/capabilities.js",
  "lib/shared/capability-manifest.js",
  "lib/shared/automation-contracts.js",
  "lib/shared/schedule.js",
  "lib/shared/compatibility.js",
  "lib/host/http.js",
  "lib/host/capability-service.js",
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

test("package-cwd build publishes the required generated outputs", async () => {
  const build = runBuild(packageRoot);
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
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

test("an active build lock prevents a concurrent build", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    await mkdir(join(fixtureRoot, ".lib-build.lock"));
    await writeFile(
      join(fixtureRoot, ".lib-build.lock/owner.json"),
      JSON.stringify({ pid: process.pid, token: "active-test-lock" }),
    );
    const build = runBuild(fixtureRoot);
    assert.notEqual(build.status, 0, `${build.stdout}\n${build.stderr}`);
    assert.match(`${build.stdout}\n${build.stderr}`, /build lock is held by process/i);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("a stale build lock directory is reclaimed before building", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    await mkdir(join(fixtureRoot, ".lib-build.lock"));
    await writeFile(
      join(fixtureRoot, ".lib-build.lock/owner.json"),
      JSON.stringify({ pid: 0, token: "stale-test-lock" }),
    );

    const build = runBuild(fixtureRoot);
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    await assertFilesExist(fixtureRoot, ["lib/index.js"]);
    await assert.rejects(stat(join(fixtureRoot, ".lib-build.lock")), { code: "ENOENT" });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("a recent lock without owner metadata is treated as an active initialization", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    await mkdir(join(fixtureRoot, ".lib-build.lock"));

    const build = runBuild(fixtureRoot);
    assert.notEqual(build.status, 0, `${build.stdout}\n${build.stderr}`);
    assert.match(`${build.stdout}\n${build.stderr}`, /build lock is initializing/i);
    await assert.rejects(stat(join(fixtureRoot, ".lib-build.lock/owner.json")), { code: "ENOENT" });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("an old lock without owner metadata is reclaimed by lock age", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    const lockDirectory = join(fixtureRoot, ".lib-build.lock");
    await mkdir(lockDirectory);
    const old = new Date("2020-01-01T00:00:00Z");
    await utimes(lockDirectory, old, old);

    const build = runBuild(fixtureRoot);
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    await assertFilesExist(fixtureRoot, ["lib/index.js"]);
    await assert.rejects(stat(lockDirectory), { code: "ENOENT" });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("startup recovers orphaned publish artifacts before a failed build", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    const orphanBackup = join(fixtureRoot, ".lib-backup-orphan");
    const orphanStaging = join(fixtureRoot, ".lib-staging-orphan");
    await mkdir(orphanBackup, { recursive: true });
    await writeFile(join(orphanBackup, "recovered.txt"), "recovered");
    await mkdir(orphanStaging, { recursive: true });
    await writeFile(join(orphanStaging, "partial.txt"), "partial");

    const failedBuild = runBuild(fixtureRoot, { DSH_AI_WORKBENCH_TEST_FAIL_BEFORE_PUBLISH: "1" });
    assert.notEqual(failedBuild.status, 0, `${failedBuild.stdout}\n${failedBuild.stderr}`);
    assert.equal(await readFile(join(fixtureRoot, "lib/recovered.txt"), "utf8"), "recovered");
    await assert.rejects(stat(orphanBackup), { code: "ENOENT" });
    await assert.rejects(stat(orphanStaging), { code: "ENOENT" });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("startup restores the newest orphaned backup and removes older backups", async () => {
  const fixtureRoot = await createBuildFixture();
  try {
    const olderBackup = join(fixtureRoot, ".lib-backup-z-older");
    const newerBackup = join(fixtureRoot, ".lib-backup-a-newer");
    const staleStaging = join(fixtureRoot, ".lib-staging-stale");
    await mkdir(olderBackup, { recursive: true });
    await writeFile(join(olderBackup, "recovered.txt"), "older");
    await mkdir(newerBackup, { recursive: true });
    await writeFile(join(newerBackup, "recovered.txt"), "newer");
    await mkdir(staleStaging, { recursive: true });
    await writeFile(join(staleStaging, "partial.txt"), "partial");
    await utimes(olderBackup, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
    await utimes(newerBackup, new Date("2021-01-01T00:00:00Z"), new Date("2021-01-01T00:00:00Z"));

    const failedBuild = runBuild(fixtureRoot, { DSH_AI_WORKBENCH_TEST_FAIL_BEFORE_PUBLISH: "1" });
    assert.notEqual(failedBuild.status, 0, `${failedBuild.stdout}\n${failedBuild.stderr}`);
    assert.equal(await readFile(join(fixtureRoot, "lib/recovered.txt"), "utf8"), "newer");
    await assert.rejects(stat(olderBackup), { code: "ENOENT" });
    await assert.rejects(stat(newerBackup), { code: "ENOENT" });
    await assert.rejects(stat(staleStaging), { code: "ENOENT" });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("build transient directories are ignored by git", async () => {
  const gitignore = await readFile(join(repositoryRoot, ".gitignore"), "utf8");
  for (const pattern of [
    "packages/ai-workbench/.lib-staging-*/",
    "packages/ai-workbench/.lib-backup-*/",
    "packages/ai-workbench/.generated-output-test-*/",
    "packages/ai-workbench/.lib-build.lock/",
  ]) {
    assert.ok(gitignore.split("\n").includes(pattern), `expected ${pattern} in .gitignore`);
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
      await mkdir(dirname(fullPath), { recursive: true });
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
