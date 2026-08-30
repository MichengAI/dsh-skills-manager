// dsh-skills-manager core —— 纯 Node 技能文件管理核心（仅 ZIP 解压使用 fflate，可独立单测）
//
// 覆盖 DSH 用户级与活动 Session 项目级技能根：
//   - 用户根目录：~/.dsh/skills 与常见 Agent 用户目录
//   - 项目根目录：<project>/.dsh/skills（可启停、创建、回收）、<project>/.agents/skills（本地策略启停、源文件只读）
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
import { createHash, randomUUID } from "node:crypto";
import { unzipSync } from "fflate";

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_ROOT_KEY_RE = /^project-(?:dsh|agents):[a-f0-9]{16}$/;
const USER_DSH_POLICY_RANK = 399;
const WINDOWS_DEVICE_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAX_SOURCE_DEPTH = 64;
const MAX_ENTRY_NAME_LENGTH = 128;
const MAX_BROWSE_ENTRIES = 500;
const MAX_UPLOAD_ARCHIVE_BYTES = 32 << 20;
const MAX_UPLOAD_ENTRY_BYTES = 32 << 20;
const MAX_UPLOAD_TOTAL_BYTES = 64 << 20;
const MAX_UPLOAD_ENTRIES = 1000;
const MAX_UPLOAD_PATH_LENGTH = 512;
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

