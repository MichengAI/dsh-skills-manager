// 独立解析参数，避免用法错误触发安装或创建沙箱。
import { supportedHosts } from "./hosts.mjs";
export const usage = "用法：node scripts/test-host-compatibility.mjs [版本 | --all] [--keep] [--serve] | --list | --help\n省略版本运行全部；标志可放在版本前后。";
export function parseOptions(args) {
  const flags = new Set();
  const versions = [];
  for (const arg of args) {
    if (arg.startsWith("--")) {
      if (!["--all", "--keep", "--serve", "--list", "--help"].includes(arg)) throw new Error(`未知标志：${arg}`);
      flags.add(arg);
    } else versions.push(arg);
  }
  if (versions.length > 1 || (versions.length && flags.has("--all"))) throw new Error("只能指定一个版本，且不能同时使用 --all");
  if (versions.length && !supportedHosts.includes(versions[0])) throw new Error(`未支持的版本：${versions[0]}`);
  if ((flags.has("--list") || flags.has("--help")) && (flags.size > 1 || versions.length)) throw new Error("--list/--help 必须单独使用");
  return { versions: versions.length ? versions : [...supportedHosts], keep: flags.has("--keep"), serve: flags.has("--serve"), list: flags.has("--list"), help: flags.has("--help") };
}
