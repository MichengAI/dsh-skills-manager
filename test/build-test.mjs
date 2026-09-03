// 源码与发布产物边界测试：防止实现重新直接维护在 lib 目录。

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

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

for (const path of ["../lib/core.js", "../lib/index.js", "../lib/client.js", "../lib/core.js.map", "../lib/index.js.map", "../lib/client.js.map"]) {
  try {
    await access(new URL(path, import.meta.url), constants.R_OK);
    await ok(true, `${path} exists as generated output`);
  } catch {
    await ok(false, `${path} exists as generated output`);
  }
}

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await ok(typeof manifest.scripts?.build === "string" && manifest.scripts.build.length > 0, "package defines a build command");
await ok(manifest.scripts?.test?.includes("build-test.mjs"), "test command enforces the source-layout contract");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
