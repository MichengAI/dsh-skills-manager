// 只给当前支持的宿主钉 Cordis。插件版本跟该宿主自己的 Cordis 线，不把 4.0.4 的插件抄到 4.0.5。
const CORDIS_PINS = Object.freeze({
  "0.2.0-rc.1": "4.0.4",
  "0.2.0-rc.2": "4.0.4",
  "0.2.1-rc.1": "4.0.5",
  "0.2.1-rc.2": "4.0.5",
  "0.2.1-rc.3": "4.0.5",
});
const CORDIS_PLUGIN_PINS = Object.freeze({
  "4.0.4": {
    "@deepseek-ai/cordis-plugin-group": "1.0.4",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.19",
    "@deepseek-ai/cordis-plugin-include": "1.0.9",
    "@deepseek-ai/cordis-plugin-loader": "1.0.5",
    "@deepseek-ai/cordis-plugin-timer": "1.1.6",
  },
  "4.0.5": {
    "@deepseek-ai/cordis-plugin-group": "1.0.5",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.20",
    "@deepseek-ai/cordis-plugin-include": "1.0.10",
    "@deepseek-ai/cordis-plugin-loader": "1.0.6",
    "@deepseek-ai/cordis-plugin-timer": "1.1.7",
  },
});

export function cordisPin(hostVersion) {
  const pin = CORDIS_PINS[hostVersion];
  if (!pin) throw new Error(`未支持的宿主：${hostVersion}`);
  return pin;
}

export function pluginPins(cordis) {
  const plugins = CORDIS_PLUGIN_PINS[cordis];
  if (!plugins) throw new Error(`缺少 ${cordis} 的插件 pin`);
  return plugins;
}

export function hostCordisOverrides(hostVersion) {
  const cordis = cordisPin(hostVersion);
  const overrides = { "@deepseek-ai/cordis": cordis, ...pluginPins(cordis) };
  if (hostVersion === "0.2.1-rc.1" || hostVersion === "0.2.1-rc.2" || hostVersion === "0.2.1-rc.3") {
    overrides["@deepseek-ai/schemastery"] = "3.18.5";
  }
  return overrides;
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
