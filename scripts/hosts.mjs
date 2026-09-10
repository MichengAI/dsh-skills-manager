// 已验证的同版本官方宿主组合；发布元数据由契约测试核对。
export const supportedHosts = Object.freeze(["0.1.0-rc.8", "0.1.1-rc.2", "0.1.2-rc.1", "0.1.5-rc.1"]);
export const peerRange = supportedHosts.join(" || ");
export const developmentHost = "0.1.5-rc.1";
