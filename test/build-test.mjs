// 源码与发布产物边界测试：防止实现重新直接维护在 lib 目录。

import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const run = promisify(execFile);

let passed = 0;
let failed = 0;

async function ok(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error("✗ " + message);
  }
}

for (const path of ["../src/core.js", "../src/index.js", "../src/client.js"]) {
  try {
    await access(new URL(path, import.meta.url), constants.R_OK);
    await ok(true, `${path} exists as maintained source`);
  } catch {
    await ok(false, `${path} exists as maintained source`);
  }
}

for (const path of ["../lib/core.js", "../lib/index.js", "../lib/client.js"]) {
  try {
    await access(new URL(path, import.meta.url), constants.R_OK);
    await ok(true, `${path} exists as generated output`);
  } catch {
    await ok(false, `${path} exists as generated output`);
  }
}

for (const path of ["../lib/core.js.map", "../lib/index.js.map", "../lib/client.js.map"]) {
  try {
    await access(new URL(path, import.meta.url), constants.F_OK);
    await ok(false, `${path} is excluded from generated output`);
  } catch {
    await ok(true, `${path} is excluded from generated output`);
  }
}

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await ok(typeof manifest.scripts?.build === "string" && manifest.scripts.build.length > 0, "package defines a build command");
await ok(manifest.scripts?.test?.includes("build-test.mjs"), "test command enforces the source-layout contract");

const projectRoot = new URL("../", import.meta.url);
const generatedCore = new URL("../lib/core.js", import.meta.url);
const beforeFailureHash = createHash("sha256").update(await readFile(generatedCore)).digest("hex");
try {
  await run(process.execPath, ["scripts/build.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, DSH_SKILLS_MANAGER_TEST_FAIL_BEFORE_PUBLISH: "1" },
  });
  await ok(false, "a failed publish keeps the previous lib output");
} catch {
  const afterFailureHash = createHash("sha256").update(await readFile(generatedCore)).digest("hex");
  await ok(afterFailureHash === beforeFailureHash, "a failed publish keeps the previous lib output");
}
const temporaryBuildDirectories = (await readdir(projectRoot)).filter((name) => name.startsWith(".dsh-skills-manager-build-"));
await ok(temporaryBuildDirectories.length === 0, "failed builds clean temporary output directories");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
