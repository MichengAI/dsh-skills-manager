// dsh-skills-manager core —— 纯 Node 技能文件管理核心（零第三方依赖，可独立单测）
//
// 覆盖 DSH 用户级技能根：
//   - 根目录：~/.dsh/skills
//   - 条目形态：<root>/<name>/SKILL.md（bundle）或 <root>/<name>.md（flat），只扫一层
//   - 前端展示 name、description 与启停状态，不做格式检查或自动修复
//
// 所有函数返回普通结果对象，业务校验失败返回 { ok: false, error, code?, params? }；
// error 保持中文原文（兼容性红线），code 为点分小写业务错误码，params 供前端词典占位符替换；
// 系统异常（fs ENOENT 等）透传 String(e.message)，不加 code。
// 文件写入错误由路由返回给调用方。

import { homedir } from "node:os";
import { join, basename, dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOWS_DEVICE_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAX_SOURCE_DEPTH = 64;
const MAX_ENTRY_NAME_LENGTH = 128;
const MAX_BROWSE_ENTRIES = 500;
const TRANSIENT_RENAME_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

// ── 业务错误码 ────────────────────────────────────────────────────────────────

/** 构造带 code/params 的业务 Error，供导入链路 throw 后透传到失败明细。 */
function codedError(message, code, params) {
  const error = new Error(message);
  error.code = code;
  error.params = params;
  return error;
}

/** 把业务 Error 的 code/params 附加到失败明细；系统异常（ENOENT 等，非 error.* 前缀）保持原文。 */
function attachCode(item, error) {
  if (error && typeof error.code === "string" && /^error\./.test(error.code)) item.code = error.code;
  if (error && error.params) item.params = error.params;
  return item;
}

// ── 路径解析 ────────────────────────────────────────────────────────────────

export function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

export function resolveAgentsHome() {
  return process.env.DSH_AGENTS_HOME || join(homedir(), ".agents");
}

/**
 * DSH 及常见 Agent 的用户级技能目录。
 *
 * rank 与官方 filesystem provider 的用户级优先级衔接：DSH=400、Agents=500。
 * manager provider 以 450 接管公共 Agents（仍低于 DSH），其余来源依次排在其后。
 */
export function userRoots() {
  return [
    { key: "dsh", path: join(resolveDshHome(), "skills"), label: "DSH 技能", mutable: true, toggleable: true, native: true, rank: 400 },
    { key: "agents", path: join(resolveAgentsHome(), "skills"), label: "公共 Agent", mutable: false, toggleable: true, native: true, rank: 450 },
    { key: "codex", path: join(process.env.DSH_CODEX_HOME || join(homedir(), ".codex"), "skills"), label: "Codex", mutable: false, toggleable: true, native: false, rank: 520 },
    { key: "claude", path: join(process.env.DSH_CLAUDE_HOME || join(homedir(), ".claude"), "skills"), label: "Claude", mutable: false, toggleable: true, native: false, rank: 530 },
    { key: "gemini", path: join(process.env.DSH_GEMINI_HOME || join(homedir(), ".gemini"), "skills"), label: "Gemini", mutable: false, toggleable: true, native: false, rank: 540 },
    { key: "opencode", path: join(process.env.DSH_OPENCODE_HOME || join(homedir(), ".config", "opencode"), "skills"), label: "OpenCode", mutable: false, toggleable: true, native: false, rank: 550 },
  ];
}

export function managerHomePath() {
  return join(resolveDshHome(), "skills-manager");
}

export function managerStatePath() {
  return join(managerHomePath(), "state.json");
}

export function trashRootPath() {
  return join(managerHomePath(), "trash");
}

export function logPath() {
  return join(resolveDshHome(), "dsh-skills-manager.log");
}

/**
 * 为前端内嵌目录选择器列出一个本机目录层级。
 * 不跟随目录符号链接；选择后的导入仍由 importSkill 做完整安全校验。
 */
export async function browseDirectories(inputPath) {
  const requested = String(inputPath == null ? "" : inputPath).trim();
  const target = requested === "" ? homedir() : requested;
  if (!isAbsolute(target)) {
    return { ok: false, error: `目录路径必须是绝对路径: ${target}`, code: "error.browse.absolute", params: { path: target } };
  }

  let canonical;
  let directory;
  try {
    canonical = await fs.realpath(target);
    directory = await fs.stat(canonical);
  } catch (error) {
    return { ok: false, error: `无法读取目录: ${target}`, code: "error.browse.unreadable", params: { path: target, error: String(error && error.message ? error.message : error) } };
  }
  if (!directory.isDirectory()) {
    return { ok: false, error: `不是目录: ${target}`, code: "error.browse.notDirectory", params: { path: target } };
  }

  const entries = [];
  let truncated = false;
  try {
    const items = await fs.readdir(canonical, { withFileTypes: true });
    for (const item of items) {
      // 目录链接不在浏览器中展开，避免选择器在不知情时跨越到另一棵目录树。
      if (!item.isDirectory() || item.isSymbolicLink()) continue;
      // Dirent 来自一次目录快照；再用 lstat 校验当前条目，既收紧 TOCTOU 窗口，
      // 也明确排除 Windows junction 等重解析目录。
      const childPath = join(canonical, item.name);
      const childStat = await lstatOrNull(childPath);
      if (!childStat || !childStat.isDirectory() || childStat.isSymbolicLink()) continue;
      if (entries.length >= MAX_BROWSE_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push({ name: item.name, path: childPath, hidden: item.name.startsWith(".") });
    }
  } catch (error) {
    return { ok: false, error: `无法读取目录: ${canonical}`, code: "error.browse.unreadable", params: { path: canonical, error: String(error && error.message ? error.message : error) } };
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

  const crumbs = [];
  let cursor = canonical;
  for (;;) {
    const parent = dirname(cursor);
    crumbs.unshift({ name: parent === cursor ? cursor : basename(cursor), path: cursor, hidden: false });
    if (parent === cursor) break;
    cursor = parent;
  }
  return { path: canonical, home: homedir(), crumbs, entries, truncated };
}

function dshRootPath() {
  return userRoots().find((root) => root.key === "dsh").path;
}

/** 公共 Agent 目录的只读拒绝结果；action 为可翻译语义值（toggle/delete）。 */
function readonlyError(action) {
  return {
    ok: false,
    code: "error.root.readonly",
    params: { action },
    error: action === "delete" ? "公共 Agent 技能目录不允许删除" : "公共 Agent 技能目录不允许启用或停用",
  };
}

function rootDefinition(root) {
  if (root && typeof root === "object" && typeof root.key === "string") return root;
  if (typeof root !== "string") return null;
  const resolved = resolve(root);
  return userRoots().find((item) => resolve(item.path) === resolved) || null;
}

function rootByKey(key) {
  return userRoots().find((item) => item.key === key) || null;
}

/** 判断 child 是否与 parent 相同或位于其内部。跨盘符时 relative 会返回绝对路径。 */
function isSameOrDescendant(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/** 解析真实路径；中间若有目录链接，按落地目录比较重叠。 */
async function resolvedPath(path) {
  try {
    return await fs.realpath(path);
  } catch {
    return resolve(path);
  }
}

/** 两个路径重叠时，覆盖导入可能删除自身来源，必须拒绝。 */
async function pathsOverlap(a, b) {
  const left = await resolvedPath(a);
  const right = await resolvedPath(b);
  return isSameOrDescendant(left, right) || isSameOrDescendant(right, left);
}

/** 预解析技能根后的根内校验，供逐条目扫描复用同一次 realpath，减少重复 IO。 */
async function isInsideResolvedRoot(rootReal, path) {
  return isSameOrDescendant(rootReal, await resolvedPath(path));
}

async function lstatOrNull(path) {
  try {
    return await fs.lstat(path);
  } catch {
    return null;
  }
}

/** 名称只允许一个普通路径段；不把既有技能名称限制为 kebab-case。 */
export function entryPath(root, name) {
  if (typeof name !== "string" || name === "" || name === "." || name === ".." || name.startsWith(".") || name.length > MAX_ENTRY_NAME_LENGTH || /[\\/:*?"<>|\0]/.test(name) || /[. ]$/.test(name) || WINDOWS_DEVICE_NAME_RE.test(name) || basename(name) !== name) return null;
  const rootPath = resolve(root);
  const path = resolve(rootPath, name);
  return isSameOrDescendant(rootPath, path) && rootPath !== path ? path : null;
}

function isDshRoot(root) {
  return typeof root === "string" && resolve(root) === resolve(dshRootPath());
}

// ── 命名规整 ────────────────────────────────────────────────────────────────

/** 尽量把任意名称规整为 kebab-case；无法生成合法名称时返回空串。 */
export function toKebab(s) {
  let t = String(s).trim();
  if (t === "") return "";
  t = t.replace(/([a-z0-9])([A-Z])/g, "$1-$2"); // camelCase 边界
  t = t.toLowerCase();
  t = t.replace(/[\s_.]+/g, "-");
  t = t.replace(/[^a-z0-9-]/g, "-");
  t = t.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return t;
}

// ── frontmatter 解析 / 序列化（宽松 YAML 对象，保留键序）────────────────────

/** 剥离 UTF-8 BOM（Windows 工具常写入，不剥离会导致开头 --- 失配）。 */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 解析 SKILL.md 的 frontmatter。返回 { fields, map, body }，map 保留键序。
 *  只识别顶层 key: value；缩进嵌套字段（如 metadata.source）不进入 map。
 *  写入走 updateInvocationPolicy 的文本级替换，因此嵌套块会被原样保留。 */
export function parseSkillDoc(text) {
  const src = stripBom(String(text));
  const lines = src.split(/\r?\n/);
  const map = Object.create(null);
  const fields = [];
  let body = src;
  let hasFrontmatter = false;
  if (lines.length > 0 && lines[0].trim() === "---") {
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        end = i;
        break;
      }
    }
    if (end >= 0) {
      hasFrontmatter = true;
      for (let i = 1; i < end; i++) {
        const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
        if (m) {
          fields.push({ key: m[1], raw: m[2] });
          const block = /^([>|])[-+]?\s*$/.exec(m[2]);
          if (block) {
            const content = [];
            while (i + 1 < end && (/^\s/.test(lines[i + 1]) || lines[i + 1] === "")) {
              i++;
              content.push(lines[i]);
            }
            const indentation = content.filter((line) => line.trim() !== "").reduce((min, line) => Math.min(min, (/^\s*/.exec(line) || [""])[0].length), Infinity);
            const normalized = content.map((line) => Number.isFinite(indentation) ? line.slice(Math.min(indentation, line.length)) : line);
            map[m[1]] = block[1] === ">" ? normalized.join(" ").replace(/\s+/g, " ").trim() : normalized.join("\n").trim();
          } else {
            map[m[1]] = decodeYamlScalar(m[2]);
          }
        }
      }
      body = lines.slice(end + 1).join("\n");
    }
  }
  return { fields, map, body, hasFrontmatter };
}

/** 读取 YAML 标量的显示值；不依赖第三方 YAML 解析器。 */
function decodeYamlScalar(v) {
  const s = String(v == null ? "" : v).trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    try {
      const value = JSON.parse(s);
      if (typeof value === "string") return value;
    } catch {
      /* 保留无法解析的原始内容 */
    }
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

export function unquote(v) {
  const s = String(v == null ? "" : v).trim();
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 仅更新调用策略行，避免重写并破坏其他 YAML frontmatter。
 *  启用时删除这两行以恢复缺省可调用，不还原这两行的原始文本或行内注释。 */
function updateInvocationPolicy(text, enabled) {
  const source = String(text);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return null;
  const fields = lines.slice(1, end).filter((line) => !/^(disable-model-invocation|user-invocable)\s*:/.test(line));
  if (!enabled) fields.push("disable-model-invocation: true", "user-invocable: false");
  return ["---", ...fields, "---", ...lines.slice(end + 1)].join(newline);
}

/** 同目录临时文件加 rename，避免写入中断时截断原 SKILL.md。 */
/** Windows 上杀毒软件或索引器可能短暂占用目录；只重试明确可恢复的 rename 错误。 */
export async function renameWithRetry(source, destination, options = {}) {
  const rename = typeof options.rename === "function" ? options.rename : fs.rename;
  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0 ? options.maxAttempts : 6;
  const delayMs = Number.isFinite(options.delayMs) && options.delayMs >= 0 ? options.delayMs : 40;
  for (let attempt = 1; ; attempt++) {
    try {
      return await rename(source, destination);
    } catch (error) {
      if (!TRANSIENT_RENAME_CODES.has(error && error.code) || attempt >= maxAttempts) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs * attempt));
    }
  }
}

async function writeFileAtomically(path, content) {
  const temp = join(dirname(path), `.${basename(path)}.dssm-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, content, "utf8");
    await fs.rename(temp, path);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** 解析布尔字段值；合法布尔返回 true/false，非法返回 undefined。 */
export function parseBoolValue(raw) {
  const v = unquote(raw).trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "on" || v === "1") return true;
  if (v === "false" || v === "no" || v === "off" || v === "0") return false;
  return undefined;
}

// ── 条目定位 / 扫描 ─────────────────────────────────────────────────────────

/** 按名称解析条目（bundle 优先，其次 flat）。找不到返回 null。 */
export async function resolveEntry(root, name) {
  const bundlePath = entryPath(root, name);
  if (bundlePath === null) return null;
  const rootPath = resolve(root);
  const rootReal = await resolvedPath(rootPath);
  const bundleStat = await lstatOrNull(bundlePath);
  if (bundleStat && bundleStat.isDirectory() && !bundleStat.isSymbolicLink()) {
    const bundleDoc = join(bundlePath, "SKILL.md");
    const docStat = await lstatOrNull(bundleDoc);
    if (docStat && docStat.isFile() && !docStat.isSymbolicLink() && await isInsideResolvedRoot(rootReal, bundleDoc)) {
      return { kind: "bundle", docPath: bundleDoc, entryPath: bundlePath };
    }
  }
  const flatDoc = resolve(rootPath, `${name}.md`);
  if (!isSameOrDescendant(rootPath, flatDoc) || rootPath === flatDoc) return null;
  const flatStat = await lstatOrNull(flatDoc);
  if (flatStat && flatStat.isFile() && !flatStat.isSymbolicLink() && await isInsideResolvedRoot(rootReal, flatDoc)) {
    return { kind: "flat", docPath: flatDoc, entryPath: flatDoc };
  }
  return null;
}

function entryOf(name, kind, docPath, doc) {
  const declaredName = doc.map.name !== undefined ? unquote(doc.map.name) : "";
  const description = doc.map.description !== undefined ? unquote(doc.map.description) : "";
  const modelValue = parseBoolValue(doc.map["disable-model-invocation"]);
  const userValue = parseBoolValue(doc.map["user-invocable"]);
  const modelDisabled = modelValue === true;
  const userDisabled = userValue === false;
  const invocationPolicyValid = (doc.map["disable-model-invocation"] === undefined || modelValue !== undefined) && (doc.map["user-invocable"] === undefined || userValue !== undefined);
  const diagnostics = [];
  if (!doc.hasFrontmatter) diagnostics.push({ level: "error", code: "diagnostic.frontmatter.missing" });
  if (doc.hasFrontmatter && !declaredName) diagnostics.push({ level: "error", code: "diagnostic.name.missing" });
  else if (declaredName && !KEBAB_RE.test(declaredName)) diagnostics.push({ level: "error", code: "diagnostic.name.invalid", params: { name: declaredName } });
  if (doc.hasFrontmatter && !description) diagnostics.push({ level: "error", code: "diagnostic.description.missing" });
  if (!invocationPolicyValid) diagnostics.push({ level: "error", code: "diagnostic.invocation.invalid" });
  return {
    name,
    declaredName,
    kind,
    docPath,
    description,
    modelInvocable: !modelDisabled,
    userInvocable: !userDisabled,
    invocationPolicyValid,
    hasFrontmatter: doc.hasFrontmatter,
    loadable: doc.hasFrontmatter && KEBAB_RE.test(declaredName) && description !== "" && invocationPolicyValid,
    diagnostics,
  };
}

/** 扫描一个技能根（只扫一层）。返回 { exists, entries }。 */
export async function scanEntries(root) {
  let items;
  try {
    items = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return { exists: false, entries: [] };
  }
  const byName = new Map();
  const rootReal = await resolvedPath(root);
  for (const it of items) {
    try {
      if (it.isSymbolicLink()) continue;
      if (it.isDirectory() && entryPath(root, it.name) !== null) {
        const docPath = join(root, it.name, "SKILL.md");
        const st = await lstatOrNull(docPath);
        if (!st || !st.isFile() || st.isSymbolicLink() || !(await isInsideResolvedRoot(rootReal, docPath))) continue;
        const doc = parseSkillDoc(await fs.readFile(docPath, "utf8"));
        byName.set(it.name, entryOf(it.name, "bundle", docPath, doc));
      } else if (it.isFile() && it.name.toLowerCase().endsWith(".md") && it.name.toLowerCase() !== "skill.md" && entryPath(root, it.name.slice(0, -3)) !== null) {
        const skillName = it.name.slice(0, -3);
        if (byName.has(skillName)) continue;
        const docPath = join(root, it.name);
        if (!(await isInsideResolvedRoot(rootReal, docPath))) continue;
        const doc = parseSkillDoc(await fs.readFile(docPath, "utf8"));
        byName.set(skillName, entryOf(skillName, "flat", docPath, doc));
      }
    } catch {
      /* 跳过不可读条目 */
    }
  }
  const entries = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { exists: true, entries };
}

// ── Manager 本地策略（外部源只读，启停状态写入 DSH_HOME）────────────────────

function defaultManagerState() {
  const sources = Object.create(null);
  const disabledSkills = Object.create(null);
  for (const root of userRoots()) {
    if (root.key === "dsh") continue;
    sources[root.key] = true;
    disabledSkills[root.key] = [];
  }
  return { version: 1, sources, disabledSkills };
}

/** 状态文件已存在但不可用时一律关闭外部来源，避免损坏配置重新暴露技能。 */
function failClosedManagerState() {
  const state = defaultManagerState();
  for (const key of Object.keys(state.sources)) state.sources[key] = false;
  return state;
}

function validManagerStateDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) return false;
  if (!value.sources || typeof value.sources !== "object" || Array.isArray(value.sources)) return false;
  if (!value.disabledSkills || typeof value.disabledSkills !== "object" || Array.isArray(value.disabledSkills)) return false;
  for (const root of userRoots()) {
    if (root.key === "dsh") continue;
    if (typeof value.sources[root.key] !== "boolean") return false;
    const list = value.disabledSkills[root.key];
    if (!Array.isArray(list) || list.some((name) => typeof name !== "string" || entryPath(root.path, name) === null)) return false;
  }
  return true;
}

function normalizeManagerState(value) {
  const normalized = defaultManagerState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return normalized;
  for (const root of userRoots()) {
    if (root.key === "dsh") continue;
    if (value.sources && typeof value.sources[root.key] === "boolean") normalized.sources[root.key] = value.sources[root.key];
    const list = value.disabledSkills && value.disabledSkills[root.key];
    if (Array.isArray(list)) normalized.disabledSkills[root.key] = [...new Set(list.filter((name) => typeof name === "string" && entryPath(root.path, name) !== null))].sort();
  }
  return normalized;
}

export async function readManagerState() {
  try {
    const raw = await fs.readFile(managerStatePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!validManagerStateDocument(parsed)) throw codedError("invalid manager state schema", "error.state.invalid");
    return { state: normalizeManagerState(parsed), warning: null, writable: true };
  } catch (error) {
    if (error && error.code === "ENOENT") return { state: defaultManagerState(), warning: null, writable: true };
    return {
      state: failClosedManagerState(),
      writable: false,
      warning: { code: "warning.state.invalid", params: { path: managerStatePath() }, error: `技能管理器状态文件不可读，外部技能已安全停用且状态写入已锁定: ${managerStatePath()}` },
    };
  }
}

async function writeManagerState(value) {
  await fs.mkdir(managerHomePath(), { recursive: true });
  await writeFileAtomically(managerStatePath(), `${JSON.stringify(normalizeManagerState(value), null, 2)}\n`);
}

function managerSkillEnabled(policy, rootKey, name) {
  return policy.sources[rootKey] !== false && !(policy.disabledSkills[rootKey] || []).includes(name);
}

function invalidManagerStateWrite() {
  return {
    ok: false,
    code: "error.state.invalid",
    params: { path: managerStatePath() },
    error: `技能管理器状态文件不可读，已拒绝覆盖: ${managerStatePath()}`,
  };
}

export async function setSourceEnabled(key, enabled, log) {
  const root = rootByKey(key);
  if (!root || root.key === "dsh" || !root.toggleable) return readonlyError("toggle");
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  current.state.sources[root.key] = enabled === true;
  await writeManagerState(current.state);
  if (log) log(enabled ? "source-enable" : "source-disable", `${enabled ? "启用" : "停用"}来源 ${root.key}: ${root.path}`);
  return { root: root.key, enabled: enabled === true };
}

async function setReadOnlySkillEnabled(root, name, enabled, log) {
  const resolved = await resolveEntry(root.path, name);
  if (resolved === null) return { ok: false, error: `技能不存在: ${name}`, code: "error.skill.notFound", params: { name } };
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  const disabled = new Set(current.state.disabledSkills[root.key] || []);
  if (enabled) disabled.delete(name);
  else disabled.add(name);
  current.state.disabledSkills[root.key] = [...disabled].sort();
  await writeManagerState(current.state);
  if (log) log(enabled ? "external-enable" : "external-disable", `${enabled ? "启用" : "停用"} ${root.key}/${name}（源文件只读）`);
  return { root: root.key, name, enabled: enabled === true };
}

// ── 启用 / 停用（同时控制模型与 / 手动调用，非破坏）──────────────────────────

/** enabled=true 恢复模型与 / 手动调用；false 同时停用两种调用入口。 */
export async function setSkillEnabled(root, name, enabled, log) {
  const definition = rootDefinition(root);
  if (!definition) return readonlyError("toggle");
  if (definition.key !== "dsh") return setReadOnlySkillEnabled(definition, name, enabled, log);
  const resolved = await resolveEntry(definition.path, name);
  if (resolved === null) return { ok: false, error: `技能不存在: ${name}`, code: "error.skill.notFound", params: { name } };
  const source = await fs.readFile(resolved.docPath, "utf8");
  const updated = updateInvocationPolicy(source, enabled);
  if (updated === null) return { ok: false, error: `技能缺少完整 frontmatter，无法${enabled ? "启用" : "停用"}: ${name}`, code: "error.skill.noFrontmatter", params: { name, action: enabled ? "enable" : "disable" } };
  await writeFileAtomically(resolved.docPath, updated);
  if (log) log(enabled ? "enable" : "disable", `${enabled ? "启用" : "停用"} ${resolved.docPath}`);
  return { name, enabled };
}

async function safeExistingEntryPaths(root, name) {
  const paths = [];
  const bundle = entryPath(root, name);
  if (bundle === null) return paths;
  const flat = resolve(root, `${name}.md`);
  const bundleStat = await lstatOrNull(bundle);
  if (bundleStat && (bundleStat.isDirectory() || bundleStat.isSymbolicLink())) paths.push({ path: bundle, fileName: name, recursive: true });
  const flatStat = await lstatOrNull(flat);
  if (flatStat && (flatStat.isFile() || flatStat.isSymbolicLink())) paths.push({ path: flat, fileName: `${name}.md`, recursive: false });
  return paths;
}

async function readTrashMetadata(id) {
  if (entryPath(trashRootPath(), id) === null) return null;
  try {
    const value = JSON.parse(await fs.readFile(join(trashRootPath(), id, "metadata.json"), "utf8"));
    if (!value || value.id !== id || typeof value.name !== "string" || !Array.isArray(value.entries)) return null;
    return value;
  } catch {
    return null;
  }
}

/** 把 DSH 根目录中的单个技能移入 manager-owned 回收站。 */
export async function deleteSkill(root, name, log, options = {}) {
  const definition = rootDefinition(root);
  if (!definition || definition.key !== "dsh") return readonlyError("delete");
  const resolved = await resolveEntry(definition.path, name);
  if (resolved === null) return { ok: false, error: `技能不存在: ${name}`, code: "error.skill.notFound", params: { name } };
  const targets = await safeExistingEntryPaths(definition.path, name);
  const id = `${Date.now()}-${randomUUID()}`;
  const trashRoot = trashRootPath();
  const stage = join(trashRoot, `.stage-${randomUUID()}`);
  const finalPath = join(trashRoot, id);
  const moved = [];
  await fs.mkdir(stage, { recursive: true });
  try {
    for (const target of targets) {
      const destination = join(stage, target.fileName);
      await renameWithRetry(target.path, destination, options.renameOptions);
      moved.push({ ...target, destination });
    }
    const metadata = { version: 1, id, name, deletedAt: new Date().toISOString(), entries: moved.map((item) => item.fileName) };
    await fs.writeFile(join(stage, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await renameWithRetry(stage, finalPath, options.renameOptions);
    if (log) log("trash", `移到回收站 ${name} -> ${finalPath}`);
    return { id, name, deletedAt: metadata.deletedAt };
  } catch (error) {
    const rollbackFailures = [];
    for (const item of moved.reverse()) {
      try {
        await renameWithRetry(item.destination, item.path, options.renameOptions);
      } catch (rollbackError) {
        rollbackFailures.push({ path: item.destination, error: String(rollbackError && rollbackError.message ? rollbackError.message : rollbackError) });
      }
    }
    if (rollbackFailures.length) {
      const causeText = String(error && error.message ? error.message : error);
      throw codedError(
        `${causeText}；移入回收站回滚失败，未恢复内容保留在: ${stage}`,
        "error.trash.rollbackFailed",
        { path: stage, error: causeText },
      );
    }
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function listTrash() {
  let items;
  try {
    items = await fs.readdir(trashRootPath(), { withFileTypes: true });
  } catch {
    return [];
  }
  const result = [];
  for (const item of items) {
    if (!item.isDirectory() || item.name.startsWith(".")) continue;
    const metadata = await readTrashMetadata(item.name);
    if (metadata) result.push(metadata);
  }
  return result.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

export async function restoreTrash(id, log) {
  const metadata = await readTrashMetadata(id);
  if (!metadata) return { ok: false, error: `回收站条目不存在: ${id}`, code: "error.trash.notFound", params: { id } };
  const root = dshRootPath();
  const conflicts = await safeExistingEntryPaths(root, metadata.name);
  if (conflicts.length) return { ok: false, error: `无法恢复，同名技能已存在: ${metadata.name}`, code: "error.trash.conflict", params: { name: metadata.name } };
  await fs.mkdir(root, { recursive: true });
  const itemRoot = join(trashRootPath(), id);
  const moved = [];
  try {
    for (const fileName of metadata.entries) {
      const source = join(itemRoot, fileName);
      const destination = join(root, fileName);
      if (!isSameOrDescendant(itemRoot, source) || !isSameOrDescendant(root, destination)) throw codedError("回收站条目路径非法", "error.trash.invalid", { id });
      await renameWithRetry(source, destination);
      moved.push({ source, destination });
    }
    await fs.rm(itemRoot, { recursive: true, force: true });
    if (log) log("restore", `从回收站恢复 ${metadata.name}`);
    return { id, name: metadata.name };
  } catch (error) {
    for (const item of moved.reverse()) await renameWithRetry(item.destination, item.source).catch(() => undefined);
    throw error;
  }
}

export async function permanentlyDeleteTrash(id, log) {
  const metadata = await readTrashMetadata(id);
  if (!metadata) return { ok: false, error: `回收站条目不存在: ${id}`, code: "error.trash.notFound", params: { id } };
  await fs.rm(join(trashRootPath(), id), { recursive: true, force: true });
  if (log) log("trash-delete", `永久删除回收站条目 ${metadata.name} (${id})`);
  return { id, name: metadata.name };
}

// ── 导入 ────────────────────────────────────────────────────────────────────

/** 分析来源：单 skill 目录 / 单 .md 文件 / 批量目录。 */
async function analyzeSource(source) {
  let st;
  try {
    st = await fs.lstat(source);
  } catch {
    return { kind: "none", error: `路径不存在: ${source}`, code: "error.source.notFound", params: { path: source } };
  }
  if (st.isSymbolicLink()) return { kind: "none", error: `不支持包含符号链接的 skill 来源: ${source}`, code: "error.source.symlink", params: { path: source } };
  if (st.isDirectory()) {
    const sk = join(source, "SKILL.md");
    const skSt = await lstatOrNull(sk);
    // 预检与实际导入口径一致：SKILL.md 本身是链接时直接拒绝，避免 dry-run 通过、正式导入才失败。
    if (skSt && skSt.isSymbolicLink()) return { kind: "none", error: `不支持包含符号链接的 skill 来源: ${sk}`, code: "error.source.symlink", params: { path: sk } };
    if (skSt && skSt.isFile()) {
      return { kind: "single", rawName: basename(source), kebab: toKebab(basename(source)), source, isDir: true, skillFile: sk };
    }
    return { kind: "batch", rawName: basename(source), source, isDir: true };
  }
  if (st.isFile() && source.toLowerCase().endsWith(".md")) {
    if (basename(source).toLowerCase() === "skill.md") {
      const parent = dirname(source);
      return { kind: "single", rawName: basename(parent), kebab: toKebab(basename(parent)), source: parent, isDir: true, skillFile: source };
    }
    const rawName = basename(source).slice(0, -3);
    return { kind: "single", rawName, kebab: toKebab(rawName), source, isDir: false, skillFile: source };
  }
  return { kind: "none", error: `无法识别的 skill 来源: ${source}`, code: "error.source.unrecognized", params: { path: source } };
}

async function collectCandidates(dir) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const it of items) {
    if (it.isSymbolicLink()) throw codedError(`不支持包含符号链接的 skill 来源: ${join(dir, it.name)}`, "error.source.symlink", { path: join(dir, it.name) });
    if (it.isDirectory()) {
      const sk = join(dir, it.name, "SKILL.md");
      // lstatOrNull 吞掉 IO 异常（返回 null 即跳过）；symlink 必须抛出，不能被“跳过”逻辑掩盖。
      const st = await lstatOrNull(sk);
      if (st && st.isSymbolicLink()) throw codedError(`不支持包含符号链接的 skill 来源: ${sk}`, "error.source.symlink", { path: sk });
      if (st && st.isFile()) {
        out.push({ source: join(dir, it.name), kebab: toKebab(it.name), rawName: it.name, isDir: true });
      }
    } else if (it.isFile() && it.name.toLowerCase().endsWith(".md") && it.name.toLowerCase() !== "skill.md") {
      out.push({ source: join(dir, it.name), kebab: toKebab(it.name.slice(0, -3)), rawName: it.name.slice(0, -3), isDir: false });
    }
  }
  return out;
}

/** 导入内容不接受符号链接，避免把目标目录外的内容带入技能目录。 */
async function assertNoSymbolicLinks(source) {
  const pending = [{ path: source, depth: 0 }];
  while (pending.length) {
    const current = pending.pop();
    if (current.depth > MAX_SOURCE_DEPTH) throw codedError(`skill 来源目录层级超过 ${MAX_SOURCE_DEPTH} 层: ${source}`, "error.source.tooDeep", { depth: MAX_SOURCE_DEPTH, path: source });
    const st = await fs.lstat(current.path);
    if (st.isSymbolicLink()) throw codedError(`不支持包含符号链接的 skill 来源: ${current.path}`, "error.source.symlink", { path: current.path });
    if (!st.isDirectory()) continue;
    const items = await fs.readdir(current.path, { withFileTypes: true });
    for (const item of items) {
      const path = join(current.path, item.name);
      if (item.isSymbolicLink()) throw codedError(`不支持包含符号链接的 skill 来源: ${path}`, "error.source.symlink", { path });
      if (item.isDirectory()) pending.push({ path, depth: current.depth + 1 });
    }
  }
}

function temporaryPath(target, kind) {
  return join(dirname(target), `.${basename(target)}.dssm-${kind}-${randomUUID()}`);
}

/** dry-run 预检执行与正式导入相同的符号链接/深度检查，预检失败即结论，不再进入覆盖确认。
 *  预检与实导之间来源被替换的竞态仍由实导阶段的复制后校验兜底。 */
async function preflightCandidates(pending, conflicts, failed) {
  for (const group of [pending, conflicts]) {
    for (let i = group.length - 1; i >= 0; i--) {
      const candidate = group[i];
      try {
        await assertNoSymbolicLinks(candidate.source);
      } catch (error) {
        failed.push(attachCode({ source: candidate.source, error: String(error && error.message ? error.message : error) }, error));
        group.splice(i, 1);
      }
    }
  }
}

/** 先复制到同目录临时路径，复制失败时不触碰现有技能。 */
async function copyToTemporary(source, target, isDir) {
  const temp = temporaryPath(target, "stage");
  try {
    await assertNoSymbolicLinks(source);
    if (isDir) await fs.cp(source, temp, { recursive: true, dereference: false });
    else await fs.copyFile(source, temp);
    await assertNoSymbolicLinks(temp);
    return temp;
  } catch (error) {
    await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/** 临时副本就绪后再替换；替换失败时尽力恢复旧条目。 */
async function replaceWithCopy(source, dest, isDir, existing = []) {
  const stage = await copyToTemporary(source, dest, isDir);
  const backups = [];
  try {
    for (const path of existing) {
      const backup = temporaryPath(path, "backup");
      await fs.rename(path, backup);
      backups.push({ path, backup });
    }
    await fs.rename(stage, dest);
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    const rollbackFailures = [];
    for (const item of backups.reverse()) {
      try {
        await fs.rename(item.backup, item.path);
      } catch (rollbackError) {
        rollbackFailures.push(item.backup);
      }
    }
    if (rollbackFailures.length) {
      const causeText = String(error && error.message ? error.message : error);
      throw codedError(
        `${causeText}；覆盖导入回滚失败，备份保留在: ${rollbackFailures.join("、")}`,
        "error.import.rollbackFailed",
        { path: rollbackFailures.join("; "), error: causeText },
      );
    }
    throw error;
  }
  const warnings = [];
  for (const item of backups) {
    try {
      await fs.rm(item.backup, { recursive: true, force: true });
    } catch (error) {
      warnings.push({
        code: "warning.backupUncleaned",
        params: { path: item.backup, error: String(error && error.message ? error.message : error) },
        error: `旧版本备份未清理: ${item.backup}（${String(error && error.message ? error.message : error)}）`,
      });
    }
  }
  return warnings;
}

/**
 * 导入技能到目标根。
 * options: { conflict: 'skip'|'overwrite', dryRun: boolean }
 * 成功返回 { kind, imported, skipped, failed }；失败返回 { ok:false, error }。
 */
export async function importSkill(source, log, options = {}) {
  const targetRoot = dshRootPath();
  const conflict = options.conflict === "overwrite" ? "overwrite" : "skip";
  const dryRun = options.dryRun === true;

  const analysis = await analyzeSource(source);
  if (analysis.kind === "none") return { ok: false, error: analysis.error || "无法识别的 skill 来源", code: analysis.code || "error.source.unrecognized", params: analysis.params };
  if (await pathsOverlap(analysis.source, targetRoot)) return { ok: false, error: "导入来源不能与 DSH 技能目录相同、包含或位于其中", code: "error.import.overlap" };

  let candidates = [];
  if (analysis.kind === "single") {
    candidates = [{ source: analysis.source, kebab: analysis.kebab, rawName: analysis.rawName, isDir: analysis.isDir }];
  } else {
    try {
      candidates = await collectCandidates(source);
    } catch (error) {
      return attachCode({ ok: false, error: String(error && error.message ? error.message : error) }, error);
    }
    if (candidates.length === 0) return { ok: false, error: `目录下未找到任何 skill 条目（需含 SKILL.md 的子目录或 .md 文件）: ${source}`, code: "error.import.emptySource", params: { path: source } };
  }

  const pending = [];
  const conflicts = [];
  const failed = [];
  const imported = [];
  const skipped = [];

  const nameCount = new Map();
  for (const candidate of candidates) {
    if (candidate.kebab && KEBAB_RE.test(candidate.kebab) && entryPath(targetRoot, candidate.kebab) !== null) nameCount.set(candidate.kebab, (nameCount.get(candidate.kebab) || 0) + 1);
  }

  function failureResult() {
    return {
      ok: false,
      // 聚合失败明细的原文；前端优先展示已翻译的 failed 明细，此处仅作兜底。
      error: failed.map((item) => item.error).join("；"),
      code: "error.import.failed",
      kind: analysis.kind,
      imported,
      skipped,
      failed,
    };
  }

  for (const c of candidates) {
    if (!c.kebab || !KEBAB_RE.test(c.kebab) || entryPath(targetRoot, c.kebab) === null) {
      failed.push({ source: c.source, error: `无法生成合法 kebab-case 名称（原始名: ${c.rawName || basename(c.source)}）`, code: "error.import.invalidName", params: { name: c.rawName || basename(c.source) } });
      continue;
    }
    if (nameCount.get(c.kebab) > 1) {
      failed.push({ source: c.source, error: `批量来源中存在多个同名插件: ${c.kebab}`, code: "error.import.duplicateName", params: { name: c.kebab } });
      continue;
    }
    const dest = c.isDir ? join(targetRoot, c.kebab) : join(targetRoot, `${c.kebab}.md`);
    const paths = [join(targetRoot, c.kebab), join(targetRoot, `${c.kebab}.md`)];
    const existing = [];
    for (const path of paths) {
      try {
        await fs.stat(path);
        existing.push(path);
      } catch {}
    }
    if (existing.length) {
      conflicts.push({ name: c.kebab, source: c.source, isDir: c.isDir, paths: existing });
      continue;
    }
    pending.push({ name: c.kebab, source: c.source, isDir: c.isDir, dest });
  }

  if (pending.length === 0 && conflicts.length === 0) return failureResult();

  if (dryRun) {
    // 预检即结论：与正式导入同口径执行符号链接/深度检查，避免预检通过、确认覆盖后实导才失败。
    await preflightCandidates(pending, conflicts, failed);
    if (pending.length === 0 && conflicts.length === 0) return failureResult();
    return { kind: analysis.kind, pending, conflicts, failed };
  }

  if (pending.length > 0 || (conflict === "overwrite" && conflicts.length > 0)) {
    await fs.mkdir(targetRoot, { recursive: true });
  }

  for (const p of pending) {
    try {
      const warnings = await replaceWithCopy(p.source, p.dest, p.isDir);
      imported.push({ name: p.name, overwritten: false, warnings });
      if (log) log("import", `导入 ${p.source} -> ${p.dest}`);
    } catch (e) {
      failed.push(attachCode({ source: p.source, error: String(e && e.message ? e.message : e) }, e));
    }
  }

  if (conflict === "overwrite") {
    for (const c of conflicts) {
      try {
        const dest = c.isDir ? join(targetRoot, c.name) : join(targetRoot, `${c.name}.md`);
        const warnings = await replaceWithCopy(c.source, dest, c.isDir, c.paths);
        imported.push({ name: c.name, overwritten: true, warnings });
        if (log) log("import-overwrite", `覆盖导入 ${c.source} -> ${dest}`);
      } catch (e) {
        failed.push(attachCode({ source: c.source, error: String(e && e.message ? e.message : e) }, e));
      }
    }
  } else {
    for (const c of conflicts) skipped.push({ name: c.name, source: c.source });
  }

  if (failed.length && imported.length === 0) return failureResult();
  return { kind: analysis.kind, imported, skipped, failed };
}

// ── 创建 / 详情 / Provider ─────────────────────────────────────────────────

function yamlString(value) {
  return JSON.stringify(String(value));
}

export async function createSkill(input, log) {
  const requestedName = String(input && input.name || "").trim();
  const name = toKebab(requestedName);
  const description = String(input && input.description || "").trim();
  const body = String(input && input.body || "").trim();
  if (!name || !KEBAB_RE.test(name) || entryPath(dshRootPath(), name) === null) return { ok: false, error: `无法生成合法 kebab-case 名称（原始名: ${requestedName}）`, code: "error.import.invalidName", params: { name: requestedName } };
  if (!description) return { ok: false, error: "技能简介不能为空", code: "error.create.descriptionRequired" };
  if (!body) return { ok: false, error: "技能正文不能为空", code: "error.create.bodyRequired" };
  if (description.length > 500 || body.length > (1 << 18)) return { ok: false, error: "技能内容过长", code: "error.create.tooLarge" };
  if (await safeExistingEntryPaths(dshRootPath(), name).then((items) => items.length > 0)) return { ok: false, error: `同名技能已存在: ${name}`, code: "error.create.conflict", params: { name } };
  await fs.mkdir(dshRootPath(), { recursive: true });
  const target = entryPath(dshRootPath(), name);
  const stage = temporaryPath(target, "create");
  try {
    await fs.mkdir(stage);
    const content = `---\nname: ${name}\ndescription: ${yamlString(description)}\n---\n\n${body}\n`;
    await fs.writeFile(join(stage, "SKILL.md"), content, "utf8");
    await fs.rename(stage, target);
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  if (log) log("create", `创建 ${join(target, "SKILL.md")}`);
  return { name, path: join(target, "SKILL.md") };
}

export async function skillDetail(key, name) {
  const root = rootByKey(key);
  if (!root) return { ok: false, error: `未知技能来源: ${key}`, code: "error.root.unknown", params: { root: key } };
  const entry = await resolveEntry(root.path, name);
  if (!entry) return { ok: false, error: `技能不存在: ${name}`, code: "error.skill.notFound", params: { name } };
  const raw = await fs.readFile(entry.docPath, "utf8");
  const doc = parseSkillDoc(raw);
  const summary = entryOf(name, entry.kind, entry.docPath, doc);
  return {
    root: root.key,
    name,
    declaredName: summary.declaredName,
    description: summary.description,
    path: entry.docPath,
    kind: entry.kind,
    body: doc.body.trim(),
    frontmatter: summary.hasFrontmatter ? Object.fromEntries(Object.entries(doc.map)) : null,
    diagnostics: summary.diagnostics,
    loadable: summary.loadable,
    sourceReadOnly: !root.mutable,
  };
}

/** 生成 manager provider 候选：保留禁用候选以阻止低优先级重名副本意外激活。 */
export async function listProviderCandidates() {
  const policy = (await readManagerState()).state;
  const candidates = [];
  for (const root of userRoots()) {
    if (root.key === "dsh") continue;
    const scanned = await scanEntries(root.path);
    for (const entry of scanned.entries) {
      if (!entry.loadable) continue;
      const managerEnabled = managerSkillEnabled(policy, root.key, entry.name);
      candidates.push({
        name: entry.declaredName,
        description: entry.description,
        invocation: managerEnabled ? { modelInvocable: entry.modelInvocable, userInvocable: entry.userInvocable } : { modelInvocable: false, userInvocable: false },
        provider: "dsh-skills-manager-external",
        source: `agent-${root.key}`,
        rank: root.rank,
        locator: { rootKey: root.key, entryName: entry.name, path: entry.docPath },
        resourceBase: { kind: "directory", path: entry.kind === "bundle" ? dirname(entry.docPath) : root.path },
        path: entry.docPath,
        metadata: { dshSkillsManager: { root: root.key, readOnly: true } },
      });
    }
  }
  return candidates;
}

export async function getProviderSkill(candidate) {
  const locator = candidate && candidate.locator;
  if (!locator || typeof locator.path !== "string" || typeof locator.rootKey !== "string") return undefined;
  const root = rootByKey(locator.rootKey);
  if (!root || root.key === "dsh") return undefined;
  const entry = await resolveEntry(root.path, String(locator.entryName || ""));
  if (!entry || resolve(entry.docPath) !== resolve(locator.path)) return undefined;
  const doc = parseSkillDoc(await fs.readFile(entry.docPath, "utf8"));
  const summary = entryOf(locator.entryName, entry.kind, entry.docPath, doc);
  if (!summary.loadable || summary.declaredName !== candidate.name) return undefined;
  return {
    name: candidate.name,
    description: candidate.description,
    invocation: candidate.invocation,
    provider: candidate.provider,
    source: candidate.source,
    resourceBase: candidate.resourceBase,
    path: candidate.path,
    metadata: candidate.metadata,
    content: doc.body.trim(),
  };
}

// ── 状态快照 ────────────────────────────────────────────────────────────────

/** DSH 与常见 Agent 根目录技能快照。 */
export async function state() {
  const roots = userRoots();
  const policyResult = await readManagerState();
  const trash = await listTrash();
  const result = { roots: [], trash, warnings: policyResult.warning ? [policyResult.warning] : [] };
  const all = [];
  for (const root of roots) {
    const { exists, entries } = await scanEntries(root.path);
    const skills = [];
    for (const e of entries) {
      const managerEnabled = root.key === "dsh" ? true : managerSkillEnabled(policyResult.state, root.key, e.name);
      skills.push({
        name: e.name,
        declaredName: e.declaredName,
        kind: e.kind,
        description: e.description,
        modelInvocable: e.modelInvocable,
        userInvocable: e.userInvocable,
        invocationPolicyValid: e.invocationPolicyValid,
        loadable: e.loadable,
        managerEnabled,
        diagnostics: e.diagnostics,
        path: e.docPath,
      });
      all.push({ root, entry: e, managerEnabled, view: skills[skills.length - 1] });
    }
    result.roots.push({ key: root.key, path: root.path, label: root.label, mutable: root.mutable, toggleable: root.toggleable, native: root.native, exists, enabled: root.key === "dsh" ? true : policyResult.state.sources[root.key] !== false, skills });
  }
  const winners = new Map();
  for (const item of all.sort((a, b) => a.root.rank - b.root.rank)) {
    const canonicalName = item.entry.declaredName || item.entry.name;
    if (!item.entry.loadable) continue;
    if (!winners.has(canonicalName)) winners.set(canonicalName, item);
    else item.view.shadowedBy = { root: winners.get(canonicalName).root.key, name: winners.get(canonicalName).entry.name };
  }
  for (const [canonicalName, winner] of winners) {
    winner.view.winner = true;
    winner.view.loaded = winner.root.key === "dsh"
      ? winner.entry.modelInvocable && winner.entry.userInvocable
      : winner.managerEnabled && winner.entry.modelInvocable && winner.entry.userInvocable;
    winner.view.canonicalName = canonicalName;
  }
  result.summary = {
    total: all.length,
    loaded: all.filter((item) => item.view.loaded === true).length,
    disabled: all.filter((item) => item.entry.loadable && (!item.managerEnabled || !item.entry.modelInvocable || !item.entry.userInvocable)).length,
    issues: all.reduce((count, item) => count + item.entry.diagnostics.length + (item.view.shadowedBy ? 1 : 0), 0),
  };
  return result;
}

export { KEBAB_RE };
