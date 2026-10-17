import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostContext, UpdateOptions, UpdateTarget } from "./host-types.js";
import type { CodedError } from "./types.js";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const PLUGIN_UPDATE_HEADER = "x-michengai-plugin-update";
const PLUGIN_UPDATE_IPC = "apply-plugin-updates";
function header(request: IncomingMessage, name: string) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}
function isLoopbackAddress(value?: string) {
  const address = value?.toLowerCase().replace(/^\[|\]$/g, "");
  return address === "localhost" || address === "localhost." || address === "::1" || address?.startsWith("127.") === true || address?.startsWith("::ffff:127.") === true;
}
function isTrustedUpdateRequest(request: IncomingMessage) {
  if (header(request, PLUGIN_UPDATE_HEADER) !== "1") return false;
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false;
  const site = header(request, "sec-fetch-site");
  if (site !== void 0 && site !== "same-origin") return false;
  const host = header(request, "host");
  if (host === void 0 || host === "") return false;
  const origin = header(request, "origin");
  // 官方 Desktop 从 dsh-app://app 转发时会去掉 origin。只接受本机 Host，浏览器带来的跨源 origin 仍然拒绝。
  if (origin === void 0 || origin === "") {
    try {
      return isLoopbackAddress(new URL(`http://${host}`).hostname);
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && isLoopbackAddress(url.hostname) && url.host === host;
  } catch {
    return false;
  }
}
function validProfileName(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\") && !/[\0-\x1f\x7f]/.test(value);
}
function profileNameFromArgv(argv: readonly string[]) {
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--profile") return argv[index + 1];
    if (argv[index]?.startsWith("--profile=")) return argv[index].slice("--profile=".length);
  }
  return argv[2] === "web" ? "web" : void 0;
}
function isDshCliEntry(entry: string, manifest: {name?: string; bin?: string | {dsh?: string}}, packageRoot: string) {
  if (typeof manifest !== "object" || manifest === null) return false;
  if (manifest.name !== "@deepseek-ai/dsh") return false;
  const bin = typeof manifest.bin === "string" ? manifest.bin : typeof manifest.bin === "object" && manifest.bin !== null ? manifest.bin.dsh : void 0;
  return typeof bin === "string" && bin !== "" && !isAbsolute(bin) && resolve(packageRoot, bin) === resolve(entry);
}
function cliEntry(argv: readonly string[] = process.argv, cwd = process.cwd(), exists: (path: string) => boolean = existsSync) {
  const value = argv[1];
  if (value === void 0 || value === "") return void 0;
  const entry = value.startsWith("file:") ? fileURLToPath(value) : resolve(cwd, value);
  if (!exists(entry)) return void 0;
  for (let directory = dirname(entry); ; ) {
    const manifestPath = resolve(directory, "package.json");
    if (exists(manifestPath)) {
      try {
        if (isDshCliEntry(entry, JSON.parse(readFileSync(manifestPath, "utf8")), directory)) return entry;
      } catch {
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return void 0;
    directory = parent;
  }
}
function optionalService(ctx: { get?: (name: string) => unknown }, name: string) {
  try {
    return typeof ctx.get === "function" ? ctx.get(name) : void 0;
  } catch {
    return void 0;
  }
}
function isOfficialDesktopHostEntry(entry: string | undefined) {
  if (entry === void 0 || entry === "") return false;
  return entry.replaceAll("\\", "/").includes("/dsh-desktop-host/");
}
function stringEnvironment(value: unknown) {
  if (value === null || typeof value !== "object") return void 0;
  const env: NodeJS.ProcessEnv = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") env[key] = item;
  }
  return Object.keys(env).length === 0 ? void 0 : env;
}
function packageManagerFrom(value: unknown): UpdateTarget["packageManager"] {
  if (value === null || typeof value !== "object") return void 0;
  const item = value as { command?: unknown; args?: unknown; env?: unknown };
  if (typeof item.command !== "string" || item.command === "") return void 0;
  if (!Array.isArray(item.args) || !item.args.every((arg) => typeof arg === "string")) return void 0;
  const env = stringEnvironment(item.env);
  return { command: item.command, args: item.args, ...env === void 0 ? {} : { env } };
}
function packageManagerFromArgv(argv: readonly string[], exists: (path: string) => boolean, execPath: string, pathEnv: string | undefined): UpdateTarget["packageManager"] {
  if (!isOfficialDesktopHostEntry(argv[1])) return void 0;
  const pnpm = argv[5];
  if (typeof pnpm !== "string" || !isAbsolute(pnpm) || !exists(pnpm)) return void 0;
  const bin = argv[6];
  const path = typeof bin === "string" && bin !== "" ? `${bin}${delimiter}${pathEnv ?? ""}` : pathEnv;
  return { command: execPath, args: ["--expose-internals", pnpm], env: { ELECTRON_RUN_AS_NODE: "1", ...typeof path === "string" && path !== "" ? { PATH: path } : {} } };
}
function pluginManagerFrom(value: unknown): UpdateTarget["pluginManager"] {
  if (value === null || typeof value !== "object" || typeof (value as { installBundle?: unknown }).installBundle !== "function") return void 0;
  return value as UpdateTarget["pluginManager"];
}
export function resolveUpdateRuntime(ctx: { get?: (name: string) => unknown }, options: { argv?: readonly string[]; env?: NodeJS.ProcessEnv; cwd?: string; homeDir?: string; exists?: (path: string) => boolean; execPath?: string } = {}): UpdateTarget {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const home = options.homeDir ?? homedir();
  const exists = options.exists ?? existsSync;
  const execPath = options.execPath ?? process.execPath;
  const profiles = optionalService(ctx, "desktopProfiles") as { current?: { name?: unknown; dir?: unknown } } | undefined;
  const desktopPnpm = optionalService(ctx, "desktopPnpm") as UpdateTarget["desktopPnpm"];
  if (profiles?.current !== void 0) {
    const current = profiles.current;
    if (!validProfileName(current?.name) || typeof current.dir !== "string" || !isAbsolute(current.dir)) {
      throw new Error("当前 Desktop Profile 信息无效，请重启后重试。");
    }
    const runnable = typeof desktopPnpm?.runPlugin === "function";
    return { profileName: current.name, profileDir: resolve(current.dir), officialDesktop: false, canAutoUpdate: runnable, ...runnable ? { desktopPnpm } : {} };
  }
  const launched = optionalService(ctx, "profileContext") as { name?: unknown; dir?: unknown; packageManager?: unknown } | undefined;
  const official = isOfficialDesktopHostEntry(argv[1]) || launched?.name === "desktop";
  const launchedDir = typeof launched?.dir === "string" && isAbsolute(launched.dir) ? resolve(launched.dir) : void 0;
  const projectDir = official && typeof argv[3] === "string" && isAbsolute(argv[3]) ? resolve(argv[3]) : void 0;
  const cwdProfile = official && exists(resolve(cwd, "package.json")) ? resolve(cwd) : void 0;
  const profileDir = launchedDir ?? projectDir ?? cwdProfile ?? resolve(env.DSH_PROFILE_DIR ?? resolve(home, ".dsh", "profiles", "web"));
  const selected = profileNameFromArgv(argv);
  const profileName = validProfileName(launched?.name) ? launched.name : official ? "desktop" : validProfileName(selected) ? selected : validProfileName(basename(profileDir)) ? basename(profileDir) : "web";
  const packageManager = official ? packageManagerFrom(launched?.packageManager) ?? packageManagerFromArgv(argv, exists, execPath, env.PATH) : void 0;
  const pluginManager = official && packageManager === void 0 ? pluginManagerFrom(optionalService(ctx, "pluginManager")) : void 0;
  const entry = official ? void 0 : cliEntry(argv, cwd, exists);
  return { profileName, profileDir, officialDesktop: official, canAutoUpdate: packageManager !== void 0 || pluginManager !== void 0 || entry !== void 0, ...packageManager === void 0 ? {} : { packageManager }, ...pluginManager === void 0 ? {} : { pluginManager }, ...entry === void 0 ? {} : { cliEntry: entry } };
}
export function shouldNotifyParent(target: UpdateTarget, send: NodeJS.Process["send"] = process.send) {
  return target.officialDesktop !== true && target.desktopPnpm === void 0 && target.packageManager === void 0 && typeof send === "function";
}
function runtime(ctx: HostContext): UpdateTarget {
  return resolveUpdateRuntime(ctx as { get?: (name: string) => unknown });
}
function parseSemver(value: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if (match === null) return void 0;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4]?.split(".") ?? [] };
}
function isNewerVersion(currentValue: string, candidateValue: string) {
  const current = parseSemver(currentValue);
  const candidate = parseSemver(candidateValue);
  if (current === void 0 || candidate === void 0) return false;
  for (let index = 0; index < 3; index += 1) {
    if (candidate.core[index] !== current.core[index]) return candidate.core[index] > current.core[index];
  }
  return comparePrerelease(candidate.prerelease, current.prerelease) > 0;
}
function comparePrerelease(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === void 0 || b === void 0) return a === b ? 0 : a === void 0 ? -1 : 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const aNumber = BigInt(a);
      const bNumber = BigInt(b);
      if (aNumber !== bNumber) return aNumber > bNumber ? 1 : -1;
      continue;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}
