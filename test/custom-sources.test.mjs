// 自定义来源：单个目录登记、总目录扫描、更新/移除、排序与 HTTP 路由。
// 运行：node test/custom-sources.test.mjs

import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";

import {
  userRoots,
  setRootPath,
  state,
  addCustomSources,
  updateCustomSource,
  removeCustomSource,
  scanCustomSourceCandidates,
  setSourceEnabled,
  createCategory,
  setCategoryEnabled,
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

async function makeSkill(skillsDir, name) {
  const dir = join(skillsDir, name);
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
  await writeFile(
    rootPathConfigPath(),
    typeof value === "string" ? value : JSON.stringify(value),
    "utf8",
  );
  return reloadRootPathOverrides();
}
async function clearConfig() {
  await rm(rootPathConfigPath(), { force: true });
  return reloadRootPathOverrides();
}

const tmp = await mkdtemp(join(tmpdir(), "dssm-custom-sources-"));
try {
  const testHome = join(tmp, "home");
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.DSH_HOME = join(tmp, "dsh");
  process.env.DSH_AGENTS_HOME = join(tmp, "agents");
  await mkdir(join(process.env.DSH_HOME, "skills"), { recursive: true });
  await mkdir(testHome, { recursive: true });
  await clearConfig();

  // ── 构造一个「产品总目录」：自身有 skills，两个子用户各有 skills，第三层不该被扫到 ──
  const product = join(tmp, "custom-product");
  await makeSkill(join(product, "skills"), "root-skill");
  await makeSkill(join(product, "alice", "skills"), "alpha-skill");
  await makeSkill(join(product, "bob", "skills"), "beta-skill");
  await makeSkill(join(product, "bob", "skills"), "gamma-skill");
  await makeSkill(join(product, "bob", "deep", "nested", "skills"), "too-deep-skill");
  await mkdir(join(product, "no-skills"), { recursive: true });
  await writeFile(join(product, "no-skills", "readme.txt"), "no skill here", "utf8");

  // ── 扫描：只探测到两层，显示名带产品目录名 ──
  const scan = await scanCustomSourceCandidates(product);
  eq(scan.ok, true, "扫描总目录成功");
  eq(scan.candidates.length, 3, "只列出两层内的技能目录（总目录 + 两个子用户）");
  eq(scan.candidates[0].depth, 0, "第一项是总目录自身的 skills");
  eq(scan.candidates[0].label, basename(product), "总目录来源用目录名作显示名");
  eq(scan.candidates[0].skillCount, 1, "总目录技能数正确");
  eq(scan.candidates[1].label, basename(product) + " / alice", "子来源显示为「产品 / 子目录」");
  eq(scan.candidates[2].skillCount, 2, "子来源技能数正确");
  ok(
    scan.candidates.every((item) => item.path.endsWith("skills")),
    "候选路径都指向 skills 目录本身",
  );
  ok(
    !scan.candidates.some((item) => item.path.includes("too-deep-skill")),
    "超过扫描层数的目录不会出现",
  );
  ok(
    !scan.candidates.some((item) => item.path.includes("no-skills")),
    "没有 skills 子目录的普通目录不会出现",
  );
  ok(scan.candidates.every((item) => item.registered === false), "未登记的候选标记为 registered:false");
  ok(scan.candidates.every((item) => item.conflict === false), "不重叠的候选 conflict:false");

  const relativeScan = await scanCustomSourceCandidates("relative/dir");
  eq(relativeScan.ok, false, "相对路径扫描被拒绝");
  eq(relativeScan.code, "error.rootPath.absolute", "相对路径扫描给出 absolute 错误码");
  const missingScan = await scanCustomSourceCandidates(join(tmp, "nope"));
  eq(missingScan.ok, false, "不存在的目录扫描被拒绝");
  eq(missingScan.code, "error.rootPath.notFound", "不存在的目录给出 notFound 错误码");

  // ── 单个目录登记：默认排到预设来源之后，且与外部来源同构 ──
  const presetMaxRank = Math.max(
    ...userRoots().filter((root) => !root.native).map((root) => root.rank),
  );
  const added = await addCustomSources({
    label: "My Agent",
    path: join(product, "skills"),
  });
  eq(added.ok, true, "单个目录可以登记为自定义来源");
  eq(added.added.length, 1, "登记返回一条记录");
  eq(added.added[0].id, "custom:my-agent", "key 由显示名生成 custom: 前缀的稳定 slug");
  const customRoot = userRoots().find((root) => root.key === "custom:my-agent");
  ok(!!customRoot, "userRoots 里出现自定义来源");
  eq(customRoot.path, join(product, "skills"), "自定义来源指向登记的目录");
  eq(customRoot.mutable, false, "自定义来源不可写入");
  eq(customRoot.toggleable, true, "自定义来源可启停");
  eq(customRoot.custom, true, "自定义来源带 custom 标记");
  ok(customRoot.rank > presetMaxRank, "自定义来源排在预设外部来源之后");

  const snapshot = await state();
  const view = snapshot.roots.find((root) => root.key === "custom:my-agent");
  eq(view.custom, true, "state 带回 custom 标记");
  eq(view.exists, true, "state 判定目录存在");
  eq(view.skills.length, 1, "state 扫到该目录下的技能");
  eq(view.skills[0].name, "root-skill", "扫到的是自定义目录里的技能");

  // 同一目录重复登记是幂等的。
  const again = await addCustomSources({ label: "Duplicate", path: join(product, "skills") });
  eq(again.ok, true, "重复目录不报错");
  eq(again.added.length, 0, "重复目录不会再登记一份");
  eq(
    userRoots().filter((root) => root.path === join(product, "skills")).length,
    1,
    "同一目录只有一个来源",
  );

  // ── 批量登记扫描结果：分组名与显示名沿用扫描结果 ──
  const batch = await addCustomSources(
    scan.candidates.slice(1).map((item) => ({
      label: item.label,
      path: item.path,
      group: item.group,
    })),
  );
  eq(batch.ok, true, "扫描结果可以批量登记");
  eq(batch.added.length, 2, "批量登记两条");
  eq(batch.added[0].group, basename(product), "批量登记保留产品分组名");
  const aliceRoot = userRoots().find((root) => root.key === batch.added[0].id);
  eq(aliceRoot.group, basename(product), "userRoots 带回分组名");
  eq(aliceRoot.label, basename(product) + " / alice", "userRoots 显示名为「产品 / 子目录」");

  // 非 ASCII 显示名退化为 custom:source，靠后缀去重。
  const dirA = join(tmp, "cn-a");
  const dirB = join(tmp, "cn-b");
  await makeSkill(dirA, "cn-skill");
  await makeSkill(dirB, "cn-skill");
  const cnA = await addCustomSources({ label: "智能体甲", path: dirA });
  const cnB = await addCustomSources({ label: "智能体乙", path: dirB });
  eq(cnA.added[0].id, "custom:source", "非 ASCII 显示名退化为 custom:source");
  eq(cnB.added[0].id, "custom:source-2", "第二个非 ASCII 显示名加后缀去重");

  // ── 路径校验 ──
  async function rejectsAdd(input, code, message) {
    const result = await addCustomSources(input);
    if (result.ok === false) {
      eq(result.code, code, message + "（错误码）");
      ok(typeof result.error === "string" && result.error.length > 0, message + "（错误原文）");
    } else {
      ok(false, message + " 应当被拒绝");
    }
  }
  await rejectsAdd({ label: "rel", path: "relative/path" }, "error.rootPath.absolute", "相对路径被拒绝");
  await rejectsAdd({ label: "gone", path: join(tmp, "missing-dir") }, "error.rootPath.notFound", "不存在的目录被拒绝");
  await rejectsAdd(
    { label: "overlap", path: join(process.env.DSH_HOME, "skills") },
    "error.rootPath.overlap",
    "与宿主技能目录重叠被拒绝",
  );
  await rejectsAdd(
    { label: "reserved", path: managerHomePath() },
    "error.rootPath.reserved",
    "与状态目录重叠被拒绝",
  );
  const plainFile = join(tmp, "plain.txt");
  await writeFile(plainFile, "not a directory", "utf8");
  await rejectsAdd({ label: "file", path: plainFile }, "error.rootPath.notDirectory", "文件路径被拒绝");
  const emptyLabel = await addCustomSources({ label: "", path: join(tmp, "empty-label") });
  ok(emptyLabel.ok === false, "目录不存在时先报目录错误");

  // ── 更新：显示名与目录都能改，错误路径不影响已有登记 ──
  const moved = join(tmp, "moved-agent");
  await makeSkill(moved, "moved-skill");
  const renamed = await updateCustomSource("custom:my-agent", { label: "Renamed Agent" });
  eq(renamed.ok, true, "可以改显示名");
  eq(userRoots().find((root) => root.key === "custom:my-agent").label, "Renamed Agent", "显示名立即生效");
  eq(renamed.source.id, "custom:my-agent", "改显示名不改 key");

  const repathed = await updateCustomSource("custom:my-agent", { path: moved });
  eq(repathed.ok, true, "可以改目录");
  eq((await state()).roots.find((root) => root.key === "custom:my-agent").skills.length, 1, "改目录后扫描新位置");
  eq((await state()).roots.find((root) => root.key === "custom:my-agent").skills[0].name, "moved-skill", "确认读到新目录的技能");

  const overlapUpdate = await updateCustomSource("custom:my-agent", { path: join(process.env.DSH_HOME, "skills") });
  eq(overlapUpdate.ok, false, "改到重叠目录被拒绝");
  eq(overlapUpdate.code, "error.rootPath.overlap", "重叠更新给出 overlap 错误码");
  eq(userRoots().find((root) => root.key === "custom:my-agent").path, moved, "失败的更新不改动已有目录");

  const unknown = await updateCustomSource("custom:does-not-exist", { label: "x" });
  eq(unknown.ok, false, "更新未登记的来源报错");
  eq(unknown.code, "error.customSource.unknown", "未登记来源给出 unknown 错误码");

  // setRootPath 对自定义来源复用同一套语义：改路径 = 更新，null = 移除登记。
  const viaSetRootPath = await setRootPath("custom:my-agent", moved);
  eq(viaSetRootPath.ok, true, "setRootPath 可以改自定义来源目录");
  eq(userRoots().find((root) => root.key === "custom:my-agent").path, moved, "setRootPath 更新到目标目录");
  const resetCustom = await setRootPath("custom:my-agent", null);
  eq(resetCustom.ok, true, "setRootPath(null) 移除自定义来源");
  ok(!userRoots().some((root) => root.key === "custom:my-agent"), "移除后 userRoots 不再包含该来源");

  // ── 启停与分类：自定义来源沿用来源级与分类级开关 ──
  const toggleTarget = batch.added[0].id;
  const disabled = await setSourceEnabled(toggleTarget, false);
  ok(!(disabled && disabled.ok === false), "自定义来源可以停用");
  eq((await state()).roots.find((root) => root.key === toggleTarget).enabled, false, "停用后 state 显示 disabled");
  await setSourceEnabled(toggleTarget, true);
  eq((await state()).roots.find((root) => root.key === toggleTarget).enabled, true, "重新启用生效");

  const category = await createCategory(toggleTarget, "常用");
  ok(!(category && category.ok === false), "自定义来源可以建分类");
  const categoryOff = await setCategoryEnabled(toggleTarget, category.category.id, false);
  ok(!(categoryOff && categoryOff.ok === false), "自定义来源的分类可以单独停用");

  // ── 目录消失：来源保留并给出 warning ──
  const vanishing = join(tmp, "vanishing");
  await makeSkill(vanishing, "temp-skill");
  const vanishingAdd = await addCustomSources({ label: "Vanishing", path: vanishing });
  eq(vanishingAdd.ok, true, "预置一个即将消失的来源");
  await rm(vanishing, { recursive: true, force: true });
  const vanishedState = await state();
  const vanishedView = vanishedState.roots.find((root) => root.key === vanishingAdd.added[0].id);
  eq(vanishedView.exists, false, "目录消失后来源仍然返回");
  ok(
    vanishedState.warnings.some((warning) => warning.code === "warning.rootPath.missing"),
    "目录消失时给出 warning.rootPath.missing",
  );

  // ── 上限 ──
  const many = [];
  for (let index = 0; index < 32; index++) {
    const dir = join(tmp, "bulk", "s" + index);
    await makeSkill(dir, "bulk-skill");
    many.push({ id: "custom:s" + index, label: "s" + index, path: dir });
  }
  await writeConfig({ version: 1, paths: {}, customSources: many });
  eq(userRoots().filter((root) => root.custom).length, 32, "32 条自定义来源全部生效");
  const overLimit = await addCustomSources({ label: "over", path: moved });
  eq(overLimit.ok, false, "超过上限时拒绝新增");
  eq(overLimit.code, "error.customSource.limit", "超限给出 limit 错误码");
  await clearConfig();

  // ── 配置兼容：v1 老文件、非法条目、非数组 ──
  await writeConfig({ version: 1, paths: {} });
  eq(userRoots().filter((root) => root.custom).length, 0, "只有 paths 的旧配置照常工作");
  eq((await state()).warnings.length, 0, "旧配置不产生告警");

  const mixed = await writeConfig({
    version: 1,
    paths: {},
    customSources: [
      { id: "custom:ok", label: "OK", path: join(product, "skills") },
      { id: "bad-id", label: "Bad", path: join(product, "alice", "skills") },
      { id: "custom:relative", label: "Rel", path: "relative/path" },
      { id: "custom:empty", label: "", path: join(product, "bob", "skills") },
      { id: "custom:ok", label: "Dup", path: join(tmp, "moved-agent") },
    ],
  });
  eq(mixed.customSources.length, 1, "只接受合法条目");
  eq(mixed.customSources[0].id, "custom:ok", "合法条目保留");
  eq(mixed.warnings.length, 4, "四种非法条目各给一条告警");
  eq(userRoots().filter((root) => root.custom).length, 1, "非法条目不会变成来源");

  const notArray = await writeConfig({ version: 1, paths: {}, customSources: "nope" });
  eq(notArray.customSources.length, 0, "非数组配置按空处理");
  eq(notArray.warnings[0].code, "warning.rootPath.invalid", "非数组配置给出 invalid 告警");
  await clearConfig();

  // ── 持久化格式 ──
  const persisted = await addCustomSources({
    label: "Persisted",
    path: join(product, "skills"),
    group: "Persisted Group",
  });
  const stored = JSON.parse(await readFile(rootPathConfigPath(), "utf8"));
  eq(stored.version, 1, "roots.json 版本号不变");
  eq(Array.isArray(stored.paths) === false && typeof stored.paths === "object", true, "paths 段落保留");
  eq(stored.customSources.length, 1, "customSources 写入文件");
  eq(stored.customSources[0].label, "Persisted", "显示名写入文件");
  eq(stored.customSources[0].group, "Persisted Group", "分组名写入文件");
  await reloadRootPathOverrides();
  eq(userRoots().find((root) => root.key === persisted.added[0].id)?.label, "Persisted", "重新读取配置后仍然生效");

  const removed = await removeCustomSource(persisted.added[0].id);
  eq(removed.ok, true, "移除登记成功");
  ok(!userRoots().some((root) => root.key === persisted.added[0].id), "移除后来源消失");
  // 验证移除来源时主动清理原始 state.json 中的孤立数据
  const statePath = join(process.env.DSH_HOME, "skills-manager", "state.json");
  const rawStateAfterRemove = JSON.parse(await readFile(statePath, "utf8"));
  eq(rawStateAfterRemove.customNotes?.[persisted.added[0].id], undefined, "移除来源后清理 customNotes 映射");
  eq(rawStateAfterRemove.categories?.[persisted.added[0].id], undefined, "移除来源后清理 categories 映射");
  const removedAgain = await removeCustomSource(persisted.added[0].id);
  eq(removedAgain.ok, false, "重复移除报错");
  eq(removedAgain.code, "error.customSource.unknown", "重复移除给出 unknown 错误码");
  await clearConfig();

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
    webStartup: { trustedHosts: [] },
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
  const api = `http://127.0.0.1:${server.address().port}/api/michengai/dsh-skills-manager`;
  const headers = { "content-type": "application/json", "x-dsh-skills-manager": "1" };
  try {
    const scanResponse = await fetch(api + "/custom-source-scan", {
      method: "POST",
      headers,
      body: JSON.stringify({ path: product }),
    });
    eq(scanResponse.status, 200, "扫描路由可用");
    const scanPayload = await scanResponse.json();
    eq(scanPayload.ok, true, "扫描路由返回统一成功包");
    eq(scanPayload.data.candidates.length, 3, "扫描路由返回候选列表");

    const before = invalidated;
    const addResponse = await fetch(api + "/custom-source-add", {
      method: "POST",
      headers,
      body: JSON.stringify({ label: "HTTP Agent", path: join(product, "skills") }),
    });
    eq(addResponse.status, 200, "登记路由成功");
    const addPayload = await addResponse.json();
    eq(addPayload.data.added[0].id, "custom:http-agent", "登记路由生成稳定的 key");
    ok(invalidated > before, "登记后使技能目录缓存失效");

    const stateResponse = await fetch(api + "/state");
    const httpRoot = (await stateResponse.json()).data.roots.find((root) => root.key === "custom:http-agent");
    eq(httpRoot.custom, true, "state 路由带回自定义来源");

    const updateResponse = await fetch(api + "/custom-source-update", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "custom:http-agent", label: "HTTP Agent 2" }),
    });
    eq(updateResponse.status, 200, "更新路由成功");
    eq((await updateResponse.json()).data.source.label, "HTTP Agent 2", "更新路由返回新显示名");

    const badAdd = await fetch(api + "/custom-source-add", {
      method: "POST",
      headers,
      body: JSON.stringify({ label: "Bad", path: "relative/path" }),
    });
    eq(badAdd.status, 400, "非法路径登记返回 400");
    eq((await badAdd.json()).code, "error.rootPath.absolute", "非法路径带业务错误码");

    const removeResponse = await fetch(api + "/custom-source-remove", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "custom:http-agent" }),
    });
    eq(removeResponse.status, 200, "移除路由成功");
    eq((await removeResponse.json()).data.removed, "custom:http-agent", "移除路由返回被移除的 key");
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
console.log(`自定义来源: ${passed} passed, 0 failed`);
