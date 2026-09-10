import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// 回归：标志顺序、非法组合与必需 peer 缺失必须被检测。
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { parseOptions } from "../scripts/compatibility-options.mjs";
import { assertHostPeers, supportedHosts, peerRange, developmentHost } from "../scripts/hosts.mjs";
assert.deepEqual(parseOptions(["--keep"]).versions, supportedHosts);
assert.equal(parseOptions(["--keep", supportedHosts[0]]).keep, true);
assert.deepEqual(parseOptions([supportedHosts[0], "--keep"]).versions, [supportedHosts[0]]);
assert.equal(parseOptions(["--list"]).list, true);
assert.equal(parseOptions(["--help"]).help, true);
for (const args of [["--wat"], ["--all", supportedHosts[0]], [supportedHosts[0], supportedHosts[1]], ["--list", "--keep"]]) {
  assert.throws(() => parseOptions(args));
}
assert.throws(() => parseOptions(["--serve"]), /单一版本/);
assert.throws(() => parseOptions(["--all", "--serve"]), /单一版本/);
assert.equal(parseOptions(["--serve", supportedHosts[0]]).serve, true);
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assertHostPeers(manifest.peerDependencies);
for (const [name, range] of Object.entries(manifest.peerDependencies)) {
  if (name.startsWith("@deepseek-ai/dsh-")) assert.equal(range, peerRange, name);
}
for (const [name, version] of Object.entries(manifest.devDependencies)) {
  if (name.startsWith("@deepseek-ai/dsh-")) assert.equal(version, developmentHost, name);
}
const missing = { ...manifest.peerDependencies };
delete missing["@deepseek-ai/dsh-web-app"];
assert.throws(() => assertHostPeers(missing));
assert.throws(() => assertHostPeers({ ...manifest.peerDependencies, "@deepseek-ai/dsh-unknown": "1" }));
// 缺失工具必须在创建宿主沙箱前失败。
const temp = await mkdtemp(join(tmpdir(), "skills-missing-tool-"));
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "path"));
  Object.assign(env, { PATH: "", TEMP: temp, TMP: temp, TMPDIR: temp });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/test-host-compatibility.mjs", import.meta.url)), supportedHosts[0]], { env, encoding: "utf8", timeout: 10000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PATH 中找不到可运行的 npm/);
  assert.deepEqual(await readdir(temp), []);
} finally { await rm(temp, { recursive: true, force: true }); }
console.log("兼容参数、必需 peer 与缺失工具回归通过");