let latestCache: {packageName: string; expiresAt: number; version: string} | undefined;
async function latestVersion(packageName: string) {
  if (latestCache?.packageName === packageName && Date.now() < latestCache.expiresAt) return latestCache.version;
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, { signal: AbortSignal.timeout(8e3) });
    if (!response.ok) return void 0;
    const value: {version?: unknown} = await response.json();
    if (typeof value.version !== "string" || value.version === "") return void 0;
    latestCache = { packageName, version: value.version, expiresAt: Date.now() + 5 * 6e4 };
    return value.version;
  } catch {
    return void 0;
  }
}
async function currentVersion(manifestUrl: URL) {
  const value: {version?: unknown} = JSON.parse(await readFile(manifestUrl, "utf8"));
  if (typeof value.version !== "string" || value.version === "") throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u63D2\u4EF6\u7248\u672C\u3002");
  return value.version;
}
async function status(options: UpdateOptions, target: UpdateTarget) {
  const current = await currentVersion(options.manifestUrl);
  const latest = await latestVersion(options.packageName);
  return {
    packageName: options.packageName,
    currentVersion: current,
    ...latest === void 0 ? {} : { latestVersion: latest },
    latestCheckFailed: latest === void 0,
    updateAvailable: latest !== void 0 && isNewerVersion(current, latest),
    profileName: target.profileName,
    canAutoUpdate: target.canAutoUpdate
  };
}
function releaseAgeSpec(packageSpec: string) {
  const at = packageSpec.lastIndexOf("@");
  if (at <= 0) return undefined;
  const name = packageSpec.slice(0, at);
  const version = packageSpec.slice(at + 1);
  if (!isPackageName(name) || !isReleaseVersion(version)) return undefined;
  return { name, version };
}
function isPackageName(name: string) {
  return /^@[^/\s]+\/[^/\s]+$/.test(name) || /^[^@/\s]+$/.test(name);
}
function isReleaseVersion(version: string) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}
function unreadableReleaseAgeExclude() {
  return new Error("发布年龄白名单无法安全合并，已停止更新，避免这个 profile 之后无法安装插件。");
}
function excludeEntry(indent: string, name: string, versions: readonly string[], comment = "") {
  const entry = `${indent}- '${name}@${versions.join(" || ")}'`;
  return comment === "" ? entry : `${entry} ${comment}`;
}
function parseExcludeLine(line: string) {
  const dash = line.indexOf("-");
  if (!/^\s+-/.test(line) || dash < 0) return undefined;
  const indent = line.slice(0, dash);
  const raw = line.slice(dash + 1).trim();
  let body = raw;
  let comment = "";
  if (raw.startsWith("'") || raw.startsWith("\"")) {
    const quote = raw[0] ?? "'";
    const end = raw.lastIndexOf(quote);
    if (end <= 0) return undefined;
    const rest = raw.slice(end + 1).trim();
    if (rest !== "" && !rest.startsWith("#")) return undefined;
    if (rest.startsWith("#")) comment = rest;
    body = raw.slice(1, end);
  } else if (raw.includes("#")) return undefined;
  if (body.includes("#")) return undefined;
  const versionAt = body.lastIndexOf("@");
  if (versionAt > 0) {
    const name = body.slice(0, versionAt);
    const versions = body.slice(versionAt + 1).split(" || ");
    if (isPackageName(name) && versions.every(isReleaseVersion)) return { indent, name, versions, comment };
    return undefined;
  }
  if (isPackageName(body) || /^@[^/\s]+\/\*$/.test(body)) return { indent, name: body, versions: undefined, comment };
  return undefined;
}
/** 把刚安装的精确版本并进 profile 白名单。pnpm 每个包名只认第一条，所以必须并进已有 union，不能另起一行，也不能收成裸包名。 */
export function mergeMinimumReleaseAgeExclude(yaml: string, packageSpec: string) {
  const spec = releaseAgeSpec(packageSpec);
  if (spec === undefined) throw new Error("更新版本无法写入发布年龄白名单，已停止更新。");
  const eol = yaml.includes("\r\n") ? "\r\n" : "\n";
  const text = yaml.replaceAll("\r\n", "\n");
  const next = mergeReleaseAgeText(text, spec.name, spec.version);
  return eol === "\r\n" ? next.replaceAll("\n", "\r\n") : next;
}
function mergeReleaseAgeText(yaml: string, name: string, version: string) {
  if (/minimumReleaseAgeExclude:[^\n\r]/.test(yaml)) throw unreadableReleaseAgeExclude();
  const marker = /(?:^|\n)minimumReleaseAgeExclude:[ \t]*(?:\n|$)/.exec(yaml);
  if (marker === null) {
    const base = yaml.endsWith("\n") || yaml.length === 0 ? yaml : `${yaml}\n`;
    const gap = base.length === 0 || base.endsWith("\n\n") ? "" : "\n";
    return `${base}${gap}minimumReleaseAgeExclude:\n  - '${name}@${version}'\n`;
  }
  const keyAt = (marker.index ?? 0) + (marker[0].startsWith("\n") ? 1 : 0);
  let cursor = keyAt + "minimumReleaseAgeExclude:".length;
  while (cursor < yaml.length && (yaml[cursor] === " " || yaml[cursor] === "\t")) cursor += 1;
  if (yaml[cursor] !== "\n") throw unreadableReleaseAgeExclude();
  const bodyStart = cursor + 1;
  const lines: string[] = [];
  let bodyEnd = bodyStart;
  while (bodyEnd <= yaml.length) {
    const nextNl = yaml.indexOf("\n", bodyEnd);
    const lineEnd = nextNl === -1 ? yaml.length : nextNl;
    const line = yaml.slice(bodyEnd, lineEnd);
    const ended = line.trim() !== "" && !/^[ \t]*#/.test(line) && !/^[ \t]/.test(line);
    if (ended) break;
    if (line.trim() !== "" && !/^[ \t]*#/.test(line) && !/^[ \t]+-/.test(line)) throw unreadableReleaseAgeExclude();
    lines.push(line);
    if (nextNl === -1) {
      bodyEnd = yaml.length;
      break;
    }
    bodyEnd = nextNl + 1;
    if (bodyEnd === yaml.length) break;
  }
  let ours: { index: number; versions: string[] | undefined; indent: string; comment: string } | undefined;
  const rewritten = lines.map((line, index) => {
    if (line.trim() === "" || /^[ \t]*#/.test(line)) return line;
    const parsed = parseExcludeLine(line);
    if (parsed === undefined) throw unreadableReleaseAgeExclude();
    if (parsed.name !== name) return line;
    if (ours === undefined) {
      ours = { index, indent: parsed.indent, versions: parsed.versions, comment: parsed.comment };
      return line;
    }
    if (ours.versions !== undefined && parsed.versions !== undefined) ours.versions = [...ours.versions, ...parsed.versions.filter((item) => !ours?.versions?.includes(item))];
    return "";
  });
  if (ours?.versions === undefined && ours !== undefined) return yaml;
  const indent = ours?.indent ?? lines.find((line) => /^[ \t]+-/.test(line))?.match(/^([ \t]+)/)?.[1] ?? "  ";
  const versions = ours?.versions === undefined ? [version] : ours.versions.includes(version) ? ours.versions : [...ours.versions, version];
  const entry = excludeEntry(indent, name, versions, ours?.comment ?? "");
  if (ours === undefined) rewritten.push(entry);
  else rewritten[ours.index] = entry;
  const body = rewritten.filter((line) => line !== "").join("\n");
  const prefix = yaml.slice(0, bodyStart);
  const suffix = yaml.slice(bodyEnd);
  const joined = `${prefix}${body}${body.length === 0 || body.endsWith("\n") ? "" : "\n"}${suffix}`;
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}
async function guardReleaseAgeExclude(profileDir: string, packageSpec: string) {
  const file = resolve(profileDir, "pnpm-workspace.yaml");
  const current = existsSync(file) ? await readFile(file, "utf8") : "packages:\n  - .\n";
  mergeMinimumReleaseAgeExclude(current, packageSpec);
}
async function replaceTextFile(file: string, next: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  const backup = `${file}.${process.pid}.bak`;
  await writeFile(tmp, next, "utf8");
  try {
    await rename(tmp, file);
    return;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") {
      await unlink(tmp).catch(() => {});
      throw error;
    }
  }
  await unlink(backup).catch(() => {});
  await rename(file, backup);
  try {
    await rename(tmp, file);
  } catch (error) {
    await rename(backup, file).catch(() => {});
    await unlink(tmp).catch(() => {});
    throw error;
  }
  await unlink(backup).catch(() => {});
}
async function recordReleaseAgeExclude(profileDir: string, packageSpec: string) {
  const file = resolve(profileDir, "pnpm-workspace.yaml");
  const current = existsSync(file) ? await readFile(file, "utf8") : "packages:\n  - .\n";
  const next = mergeMinimumReleaseAgeExclude(current, packageSpec);
  if (next !== current) await replaceTextFile(file, next);
}
async function runCliInstall(target: UpdateTarget, packageSpec: string) {
  if (target.cliEntry === void 0) throw new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u81EA\u52A8\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u624B\u5DE5\u66F4\u65B0\u547D\u4EE4\u3002");
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [target.cliEntry!, "plugin", "--profile", target.profileName, "add", "--config.minimumReleaseAge=0", packageSpec, "--registry=https://registry.npmjs.org/"], {
      cwd: target.profileDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" }
    });
    let detail = "";
    child.stdout?.on("data", (chunk) => {
      detail = (detail + String(chunk)).slice(-4e3);
    });
    child.stderr?.on("data", (chunk) => {
      detail = (detail + String(chunk)).slice(-4e3);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("\u66F4\u65B0\u8D85\u65F6\uFF0C\u8BF7\u6539\u7528\u624B\u5DE5\u66F4\u65B0\u3002"));
    }, 10 * 6e4);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(detail.trim() || `\u66F4\u65B0\u8FDB\u7A0B\u9000\u51FA\u7801 ${String(code)}`));
    });
  });
}
async function install(target: UpdateTarget, packageSpec: string) {
  if (target.desktopPnpm !== void 0) {
    await guardReleaseAgeExclude(target.profileDir, packageSpec);
    const handle = target.desktopPnpm.runPlugin(["add", "--config.minimumReleaseAge=0", packageSpec, "--registry=https://registry.npmjs.org/"], target.profileDir);
    const result = await handle.done;
    if (result.exitCode !== 0) throw new Error(`更新进程退出码 ${String(result.exitCode)}。`);
    await recordReleaseAgeExclude(target.profileDir, packageSpec);
    return;
  }
  if (target.packageManager !== void 0) {
    await guardReleaseAgeExclude(target.profileDir, packageSpec);
    const manager = target.packageManager;
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(manager.command, [...manager.args, "add", "--config.minimumReleaseAge=0", packageSpec, "--registry=https://registry.npmjs.org/"], {
        cwd: target.profileDir, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...manager.env, NO_COLOR: "1" },
      });
      let detail = "";
      child.stdout?.on("data", (chunk) => { detail = (detail + String(chunk)).slice(-4e3); });
      child.stderr?.on("data", (chunk) => { detail = (detail + String(chunk)).slice(-4e3); });
      const timer = setTimeout(() => { child.kill(); reject(new Error("更新超时，请改用手工更新。")); }, 10 * 6e4);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); if (code === 0) resolvePromise(); else reject(new Error(detail.trim() || `更新进程退出码 ${String(code)}`)); });
    });
    await recordReleaseAgeExclude(target.profileDir, packageSpec);
    return;
  }
  if (target.pluginManager !== void 0) {
    await guardReleaseAgeExclude(target.profileDir, packageSpec);
    const result = await target.pluginManager.installBundle(packageSpec);
    if (result.application === "applied" || result.application === "restart-required" || result.application === "overridden") {
      await recordReleaseAgeExclude(target.profileDir, packageSpec);
      return;
    }
    throw new Error(result.error?.message || result.packageResult?.output || "更新失败，请查看服务端日志。");
  }
  await guardReleaseAgeExclude(target.profileDir, packageSpec);
  await runCliInstall(target, packageSpec);
  await recordReleaseAgeExclude(target.profileDir, packageSpec);
}
function json(response: ServerResponse, statusCode: number, value: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}
function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "\u66F4\u65B0\u6682\u4E0D\u53EF\u7528\u3002";
  return /[A-Za-z]:[\\/]|\/(?:home|root|Users|var|tmp)\//.test(message) ? "\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u670D\u52A1\u7AEF\u65E5\u5FD7\u3002" : message;
}
function registerPluginUpdater(ctx: HostContext, options: UpdateOptions) {
  const host = ctx;
  let installing = false;
  return host.webServer.register({
    kind: "exact",
    path: options.endpoint,
    handler: async (request, response) => {
      try {
        const target = runtime(host);
        if (request.method === "GET" || request.method === "HEAD") {
          const payload = await status(options, target);
          response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          response.end(request.method === "HEAD" ? void 0 : JSON.stringify(payload));
          return;
        }
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "GET, HEAD, POST" });
          response.end();
          return;
        }
        if (!isTrustedUpdateRequest(request)) {
          json(response, 403, { error: "\u5DF2\u62D2\u7EDD\u975E\u672C\u673A\u540C\u6E90\u66F4\u65B0\u8BF7\u6C42\u3002" });
          return;
        }
        if (installing) {
          json(response, 409, { error: "\u5F53\u524D\u63D2\u4EF6\u6B63\u5728\u66F4\u65B0\uFF0C\u8BF7\u7A0D\u5019\u3002" });
          return;
        }
        const before = await status(options, target);
        if (before.latestVersion === void 0) {
          json(response, 503, { error: "\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u6700\u65B0\u7248\u672C\u3002" });
          return;
        }
        if (!before.updateAvailable) {
          json(response, 200, before);
          return;
        }
        installing = true;
        try {
          await install(target, `${options.packageName}@${before.latestVersion}`);
        } finally {
          installing = false;
        }
        const notifyParent = shouldNotifyParent(target);
        const autoReload = target.desktopPnpm !== void 0 || notifyParent;
        json(response, 200, { ...before, updatedVersion: before.latestVersion, restartRequired: true, autoReload, ...target.officialDesktop ? { restartDesktop: true } : {} });
        if (notifyParent) setTimeout(() => {
          process.send?.(PLUGIN_UPDATE_IPC);
        }, 150).unref?.();
      } catch (caught) { const error = caught as CodedError;
        ctx.logger.warn(`plugin updater failed: ${String(error)}`);
        json(response, 503, { error: publicError(error) });
      }
    }
  });
}
export {
  PLUGIN_UPDATE_HEADER,
  PLUGIN_UPDATE_IPC,
  isDshCliEntry,
  isNewerVersion,
  isTrustedUpdateRequest,
  recordReleaseAgeExclude,
  registerPluginUpdater
};
