// 0.1.7-rc.1 依赖 Cordis ~4.0.4；更早的已验证 rc 宿主继续锁定 4.0.2。
// 官方 Cordis 插件的最新版只接受 ~4.0.4。旧宿主若让它们浮动，HMR 服务不会注册，补丁监听会直接退出。
const CORDIS_PINS = Object.freeze({
  "0.1.7-rc.1": "4.0.4",
});
const CORDIS_PLUGIN_PINS = Object.freeze({
  "4.0.2": {
    "@deepseek-ai/cordis-plugin-group": "1.0.2",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.17",
    "@deepseek-ai/cordis-plugin-include": "1.0.7",
    "@deepseek-ai/cordis-plugin-loader": "1.0.3",
    "@deepseek-ai/cordis-plugin-timer": "1.1.4",
  },
  "4.0.4": {
    "@deepseek-ai/cordis-plugin-group": "1.0.4",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.19",
    "@deepseek-ai/cordis-plugin-include": "1.0.9",
    "@deepseek-ai/cordis-plugin-loader": "1.0.5",
    "@deepseek-ai/cordis-plugin-timer": "1.1.6",
  },
});

export function cordisPin(hostVersion) {
  return CORDIS_PINS[hostVersion] ?? "4.0.2";
}

export function hostCordisOverrides(hostVersion) {
  const cordis = cordisPin(hostVersion);
  return { "@deepseek-ai/cordis": cordis, ...CORDIS_PLUGIN_PINS[cordis] };
}

// pnpm 的包名通配 override 不保证匹配传递依赖；在解析每个包时锁定官方依赖。
export function pinHostDependencies(manifest, version) {
  const pinned = { ...manifest };
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (!manifest[field]) continue;
    pinned[field] = Object.fromEntries(Object.entries(manifest[field]).map(([name, range]) =>
      [name, name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-") ? version : range]));
  }
  return pinned;
}
