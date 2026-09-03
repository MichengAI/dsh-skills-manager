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
const MAX_UPLOAD_ENTRIES = 1e3;
const MAX_UPLOAD_PATH_LENGTH = 512;
const TRANSIENT_RENAME_CODES = /* @__PURE__ */ new Set(["EACCES", "EBUSY", "EPERM"]);
function codedError(message, code, params) {
  const error = new Error(message);
  error.code = code;
  error.params = params;
  return error;
}
function attachCode(item, error) {
  if (error && typeof error.code === "string" && /^error\./.test(error.code)) item.code = error.code;
  if (error && error.params) item.params = error.params;
  return item;
}
function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}
function resolveAgentsHome() {
  return process.env.DSH_AGENTS_HOME || join(homedir(), ".agents");
}
function userRoots() {
  return [
    { key: "dsh", path: join(resolveDshHome(), "skills"), label: "DSH \u6280\u80FD", mutable: true, toggleable: true, native: true, rank: 400 },
    { key: "agents", path: join(resolveAgentsHome(), "skills"), label: "\u516C\u5171 Agent", mutable: false, toggleable: true, native: true, rank: 450 },
    { key: "ccswitch", path: join(homedir(), ".cc-switch", "skills"), label: "CC Switch", mutable: false, toggleable: true, native: false, rank: 510 },
    { key: "codex", path: join(process.env.DSH_CODEX_HOME || join(homedir(), ".codex"), "skills"), label: "Codex", mutable: false, toggleable: true, native: false, rank: 520 },
    { key: "claude", path: join(process.env.DSH_CLAUDE_HOME || join(homedir(), ".claude"), "skills"), label: "Claude", mutable: false, toggleable: true, native: false, rank: 530 },
    { key: "gemini", path: join(process.env.DSH_GEMINI_HOME || join(homedir(), ".gemini"), "skills"), label: "Gemini", mutable: false, toggleable: true, native: false, rank: 540 },
    { key: "opencode", path: join(process.env.DSH_OPENCODE_HOME || join(homedir(), ".config", "opencode"), "skills"), label: "OpenCode", mutable: false, toggleable: true, native: false, rank: 550 }
  ];
}
function projectIdentity(path) {
  const canonical = pathIdentity(path);
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
  for (; ; ) {
    try {
      await fs.lstat(join(current, ".git"));
      return { root: current, cwd: start };
    } catch {
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
  return !await overlapsUserSkillRoot(definition.path);
}
async function projectRoots(projectCwds = [], diagnostics) {
  const projects = /* @__PURE__ */ new Map();
  for (const cwd of Array.isArray(projectCwds) ? projectCwds : []) {
    const found = await nearestProjectRoot(cwd);
    if (!found || !found.root) {
      if (found && found.unavailable && Array.isArray(diagnostics) && typeof cwd === "string" && isAbsolute(cwd)) {
        diagnostics.push({ code: "warning.project.unavailable", params: { path: cwd }, error: `\u65E0\u6CD5\u4ECE\u5BBF\u4E3B\u8BFB\u53D6\u6D3B\u52A8\u5DE5\u4F5C\u533A\uFF0C\u9879\u76EE\u6280\u80FD\u672A\u663E\u793A: ${cwd}` });
      }
      continue;
    }
    const identity = pathIdentity(found.root);
    const existing = projects.get(identity) || { root: found.root, cwds: /* @__PURE__ */ new Set() };
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
      workspaceCwds: [...project.cwds].sort()
    };
    const candidates = [
      { ...common, key: `project-dsh:${id}`, kind: "project-dsh", localeKey: "projectDsh", path: join(project.root, ".dsh", "skills"), label: "Project DSH", rank: 100, mutable: true, toggleable: true },
      { ...common, key: `project-agents:${id}`, kind: "project-agents", localeKey: "projectAgents", path: join(project.root, ".agents", "skills"), label: "Project Agent", rank: 200, toggleable: true }
    ];
    for (const candidate of candidates) {
      if (await projectSourceSafe(candidate)) roots.push(candidate);
    }
  }
  return roots;
}
function managerHomePath() {
  return join(resolveDshHome(), "skills-manager");
}
function managerStatePath() {
  return join(managerHomePath(), "state.json");
}
function trashRootPath() {
  return join(managerHomePath(), "trash");
}
function logPath() {
  return join(resolveDshHome(), "dsh-skills-manager.log");
}
async function browseDirectories(inputPath) {
  const requested = String(inputPath == null ? "" : inputPath).trim();
  const target = requested === "" ? homedir() : requested;
  if (!isAbsolute(target)) {
    return { ok: false, error: `\u76EE\u5F55\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84: ${target}`, code: "error.browse.absolute", params: { path: target } };
  }
  let canonical;
  let directory;
  try {
    canonical = await fs.realpath(target);
    directory = await fs.stat(canonical);
  } catch (error) {
    return { ok: false, error: `\u65E0\u6CD5\u8BFB\u53D6\u76EE\u5F55: ${target}`, code: "error.browse.unreadable", params: { path: target, error: String(error && error.message ? error.message : error) } };
  }
  if (!directory.isDirectory()) {
    return { ok: false, error: `\u4E0D\u662F\u76EE\u5F55: ${target}`, code: "error.browse.notDirectory", params: { path: target } };
  }
  const entries = [];
  let truncated = false;
  try {
    const items = await fs.readdir(canonical, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory() || item.isSymbolicLink()) continue;
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
    return { ok: false, error: `\u65E0\u6CD5\u8BFB\u53D6\u76EE\u5F55: ${canonical}`, code: "error.browse.unreadable", params: { path: canonical, error: String(error && error.message ? error.message : error) } };
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base", numeric: true }));
  const crumbs = [];
  let cursor = canonical;
  for (; ; ) {
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
function readonlyError(action) {
  return {
    ok: false,
    code: "error.root.readonly",
    params: { action },
    error: action === "delete" ? "\u8BE5\u6280\u80FD\u6765\u6E90\u4E0D\u5141\u8BB8\u5220\u9664" : "\u8BE5\u6280\u80FD\u6765\u6E90\u4E0D\u5141\u8BB8\u542F\u7528\u6216\u505C\u7528"
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
function writableRootDefinition(root) {
  const definition = rootDefinition(root);
  if (!definition || definition.mutable !== true) return null;
  if (definition.key === "dsh") return resolve(definition.path) === resolve(dshRootPath()) ? rootByKey("dsh") : null;
  if (definition.scope !== "project" || definition.kind !== "project-dsh" || typeof definition.projectRoot !== "string" || !isAbsolute(definition.projectRoot) || definition.key !== `project-dsh:${projectIdentity(definition.projectRoot)}` || resolve(definition.path) !== resolve(join(definition.projectRoot, ".dsh", "skills"))) return null;
  return definition;
}
async function checkedWritableRootDefinition(root) {
  const definition = writableRootDefinition(root);
  if (!definition || definition.scope !== "project") return definition;
  if (await overlapsUserSkillRoot(definition.path)) {
    return { ok: false, error: `\u9879\u76EE\u6280\u80FD\u76EE\u5F55\u4E0E\u7528\u6237\u6280\u80FD\u76EE\u5F55\u91CD\u53E0\uFF0C\u62D2\u7EDD\u5199\u5165: ${definition.path}`, code: "error.root.unsafe", params: { path: definition.path } };
  }
  for (const path of [join(definition.projectRoot, ".dsh"), definition.path]) {
    const st = await lstatOrNull(path);
    if (st && (!st.isDirectory() || st.isSymbolicLink())) {
      return { ok: false, error: `\u9879\u76EE\u6280\u80FD\u76EE\u5F55\u4E0D\u5B89\u5168\uFF0C\u62D2\u7EDD\u5199\u5165: ${path}`, code: "error.root.unsafe", params: { path } };
    }
  }
  return definition;
}
function isSameOrDescendant(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
async function resolvedPath(path) {
  try {
    return await fs.realpath(path);
  } catch {
    return resolve(path);
  }
}
async function comparisonPath(path) {
  let current = resolve(path);
  const missing = [];
  for (; ; ) {
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
async function pathsOverlap(a, b) {
  const left = await resolvedPath(a);
  const right = await resolvedPath(b);
  return isSameOrDescendant(left, right) || isSameOrDescendant(right, left);
}
async function isInsideResolvedRoot(rootReal, path) {
  return isSameOrDescendant(rootReal, await resolvedPath(path));
}
function pathIdentity(path) {
  const canonical = resolve(path);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}
async function lstatOrNull(path) {
  try {
    return await fs.lstat(path);
  } catch {
    return null;
  }
}
async function resolvedReadonlyUserRoots() {
  const roots = userRoots().filter((root) => !root.mutable && root.scope !== "project");
  const resolvedRoots = await Promise.all(roots.map(async (root) => {
    const stat = await lstatOrNull(root.path);
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) return null;
    try {
      return { root, realPath: await fs.realpath(root.path) };
    } catch {
      return null;
    }
  }));
  return resolvedRoots.filter(Boolean);
}
async function resolveTrustedLinkedBundle(root, bundlePath, trustedReadonlyRoots = resolvedReadonlyUserRoots()) {
  const sourceRoot = rootDefinition(root);
  if (!sourceRoot || sourceRoot.mutable || sourceRoot.scope === "project") return null;
  let realEntryPath;
  try {
    realEntryPath = await fs.realpath(bundlePath);
  } catch {
    return null;
  }
  const realEntryStat = await lstatOrNull(realEntryPath);
  if (!realEntryStat || !realEntryStat.isDirectory() || realEntryStat.isSymbolicLink()) return null;
  const resolvedRoots = await trustedReadonlyRoots;
  const resolvedSourceRoot = resolvedRoots.find((candidate) => pathIdentity(candidate.root.path) === pathIdentity(sourceRoot.path));
  if (!resolvedSourceRoot) return null;
  let trusted = false;
  for (const targetRoot of resolvedRoots) {
    if (pathIdentity(targetRoot.realPath) === pathIdentity(resolvedSourceRoot.realPath)) continue;
    const acceptedTarget = entryPath(targetRoot.realPath, basename(realEntryPath));
    if (acceptedTarget && pathIdentity(acceptedTarget) === pathIdentity(realEntryPath)) {
      trusted = true;
      break;
    }
  }
  if (!trusted) return null;
  const realDocPath = join(realEntryPath, "SKILL.md");
  const docStat = await lstatOrNull(realDocPath);
  if (!docStat || !docStat.isFile() || docStat.isSymbolicLink()) return null;
  return { realEntryPath, realDocPath };
}
function entryPath(root, name) {
  if (typeof name !== "string" || name === "" || name === "." || name === ".." || name.startsWith(".") || name.length > MAX_ENTRY_NAME_LENGTH || /[\\/:*?"<>|\0]/.test(name) || /[. ]$/.test(name) || WINDOWS_DEVICE_NAME_RE.test(name) || basename(name) !== name) return null;
  const rootPath = resolve(root);
  const path = resolve(rootPath, name);
  return isSameOrDescendant(rootPath, path) && rootPath !== path ? path : null;
}
function isDshRoot(root) {
  return typeof root === "string" && resolve(root) === resolve(dshRootPath());
}
function toKebab(s) {
  let t = String(s).trim();
  if (t === "") return "";
  t = t.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
  t = t.toLowerCase();
  t = t.replace(/[\s_.]+/g, "-");
  t = t.replace(/[^a-z0-9-]/g, "-");
  t = t.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return t;
}
function stripBom(text) {
  return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
function parseSkillDoc(text) {
  const src = stripBom(String(text));
  const lines = src.split(/\r?\n/);
  const map = /* @__PURE__ */ Object.create(null);
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
function decodeYamlScalar(v) {
  const s = String(v == null ? "" : v).trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    try {
      const value = JSON.parse(s);
      if (typeof value === "string") return value;
    } catch {
    }
  }
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return s;
}
function unquote(v) {
  const s = String(v == null ? "" : v).trim();
  if (s.length >= 2 && (s[0] === '"' && s[s.length - 1] === '"' || s[0] === "'" && s[s.length - 1] === "'")) {
    return s.slice(1, -1);
  }
  return s;
}
async function renameWithRetry(source, destination, options = {}) {
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
      verbatimSymlinks: true
    });
    await renameWithRetry(source, quarantine, options);
  } catch (error) {
    await removeMovedPath(destination).catch(() => void 0);
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
    await fs.rm(temp, { force: true }).catch(() => void 0);
    throw error;
  }
}
function parseBoolValue(raw) {
  const v = unquote(raw).trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "on" || v === "1") return true;
  if (v === "false" || v === "no" || v === "off" || v === "0") return false;
  return void 0;
}
async function resolveEntry(root, name) {
  try {
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
        return { kind: "bundle", docPath: bundleDoc, entryPath: bundlePath, realDocPath: await fs.realpath(bundleDoc), realEntryPath: await fs.realpath(bundlePath), linked: false };
      }
    }
    if (bundleStat && bundleStat.isSymbolicLink()) {
      const linked = await resolveTrustedLinkedBundle(rootPath, bundlePath);
      if (linked) return { kind: "bundle", docPath: join(bundlePath, "SKILL.md"), entryPath: bundlePath, ...linked, linked: true };
    }
    const flatDoc = resolve(rootPath, `${name}.md`);
    if (!isSameOrDescendant(rootPath, flatDoc) || rootPath === flatDoc) return null;
    const flatStat = await lstatOrNull(flatDoc);
    if (flatStat && flatStat.isFile() && !flatStat.isSymbolicLink() && await isInsideResolvedRoot(rootReal, flatDoc)) {
      const realDocPath = await fs.realpath(flatDoc);
      return { kind: "flat", docPath: flatDoc, entryPath: flatDoc, realDocPath, realEntryPath: realDocPath, linked: false };
    }
    return null;
  } catch {
    return null;
  }
}
function entryOf(name, kind, docPath, doc) {
  const declaredName = doc.map.name !== void 0 ? unquote(doc.map.name) : "";
  const description = doc.map.description !== void 0 ? unquote(doc.map.description) : "";
  const modelValue = parseBoolValue(doc.map["disable-model-invocation"]);
  const userValue = parseBoolValue(doc.map["user-invocable"]);
  const modelDisabled = modelValue === true;
  const userDisabled = userValue === false;
  const invocationPolicyValid = (doc.map["disable-model-invocation"] === void 0 || modelValue !== void 0) && (doc.map["user-invocable"] === void 0 || userValue !== void 0);
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
    diagnostics
  };
}
async function scanEntries(root, options = {}) {
  const rootStat = await lstatOrNull(resolve(root));
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) return { exists: false, entries: [] };
  let items;
  try {
    items = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return { exists: false, entries: [] };
  }
  const byName = /* @__PURE__ */ new Map();
  const rootReal = await resolvedPath(root);
  let trustedReadonlyRoots = options.trustedReadonlyRoots;
  for (const it of items) {
    try {
      if (it.isSymbolicLink()) {
        const bundlePath = entryPath(root, it.name);
        if (bundlePath === null) continue;
        trustedReadonlyRoots ||= resolvedReadonlyUserRoots();
        const linked = await resolveTrustedLinkedBundle(root, bundlePath, trustedReadonlyRoots);
        if (!linked) continue;
        const doc = parseSkillDoc(await fs.readFile(linked.realDocPath, "utf8"));
        byName.set(it.name, { ...entryOf(it.name, "bundle", join(bundlePath, "SKILL.md"), doc), entryPath: bundlePath, ...linked, linked: true });
        continue;
      }
      if (it.isDirectory() && entryPath(root, it.name) !== null) {
        const docPath = join(root, it.name, "SKILL.md");
        const st = await lstatOrNull(docPath);
        if (!st || !st.isFile() || st.isSymbolicLink() || !await isInsideResolvedRoot(rootReal, docPath)) continue;
        const doc = parseSkillDoc(await fs.readFile(docPath, "utf8"));
        byName.set(it.name, { ...entryOf(it.name, "bundle", docPath, doc), entryPath: join(root, it.name), realDocPath: await fs.realpath(docPath), realEntryPath: await fs.realpath(join(root, it.name)), linked: false });
      } else if (it.isFile() && it.name.toLowerCase().endsWith(".md") && it.name.toLowerCase() !== "skill.md" && entryPath(root, it.name.slice(0, -3)) !== null) {
        const skillName = it.name.slice(0, -3);
        if (byName.has(skillName)) continue;
        const docPath = join(root, it.name);
        if (!await isInsideResolvedRoot(rootReal, docPath)) continue;
        const doc = parseSkillDoc(await fs.readFile(docPath, "utf8"));
        const realDocPath = await fs.realpath(docPath);
        byName.set(skillName, { ...entryOf(skillName, "flat", docPath, doc), entryPath: docPath, realDocPath, realEntryPath: realDocPath, linked: false });
      }
    } catch {
    }
  }
  const entries = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { exists: true, entries };
}
async function scanDeduplicatedUserRoots(roots = userRoots()) {
  const trustedReadonlyRoots = resolvedReadonlyUserRoots();
  const results = await Promise.all(roots.map(async (root) => [root, await scanEntries(root.path, { trustedReadonlyRoots })]));
  const scans = /* @__PURE__ */ new Map();
  const groups = /* @__PURE__ */ new Map();
  for (const [root, scan] of results) {
    scans.set(root.key, scan);
    for (const entry of scan.entries) {
      const identity = pathIdentity(entry.realEntryPath || entry.entryPath || entry.docPath);
      const group = groups.get(identity) || [];
      group.push({ root, entry });
      groups.set(identity, group);
    }
  }
  const winners = /* @__PURE__ */ new Set();
  for (const group of groups.values()) {
    group.sort((left, right) => Number(left.entry.linked) - Number(right.entry.linked) || left.root.rank - right.root.rank);
    const winner = group[0];
    winner.entry.providerRank = Math.min(...group.map((item) => item.root.rank));
    winner.entry.policyRootKeys = group.map((item) => item.root.key);
    winners.add(winner.entry);
  }
  for (const scan of scans.values()) {
    scan.entries = scan.entries.filter((entry) => winners.has(entry));
  }
  return scans;
}
async function visibleEntryForRoot(root, name) {
  if (root.scope === "project") return resolveEntry(root.path, name);
  const entry = await resolveEntry(root.path, name);
  if (!entry) return null;
  const identity = pathIdentity(entry.realEntryPath || entry.entryPath || entry.docPath);
  const owners = (await resolvedReadonlyUserRoots()).filter((candidate) => {
    const expected = entryPath(candidate.realPath, basename(entry.realEntryPath || entry.entryPath || entry.docPath));
    return expected !== null && pathIdentity(expected) === identity;
  }).sort((left, right) => left.root.rank - right.root.rank);
  return owners.length === 0 || owners[0].root.key === root.key ? entry : null;
}
function defaultManagerState() {
  const sources = /* @__PURE__ */ Object.create(null);
  const disabledSkills = /* @__PURE__ */ Object.create(null);
  const enabledSkills = /* @__PURE__ */ Object.create(null);
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
function failClosedManagerState() {
  const state2 = defaultManagerState();
  for (const key of Object.keys(state2.sources)) state2.sources[key] = false;
  return state2;
}
function validPolicyLists(value, allowMissing = false) {
  if (value === void 0 && allowMissing) return true;
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
  for (const key of /* @__PURE__ */ new Set([...Object.keys(value.disabledSkills), ...Object.keys(enabledSkills)])) {
    const disabled = new Set(value.disabledSkills[key] || []);
    if ((enabledSkills[key] || []).some((name) => disabled.has(name))) return false;
  }
  return true;
}
function migrateManagerStateDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) return value;
  if (value.sources && typeof value.sources === "object" && !Array.isArray(value.sources) && value.sources.ccswitch === void 0) value.sources.ccswitch = true;
  if (value.disabledSkills && typeof value.disabledSkills === "object" && !Array.isArray(value.disabledSkills) && value.disabledSkills.ccswitch === void 0) value.disabledSkills.ccswitch = [];
  if (value.enabledSkills && typeof value.enabledSkills === "object" && !Array.isArray(value.enabledSkills) && value.enabledSkills.ccswitch === void 0) value.enabledSkills.ccswitch = [];
  return value;
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
async function readManagerState() {
  try {
    const raw = await fs.readFile(managerStatePath(), "utf8");
    const parsed = migrateManagerStateDocument(JSON.parse(raw));
    if (!validManagerStateDocument(parsed)) throw codedError("invalid manager state schema", "error.state.invalid");
    return { state: normalizeManagerState(parsed), warning: null, writable: true };
  } catch (error) {
    if (error && error.code === "ENOENT") return { state: defaultManagerState(), warning: null, writable: true };
    return {
      state: failClosedManagerState(),
      writable: false,
      warning: { code: "warning.state.invalid", params: { path: managerStatePath() }, error: `\u6280\u80FD\u7BA1\u7406\u5668\u72B6\u6001\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF0C\u6240\u6709\u6280\u80FD\u5DF2\u5B89\u5168\u505C\u7528\u4E14\u72B6\u6001\u5199\u5165\u5DF2\u9501\u5B9A: ${managerStatePath()}` }
    };
  }
}
async function writeManagerState(value) {
  await fs.mkdir(managerHomePath(), { recursive: true });
  await writeFileAtomically(managerStatePath(), `${JSON.stringify(normalizeManagerState(value), null, 2)}
`);
}
function managerSkillOverride(policy, rootKey, name, policyRootKeys = []) {
  if ((policy.enabledSkills[rootKey] || []).includes(name)) return true;
  if ((policy.disabledSkills[rootKey] || []).includes(name)) return false;
  let inheritedEnable = false;
  for (const key of policyRootKeys) {
    if (key === rootKey) continue;
    if ((policy.disabledSkills[key] || []).includes(name)) return false;
    if ((policy.enabledSkills[key] || []).includes(name)) inheritedEnable = true;
  }
  if (inheritedEnable) return true;
  return void 0;
}
function effectiveSkillPolicy(policyResult, root, entry) {
  const override = managerSkillOverride(policyResult.state, root.key, entry.name, entry.policyRootKeys);
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
    error: `\u6280\u80FD\u7BA1\u7406\u5668\u72B6\u6001\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF0C\u5DF2\u62D2\u7EDD\u8986\u76D6: ${managerStatePath()}`
  };
}
async function setSourceEnabled(key, enabled, log) {
  const root = rootByKey(key);
  if (!root || root.key === "dsh" || !root.toggleable) return readonlyError("toggle");
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  current.state.sources[root.key] = enabled === true;
  await writeManagerState(current.state);
  if (log) log(enabled ? "source-enable" : "source-disable", `${enabled ? "\u542F\u7528" : "\u505C\u7528"}\u6765\u6E90 ${root.key}: ${root.path}`);
  return { root: root.key, enabled: enabled === true };
}
async function checkedPolicyRootDefinition(root) {
  const definition = rootDefinition(root);
  if (!definition || !definition.toggleable) return null;
  if (definition.scope !== "project") {
    const canonical = rootByKey(definition.key);
    return canonical && resolve(canonical.path) === resolve(definition.path) ? canonical : null;
  }
  const validProjectRoot = (definition.kind === "project-dsh" || definition.kind === "project-agents") && PROJECT_ROOT_KEY_RE.test(definition.key) && typeof definition.projectRoot === "string" && isAbsolute(definition.projectRoot) && definition.key === `${definition.kind}:${projectIdentity(definition.projectRoot)}` && resolve(definition.path) === resolve(join(definition.projectRoot, definition.kind === "project-dsh" ? ".dsh" : ".agents", "skills"));
  if (!validProjectRoot) return null;
  if (!await projectSourceSafe(definition)) {
    return { ok: false, error: `\u9879\u76EE\u6280\u80FD\u76EE\u5F55\u4E0D\u5B89\u5168\uFF0C\u62D2\u7EDD\u5199\u5165\u72B6\u6001: ${definition.path}`, code: "error.root.unsafe", params: { path: definition.path } };
  }
  return definition;
}
async function setPolicySkillEnabled(root, name, enabled, log) {
  const definition = await checkedPolicyRootDefinition(root);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("toggle");
  const resolved = await resolveEntry(definition.path, name);
  if (resolved === null) return { ok: false, error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`, code: "error.skill.notFound", params: { name } };
  let summary;
  try {
    summary = entryOf(name, resolved.kind, resolved.docPath, parseSkillDoc(await fs.readFile(resolved.realDocPath || resolved.docPath, "utf8")));
  } catch {
    return { ok: false, error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`, code: "error.skill.notFound", params: { name } };
  }
  if (!summary.hasFrontmatter) {
    return { ok: false, error: `\u6280\u80FD\u7F3A\u5C11\u5B8C\u6574 frontmatter\uFF0C\u65E0\u6CD5${enabled ? "\u542F\u7528" : "\u505C\u7528"}: ${name}`, code: "error.skill.noFrontmatter", params: { name, action: enabled ? "enable" : "disable" } };
  }
  if (!summary.loadable) {
    return { ok: false, error: `\u6280\u80FD\u7ED3\u6784\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5${enabled ? "\u542F\u7528" : "\u505C\u7528"}: ${name}`, code: "error.skill.notLoadable", params: { name, action: enabled ? "enable" : "disable" } };
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
  if (log) log(enabled ? "policy-enable" : "policy-disable", `${enabled ? "\u542F\u7528" : "\u505C\u7528"} ${definition.key}/${name}\uFF08\u672C\u5730\u7B56\u7565\uFF0C\u6E90\u6587\u4EF6\u4E0D\u53D8\uFF09`);
  return { root: definition.key, name, enabled: enabled === true };
}
async function setSkillEnabled(root, name, enabled, log) {
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
        force: false
      });
    }
    await fs.writeFile(join(finalPath, "metadata.json"), `${JSON.stringify(metadata, null, 2)}
`, "utf8");
  } catch (error) {
    await fs.rm(finalPath, { recursive: true, force: true }).catch(() => void 0);
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
    label: definition.label
  };
}
async function restoreRootDefinition(metadata, options = {}) {
  if (!metadata.root) return rootByKey("dsh");
  if (metadata.root.scope === "user" && metadata.root.key === "dsh") return rootByKey("dsh");
  if (metadata.root.scope !== "project" || metadata.root.kind !== "project-dsh" || typeof metadata.root.key !== "string" || typeof metadata.root.projectRoot !== "string" || !isAbsolute(metadata.root.projectRoot)) return { ok: false, error: `\u56DE\u6536\u7AD9\u6761\u76EE\u6765\u6E90\u975E\u6CD5: ${metadata.id}`, code: "error.trash.invalid", params: { id: metadata.id } };
  const roots = await projectRoots(options.projectCwds);
  const normalizedProjectRoot = pathIdentity(metadata.root.projectRoot);
  const root = roots.find((item) => item.key === metadata.root.key && item.kind === "project-dsh" && pathIdentity(item.projectRoot) === normalizedProjectRoot);
  if (!root) {
    return {
      ok: false,
      error: `\u539F\u9879\u76EE\u5F53\u524D\u4E0D\u5728\u6D3B\u52A8\u5DE5\u4F5C\u533A\u4E2D\uFF0C\u65E0\u6CD5\u6062\u590D: ${metadata.root.projectRoot}`,
      code: "error.trash.projectUnavailable",
      params: { path: metadata.root.projectRoot }
    };
  }
  return checkedWritableRootDefinition(root);
}
async function deleteSkill(root, name, log, options = {}) {
  const definition = await checkedWritableRootDefinition(root);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("delete");
  const resolved = await resolveEntry(definition.path, name);
  if (resolved === null) return { ok: false, error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`, code: "error.skill.notFound", params: { name } };
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
      if (transferred.cleanupError && log) log("trash-source-warning", `\u6280\u80FD\u5DF2\u8DE8\u76D8\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C\u4F46\u6E90\u76D8\u9690\u85CF\u526F\u672C\u7B49\u5F85\u540E\u7EED\u6E05\u7406: ${transferred.quarantine}\uFF08${transferred.cleanupError.message || transferred.cleanupError}\uFF09`);
      moved.push({ ...target, destination });
    }
    const metadata = { version: 2, id, name, deletedAt: (/* @__PURE__ */ new Date()).toISOString(), entries: moved.map((item) => item.fileName), root: trashRootMetadata(definition) };
    await fs.writeFile(join(stage, "metadata.json"), `${JSON.stringify(metadata, null, 2)}
`, "utf8");
    const published = await publishTrashStage(stage, finalPath, metadata, options.renameOptions);
    if (published.cleanupError && log) log("trash-stage-warning", `\u56DE\u6536\u7AD9\u5DF2\u53D1\u5E03\uFF0C\u4F46\u4E34\u65F6\u76EE\u5F55\u7B49\u5F85\u540E\u7EED\u6E05\u7406: ${stage}\uFF08${published.cleanupError.message || published.cleanupError}\uFF09`);
    if (log) log("trash", `\u79FB\u5230\u56DE\u6536\u7AD9 ${name} -> ${finalPath}`);
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
        `${causeText}\uFF1B\u79FB\u5165\u56DE\u6536\u7AD9\u56DE\u6EDA\u5931\u8D25\uFF0C\u672A\u6062\u590D\u5185\u5BB9\u4FDD\u7559\u5728: ${stage}`,
        "error.trash.rollbackFailed",
        { path: stage, error: causeText }
      );
    }
    await fs.rm(stage, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
}
async function listTrash() {
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
async function restoreTrash(id, log, options = {}) {
  const metadata = await readTrashMetadata(id);
  if (!metadata) return { ok: false, error: `\u56DE\u6536\u7AD9\u6761\u76EE\u4E0D\u5B58\u5728: ${id}`, code: "error.trash.notFound", params: { id } };
  const definition = await restoreRootDefinition(metadata, options);
  if (!definition || definition.ok === false) return definition || readonlyError("restore");
  const root = definition.path;
  const conflicts = await safeExistingEntryPaths(root, metadata.name);
  if (conflicts.length) return { ok: false, error: `\u65E0\u6CD5\u6062\u590D\uFF0C\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728: ${metadata.name}`, code: "error.trash.conflict", params: { name: metadata.name } };
  await fs.mkdir(root, { recursive: true });
  const itemRoot = join(trashRootPath(), id);
  const moved = [];
  try {
    for (const fileName of metadata.entries) {
      const source = join(itemRoot, fileName);
      const destination = join(root, fileName);
      if (!isSameOrDescendant(itemRoot, source) || !isSameOrDescendant(root, destination)) throw codedError("\u56DE\u6536\u7AD9\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5", "error.trash.invalid", { id });
      await movePathWithFallback(source, destination, options.renameOptions);
      moved.push({ source, destination });
    }
    await fs.rm(itemRoot, { recursive: true, force: true });
    if (log) log("restore", `\u4ECE\u56DE\u6536\u7AD9\u6062\u590D ${metadata.name} -> ${root}`);
    return { id, name: metadata.name, root: trashRootMetadata(definition) };
  } catch (error) {
    for (const item of moved.reverse()) await movePathWithFallback(item.destination, item.source, options.renameOptions).catch(() => void 0);
    throw error;
  }
}
async function permanentlyDeleteTrash(id, log) {
  const metadata = await readTrashMetadata(id);
  if (!metadata) return { ok: false, error: `\u56DE\u6536\u7AD9\u6761\u76EE\u4E0D\u5B58\u5728: ${id}`, code: "error.trash.notFound", params: { id } };
  await fs.rm(join(trashRootPath(), id), { recursive: true, force: true });
  if (log) log("trash-delete", `\u6C38\u4E45\u5220\u9664\u56DE\u6536\u7AD9\u6761\u76EE ${metadata.name} (${id})`);
  return { id, name: metadata.name };
}
async function analyzeSource(source) {
  let st;
  try {
    st = await fs.lstat(source);
  } catch {
    return { kind: "none", error: `\u8DEF\u5F84\u4E0D\u5B58\u5728: ${source}`, code: "error.source.notFound", params: { path: source } };
  }
  if (st.isSymbolicLink()) return { kind: "none", error: `\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${source}`, code: "error.source.symlink", params: { path: source } };
  if (st.isDirectory()) {
    const sk = join(source, "SKILL.md");
    const skSt = await lstatOrNull(sk);
    if (skSt && skSt.isSymbolicLink()) return { kind: "none", error: `\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${sk}`, code: "error.source.symlink", params: { path: sk } };
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
  return { kind: "none", error: `\u65E0\u6CD5\u8BC6\u522B\u7684 skill \u6765\u6E90: ${source}`, code: "error.source.unrecognized", params: { path: source } };
}
async function collectCandidates(dir) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const it of items) {
    if (it.isSymbolicLink()) throw codedError(`\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${join(dir, it.name)}`, "error.source.symlink", { path: join(dir, it.name) });
    if (it.isDirectory()) {
      const sk = join(dir, it.name, "SKILL.md");
      const st = await lstatOrNull(sk);
      if (st && st.isSymbolicLink()) throw codedError(`\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${sk}`, "error.source.symlink", { path: sk });
      if (st && st.isFile()) {
        out.push({ source: join(dir, it.name), kebab: toKebab(it.name), rawName: it.name, isDir: true });
      }
    } else if (it.isFile() && it.name.toLowerCase().endsWith(".md") && it.name.toLowerCase() !== "skill.md") {
      out.push({ source: join(dir, it.name), kebab: toKebab(it.name.slice(0, -3)), rawName: it.name.slice(0, -3), isDir: false });
    }
  }
  return out;
}
async function assertNoSymbolicLinks(source) {
  const pending = [{ path: source, depth: 0 }];
  while (pending.length) {
    const current = pending.pop();
    if (current.depth > MAX_SOURCE_DEPTH) throw codedError(`skill \u6765\u6E90\u76EE\u5F55\u5C42\u7EA7\u8D85\u8FC7 ${MAX_SOURCE_DEPTH} \u5C42: ${source}`, "error.source.tooDeep", { depth: MAX_SOURCE_DEPTH, path: source });
    const st = await fs.lstat(current.path);
    if (st.isSymbolicLink()) throw codedError(`\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${current.path}`, "error.source.symlink", { path: current.path });
    if (!st.isDirectory()) continue;
    const items = await fs.readdir(current.path, { withFileTypes: true });
    for (const item of items) {
      const path = join(current.path, item.name);
      if (item.isSymbolicLink()) throw codedError(`\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${path}`, "error.source.symlink", { path });
      if (item.isDirectory()) pending.push({ path, depth: current.depth + 1 });
    }
  }
}
function temporaryPath(target, kind) {
  return join(dirname(target), `.${basename(target)}.dssm-${kind}-${randomUUID()}`);
}
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
async function copyToTemporary(source, target, isDir) {
  const temp = temporaryPath(target, "stage");
  try {
    await assertNoSymbolicLinks(source);
    if (isDir) await fs.cp(source, temp, { recursive: true, dereference: false });
    else await fs.copyFile(source, temp);
    await assertNoSymbolicLinks(temp);
    return temp;
  } catch (error) {
    await fs.rm(temp, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
}
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
    await fs.rm(stage, { recursive: true, force: true }).catch(() => void 0);
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
        `${causeText}\uFF1B\u8986\u76D6\u5BFC\u5165\u56DE\u6EDA\u5931\u8D25\uFF0C\u5907\u4EFD\u4FDD\u7559\u5728: ${rollbackFailures.join("\u3001")}`,
        "error.import.rollbackFailed",
        { path: rollbackFailures.join("; "), error: causeText }
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
        error: `\u65E7\u7248\u672C\u5907\u4EFD\u672A\u6E05\u7406: ${item.backup}\uFF08${String(error && error.message ? error.message : error)}\uFF09`
      });
    }
  }
  return warnings;
}
async function importSkill(source, log, options = {}) {
  const targetRoot = dshRootPath();
  const conflict = options.conflict === "overwrite" ? "overwrite" : "skip";
  const dryRun = options.dryRun === true;
  const analysis = await analyzeSource(source);
  if (analysis.kind === "none") return { ok: false, error: analysis.error || "\u65E0\u6CD5\u8BC6\u522B\u7684 skill \u6765\u6E90", code: analysis.code || "error.source.unrecognized", params: analysis.params };
  if (await pathsOverlap(analysis.source, targetRoot)) return { ok: false, error: "\u5BFC\u5165\u6765\u6E90\u4E0D\u80FD\u4E0E DSH \u6280\u80FD\u76EE\u5F55\u76F8\u540C\u3001\u5305\u542B\u6216\u4F4D\u4E8E\u5176\u4E2D", code: "error.import.overlap" };
  let candidates = [];
  if (analysis.kind === "single") {
    candidates = [{ source: analysis.source, kebab: analysis.kebab, rawName: analysis.rawName, isDir: analysis.isDir }];
  } else {
    try {
      candidates = await collectCandidates(source);
    } catch (error) {
      return attachCode({ ok: false, error: String(error && error.message ? error.message : error) }, error);
    }
    if (candidates.length === 0) return { ok: false, error: `\u76EE\u5F55\u4E0B\u672A\u627E\u5230\u4EFB\u4F55 skill \u6761\u76EE\uFF08\u9700\u542B SKILL.md \u7684\u5B50\u76EE\u5F55\u6216 .md \u6587\u4EF6\uFF09: ${source}`, code: "error.import.emptySource", params: { path: source } };
  }
  const pending = [];
  const conflicts = [];
  const failed = [];
  const imported = [];
  const skipped = [];
  const nameCount = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    if (candidate.kebab && KEBAB_RE.test(candidate.kebab) && entryPath(targetRoot, candidate.kebab) !== null) nameCount.set(candidate.kebab, (nameCount.get(candidate.kebab) || 0) + 1);
  }
  function failureResult() {
    return {
      ok: false,
      // 聚合失败明细的原文；前端优先展示已翻译的 failed 明细，此处仅作兜底。
      error: failed.map((item) => item.error).join("\uFF1B"),
      code: "error.import.failed",
      kind: analysis.kind,
      imported,
      skipped,
      failed
    };
  }
  for (const c of candidates) {
    if (!c.kebab || !KEBAB_RE.test(c.kebab) || entryPath(targetRoot, c.kebab) === null) {
      failed.push({ source: c.source, error: `\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 kebab-case \u540D\u79F0\uFF08\u539F\u59CB\u540D: ${c.rawName || basename(c.source)}\uFF09`, code: "error.import.invalidName", params: { name: c.rawName || basename(c.source) } });
      continue;
    }
    if (nameCount.get(c.kebab) > 1) {
      failed.push({ source: c.source, error: `\u6279\u91CF\u6765\u6E90\u4E2D\u5B58\u5728\u591A\u4E2A\u540C\u540D\u63D2\u4EF6: ${c.kebab}`, code: "error.import.duplicateName", params: { name: c.kebab } });
      continue;
    }
    const dest = c.isDir ? join(targetRoot, c.kebab) : join(targetRoot, `${c.kebab}.md`);
    const paths = [join(targetRoot, c.kebab), join(targetRoot, `${c.kebab}.md`)];
    const existing = [];
    for (const path of paths) {
      try {
        await fs.stat(path);
        existing.push(path);
      } catch {
      }
    }
    if (existing.length) {
      conflicts.push({ name: c.kebab, source: c.source, isDir: c.isDir, paths: existing });
      continue;
    }
    pending.push({ name: c.kebab, source: c.source, isDir: c.isDir, dest });
  }
  if (pending.length === 0 && conflicts.length === 0) return failureResult();
  if (dryRun) {
    await preflightCandidates(pending, conflicts, failed);
    if (pending.length === 0 && conflicts.length === 0) return failureResult();
    return { kind: analysis.kind, pending, conflicts, failed };
  }
  if (pending.length > 0 || conflict === "overwrite" && conflicts.length > 0) {
    await fs.mkdir(targetRoot, { recursive: true });
  }
  for (const p of pending) {
    try {
      const warnings = await replaceWithCopy(p.source, p.dest, p.isDir);
      imported.push({ name: p.name, overwritten: false, warnings });
      if (log) log("import", `\u5BFC\u5165 ${p.source} -> ${p.dest}`);
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
        if (log) log("import-overwrite", `\u8986\u76D6\u5BFC\u5165 ${c.source} -> ${dest}`);
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
function normalizeUploadPath(input) {
  const raw = String(input == null ? "" : input).replace(/\\/g, "/");
  if (!raw || raw.length > MAX_UPLOAD_PATH_LENGTH || raw.includes("\0") || raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || raw.startsWith("//")) {
    throw codedError(`\u4E0A\u4F20\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5: ${raw}`, "error.upload.path", { path: raw });
  }
  const directory = raw.endsWith("/");
  const parts = raw.split("/").filter((part, index, all) => directory && index === all.length - 1 ? false : true);
  if (!parts.length || parts.length > MAX_SOURCE_DEPTH || parts.some((part) => !part || part === "." || part === ".." || part.length > MAX_ENTRY_NAME_LENGTH || WINDOWS_DEVICE_NAME_RE.test(part))) {
    throw codedError(`\u4E0A\u4F20\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5: ${raw}`, "error.upload.path", { path: raw });
  }
  return { path: parts.join("/"), directory };
}
function decodeUploadBase64(value, maxBytes, code = "error.upload.tooLarge") {
  const raw = String(value == null ? "" : value);
  const padding = raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0;
  const dataLength = raw.length - padding;
  const firstPadding = raw.indexOf("=");
  if (raw.length % 4 !== 0 || firstPadding !== -1 && firstPadding !== dataLength) {
    throw codedError("\u4E0A\u4F20\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 Base64", "error.upload.encoding");
  }
  const decodedLength = raw.length / 4 * 3 - padding;
  if (decodedLength > maxBytes) throw codedError(`\u4E0A\u4F20\u5185\u5BB9\u8D85\u8FC7 ${maxBytes} \u5B57\u8282\u9650\u5236`, code, { limit: maxBytes });
  for (let index = 0; index < dataLength; index += 1) {
    const char = raw.charCodeAt(index);
    if (!(char >= 65 && char <= 90 || char >= 97 && char <= 122 || char >= 48 && char <= 57 || char === 43 || char === 47)) {
      throw codedError("\u4E0A\u4F20\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 Base64", "error.upload.encoding");
    }
  }
  const bytes = Buffer.from(raw, "base64");
  return bytes;
}
function uploadError(error) {
  return attachCode({ ok: false, error: String(error && error.message ? error.message : error) }, error);
}
async function writeUploadedEntries(contentRoot, entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw codedError("\u4E0A\u4F20\u5185\u5BB9\u4E3A\u7A7A", "error.upload.empty");
  if (entries.length > MAX_UPLOAD_ENTRIES) throw codedError(`\u4E0A\u4F20\u6761\u76EE\u8D85\u8FC7 ${MAX_UPLOAD_ENTRIES} \u4E2A`, "error.upload.tooMany", { limit: MAX_UPLOAD_ENTRIES });
  let total = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    const normalized = normalizeUploadPath(entry && entry.path);
    const key = normalized.path.toLowerCase();
    if (seen.has(key)) throw codedError(`\u4E0A\u4F20\u5185\u5BB9\u5305\u542B\u91CD\u590D\u8DEF\u5F84: ${normalized.path}`, "error.upload.duplicate", { path: normalized.path });
    seen.add(key);
    if (normalized.directory) continue;
    const bytes = decodeUploadBase64(entry && entry.data, MAX_UPLOAD_ENTRY_BYTES);
    total += bytes.length;
    if (total > MAX_UPLOAD_TOTAL_BYTES) throw codedError(`\u4E0A\u4F20\u5185\u5BB9\u603B\u5927\u5C0F\u8D85\u8FC7 ${MAX_UPLOAD_TOTAL_BYTES} \u5B57\u8282`, "error.upload.tooLarge", { limit: MAX_UPLOAD_TOTAL_BYTES });
    const target = join(contentRoot, ...normalized.path.split("/"));
    if (!isSameOrDescendant(contentRoot, target)) throw codedError(`\u4E0A\u4F20\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5: ${normalized.path}`, "error.upload.path", { path: normalized.path });
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
        if (count > MAX_UPLOAD_ENTRIES) throw codedError(`ZIP \u6761\u76EE\u8D85\u8FC7 ${MAX_UPLOAD_ENTRIES} \u4E2A`, "error.upload.tooMany", { limit: MAX_UPLOAD_ENTRIES });
        if (!normalized.directory && info.originalSize > MAX_UPLOAD_ENTRY_BYTES) throw codedError(`ZIP \u6761\u76EE\u8FC7\u5927: ${normalized.path}`, "error.upload.tooLarge", { limit: MAX_UPLOAD_ENTRY_BYTES });
        total += normalized.directory ? 0 : info.originalSize;
        if (total > MAX_UPLOAD_TOTAL_BYTES) throw codedError(`ZIP \u89E3\u538B\u540E\u603B\u5927\u5C0F\u8D85\u8FC7 ${MAX_UPLOAD_TOTAL_BYTES} \u5B57\u8282`, "error.upload.tooLarge", { limit: MAX_UPLOAD_TOTAL_BYTES });
        return !normalized.directory;
      }
    });
  } catch (error) {
    if (error && /^error\./.test(String(error.code || ""))) throw error;
    throw codedError(`ZIP \u65E0\u6CD5\u89E3\u538B: ${String(error && error.message ? error.message : error)}`, "error.upload.zipInvalid");
  }
  const entries = Object.entries(files).map(([path, bytes]) => ({ path, data: Buffer.from(bytes).toString("base64") }));
  await writeUploadedEntries(contentRoot, entries);
}
async function prepareUploadedSource(sessionRoot, input) {
  const contentRoot = join(sessionRoot, "content");
  await fs.mkdir(contentRoot, { recursive: true });
  if (input && input.zip !== void 0) await writeUploadedZip(contentRoot, input.zip);
  else await writeUploadedEntries(contentRoot, input && input.entries);
  const rootSkill = join(contentRoot, "SKILL.md");
  const rootSkillStat = await lstatOrNull(rootSkill);
  if (!rootSkillStat || !rootSkillStat.isFile()) return contentRoot;
  const doc = parseSkillDoc(await fs.readFile(rootSkill, "utf8"));
  const fallback = String(input && input.name || "uploaded-skill").replace(/\.zip$/i, "").replace(/^skill\.md$/i, "uploaded-skill");
  const skillName = toKebab(doc.map.name || fallback);
  if (!skillName || !KEBAB_RE.test(skillName) || entryPath(contentRoot, skillName) === null) {
    throw codedError(`\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 kebab-case \u540D\u79F0\uFF08\u539F\u59CB\u540D: ${doc.map.name || fallback}\uFF09`, "error.import.invalidName", { name: doc.map.name || fallback });
  }
  const batchRoot = join(sessionRoot, "batch");
  const wrappedRoot = join(batchRoot, skillName);
  await fs.mkdir(batchRoot, { recursive: true });
  await fs.rename(contentRoot, wrappedRoot);
  return batchRoot;
}
async function importUploadedSkill(input, log, options = {}) {
  const uploadHome = join(managerHomePath(), "uploads");
  const sessionRoot = join(uploadHome, `.upload-${randomUUID()}`);
  try {
    await fs.mkdir(sessionRoot, { recursive: true });
    const source = await prepareUploadedSource(sessionRoot, input || {});
    return await importSkill(source, log, options);
  } catch (error) {
    return uploadError(error);
  } finally {
    await fs.rm(sessionRoot, { recursive: true, force: true }).catch(() => void 0);
  }
}
function yamlString(value) {
  return JSON.stringify(String(value));
}
async function createSkill(input, log, options = {}) {
  const requestedRoot = Object.prototype.hasOwnProperty.call(options, "root") ? options.root : rootByKey("dsh");
  const definition = await checkedWritableRootDefinition(requestedRoot);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("create");
  const root = definition.path;
  const requestedName = String(input && input.name || "").trim();
  const name = toKebab(requestedName);
  const description = String(input && input.description || "").trim();
  const body = String(input && input.body || "").trim();
  if (!name || !KEBAB_RE.test(name) || entryPath(root, name) === null) return { ok: false, error: `\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 kebab-case \u540D\u79F0\uFF08\u539F\u59CB\u540D: ${requestedName}\uFF09`, code: "error.import.invalidName", params: { name: requestedName } };
  if (!description) return { ok: false, error: "\u6280\u80FD\u7B80\u4ECB\u4E0D\u80FD\u4E3A\u7A7A", code: "error.create.descriptionRequired" };
  if (!body) return { ok: false, error: "\u6280\u80FD\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A", code: "error.create.bodyRequired" };
  if (description.length > 500 || body.length > 1 << 18) return { ok: false, error: "\u6280\u80FD\u5185\u5BB9\u8FC7\u957F", code: "error.create.tooLarge" };
  if (await safeExistingEntryPaths(root, name).then((items) => items.length > 0)) return { ok: false, error: `\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728: ${name}`, code: "error.create.conflict", params: { name } };
  await fs.mkdir(root, { recursive: true });
  const target = entryPath(root, name);
  const stage = temporaryPath(target, "create");
  try {
    await fs.mkdir(stage);
    const content = `---
name: ${name}
description: ${yamlString(description)}
---

${body}
`;
    await fs.writeFile(join(stage, "SKILL.md"), content, "utf8");
    await fs.rename(stage, target);
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
  if (log) log("create", `\u521B\u5EFA ${join(target, "SKILL.md")}`);
  return { name, path: join(target, "SKILL.md"), root: definition.key };
}
async function skillDetail(key, name, options = {}) {
  const scopedRoots = await projectRoots(options.projectCwds);
  const root = rootByKey(key) || scopedRoots.find((item) => item.key === key);
  if (!root) return { ok: false, error: `\u672A\u77E5\u6280\u80FD\u6765\u6E90: ${key}`, code: "error.root.unknown", params: { root: key } };
  const entry = await visibleEntryForRoot(root, name);
  if (!entry) return { ok: false, error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`, code: "error.skill.notFound", params: { name } };
  let raw;
  try {
    raw = await fs.readFile(entry.realDocPath || entry.docPath, "utf8");
  } catch {
    return { ok: false, error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`, code: "error.skill.notFound", params: { name } };
  }
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
    sourceReadOnly: !root.mutable
  };
}
async function listProviderCandidates(options = {}) {
  const policyResult = await readManagerState();
  const candidates = [];
  const user = userRoots();
  const userScans = await scanDeduplicatedUserRoots(user);
  for (const root of user) {
    const scanned = userScans.get(root.key);
    for (const entry of scanned.entries) {
      if (!entry.loadable) continue;
      const policy = effectiveSkillPolicy(policyResult, root, entry);
      const needsOverlay = root.key !== "dsh" || policy.override !== void 0 || !entry.invocationPolicyValid || policyResult.writable === false;
      if (!needsOverlay) continue;
      candidates.push({
        name: entry.declaredName,
        description: entry.description,
        invocation: { modelInvocable: policy.modelInvocable, userInvocable: policy.userInvocable },
        provider: "dsh-skills-manager-external",
        source: root.key === "dsh" ? "user-dsh" : `agent-${root.key}`,
        rank: root.key === "dsh" ? USER_DSH_POLICY_RANK : entry.providerRank ?? root.rank,
        locator: { rootKey: root.key, entryName: entry.name, path: entry.docPath, realEntryPath: entry.realEntryPath, realDocPath: entry.realDocPath },
        resourceBase: { kind: "directory", path: entry.kind === "bundle" ? entry.realEntryPath : root.path },
        path: entry.docPath,
        metadata: { dshSkillsManager: { root: root.key, readOnly: !root.mutable, sourceReadOnly: !root.mutable, policyOnly: root.key === "dsh" } }
      });
    }
  }
  const cwd = options && typeof options.cwd === "string" ? options.cwd : void 0;
  if (cwd) {
    const roots = await projectRoots([cwd]);
    for (const root of roots) {
      const scanned = await scanEntries(root.path);
      for (const entry of scanned.entries) {
        if (!entry.loadable) continue;
        const policy = effectiveSkillPolicy(policyResult, root, entry);
        const needsOverlay = policy.override !== void 0 || !entry.invocationPolicyValid || policyResult.writable === false;
        if (!needsOverlay) continue;
        candidates.push({
          name: entry.declaredName,
          description: entry.description,
          invocation: { modelInvocable: policy.modelInvocable, userInvocable: policy.userInvocable },
          provider: "dsh-skills-manager-external",
          source: root.kind,
          rank: root.rank - 1,
          locator: { rootKey: root.key, entryName: entry.name, path: entry.docPath, realEntryPath: entry.realEntryPath, realDocPath: entry.realDocPath },
          resourceBase: { kind: "directory", path: entry.kind === "bundle" ? entry.realEntryPath : root.path },
          path: entry.docPath,
          metadata: { dshSkillsManager: { root: root.key, readOnly: !root.mutable, sourceReadOnly: !root.mutable, policyOnly: true } }
        });
      }
    }
  }
  return candidates;
}
async function getProviderSkill(candidate, options = {}) {
  const locator = candidate && candidate.locator;
  if (!locator || typeof locator.path !== "string" || typeof locator.rootKey !== "string" || typeof locator.realEntryPath !== "string" || typeof locator.realDocPath !== "string") return void 0;
  let root = rootByKey(locator.rootKey);
  if (!root && PROJECT_ROOT_KEY_RE.test(locator.rootKey) && typeof options.cwd === "string") {
    root = (await projectRoots([options.cwd])).find((item) => item.key === locator.rootKey);
  }
  if (!root) return void 0;
  try {
    const entry = await resolveEntry(root.path, String(locator.entryName || ""));
    if (!entry || resolve(entry.docPath) !== resolve(locator.path)) return void 0;
    if (pathIdentity(entry.realEntryPath) !== pathIdentity(locator.realEntryPath)) return void 0;
    if (pathIdentity(entry.realDocPath) !== pathIdentity(locator.realDocPath)) return void 0;
    const doc = parseSkillDoc(await fs.readFile(entry.realDocPath || entry.docPath, "utf8"));
    const summary = entryOf(locator.entryName, entry.kind, entry.docPath, doc);
    if (!summary.loadable || summary.declaredName !== candidate.name) return void 0;
    return {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      provider: candidate.provider,
      source: candidate.source,
      resourceBase: candidate.resourceBase,
      path: candidate.path,
      metadata: candidate.metadata,
      content: doc.body.trim()
    };
  } catch {
    return void 0;
  }
}
function canonicalSkillName(item) {
  return item.entry.declaredName || item.entry.name;
}
function markWinners(items, options = {}) {
  const winners = /* @__PURE__ */ new Map();
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
async function state(options = {}) {
  const user = userRoots();
  const userScans = await scanDeduplicatedUserRoots(user);
  const projectWarnings = [];
  const scoped = await projectRoots(options.projectCwds, projectWarnings);
  const policyResult = await readManagerState();
  const trash = await listTrash();
  const result = { roots: [], projects: [], trash, warnings: [...policyResult.warning ? [policyResult.warning] : [], ...projectWarnings] };
  const all = [];
  for (const root of [...scoped, ...user]) {
    const { exists, entries } = root.scope === "project" ? await scanEntries(root.path) : userScans.get(root.key);
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
        managerOverride: policy.override === void 0 ? null : policy.override,
        effectiveModelInvocable: policy.modelInvocable,
        effectiveUserInvocable: policy.userInvocable,
        diagnostics: e.diagnostics,
        path: e.docPath
      });
      all.push({ root, entry: e, managerEnabled, policy, view: skills[skills.length - 1] });
    }
    result.roots.push({
      key: root.key,
      ...root.kind ? { kind: root.kind } : {},
      ...root.localeKey ? { localeKey: root.localeKey } : {},
      path: root.path,
      label: root.label,
      mutable: root.mutable,
      toggleable: root.toggleable,
      native: root.native,
      rank: root.rank,
      scope: root.scope || "user",
      ...root.projectRoot ? { projectRoot: root.projectRoot, projectName: root.projectName, workspaceCwds: root.workspaceCwds } : {},
      exists,
      enabled: policyResult.writable !== false && (root.scope === "project" || root.key === "dsh" || policyResult.state.sources[root.key] !== false),
      skills
    });
  }
  const userItems = all.filter((item) => item.root.scope !== "project");
  markWinners(userItems);
  const projectGroups = /* @__PURE__ */ new Map();
  for (const item of all.filter((candidate) => candidate.root.scope === "project")) {
    const group = projectGroups.get(item.root.projectRoot) || [];
    group.push(item);
    projectGroups.set(item.root.projectRoot, group);
  }
  for (const projectItems of projectGroups.values()) {
    const userCopies = userItems.map((item) => ({ ...item, view: { ...item.view } }));
    markWinners([...projectItems, ...userCopies]);
  }
  const seenProjects = /* @__PURE__ */ new Set();
  for (const root of result.roots.filter((item) => item.scope === "project")) {
    if (seenProjects.has(root.projectRoot)) continue;
    seenProjects.add(root.projectRoot);
    result.projects.push({ root: root.projectRoot, name: root.projectName, workspaceCwds: root.workspaceCwds });
  }
  result.summary = {
    total: all.length,
    enabled: all.filter((item) => item.view.enabled === true).length,
    disabled: all.filter((item) => item.entry.loadable && item.policy.enabled === false).length,
    issues: all.reduce((count, item) => count + item.entry.diagnostics.length + (item.view.shadowedBy ? 1 : 0), 0)
  };
  return result;
}
export {
  KEBAB_RE,
  browseDirectories,
  createSkill,
  deleteSkill,
  entryPath,
  getProviderSkill,
  importSkill,
  importUploadedSkill,
  listProviderCandidates,
  listTrash,
  logPath,
  managerHomePath,
  managerStatePath,
  parseBoolValue,
  parseSkillDoc,
  permanentlyDeleteTrash,
  projectRoots,
  readManagerState,
  renameWithRetry,
  resolveAgentsHome,
  resolveDshHome,
  resolveEntry,
  restoreTrash,
  scanEntries,
  setSkillEnabled,
  setSourceEnabled,
  skillDetail,
  state,
  toKebab,
  trashRootPath,
  unquote,
  userRoots
};
