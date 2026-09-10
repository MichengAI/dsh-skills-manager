// 回归：标志顺序、非法组合与必需 peer 缺失必须被检测。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOptions } from "../scripts/compatibility-options.mjs";
import { assertHostPeers, supportedHosts } from "../scripts/hosts.mjs";
assert.deepEqual(parseOptions(["--keep"]).versions, supportedHosts);
assert.equal(parseOptions(["--keep", supportedHosts[0]]).keep, true);
assert.deepEqual(parseOptions([supportedHosts[0], "--keep"]).versions, [supportedHosts[0]]);
assert.equal(parseOptions(["--list"]).list, true);
assert.equal(parseOptions(["--help"]).help, true);
for (const args of [["--wat"], ["--all", supportedHosts[0]], [supportedHosts[0], supportedHosts[1]], ["--list", "--keep"]]) {
  assert.throws(() => parseOptions(args));
}
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assertHostPeers(manifest.peerDependencies);
const missing = { ...manifest.peerDependencies };
delete missing["@deepseek-ai/dsh-web-app"];
assert.throws(() => assertHostPeers(missing));
assert.throws(() => assertHostPeers({ ...manifest.peerDependencies, "@deepseek-ai/dsh-unknown": "1" }));
console.log("兼容参数与必需 peer 回归通过");
