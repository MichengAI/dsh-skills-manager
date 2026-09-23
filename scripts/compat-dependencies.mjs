// 0.1.7-rc.1 依赖 Cordis ~4.0.4；更早的已验证 rc 宿主继续锁定 4.0.2。
const CORDIS_PINS = Object.freeze({
  "0.1.7-rc.1": "4.0.4",
});

export function cordisPin(hostVersion) {
  return CORDIS_PINS[hostVersion] ?? "4.0.2";
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
