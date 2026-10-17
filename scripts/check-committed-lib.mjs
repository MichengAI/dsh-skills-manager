// GitHub 安装读的是提交的 lib/。源码变了却没提交产物时，这里必须失败。
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

async function filesIn(dir) {
  const names = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) names.push(...await filesIn(path));
    else names.push(path);
  }
  return names.sort();
}

async function hashLib() {
  const hash = createHash("sha256");
  for (const path of await filesIn("lib")) {
    hash.update(path);
    hash.update((await readFile(path)).toString("utf8").replaceAll("\r\n", "\n"));
  }
  return hash.digest("hex");
}

const before = await hashLib();
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (status) => resolve(status ?? 1));
});
if (code !== 0) process.exit(code);
const after = await hashLib();
if (before !== after) {
  console.error("提交的 lib/ 与当前源码构建结果不一致。请提交这次构建产物。");
  process.exit(1);
}
