import assert from "node:assert/strict";
// 已验证的同版本官方宿主组合；发布元数据由契约测试核对。
export const supportedHosts = Object.freeze(["0.1.0-rc.8", "0.1.1-rc.2", "0.1.2-rc.1", "0.1.5-rc.1"]);
export const peerRange = supportedHosts.join(" || ");
export const developmentHost = "0.1.5-rc.1";

export const requiredHostPeers = Object.freeze([
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-host-webserver",
  "@deepseek-ai/dsh-session",
  "@deepseek-ai/dsh-skill",
  "@deepseek-ai/dsh-tools",
  "@deepseek-ai/dsh-web-app",
]);
export function assertHostPeers(peers) {
  assert.deepEqual(Object.keys(peers).filter(name => name.startsWith("@deepseek-ai/dsh-")).sort(), [...requiredHostPeers].sort(), "官方 peer 集合与必需清单不一致");
}
