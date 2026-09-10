// 默认只校验；--write 从版本清单同步发布元数据和当前 README，历史 CHANGELOG 不参与生成。
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { supportedHosts, peerRange, developmentHost, assertHostPeers } from "./hosts.mjs";
const manifestUrl = new URL("../package.json", import.meta.url);
const original = await readFile(manifestUrl, "utf8");
const manifest = JSON.parse(original);
assertHostPeers(manifest.peerDependencies);
assert.equal(new Set(supportedHosts).size, supportedHosts.length);
assert(supportedHosts.includes(developmentHost));
for (const [field, value] of [["peerDependencies", peerRange], ["devDependencies", developmentHost]]) {
  for (const name of Object.keys(manifest[field])) {
    if (name.startsWith("@deepseek-ai/dsh-")) manifest[field][name] = value;
  }
}
const expected = JSON.stringify(manifest, null, 2) + "\n";
const write = process.argv.includes("--write");
if (write) await writeFile(manifestUrl, expected);
else assert.deepEqual(JSON.parse(original), manifest, "package.json 与 hosts.mjs 不一致；运行 node scripts/sync-hosts.mjs --write");
for (const [file, pattern, line] of [
  ["README.md", /^- Plugin `[^`]+` is tested with DeepSeek Harness .*$/m, `- Plugin \`${manifest.version}\` is tested with DeepSeek Harness ${supportedHosts.map(v => "`" + v + "`").join(", ")}. Development dependencies remain pinned to \`${developmentHost}\`; other Host versions are not implicitly supported.`],
  ["README.zh-CN.md", /^- `[^`]+` 已验证兼容 DeepSeek Harness .*$/m, `- \`${manifest.version}\` 已验证兼容 DeepSeek Harness ${supportedHosts.map(v => "`" + v + "`").join("、")}；开发依赖固定使用 \`${developmentHost}\`，不自动声明支持其他版本。`],
]) {
  const url = new URL("../" + file, import.meta.url);
  const content = await readFile(url, "utf8");
  assert(pattern.test(content), `${file} 缺少兼容说明段落`);
  if (write) await writeFile(url, content.replace(pattern, line));
  else assert.equal(content.match(pattern)[0], line, `${file} 兼容说明需要同步`);
}
