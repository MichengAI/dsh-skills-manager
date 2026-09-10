// 隔离安装指定版本的真实 DSH Web，验证发布包、Agent 作用域和技能策略。
// --serve 在检查后保留宿主供浏览器验收；Ctrl+C 关闭宿主。保留临时目录作为诊断证据。
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const version = process.argv[2];
const supported = ["0.1.0-rc.8", "0.1.1-rc.2", "0.1.2-rc.1", "0.1.5-rc.1"];
assert(supported.includes(version), `用法：node scripts/test-host-compatibility.mjs <${supported.join("|")}> [--serve]`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = await mkdtemp(join(tmpdir(), `dsh-skills-compat-${version}-`));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const npm = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const pnpm = join(dirname(process.execPath), "node_modules", "corepack", "dist", "pnpm.js");
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
    const child = spawn(process.execPath, args, { cwd, env: taskEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
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
  host = spawn(process.execPath, [cli, "--profile", "web", "--patch", join(sandbox, "probe.yml"), "--port", "0", "--no-open"], { cwd: workspace, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
  assert(state.data.roots.some(item => item.skills.some(skill => skill.name === "compat-external")));
  const probe = () => request("/__skills-manager-compat");
  let snapshot = await probe();
  assert(snapshot.skill.content.includes("COMPAT_EXTERNAL_BODY"));
  assert(snapshot.skill.invocation.modelInvocable);
  report.checks.push("发布包加载、状态接口、真实 Agent 作用域列表与正文读取");
  await request("/api/dsh-skills-manager/disable", { root: "agents", name: "compat-external" });
  snapshot = await probe();
  assert.equal(snapshot.skill.invocation.modelInvocable, false);
  assert.equal(snapshot.skill.invocation.userInvocable, false);
  await request("/api/dsh-skills-manager/enable", { root: "agents", name: "compat-external" });
  snapshot = await probe();
  assert.equal(snapshot.skill.invocation.modelInvocable, true);
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
  if (host && host.exitCode === null) {
    const stopped = new Promise(resolveStop => host.once("exit", resolveStop));
    host.kill();
    await stopped;
  }
  await writeFile(join(sandbox, "host.log"), hostLog.replace(/\?token=[^\s]+/g, "?token=[redacted]"));
}
