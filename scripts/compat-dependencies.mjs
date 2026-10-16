// 0.2.0 的 RC 依赖 Cordis ~4.0.4；0.2.1 alpha 按宿主自己的 Cordis 范围钉死，避免浮动后 HMR 不注册。
const CORDIS_PINS = Object.freeze({
  "0.1.7-rc.1": "4.0.4",
  "0.1.7-rc.2": "4.0.4",
  "0.2.0-rc.1": "4.0.4",
  "0.2.0-rc.2": "4.0.4",
  "0.2.1-alpha.1": "4.0.5-alpha.1",
  "0.2.1-alpha.2": "4.0.5-alpha.1",
  "0.2.1-alpha.3": "4.0.5-alpha.2",
  "0.2.1-alpha.4": "4.0.5-alpha.2",
  "0.2.1-alpha.5": "4.0.5-alpha.2",
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
  "4.0.5-alpha.1": {
    "@deepseek-ai/cordis-plugin-group": "1.0.4",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.19",
    "@deepseek-ai/cordis-plugin-include": "1.0.10-alpha.1",
    "@deepseek-ai/cordis-plugin-loader": "1.0.6-alpha.1",
    "@deepseek-ai/cordis-plugin-timer": "1.1.7-alpha.1",
  },
  "4.0.5-alpha.2": {
    "@deepseek-ai/cordis-plugin-group": "1.0.5-alpha.2",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.20-alpha.2",
    "@deepseek-ai/cordis-plugin-include": "1.0.10-alpha.2",
    "@deepseek-ai/cordis-plugin-loader": "1.0.6-alpha.2",
    "@deepseek-ai/cordis-plugin-timer": "1.1.7-alpha.2",
  },
});

export function cordisPin(hostVersion) {
  return CORDIS_PINS[hostVersion] ?? "4.0.2";
}

export function hostCordisOverrides(hostVersion) {
  const cordis = cordisPin(hostVersion);
  const overrides = { "@deepseek-ai/cordis": cordis, ...CORDIS_PLUGIN_PINS[cordis] };
  if (hostVersion === "0.2.1-alpha.1" || hostVersion === "0.2.1-alpha.2") {
    overrides["@deepseek-ai/schemastery"] = "3.18.5-alpha.1";
  }
  if (hostVersion === "0.2.1-alpha.3" || hostVersion === "0.2.1-alpha.4" || hostVersion === "0.2.1-alpha.5") {
    overrides["@deepseek-ai/schemastery"] = "3.18.5-alpha.2";
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
