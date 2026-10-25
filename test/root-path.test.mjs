// 外部来源自定义技能目录：roots.json 优先级、保存校验、损坏文件与 state 字段。
// 运行：node test/root-path.test.mjs

import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  userRoots,
  setRootPath,
  state,
  scanEntries,
  reloadRootPathOverrides,
  rootPathConfigPath,
  managerHomePath,
} from "../lib/core.js";
import { apply as applyHost } from "../lib/index.js";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error("✗ " + msg);
  }
}
function eq(actual, expected, msg) {
  ok(
    actual === expected,
    msg +
      " (got " +
      JSON.stringify(actual) +
      ", want " +
      JSON.stringify(expected) +
      ")",
  );
}

async function makeSkill(root, name) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill.\n---\nbody`,
    "utf8",
  );
  return dir;
}
async function writeConfig(value) {
  await mkdir(managerHomePath(), { recursive: true });
  await writeFile(rootPathConfigPath(), typeof value === "string" ? value : JSON.stringify(value), "utf8");
  return reloadRootPathOverrides();
}
async function clearConfig() {
  await rm(rootPathConfigPath(), { force: true });
  return reloadRootPathOverrides();
}

const tmp = await mkdtemp(join(tmpdir(), "dssm-root-path-"));
try {
  const testHome = join(tmp, "home");
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.DSH_HOME = join(tmp, "dsh");
  process.env.DSH_AGENTS_HOME = join(tmp, "agents");
  process.env.DSH_CODEX_HOME = join(tmp, "codex-home");
  process.env.DSH_CLAUDE_HOME = join(tmp, "claude-home");
  await mkdir(join(process.env.DSH_CODEX_HOME, "skills"), { recursive: true });
  await clearConfig();

  const codexDefault = join(process.env.DSH_CODEX_HOME, "skills");
  const claudeDefault = join(process.env.DSH_CLAUDE_HOME, "skills");
  const customCodex = join(tmp, "custom-codex");
  await makeSkill(customCodex, "only-skill");

  // ── 默认状态 ──
  const initial = userRoots().find((root) => root.key === "codex");
  eq(initial.path, codexDefault, "没有配置时使用环境变量推导的默认目录");
  eq(initial.defaultPath, undefined, "未覆盖时不带 defaultPath");
  eq(userRoots().find((root) => root.key === "claude").path, claudeDefault, "其它来源保持默认");

  // ── 保存覆盖 ──
  const saved = await setRootPath("codex", customCodex);
  eq(saved.ok, true, "外部来源可以改写目录");
  const codex = userRoots().find((root) => root.key === "codex");
  eq(codex.path, customCodex, "userRoots 立即使用新目录");
  eq(codex.defaultPath, codexDefault, "覆盖后保留默认目录供恢复");
  eq(userRoots().find((root) => root.key === "claude").path, claudeDefault, "改一个来源不影响其它来源");

  const stored = JSON.parse(await readFile(rootPathConfigPath(), "utf8"));
  eq(stored.version, 1, "roots.json 带版本号");
  eq(stored.paths.codex, customCodex, "roots.json 保存最终 skills 目录");

  const scanned = await scanEntries(userRoots().find((root) => root.key === "codex"));
  eq(scanned.exists, true, "扫描跟随自定义目录");
  eq(scanned.entries.length, 1, "自定义目录里的技能被发现");
  eq(scanned.entries[0].name, "only-skill", "发现的是新目录里的技能");

  const snapshot = await state();
  const view = snapshot.roots.find((root) => root.key === "codex");
  eq(view.path, customCodex, "state 返回自定义目录");
  eq(view.overridden, true, "state 标记该来源已自定义");
  eq(view.defaultPath, codexDefault, "state 回带默认目录");
  eq(view.skills.length, 1, "state 按新目录列出技能");
  eq(snapshot.roots.find((root) => root.key === "claude").overridden, undefined, "未覆盖的来源没有标记");

  // ── 优先级：roots.json > 环境变量 ──
  process.env.DSH_CODEX_HOME = join(tmp, "other-home");
  eq(userRoots().find((root) => root.key === "codex").path, customCodex, "roots.json 优先于 DSH_CODEX_HOME");
  process.env.DSH_CODEX_HOME = join(tmp, "codex-home");

  // ── 恢复默认 ──
  const reset = await setRootPath("codex", null);
  eq(reset.ok, true, "path=null 恢复默认");
  eq(userRoots().find((root) => root.key === "codex").path, codexDefault, "恢复后回到默认目录");
  eq(userRoots().find((root) => root.key === "codex").defaultPath, undefined, "恢复后不再带 defaultPath");
  eq((await state()).roots.find((root) => root.key === "codex").overridden, undefined, "恢复后 state 不再标记");
  eq(JSON.parse(await readFile(rootPathConfigPath(), "utf8")).paths.codex, undefined, "恢复默认清除持久化条目");

  // 空字符串等价于恢复默认；与默认值相同的保存也归一成“未覆盖”。
  await setRootPath("codex", customCodex);
  await setRootPath("codex", "");
  eq(userRoots().find((root) => root.key === "codex").defaultPath, undefined, "空字符串也恢复默认");
  await setRootPath("codex", customCodex);
  await setRootPath("codex", codexDefault);
  eq(userRoots().find((root) => root.key === "codex").defaultPath, undefined, "保存默认值等于恢复默认");

  // ── 保存校验 ──
  async function rejects(key, value, code, message) {
    const result = await setRootPath(key, value);
    if (result.ok === false) {
      eq(result.code, code, message + "（错误码）");
      ok(typeof result.error === "string" && result.error.length > 0, message + "（中文错误原文）");
    } else {
      ok(false, message + " 应当被拒绝");
    }
  }

  // ── 持久化失败时内存配置不应被修改 ──
  const { promises: nodeFs } = await import("node:fs");
  const origRename = nodeFs.rename;
  try {
    nodeFs.rename = async (from, to) => {
      if (String(to).endsWith("roots.json")) {
        const err = new Error("EACCES: permission denied, rename");
        err.code = "EACCES";
        throw err;
      }
      return origRename(from, to);
    };
    let threw = false;
    try {
      await setRootPath("codex", customCodex);
    } catch (e) {
      threw = true;
      eq(e.code, "EACCES", "写入抛出 EACCES");
    }
    ok(threw, "持久化异常向外抛出");
    eq(userRoots().find((r) => r.key === "codex").path, codexDefault, "持久化失败后内存路径保持默认，不被提前污染");
    eq(userRoots().find((r) => r.key === "codex").defaultPath, undefined, "持久化失败后不带 defaultPath");
  } finally {
    nodeFs.rename = origRename;
  }
  const plainFile = join(tmp, "plain.txt");
  await writeFile(plainFile, "not a directory", "utf8");
  await mkdir(managerHomePath(), { recursive: true });
  await mkdir(join(process.env.DSH_HOME, "skills"), { recursive: true });

  await rejects("codex", "relative/path", "error.rootPath.absolute", "相对路径被拒绝");
  await rejects("codex", join(tmp, "missing-dir"), "error.rootPath.notFound", "不存在的目录被拒绝");
  await rejects("codex", plainFile, "error.rootPath.notDirectory", "文件路径被拒绝");
  await rejects("codex", join(tmp, "x".repeat(1100)), "error.rootPath.tooLong", "超长路径被拒绝");
  await rejects("codex", join(process.env.DSH_HOME, "skills"), "error.rootPath.overlap", "与 DSH 技能目录重叠被拒绝");
  await rejects("codex", managerHomePath(), "error.rootPath.reserved", "与状态目录重叠被拒绝");
  await rejects("codex", 42, "error.rootPath.invalid", "非文本路径被拒绝");
  await rejects("dsh", customCodex, "error.rootPath.unsupported", "DSH 目录不开放修改");
  await rejects("agents", customCodex, "error.rootPath.unsupported", "公共 Agent 目录不开放修改");
  await rejects("project-dsh:0000000000000000", customCodex, "error.rootPath.unsupported", "项目来源不开放修改");
  await rejects("nope", customCodex, "error.rootPath.unsupported", "未知来源被拒绝");
  ok((await stat(customCodex)).isDirectory(), "校验失败不会改动任何目录");

  // ── 损坏 / 混合配置 ──
  let config = await writeConfig("{ not json");
  eq(Object.keys(config.paths).length, 0, "损坏的 JSON 回退到默认目录");
  eq(config.warnings.length, 1, "损坏的 JSON 给出一条告警");
  eq(config.warnings[0].code, "warning.rootPath.corrupt", "损坏文件使用 corrupt 告警码");
  ok((await state()).warnings.some((warning) => warning.code === "warning.rootPath.corrupt"), "state 暴露损坏告警");
  eq(userRoots().find((root) => root.key === "codex").path, codexDefault, "损坏配置不影响默认目录");

  config = await writeConfig({
    version: 1,
    paths: { codex: customCodex, claude: "relative", gemini: 5, nope: customCodex },
  });
  eq(config.paths.codex, customCodex, "合法条目照常生效");
  eq(config.paths.claude, undefined, "相对路径条目被忽略");
  eq(config.paths.gemini, undefined, "非文本条目被忽略");
  eq(config.paths.nope, undefined, "未登记来源被忽略");
  eq(config.warnings.filter((warning) => warning.code === "warning.rootPath.invalid").length, 3, "非法与未知条目都给出 invalid 告警");
  eq(userRoots().find((root) => root.key === "claude").path, claudeDefault, "被忽略的条目保持默认");

  // ── 自定义目录消失：来源仍保留，并给出 warning ──
  const gone = join(tmp, "gone");
  await writeConfig({ version: 1, paths: { codex: gone } });
  const missingSnapshot = await state();
  const missingView = missingSnapshot.roots.find((root) => root.key === "codex");
  eq(missingView.exists, false, "目录不存在时来源仍然返回");
  eq(missingView.overridden, true, "目录不存在时仍标记为自定义，界面上才能改回去");
  ok(
    missingSnapshot.warnings.some((warning) => warning.code === "warning.rootPath.missing"),
    "目录不存在时 state 给出 warning.rootPath.missing",
  );
  await clearConfig();
  eq(userRoots().find((root) => root.key === "codex").path, codexDefault, "清理配置后回到默认");

  // ── HTTP 路由 ──
  let route;
  let invalidated = 0;
  applyHost({
    webServer: {
      register(value) {
        if (value && value.kind === "prefix") route = value;
        return function () {};
      },
    },
    webRuntime: { trustedHosts: [] },
    skills: {
      registerProvider(register) {
        register({
          invalidate() {
            invalidated++;
          },
        });
        return function () {};
      },
    },
    tools: { register() { return function () {}; } },
    effect(register) { return register(); },
    emit() {},
    get() {},
  });
  const server = createServer((req, res) => route.handler(req, res));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const api = `http://127.0.0.1:${server.address().port}/api/dsh-skills-manager`;
  const headers = {
    "content-type": "application/json",
    "x-dsh-skills-manager": "1",
  };
  try {
    const before = invalidated;
    const saveResponse = await fetch(api + "/root-path", {
      method: "POST",
      headers,
      body: JSON.stringify({ key: "codex", path: customCodex }),
    });
    eq(saveResponse.status, 200, "root-path 路由保存成功");
    const savePayload = await saveResponse.json();
    eq(savePayload.ok, true, "root-path 返回统一成功包");
    eq(savePayload.data.root.path, customCodex, "root-path 回带新目录");
    ok(invalidated > before, "保存后使 provider 目录缓存失效");

    const stateResponse = await fetch(api + "/state");
    eq(stateResponse.status, 200, "state 路由可读");
    const rootView = (await stateResponse.json()).data.roots.find((root) => root.key === "codex");
    eq(rootView.path, customCodex, "state 路由看到新目录");
    eq(rootView.overridden, true, "state 路由带回 overridden");

    const rejectResponse = await fetch(api + "/root-path", {
      method: "POST",
      headers,
      body: JSON.stringify({ key: "dsh", path: customCodex }),
    });
    eq(rejectResponse.status, 400, "不允许修改的来源返回 400");
    const rejectPayload = await rejectResponse.json();
    eq(rejectPayload.ok, false, "拒绝时返回 ok:false");
    eq(rejectPayload.code, "error.rootPath.unsupported", "拒绝时带业务错误码");

    const resetResponse = await fetch(api + "/root-path", {
      method: "POST",
      headers,
      body: JSON.stringify({ key: "codex", path: null }),
    });
    eq(resetResponse.status, 200, "path=null 通过路由恢复默认");
    const resetState = await (await fetch(api + "/state")).json();
    eq(resetState.data.roots.find((root) => root.key === "codex").path, codexDefault, "路由恢复默认后 state 回到默认目录");

    const missingBody = await fetch(api + "/root-path", {
      method: "POST",
      headers,
      body: JSON.stringify({ key: "codex" }),
    });
    eq(missingBody.status, 200, "缺少 path 字段按恢复默认处理");
    eq(JSON.parse(await readFile(rootPathConfigPath(), "utf8")).paths.codex, undefined, "缺少 path 不写覆盖");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`自定义技能目录: ${passed} passed, 0 failed`);
