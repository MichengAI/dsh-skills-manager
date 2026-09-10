// 隔离安装指定版本的真实 DSH Web，验证发布包、Agent 作用域和技能策略。
// --serve 在检查后保留宿主供浏览器验收；Ctrl+C 关闭宿主。失败或 --keep 保留临时目录；结果另存 .compat-results。
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, cp, realpath, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, delimiter, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

import { supportedHosts as supported } from "./hosts.mjs";
const version = process.argv[2];
if (!version || version === "--all") {
  for (const item of supported) {
    const code = await new Promise((done, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), item, ...process.argv.slice(3)], { stdio: "inherit", windowsHide: true });
      child.once("error", reject);
      child.once("exit", done);
    });
    if (code !== 0) process.exit(1);
  }
  process.exit(0);
}
if (version === "--list") { console.log(JSON.stringify(supported)); process.exit(0); }
assert(supported.includes(version), `用法：node scripts/test-host-compatibility.mjs <${supported.join("|")}> [--serve]`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = await mkdtemp(join(tmpdir(), `dsh-skills-compat-${version}-`));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
// 从 PATH 的实际 shim 或符号链接定位入口，不依赖 Node 安装位置。
async function findTool(name) {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    const shim = join(directory, name + (process.platform === "win32" ? ".cmd" : ""));
    try {
      const target = await realpath(shim);
      if (process.platform !== "win32") return target;
      const candidates = name === "npm" ? ["node_modules/npm/bin/npm-cli.js"] : ["node_modules/pnpm/bin/pnpm.cjs", "node_modules/corepack/dist/pnpm.js"];
      for (const candidate of candidates) {
        const entry = resolve(dirname(target), candidate);
        try { await access(entry); return entry; } catch {}
      }
    } catch {}
  }
  throw new Error(`PATH 中找不到可运行的 ${name} 入口；请安装项目指定的 pnpm 和 npm 后重试。`);
}
const npm = await findTool("npm");
const pnpm = await findTool("pnpm");
const env = { ...process.env, DSH_HOME: join(sandbox, "home"), USERPROFILE: join(sandbox, "user") };
for (const key of ["AGENTS", "CODEX", "CLAUDE", "GEMINI", "OPENCODE", "CURSOR"]) {
  env[`DSH_${key}_HOME`] = join(env.USERPROFILE, key.toLowerCase());
}
const workspace = join(sandbox, "workspace");
await mkdir(workspace, { recursive: true });
await mkdir(join(workspace, ".git"));
await mkdir(env.USERPROFILE, { recursive: true });

async function run(args, cwd = sandbox, taskEnv = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: taskEnv, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => {
      void stopProcess(child).catch(error => console.error(error));
      reject(new Error(`命令超过 180 秒：${args.join(" ")}\n${output}`));
    }, 180000);
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("exit", code => {
      clearTimeout(timeout);
      code === 0 ? resolveRun(output) : reject(new Error(`${args.join(" ")} (${code})\n${output}`));
    });
  });
}

// 仅终止本脚本启动的进程树；退出有界，避免失败后无限等待。
async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((done, reject) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      const timer = setTimeout(() => { killer.kill(); reject(new Error("终止进程树超时")); }, 10000);
      killer.once("error", error => { clearTimeout(timer); reject(error); });
      killer.once("exit", () => { clearTimeout(timer); done(); });
    });
  } else {
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(new Error("宿主退出超时")), 10000);
      child.once("exit", () => { clearTimeout(timer); done(); });
    });
  }
}