function projectIdentity(path) {
  const canonical = process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

async function nearestProjectRoot(cwd) {
  if (typeof cwd !== "string" || !isAbsolute(cwd)) return null;
  let start;
  try {
    start = await fs.realpath(resolve(cwd));
    if (!(await fs.stat(start)).isDirectory()) return null;
  } catch {
    return { unavailable: true, cwd };
  }
  let current = start;
  for (;;) {
    try {
      await fs.lstat(join(current, ".git"));
      return { root: current, cwd: start };
    } catch {
      /* 继续向上查找最近的项目根 */
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function projectSourceSafe(definition) {
  const container = join(definition.projectRoot, definition.kind === "project-dsh" ? ".dsh" : ".agents");
  for (const path of [container, definition.path]) {
    const st = await lstatOrNull(path);
    if (st && (!st.isDirectory() || st.isSymbolicLink())) return false;
  }
  return !(await overlapsUserSkillRoot(definition.path));
}

/**
 * 从活动 Session cwd 推导项目技能根。只接受宿主上可解析的绝对目录，
 * 同一项目的多个 Session 会折叠到同一组稳定 key，避免跨 workspace 合并同名技能。
 */
export async function projectRoots(projectCwds = [], diagnostics) {
  const projects = new Map();
  for (const cwd of Array.isArray(projectCwds) ? projectCwds : []) {
    const found = await nearestProjectRoot(cwd);
    if (!found || !found.root) {
      if (found && found.unavailable && Array.isArray(diagnostics) && typeof cwd === "string" && isAbsolute(cwd)) {
        diagnostics.push({ code: "warning.project.unavailable", params: { path: cwd }, error: `无法从宿主读取活动工作区，项目技能未显示: ${cwd}` });
      }
      continue;
    }
    const identity = process.platform === "win32" ? found.root.toLowerCase() : found.root;
    const existing = projects.get(identity) || { root: found.root, cwds: new Set() };
    existing.cwds.add(found.cwd);
    projects.set(identity, existing);
  }
  const roots = [];
  for (const project of [...projects.values()].sort((a, b) => a.root.localeCompare(b.root))) {
    const id = projectIdentity(project.root);
    const common = {
      mutable: false,
      toggleable: false,
      native: true,
      scope: "project",
      projectRoot: project.root,
      projectName: basename(project.root) || project.root,
      workspaceCwds: [...project.cwds].sort(),
    };
    const candidates = [
      { ...common, key: `project-dsh:${id}`, kind: "project-dsh", localeKey: "projectDsh", path: join(project.root, ".dsh", "skills"), label: "Project DSH", rank: 100, mutable: true, toggleable: true },
      { ...common, key: `project-agents:${id}`, kind: "project-agents", localeKey: "projectAgents", path: join(project.root, ".agents", "skills"), label: "Project Agent", rank: 200, toggleable: true },
    ];
    for (const candidate of candidates) {
      if (await projectSourceSafe(candidate)) roots.push(candidate);
    }
  }
  return roots;
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

/** 只读来源的拒绝结果；action 为可翻译语义值（toggle/delete）。 */
function readonlyError(action) {
  return {
    ok: false,
    code: "error.root.readonly",
    params: { action },
    error: action === "delete" ? "该技能来源不允许删除" : "该技能来源不允许启用或停用",
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

/** 只允许用户 DSH 根，或由活动 Session 推导出的项目 DSH 根参与文件写入。 */
function writableRootDefinition(root) {
  const definition = rootDefinition(root);
  if (!definition || definition.mutable !== true) return null;
  if (definition.key === "dsh") return resolve(definition.path) === resolve(dshRootPath()) ? rootByKey("dsh") : null;
  if (
    definition.scope !== "project"
    || definition.kind !== "project-dsh"
    || typeof definition.projectRoot !== "string"
    || !isAbsolute(definition.projectRoot)
    || definition.key !== `project-dsh:${projectIdentity(definition.projectRoot)}`
    || resolve(definition.path) !== resolve(join(definition.projectRoot, ".dsh", "skills"))
  ) return null;
  return definition;
}

async function checkedWritableRootDefinition(root) {
  const definition = writableRootDefinition(root);
  if (!definition || definition.scope !== "project") return definition;
  if (await overlapsUserSkillRoot(definition.path)) {
    return { ok: false, error: `项目技能目录与用户技能目录重叠，拒绝写入: ${definition.path}`, code: "error.root.unsafe", params: { path: definition.path } };
  }
  // 项目仓库内容不可信；拒绝通过 .dsh 或 skills 链接把写入重定向到项目之外。
  for (const path of [join(definition.projectRoot, ".dsh"), definition.path]) {
    const st = await lstatOrNull(path);
    if (st && (!st.isDirectory() || st.isSymbolicLink())) {
      return { ok: false, error: `项目技能目录不安全，拒绝写入: ${path}`, code: "error.root.unsafe", params: { path } };
    }
  }
  return definition;
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

/** 即使末级路径尚不存在，也解析最近既存祖先中的链接，供权限域重叠判断。 */
async function comparisonPath(path) {
  let current = resolve(path);
  const missing = [];
  for (;;) {
    try {
      return resolve(await fs.realpath(current), ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

async function overlapsUserSkillRoot(path) {
  const candidate = await comparisonPath(path);
  for (const root of userRoots()) {
    const userPath = await comparisonPath(root.path);
    if (isSameOrDescendant(candidate, userPath) || isSameOrDescendant(userPath, candidate)) return true;
  }
  return false;
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
 *  只识别顶层 key: value；缩进嵌套字段（如 metadata.source）不进入 map。 */
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

async function removeMovedPath(path) {
  const st = await lstatOrNull(path);
  if (!st) return;
  if (st.isDirectory() && !st.isSymbolicLink()) await fs.rm(path, { recursive: true, force: false });
  else await fs.unlink(path);
}

/** rename 跨盘返回 EXDEV 时：先完整复制，再在源盘原子隐藏源条目，最后清理隐藏副本。 */
async function movePathWithFallback(source, destination, options = {}) {
  try {
    await renameWithRetry(source, destination, options);
    return { copied: false, cleanupError: null };
  } catch (error) {
    if (!error || error.code !== "EXDEV") throw error;
  }

  const quarantine = join(dirname(source), `.${basename(source)}.dssm-move-${randomUUID()}`);
  try {
    await fs.cp(source, destination, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    // 源与 quarantine 位于同一目录；成功后原技能名立即消失，避免递归删除留下半份可见条目。
    await renameWithRetry(source, quarantine, options);
  } catch (error) {
    await removeMovedPath(destination).catch(() => undefined);
    throw error;
  }

  let cleanupError = null;
  try {
    await removeMovedPath(quarantine);
  } catch (error) {
    cleanupError = error;
  }
  return { copied: true, cleanupError, quarantine };
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
  const rootStat = await lstatOrNull(rootPath);
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) return null;
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
    // 调用策略值异常可以由 manager 本地策略覆盖；结构本身合法即可加载。
    loadable: doc.hasFrontmatter && KEBAB_RE.test(declaredName) && description !== "",
    diagnostics,
  };
}

/** 扫描一个技能根（只扫一层）。返回 { exists, entries }。 */
export async function scanEntries(root) {
  const rootStat = await lstatOrNull(resolve(root));
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) return { exists: false, entries: [] };
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
  const enabledSkills = Object.create(null);
  for (const root of userRoots()) {
    if (root.key !== "dsh") sources[root.key] = true;
    disabledSkills[root.key] = [];
    enabledSkills[root.key] = [];
  }
  return { version: 1, sources, disabledSkills, enabledSkills };
}

function validStateSkillName(name) {
  return typeof name === "string" && KEBAB_RE.test(name) && entryPath(resolveDshHome(), name) !== null;
}

/** 状态文件已存在但不可用时一律关闭外部来源，避免损坏配置重新暴露技能。 */
function failClosedManagerState() {
  const state = defaultManagerState();
  for (const key of Object.keys(state.sources)) state.sources[key] = false;
  return state;
}

function validPolicyLists(value, allowMissing = false) {
  if (value === undefined && allowMissing) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [key, list] of Object.entries(value)) {
    if (!userRoots().some((root) => root.key === key) && !PROJECT_ROOT_KEY_RE.test(key)) continue;
    if (!Array.isArray(list) || list.some((name) => !validStateSkillName(name))) return false;
  }
  return true;
}

function validManagerStateDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) return false;
  if (!value.sources || typeof value.sources !== "object" || Array.isArray(value.sources)) return false;
  if (!validPolicyLists(value.disabledSkills) || !validPolicyLists(value.enabledSkills, true)) return false;
  for (const root of userRoots()) {
    if (root.key === "dsh") continue;
    if (typeof value.sources[root.key] !== "boolean") return false;
    const list = value.disabledSkills[root.key];
    if (!Array.isArray(list) || list.some((name) => typeof name !== "string" || entryPath(root.path, name) === null)) return false;
  }
  const enabledSkills = value.enabledSkills || {};
  for (const key of new Set([...Object.keys(value.disabledSkills), ...Object.keys(enabledSkills)])) {
    const disabled = new Set(value.disabledSkills[key] || []);
    if ((enabledSkills[key] || []).some((name) => disabled.has(name))) return false;
  }
  return true;
}

function normalizeManagerState(value) {
  const normalized = defaultManagerState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return normalized;
  for (const root of userRoots()) {
    if (root.key !== "dsh" && value.sources && typeof value.sources[root.key] === "boolean") normalized.sources[root.key] = value.sources[root.key];
    const list = value.disabledSkills && value.disabledSkills[root.key];
    if (Array.isArray(list)) normalized.disabledSkills[root.key] = [...new Set(list.filter((name) => typeof name === "string" && entryPath(root.path, name) !== null))].sort();
    const enabled = value.enabledSkills && value.enabledSkills[root.key];
    if (Array.isArray(enabled)) normalized.enabledSkills[root.key] = [...new Set(enabled.filter((name) => typeof name === "string" && entryPath(root.path, name) !== null))].sort();
  }
  for (const field of ["disabledSkills", "enabledSkills"]) {
    const source = value[field];
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [key, list] of Object.entries(source)) {
        if (!PROJECT_ROOT_KEY_RE.test(key) || !Array.isArray(list)) continue;
        normalized[field][key] = [...new Set(list.filter(validStateSkillName))].sort();
      }
    }
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
      warning: { code: "warning.state.invalid", params: { path: managerStatePath() }, error: `技能管理器状态文件不可读，所有技能已安全停用且状态写入已锁定: ${managerStatePath()}` },
    };
  }
}

async function writeManagerState(value) {
  await fs.mkdir(managerHomePath(), { recursive: true });
  await writeFileAtomically(managerStatePath(), `${JSON.stringify(normalizeManagerState(value), null, 2)}\n`);
}

function managerSkillOverride(policy, rootKey, name) {
  if ((policy.enabledSkills[rootKey] || []).includes(name)) return true;
  if ((policy.disabledSkills[rootKey] || []).includes(name)) return false;
  return undefined;
}

function effectiveSkillPolicy(policyResult, root, entry) {
  const override = managerSkillOverride(policyResult.state, root.key, entry.name);
  const sourceEnabled = root.key === "dsh" || root.scope === "project" || policyResult.state.sources[root.key] !== false;
  if (policyResult.writable === false || !sourceEnabled || override === false) {
    return { override, sourceEnabled, modelInvocable: false, userInvocable: false, enabled: false };
  }
  if (override === true) {
    return { override, sourceEnabled, modelInvocable: true, userInvocable: true, enabled: true };
  }
  const modelInvocable = entry.invocationPolicyValid && entry.modelInvocable;
  const userInvocable = entry.invocationPolicyValid && entry.userInvocable;
  return { override, sourceEnabled, modelInvocable, userInvocable, enabled: modelInvocable && userInvocable };
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

async function checkedPolicyRootDefinition(root) {
  const definition = rootDefinition(root);
  if (!definition || !definition.toggleable) return null;
  if (definition.scope !== "project") {
    const canonical = rootByKey(definition.key);
    return canonical && resolve(canonical.path) === resolve(definition.path) ? canonical : null;
  }
  const validProjectRoot = (definition.kind === "project-dsh" || definition.kind === "project-agents")
    && PROJECT_ROOT_KEY_RE.test(definition.key)
    && typeof definition.projectRoot === "string"
    && isAbsolute(definition.projectRoot)
    && definition.key === `${definition.kind}:${projectIdentity(definition.projectRoot)}`
    && resolve(definition.path) === resolve(join(definition.projectRoot, definition.kind === "project-dsh" ? ".dsh" : ".agents", "skills"));
  if (!validProjectRoot) return null;
  if (!(await projectSourceSafe(definition))) {
    return { ok: false, error: `项目技能目录不安全，拒绝写入状态: ${definition.path}`, code: "error.root.unsafe", params: { path: definition.path } };
  }
  return definition;
}

async function setPolicySkillEnabled(root, name, enabled, log) {
  const definition = await checkedPolicyRootDefinition(root);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("toggle");
  const resolved = await resolveEntry(definition.path, name);
  if (resolved === null) return { ok: false, error: `技能不存在: ${name}`, code: "error.skill.notFound", params: { name } };
  const summary = entryOf(name, resolved.kind, resolved.docPath, parseSkillDoc(await fs.readFile(resolved.docPath, "utf8")));
  if (!summary.hasFrontmatter) {
    return { ok: false, error: `技能缺少完整 frontmatter，无法${enabled ? "启用" : "停用"}: ${name}`, code: "error.skill.noFrontmatter", params: { name, action: enabled ? "enable" : "disable" } };
  }
  if (!summary.loadable) {
    return { ok: false, error: `技能结构不完整，无法${enabled ? "启用" : "停用"}: ${name}`, code: "error.skill.notLoadable", params: { name, action: enabled ? "enable" : "disable" } };
  }
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  const disabled = new Set(current.state.disabledSkills[definition.key] || []);
  const explicitlyEnabled = new Set(current.state.enabledSkills[definition.key] || []);
  if (enabled) {
    disabled.delete(name);
    explicitlyEnabled.add(name);
  } else {
    explicitlyEnabled.delete(name);
    disabled.add(name);
  }
  current.state.disabledSkills[definition.key] = [...disabled].sort();
  current.state.enabledSkills[definition.key] = [...explicitlyEnabled].sort();
  await writeManagerState(current.state);
  if (log) log(enabled ? "policy-enable" : "policy-disable", `${enabled ? "启用" : "停用"} ${definition.key}/${name}（本地策略，源文件不变）`);
  return { root: definition.key, name, enabled: enabled === true };
}

// ── 启用 / 停用（同时控制模型与 / 手动调用，非破坏）──────────────────────────

/** enabled=true 恢复模型与 / 手动调用；false 同时停用两种调用入口。 */
export async function setSkillEnabled(root, name, enabled, log) {
  return setPolicySkillEnabled(root, name, enabled, log);
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

/**
 * Windows Defender / 索引器可能持续占用刚写入的 stage 目录，导致容器目录 rename
 * 在短重试窗口后仍返回 EPERM。此时保留 stage 作为唯一可回滚副本，逐项复制到最终目录，
 * 并最后写 metadata：listTrash() 在复制完整前不会暴露半成品。
 */
async function publishTrashStage(stage, finalPath, metadata, renameOptions) {
  try {
    await renameWithRetry(stage, finalPath, renameOptions);
    return { fallback: false, cleanupError: null };
  } catch (error) {
    if (!TRANSIENT_RENAME_CODES.has(error && error.code)) throw error;
  }

  await fs.mkdir(finalPath);
  try {
    for (const fileName of metadata.entries) {
      await fs.cp(join(stage, fileName), join(finalPath, fileName), {
        recursive: true,
        dereference: false,
        errorOnExist: true,
        force: false,
      });
    }
    await fs.writeFile(join(finalPath, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  } catch (error) {
    await fs.rm(finalPath, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  let cleanupError = null;
  try {
    await fs.rm(stage, { recursive: true, force: true });
  } catch (error) {
    cleanupError = error;
  }
  return { fallback: true, cleanupError };
}

function trashRootMetadata(definition) {
  if (definition.key === "dsh") return { key: "dsh", scope: "user", label: definition.label };
  return {
    key: definition.key,
    scope: "project",
    kind: "project-dsh",
    projectRoot: definition.projectRoot,
    projectName: definition.projectName,
    label: definition.label,
  };
}

async function restoreRootDefinition(metadata, options = {}) {
  // version 1 entries predate scoped Trash and always belong to $DSH_HOME/skills.
  if (!metadata.root) return rootByKey("dsh");
  if (metadata.root.scope === "user" && metadata.root.key === "dsh") return rootByKey("dsh");
  if (
    metadata.root.scope !== "project"
    || metadata.root.kind !== "project-dsh"
    || typeof metadata.root.key !== "string"
    || typeof metadata.root.projectRoot !== "string"
    || !isAbsolute(metadata.root.projectRoot)
  ) return { ok: false, error: `回收站条目来源非法: ${metadata.id}`, code: "error.trash.invalid", params: { id: metadata.id } };
  const roots = await projectRoots(options.projectCwds);
  const normalizedProjectRoot = process.platform === "win32" ? resolve(metadata.root.projectRoot).toLowerCase() : resolve(metadata.root.projectRoot);
  const root = roots.find((item) => item.key === metadata.root.key && item.kind === "project-dsh" && (process.platform === "win32" ? resolve(item.projectRoot).toLowerCase() : resolve(item.projectRoot)) === normalizedProjectRoot);
  if (!root) {
    return {
      ok: false,
      error: `原项目当前不在活动工作区中，无法恢复: ${metadata.root.projectRoot}`,
      code: "error.trash.projectUnavailable",
      params: { path: metadata.root.projectRoot },
    };
  }
  return checkedWritableRootDefinition(root);
}

/** 把用户或活动项目的 DSH 根中的单个技能移入 manager-owned 回收站。 */
export async function deleteSkill(root, name, log, options = {}) {
  const definition = await checkedWritableRootDefinition(root);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("delete");
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
      const transferred = await movePathWithFallback(target.path, destination, options.renameOptions);
      if (transferred.cleanupError && log) log("trash-source-warning", `技能已跨盘移入回收站，但源盘隐藏副本等待后续清理: ${transferred.quarantine}（${transferred.cleanupError.message || transferred.cleanupError}）`);
      moved.push({ ...target, destination });
    }
    const metadata = { version: 2, id, name, deletedAt: new Date().toISOString(), entries: moved.map((item) => item.fileName), root: trashRootMetadata(definition) };
    await fs.writeFile(join(stage, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    const published = await publishTrashStage(stage, finalPath, metadata, options.renameOptions);
    if (published.cleanupError && log) log("trash-stage-warning", `回收站已发布，但临时目录等待后续清理: ${stage}（${published.cleanupError.message || published.cleanupError}）`);
    if (log) log("trash", `移到回收站 ${name} -> ${finalPath}`);
    return { id, name, deletedAt: metadata.deletedAt, root: metadata.root };
  } catch (error) {
    const rollbackFailures = [];
    for (const item of moved.reverse()) {
      try {
        await movePathWithFallback(item.destination, item.path, options.renameOptions);
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

export async function restoreTrash(id, log, options = {}) {
  const metadata = await readTrashMetadata(id);
  if (!metadata) return { ok: false, error: `回收站条目不存在: ${id}`, code: "error.trash.notFound", params: { id } };
  const definition = await restoreRootDefinition(metadata, options);
  if (!definition || definition.ok === false) return definition || readonlyError("restore");
  const root = definition.path;
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
      await movePathWithFallback(source, destination, options.renameOptions);
      moved.push({ source, destination });
    }
    await fs.rm(itemRoot, { recursive: true, force: true });
    if (log) log("restore", `从回收站恢复 ${metadata.name} -> ${root}`);
    return { id, name: metadata.name, root: trashRootMetadata(definition) };
  } catch (error) {
    for (const item of moved.reverse()) await movePathWithFallback(item.destination, item.source, options.renameOptions).catch(() => undefined);
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

// ── 浏览器上传导入 ──────────────────────────────────────────────────────────

/**
 * 校验浏览器或 ZIP 提供的相对路径。上传内容始终写成普通文件，不解释 ZIP 的链接元数据。
 * 这样既不依赖浏览器泄露本机绝对路径，也不会让归档跨出管理器暂存目录。
 */
function normalizeUploadPath(input) {
  const raw = String(input == null ? "" : input).replace(/\\/g, "/");
  if (!raw || raw.length > MAX_UPLOAD_PATH_LENGTH || raw.includes("\0") || raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || raw.startsWith("//")) {
    throw codedError(`上传条目路径非法: ${raw}`, "error.upload.path", { path: raw });
  }
  const directory = raw.endsWith("/");
  const parts = raw.split("/").filter((part, index, all) => directory && index === all.length - 1 ? false : true);
  if (!parts.length || parts.length > MAX_SOURCE_DEPTH || parts.some((part) => !part || part === "." || part === ".." || part.length > MAX_ENTRY_NAME_LENGTH || WINDOWS_DEVICE_NAME_RE.test(part))) {
    throw codedError(`上传条目路径非法: ${raw}`, "error.upload.path", { path: raw });
  }
  return { path: parts.join("/"), directory };
}

function decodeUploadBase64(value, maxBytes, code = "error.upload.tooLarge") {
  const raw = String(value == null ? "" : value);
  const padding = raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0;
  const dataLength = raw.length - padding;
  const firstPadding = raw.indexOf("=");
  if (raw.length % 4 !== 0 || (firstPadding !== -1 && firstPadding !== dataLength)) {
    throw codedError("上传内容不是合法 Base64", "error.upload.encoding");
  }
  const decodedLength = raw.length / 4 * 3 - padding;
  if (decodedLength > maxBytes) throw codedError(`上传内容超过 ${maxBytes} 字节限制`, code, { limit: maxBytes });
  // 避免对数 MiB 字符串使用带重复分组的正则；V8 可能在合法大文件上耗尽调用栈。
  for (let index = 0; index < dataLength; index += 1) {
    const char = raw.charCodeAt(index);
    if (!((char >= 65 && char <= 90) || (char >= 97 && char <= 122) || (char >= 48 && char <= 57) || char === 43 || char === 47)) {
      throw codedError("上传内容不是合法 Base64", "error.upload.encoding");
    }
  }
  const bytes = Buffer.from(raw, "base64");
  return bytes;
}

function uploadError(error) {
  return attachCode({ ok: false, error: String(error && error.message ? error.message : error) }, error);
}

async function writeUploadedEntries(contentRoot, entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw codedError("上传内容为空", "error.upload.empty");
  if (entries.length > MAX_UPLOAD_ENTRIES) throw codedError(`上传条目超过 ${MAX_UPLOAD_ENTRIES} 个`, "error.upload.tooMany", { limit: MAX_UPLOAD_ENTRIES });
  let total = 0;
  const seen = new Set();
  for (const entry of entries) {
    const normalized = normalizeUploadPath(entry && entry.path);
    const key = normalized.path.toLowerCase();
    if (seen.has(key)) throw codedError(`上传内容包含重复路径: ${normalized.path}`, "error.upload.duplicate", { path: normalized.path });
    seen.add(key);
    if (normalized.directory) continue;
    const bytes = decodeUploadBase64(entry && entry.data, MAX_UPLOAD_ENTRY_BYTES);
    total += bytes.length;
    if (total > MAX_UPLOAD_TOTAL_BYTES) throw codedError(`上传内容总大小超过 ${MAX_UPLOAD_TOTAL_BYTES} 字节`, "error.upload.tooLarge", { limit: MAX_UPLOAD_TOTAL_BYTES });
    const target = join(contentRoot, ...normalized.path.split("/"));
    if (!isSameOrDescendant(contentRoot, target)) throw codedError(`上传条目路径非法: ${normalized.path}`, "error.upload.path", { path: normalized.path });
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}

async function writeUploadedZip(contentRoot, encoded) {
  const archive = decodeUploadBase64(encoded, MAX_UPLOAD_ARCHIVE_BYTES, "error.upload.archiveTooLarge");
  let count = 0;
  let total = 0;
  let files;
  try {
    files = unzipSync(archive, {
      filter(info) {
        const normalized = normalizeUploadPath(info.name);
        count += 1;
        if (count > MAX_UPLOAD_ENTRIES) throw codedError(`ZIP 条目超过 ${MAX_UPLOAD_ENTRIES} 个`, "error.upload.tooMany", { limit: MAX_UPLOAD_ENTRIES });
        if (!normalized.directory && info.originalSize > MAX_UPLOAD_ENTRY_BYTES) throw codedError(`ZIP 条目过大: ${normalized.path}`, "error.upload.tooLarge", { limit: MAX_UPLOAD_ENTRY_BYTES });
        total += normalized.directory ? 0 : info.originalSize;
        if (total > MAX_UPLOAD_TOTAL_BYTES) throw codedError(`ZIP 解压后总大小超过 ${MAX_UPLOAD_TOTAL_BYTES} 字节`, "error.upload.tooLarge", { limit: MAX_UPLOAD_TOTAL_BYTES });
        return !normalized.directory;
      },
    });
  } catch (error) {
    if (error && /^error\./.test(String(error.code || ""))) throw error;
    throw codedError(`ZIP 无法解压: ${String(error && error.message ? error.message : error)}`, "error.upload.zipInvalid");
  }
  const entries = Object.entries(files).map(([path, bytes]) => ({ path, data: Buffer.from(bytes).toString("base64") }));
  await writeUploadedEntries(contentRoot, entries);
}

async function prepareUploadedSource(sessionRoot, input) {
  const contentRoot = join(sessionRoot, "content");
  await fs.mkdir(contentRoot, { recursive: true });
  if (input && input.zip !== undefined) await writeUploadedZip(contentRoot, input.zip);
  else await writeUploadedEntries(contentRoot, input && input.entries);

  const rootSkill = join(contentRoot, "SKILL.md");
  const rootSkillStat = await lstatOrNull(rootSkill);
  if (!rootSkillStat || !rootSkillStat.isFile()) return contentRoot;

  const doc = parseSkillDoc(await fs.readFile(rootSkill, "utf8"));
  const fallback = String(input && input.name || "uploaded-skill").replace(/\.zip$/i, "").replace(/^skill\.md$/i, "uploaded-skill");
  const skillName = toKebab(doc.map.name || fallback);
  if (!skillName || !KEBAB_RE.test(skillName) || entryPath(contentRoot, skillName) === null) {
    throw codedError(`无法生成合法 kebab-case 名称（原始名: ${doc.map.name || fallback}）`, "error.import.invalidName", { name: doc.map.name || fallback });
  }
  const batchRoot = join(sessionRoot, "batch");
  const wrappedRoot = join(batchRoot, skillName);
  await fs.mkdir(batchRoot, { recursive: true });
  await fs.rename(contentRoot, wrappedRoot);
  return batchRoot;
}

/**
 * 接收浏览器读取后的内容，在 manager 私有目录暂存并复用现有原子导入链路。
 * input: { name, entries:[{path,data(base64)}] } 或 { name, zip:base64 }。
 */
export async function importUploadedSkill(input, log, options = {}) {
  const uploadHome = join(managerHomePath(), "uploads");
  const sessionRoot = join(uploadHome, `.upload-${randomUUID()}`);
  try {
    await fs.mkdir(sessionRoot, { recursive: true });
    const source = await prepareUploadedSource(sessionRoot, input || {});
    return await importSkill(source, log, options);
  } catch (error) {
    return uploadError(error);
  } finally {
    await fs.rm(sessionRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ── 创建 / 详情 / Provider ─────────────────────────────────────────────────

function yamlString(value) {
  return JSON.stringify(String(value));
}

export async function createSkill(input, log, options = {}) {
  const requestedRoot = Object.prototype.hasOwnProperty.call(options, "root") ? options.root : rootByKey("dsh");
  const definition = await checkedWritableRootDefinition(requestedRoot);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("create");
  const root = definition.path;
  const requestedName = String(input && input.name || "").trim();
  const name = toKebab(requestedName);
  const description = String(input && input.description || "").trim();
  const body = String(input && input.body || "").trim();
  if (!name || !KEBAB_RE.test(name) || entryPath(root, name) === null) return { ok: false, error: `无法生成合法 kebab-case 名称（原始名: ${requestedName}）`, code: "error.import.invalidName", params: { name: requestedName } };
  if (!description) return { ok: false, error: "技能简介不能为空", code: "error.create.descriptionRequired" };
  if (!body) return { ok: false, error: "技能正文不能为空", code: "error.create.bodyRequired" };
  if (description.length > 500 || body.length > (1 << 18)) return { ok: false, error: "技能内容过长", code: "error.create.tooLarge" };
  if (await safeExistingEntryPaths(root, name).then((items) => items.length > 0)) return { ok: false, error: `同名技能已存在: ${name}`, code: "error.create.conflict", params: { name } };
  await fs.mkdir(root, { recursive: true });
  const target = entryPath(root, name);
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
  return { name, path: join(target, "SKILL.md"), root: definition.key };
}

export async function skillDetail(key, name, options = {}) {
  const scopedRoots = await projectRoots(options.projectCwds);
  const root = rootByKey(key) || scopedRoots.find((item) => item.key === key);
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
export async function listProviderCandidates(options = {}) {
  const policyResult = await readManagerState();
  const candidates = [];
  for (const root of userRoots()) {
    const scanned = await scanEntries(root.path);
    for (const entry of scanned.entries) {
      if (!entry.loadable) continue;
      const policy = effectiveSkillPolicy(policyResult, root, entry);
      const needsOverlay = root.key !== "dsh" || policy.override !== undefined || !entry.invocationPolicyValid || policyResult.writable === false;
      if (!needsOverlay) continue;
      candidates.push({
        name: entry.declaredName,
        description: entry.description,
        invocation: { modelInvocable: policy.modelInvocable, userInvocable: policy.userInvocable },
        provider: "dsh-skills-manager-external",
        source: root.key === "dsh" ? "user-dsh" : `agent-${root.key}`,
        rank: root.key === "dsh" ? USER_DSH_POLICY_RANK : root.rank,
        locator: { rootKey: root.key, entryName: entry.name, path: entry.docPath },
        resourceBase: { kind: "directory", path: entry.kind === "bundle" ? dirname(entry.docPath) : root.path },
        path: entry.docPath,
        metadata: { dshSkillsManager: { root: root.key, readOnly: !root.mutable, sourceReadOnly: !root.mutable, policyOnly: root.key === "dsh" } },
      });
    }
  }
  const cwd = options && typeof options.cwd === "string" ? options.cwd : undefined;
  if (cwd) {
    const roots = await projectRoots([cwd]);
    for (const root of roots) {
      const scanned = await scanEntries(root.path);
      for (const entry of scanned.entries) {
        if (!entry.loadable) continue;
        const policy = effectiveSkillPolicy(policyResult, root, entry);
        const needsOverlay = policy.override !== undefined || !entry.invocationPolicyValid || policyResult.writable === false;
        // 没有本地覆盖时继续由 DSH 官方作用域 provider 负责加载。
        if (!needsOverlay) continue;
        candidates.push({
          name: entry.declaredName,
          description: entry.description,
          invocation: { modelInvocable: policy.modelInvocable, userInvocable: policy.userInvocable },
          provider: "dsh-skills-manager-external",
          source: root.kind,
          rank: root.rank - 1,
          locator: { rootKey: root.key, entryName: entry.name, path: entry.docPath },
          resourceBase: { kind: "directory", path: entry.kind === "bundle" ? dirname(entry.docPath) : root.path },
          path: entry.docPath,
          metadata: { dshSkillsManager: { root: root.key, readOnly: !root.mutable, sourceReadOnly: !root.mutable, policyOnly: true } },
        });
      }
    }
  }
  return candidates;
}

export async function getProviderSkill(candidate, options = {}) {
  const locator = candidate && candidate.locator;
  if (!locator || typeof locator.path !== "string" || typeof locator.rootKey !== "string") return undefined;
  let root = rootByKey(locator.rootKey);
  if (!root && PROJECT_ROOT_KEY_RE.test(locator.rootKey) && typeof options.cwd === "string") {
    root = (await projectRoots([options.cwd])).find((item) => item.key === locator.rootKey);
  }
  if (!root) return undefined;
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

function canonicalSkillName(item) {
  return item.entry.declaredName || item.entry.name;
}

function markWinners(items, options = {}) {
  const winners = new Map();
  for (const item of [...items].sort((a, b) => a.root.rank - b.root.rank)) {
    const canonicalName = canonicalSkillName(item);
    if (!item.entry.loadable) continue;
    if (!winners.has(canonicalName)) {
      winners.set(canonicalName, item);
    } else if (options.markShadowed !== false) {
      item.view.shadowedBy = { root: winners.get(canonicalName).root.key, name: winners.get(canonicalName).entry.name };
    }
  }
  for (const [canonicalName, winner] of winners) {
    if (options.markWinner !== false) winner.view.winner = true;
    winner.view.enabled = winner.policy.enabled;
    winner.view.canonicalName = canonicalName;
  }
  return winners;
}

/** DSH、常见 Agent 与活动 Session 项目根的技能快照。 */
export async function state(options = {}) {
  const user = userRoots();
  const projectWarnings = [];
  const scoped = await projectRoots(options.projectCwds, projectWarnings);
  const policyResult = await readManagerState();
  const trash = await listTrash();
  const result = { roots: [], projects: [], trash, warnings: [...(policyResult.warning ? [policyResult.warning] : []), ...projectWarnings] };
  const all = [];
  for (const root of [...scoped, ...user]) {
    const { exists, entries } = await scanEntries(root.path);
    // 即使项目 .dsh/skills 尚不存在，也要把可写根返回给创建表单；只读项目根仍按实际存在性展示。
    if (root.scope === "project" && !exists && root.kind !== "project-dsh") continue;
    const skills = [];
    for (const e of entries) {
      const policy = effectiveSkillPolicy(policyResult, root, e);
      const managerEnabled = policyResult.writable !== false && policy.sourceEnabled && policy.override !== false;
      skills.push({
        name: e.name,
        declaredName: e.declaredName,
        kind: e.kind,
        description: e.description,
        modelInvocable: e.modelInvocable,
        userInvocable: e.userInvocable,
        invocationPolicyValid: e.invocationPolicyValid,
        hasFrontmatter: e.hasFrontmatter,
        loadable: e.loadable,
        managerEnabled,
        managerOverride: policy.override === undefined ? null : policy.override,
        effectiveModelInvocable: policy.modelInvocable,
        effectiveUserInvocable: policy.userInvocable,
        diagnostics: e.diagnostics,
        path: e.docPath,
      });
      all.push({ root, entry: e, managerEnabled, policy, view: skills[skills.length - 1] });
    }
    result.roots.push({
      key: root.key,
      ...(root.kind ? { kind: root.kind } : {}),
      ...(root.localeKey ? { localeKey: root.localeKey } : {}),
      path: root.path,
      label: root.label,
      mutable: root.mutable,
      toggleable: root.toggleable,
      native: root.native,
      rank: root.rank,
      scope: root.scope || "user",
      ...(root.projectRoot ? { projectRoot: root.projectRoot, projectName: root.projectName, workspaceCwds: root.workspaceCwds } : {}),
      exists,
      enabled: policyResult.writable !== false && (root.scope === "project" || root.key === "dsh" || policyResult.state.sources[root.key] !== false),
      skills,
    });
  }
  const userItems = all.filter((item) => item.root.scope !== "project");
  markWinners(userItems);
  const projectGroups = new Map();
  for (const item of all.filter((candidate) => candidate.root.scope === "project")) {
    const group = projectGroups.get(item.root.projectRoot) || [];
    group.push(item);
    projectGroups.set(item.root.projectRoot, group);
  }
  for (const projectItems of projectGroups.values()) {
    // 用户级条目参与该 workspace 的优先级判定，但不把其全局视图标记为“被某项目覆盖”。
    const userCopies = userItems.map((item) => ({ ...item, view: { ...item.view } }));
    markWinners([...projectItems, ...userCopies]);
  }
  const seenProjects = new Set();
  for (const root of result.roots.filter((item) => item.scope === "project")) {
    if (seenProjects.has(root.projectRoot)) continue;
    seenProjects.add(root.projectRoot);
    result.projects.push({ root: root.projectRoot, name: root.projectName, workspaceCwds: root.workspaceCwds });
  }
  result.summary = {
    total: all.length,
    enabled: all.filter((item) => item.view.enabled === true).length,
    disabled: all.filter((item) => item.entry.loadable && item.policy.enabled === false).length,
    issues: all.reduce((count, item) => count + item.entry.diagnostics.length + (item.view.shadowedBy ? 1 : 0), 0),
  };
  return result;
}

export { KEBAB_RE };