const report = { version, plugin: manifest.version, sandbox, checks: [] };
let host;
let hostLog = "";
try {
  console.log(`${version}: 隔离安装 ${sandbox}`);
  const dependencies = { "@deepseek-ai/dsh": version };
  for (const name of Object.keys(manifest.peerDependencies)) {
    if (name.startsWith("@deepseek-ai/dsh-")) dependencies[name] = version;
  }
  await writeFile(join(sandbox, "package.json"), JSON.stringify({ private: true, type: "module", packageManager: manifest.packageManager, dependencies }));
  // 旧版宿主的 peer 图会使 npm 11 长时间解析；使用项目规定的 pnpm，并统一官方版本。
  await writeFile(join(sandbox, "pnpm-workspace.yaml"), `autoInstallPeers: true\nstrictPeerDependencies: false\noverrides:\n  '@deepseek-ai/dsh-*': '${version}'\n  '@deepseek-ai/cordis': '4.0.2'\n`);
  const installLog = await run([pnpm, "install", "--ignore-scripts", "--registry=https://registry.npmjs.org/"]);
  await writeFile(join(sandbox, "install.log"), installLog);
  for (const [name, expected] of Object.entries(dependencies)) {
    const installed = JSON.parse(await readFile(join(sandbox, "node_modules", name, "package.json"), "utf8"));
    assert.equal(installed.version, expected, `${name} 不能由其他版本掩盖`);
  }
  report.checks.push("精确版本的宿主与全部直接官方 peer 已安装");
  const pack = JSON.parse(await run([npm, "pack", "--ignore-scripts", "--json", "--pack-destination", sandbox], root));
  const cli = join(sandbox, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  await writeFile(join(sandbox, "plugin-install.log"), await run([cli, "plugin", "--profile", "web", "add", join(sandbox, pack[0].filename), "--registry=https://registry.npmjs.org/"], sandbox, env));
  await cp(join(root, "test", "fixtures", "compatibility-probe.mjs"), join(sandbox, "probe.mjs"));
  await writeFile(join(sandbox, "probe.yml"), `- insert:\n    - id: skills-compat-probe\n      name: ${JSON.stringify(pathToFileURL(join(sandbox, "probe.mjs")).href)}\n`);
  const external = join(env.DSH_AGENTS_HOME, "skills", "compat-external");
  await mkdir(external, { recursive: true });
  const original = "---\nname: compat-external\ndescription: 隔离兼容测试\n---\nCOMPAT_EXTERNAL_BODY\n";
  await writeFile(join(external, "SKILL.md"), original);
  const local = join(env.DSH_HOME, "skills", "compat-local");
  await mkdir(local, { recursive: true });
  await writeFile(join(local, "SKILL.md"), original.replaceAll("compat-external", "compat-local"));
  host = spawn(process.execPath, [cli, "--profile", "web", "--patch", join(sandbox, "probe.yml"), "--port", "0", "--no-open"], { cwd: workspace, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => reject(new Error(`宿主启动超时\n${hostLog}`)), 45000);
    const observe = data => {
      hostLog += data;
      const match = hostLog.match(/http:\/\/127\.0\.0\.1:\d+(?:\/[^\s]*)?/);
      if (match) { clearTimeout(timeout); resolveUrl(match[0]); }
    };
    host.stdout.on("data", observe);
    host.stderr.on("data", observe);
    host.once("error", error => { clearTimeout(timeout); reject(error); });
    host.once("exit", code => { clearTimeout(timeout); reject(new Error(`宿主提前退出 ${code}\n${hostLog}`)); });
  });
  const base = new URL(url).origin;
  // 首次访问换取宿主 Cookie；不在证据中保存临时访问 token。
  const landing = await fetch(url, { redirect: "manual" });
  const cookie = landing.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  async function request(path, body) {
    const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { cookie, origin: base, "content-type": "application/json", "x-dsh-skills-manager": "1" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return JSON.parse(text);
  }
  const state = await request("/api/dsh-skills-manager/state");
  assert(state.ok);
  for (const name of ["compat-external", "compat-local"]) {
    assert(state.data.roots.some(item => item.skills.some(skill => skill.name === name)), `状态缺少 ${name}`);
  }
  const probe = () => request("/__skills-manager-compat");
  let snapshot = await probe();
  assert(snapshot.list.some(skill => skill.name === "compat-external"));
  assert(snapshot.list.some(skill => skill.name === "compat-local"));
  assert(snapshot.local.content.includes("COMPAT_EXTERNAL_BODY"));
  assert(snapshot.skill.content.includes("COMPAT_EXTERNAL_BODY"));
  assert(snapshot.skill.invocation.modelInvocable);
  report.checks.push("发布包加载、状态接口、真实 Agent 作用域列表与正文读取");
  await request("/api/dsh-skills-manager/disable", { root: "agents", name: "compat-external" });
  snapshot = await probe();
  assert(snapshot.list.some(skill => skill.name === "compat-external"), "停用后仍可发现技能");
  assert.equal(snapshot.skill.invocation.modelInvocable, false);
  assert.equal(snapshot.skill.invocation.userInvocable, false);
  await request("/api/dsh-skills-manager/enable", { root: "agents", name: "compat-external" });
  snapshot = await probe();
  assert.equal(snapshot.skill.invocation.modelInvocable, true);
  assert.equal(snapshot.skill.invocation.userInvocable, true);
  assert.equal(await readFile(join(external, "SKILL.md"), "utf8"), original);
  report.checks.push("活动 Agent 停用后模型与用户调用策略刷新、恢复启用、源文件不变");
  report.passed = true;
  await writeFile(join(sandbox, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (process.argv.includes("--serve")) {
    console.log(`浏览器验收：${url}`);
    await new Promise(resolveStop => { process.once("SIGINT", resolveStop); process.once("SIGTERM", resolveStop); });
  }
} catch (error) {
  report.passed = false;
  report.error = String(error.stack || error);
  await writeFile(join(sandbox, "result.json"), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report));
  process.exitCode = 1;
} finally {
  try { await stopProcess(host); } catch (error) { report.passed = false; report.error = String(error); process.exitCode = 1; }
  const evidence = join(root, ".compat-results", version);
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, "result.json"), JSON.stringify(report, null, 2));
  await writeFile(join(evidence, "host.log"), hostLog.replace(/\?token=[^\s]+/g, "?token=[redacted]"));
  for (const name of ["install.log", "plugin-install.log"]) {
    try { await cp(join(sandbox, name), join(evidence, name)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await writeFile(join(sandbox, "result.json"), JSON.stringify(report, null, 2));
  if (report.passed && !process.argv.includes("--keep") && !process.argv.includes("--serve")) {
    const rel = relative(resolve(tmpdir()), sandbox);
    assert(rel && !rel.startsWith("..") && !isAbsolute(rel), "清理路径必须位于临时目录内");
    try { await rm(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); }
    catch (error) { console.warn(`临时目录清理失败，保留 ${sandbox}: ${error.message}`); }
  }
}
