import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  join,
  basename,
  dirname,
  resolve,
  relative,
  isAbsolute,
  sep
} from "node:path";
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import {
  discoverReadonlyEntries,
  validDiscoveryName
} from "./readonly-discovery.js";
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXTERNAL_SOURCE_ORDER = [
  "ccswitch",
  "codex",
  "claude",
  "gemini",
  "opencode",
  "cursor",
  "copilot",
  "windsurf",
  "windsurf-user",
  "trae",
  "trae-cn",
  "openclaw",
  "clawdbot",
  "roo",
  "codebuddy",
  "workbuddy",
  "qoder",
  "qoder-cn",
  "lingma"
];
function rankSources(sources, startRank) {
  const order = (root) => EXTERNAL_SOURCE_ORDER.indexOf(root.key);
  const external = sources.filter((root) => !root.native);
  for (const root of external) {
    if (order(root) < 0) throw new Error(`\u6280\u80FD\u6765\u6E90\u672A\u767B\u8BB0\u5230 EXTERNAL_SOURCE_ORDER: ${root.key}`);
  }
  external.sort((a, b) => order(a) - order(b));
  const ranks = new Map(external.map((root, index) => [root.key, startRank + index * 10]));
  return sources.map((root) => ({ ...root, rank: root.native ? root.rank : ranks.get(root.key) })).sort((a, b) => a.rank - b.rank);
}
const PROJECT_SOURCES = rankSources([
  { key: "dsh", directory: ".dsh", localeKey: "projectDsh", label: "Project DSH", rank: 100, mutable: true, native: true },
  { key: "agents", directory: ".agents", localeKey: "projectAgents", label: "Project Agent", rank: 200, native: true },
  // 保留原生项目 100/200；其余项目来源按统一 Agent 顺序生成 210–320。
  { key: "copilot", directory: ".github", localeKey: "copilot", label: "Copilot" },
  { key: "codex", directory: ".codex", localeKey: "codex", label: "Codex" },
  { key: "claude", directory: ".claude", localeKey: "claude", label: "Claude Code" },
  { key: "gemini", directory: ".gemini", localeKey: "gemini", label: "Gemini" },
  { key: "opencode", directory: ".opencode", localeKey: "opencode", label: "OpenCode" },
  { key: "cursor", directory: ".cursor", localeKey: "cursor", label: "Cursor" },
  { key: "windsurf", directory: ".windsurf", localeKey: "windsurf", label: "Windsurf" },
  { key: "trae", directory: ".trae", localeKey: "trae", label: "Trae" },
  { key: "trae-cn", directory: ".trae-cn", localeKey: "traeCn", label: "Trae CN" },
  { key: "roo", directory: ".roo", localeKey: "roo", label: "Roo" },
  { key: "codebuddy", directory: ".codebuddy", localeKey: "codebuddy", label: "CodeBuddy" },
  { key: "workbuddy", directory: ".workbuddy", localeKey: "workbuddy", label: "WorkBuddy" },
  // Qoder CN CLI 的项目技能也写在 .qoder/skills，与国际版 Qoder 共用。
  { key: "qoder", directory: ".qoder", localeKey: "qoder", label: "Qoder" },
  { key: "lingma", directory: ".lingma", localeKey: "lingma", label: "Qoder CN" }
], 210);
const PROJECT_ROOT_KEY_RE = new RegExp(
  `^project-(?:${[...PROJECT_SOURCES].map((source) => source.key).sort((left, right) => right.length - left.length).join("|")}):[a-f0-9]{16}$`
);
function projectSourceDefinition(kind) {
  return PROJECT_SOURCES.find((source) => `project-${source.key}` === kind);
}
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
  if (error && typeof error.code === "string" && /^error\./.test(error.code))
    item.code = error.code;
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
  return rankSources([
    {
      key: "dsh",
      path: join(resolveDshHome(), "skills"),
      label: "DSH",
      mutable: true,
      toggleable: true,
      native: true,
      rank: 400
    },
    {
      key: "agents",
      path: join(resolveAgentsHome(), "skills"),
      label: "\u516C\u5171 Agent",
      mutable: true,
      toggleable: true,
      native: true,
      rank: 450
    },
    {
      key: "ccswitch",
      path: join(homedir(), ".cc-switch", "skills"),
      label: "CC Switch",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "codex",
      path: join(
        process.env.DSH_CODEX_HOME || join(homedir(), ".codex"),
        "skills"
      ),
      label: "Codex",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "claude",
      path: join(
        process.env.DSH_CLAUDE_HOME || join(homedir(), ".claude"),
        "skills"
      ),
      label: "Claude Code",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "gemini",
      path: join(
        process.env.DSH_GEMINI_HOME || join(homedir(), ".gemini"),
        "skills"
      ),
      label: "Gemini",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "opencode",
      path: join(
        process.env.DSH_OPENCODE_HOME || join(homedir(), ".config", "opencode"),
        "skills"
      ),
      label: "OpenCode",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "cursor",
      path: join(
        process.env.DSH_CURSOR_HOME || join(homedir(), ".cursor"),
        "skills"
      ),
      label: "Cursor",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "copilot",
      path: join(process.env.DSH_COPILOT_HOME || join(homedir(), ".copilot"), "skills"),
      label: "Copilot",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "windsurf",
      path: join(
        process.env.DSH_WINDSURF_HOME || join(homedir(), ".codeium", "windsurf"),
        "skills"
      ),
      label: "Windsurf",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "windsurf-user",
      localeKey: "windsurfUser",
      path: join(
        process.env.DSH_WINDSURF_USER_HOME || join(homedir(), ".windsurf"),
        "skills"
      ),
      label: "Windsurf \u4E3B\u76EE\u5F55",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "trae",
      path: join(process.env.DSH_TRAE_HOME || join(homedir(), ".trae"), "skills"),
      label: "Trae",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "trae-cn",
      localeKey: "traeCn",
      path: join(
        process.env.DSH_TRAE_CN_HOME || join(homedir(), ".trae-cn"),
        "skills"
      ),
      label: "Trae \u56FD\u5185\u7248",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "openclaw",
      path: join(
        process.env.DSH_OPENCLAW_HOME || join(homedir(), ".openclaw"),
        "skills"
      ),
      label: "OpenClaw",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "clawdbot",
      path: join(
        process.env.DSH_CLAWDBOT_HOME || join(homedir(), ".clawdbot"),
        "skills"
      ),
      label: "OpenClaw \u65E7\u76EE\u5F55",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "roo",
      path: join(process.env.DSH_ROO_HOME || join(homedir(), ".roo"), "skills"),
      label: "Roo",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "codebuddy",
      path: join(
        process.env.DSH_CODEBUDDY_HOME || join(homedir(), ".codebuddy"),
        "skills"
      ),
      label: "CodeBuddy",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "workbuddy",
      localeKey: "workbuddy",
      path: join(
        process.env.DSH_WORKBUDDY_HOME || join(homedir(), ".workbuddy"),
        "skills"
      ),
      label: "WorkBuddy",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "qoder",
      localeKey: "qoder",
      path: join(process.env.DSH_QODER_HOME || join(homedir(), ".qoder"), "skills"),
      label: "Qoder",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "qoder-cn",
      localeKey: "qoderCn",
      path: join(
        process.env.DSH_QODER_CN_HOME || join(homedir(), ".qoder-cn"),
        "skills"
      ),
      label: "Qoder CN CLI",
      mutable: false,
      toggleable: true,
      native: false
    },
    {
      key: "lingma",
      localeKey: "lingma",
      path: join(process.env.DSH_LINGMA_HOME || join(homedir(), ".lingma"), "skills"),
      label: "Qoder CN",
      mutable: false,
      toggleable: true,
      native: false
    }
  ], 500);
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
    if (parent === current) return { root: start, cwd: start };
    current = parent;
  }
}
async function projectSourceSafe(definition) {
  const source = projectSourceDefinition(definition.kind);
  if (!source) return false;
  if (!source.mutable)
    return !await overlapsUserSkillRoot(definition.path);
  const container = join(
    definition.projectRoot,
    source.directory
  );
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
        diagnostics.push({
          code: "warning.project.unavailable",
          params: { path: cwd },
          error: `\u65E0\u6CD5\u4ECE\u5BBF\u4E3B\u8BFB\u53D6\u6D3B\u52A8\u5DE5\u4F5C\u533A\uFF0C\u9879\u76EE\u6280\u80FD\u672A\u663E\u793A: ${cwd}`
        });
      }
      continue;
    }
    const identity = pathIdentity(found.root);
    const existing = projects.get(identity) || {
      root: found.root,
      cwds: /* @__PURE__ */ new Set()
    };
    existing.cwds.add(found.cwd);
    projects.set(identity, existing);
  }
  const roots = [];
  for (const project of [...projects.values()].sort(
    (a, b) => a.root.localeCompare(b.root)
  )) {
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
    const candidates = PROJECT_SOURCES.map((source) => ({
      ...common,
      key: `project-${source.key}:${id}`,
      kind: `project-${source.key}`,
      localeKey: source.localeKey,
      path: join(project.root, source.directory, "skills"),
      label: source.label,
      rank: source.rank,
      mutable: source.mutable === true,
      native: source.native === true,
      toggleable: true
    }));
    for (const candidate of candidates) {
      if (candidate.kind !== "project-dsh" && !await lstatOrNull(candidate.path))
        continue;
      if (await projectSourceSafe(candidate)) roots.push(candidate);
    }
  }
  return roots;
}
function sameWorkspace(a, b) {
  return pathIdentity(a) === pathIdentity(b);
}
function createWorkspaceIndex(registered, hooks) {
  let pending;
  return {
    registered,
    load() {
      if (!pending) {
        hooks?.onBuild?.();
        pending = indexRegisteredWorkspaces(registered);
      }
      return pending;
    }
  };
}
async function indexRegisteredWorkspaces(registered) {
  const list = Array.isArray(registered) ? registered.filter((item) => typeof item === "string") : [];
  const indexed = [];
  for (const workspace of list) indexed.push(await resolveWorkspaceTarget(workspace, list));
  return indexed;
}
async function projectRootForRecord(projectRoot, registered, indexed) {
  if (typeof projectRoot !== "string" || !isAbsolute(projectRoot))
    return { ok: false, error: "\u5B89\u88C5\u8BB0\u5F55\u4E2D\u7684\u5DE5\u4F5C\u533A\u8DEF\u5F84\u65E0\u6548", code: "error.workspace.unavailable" };
  const saved = await nearestProjectRoot(projectRoot);
  if (!saved?.root || !sameWorkspace(saved.root, projectRoot))
    return { ok: false, error: `\u5DE5\u4F5C\u533A\u76EE\u5F55\u4E0D\u53EF\u7528: ${projectRoot}`, code: "error.workspace.unavailable", params: { path: projectRoot } };
  for (const target of indexed ?? await indexRegisteredWorkspaces(registered)) {
    if ("root" in target && sameWorkspace(target.root.projectRoot, projectRoot)) return target;
  }
  return { ok: false, error: "\u8BF7\u9009\u62E9\u5DF2\u767B\u8BB0\u7684\u5DE5\u4F5C\u533A", code: "error.workspace.unregistered" };
}
async function resolveWorkspaceTarget(workspace, registered) {
  const unregistered = {
    ok: false,
    error: "\u8BF7\u9009\u62E9\u5DF2\u767B\u8BB0\u7684\u5DE5\u4F5C\u533A",
    code: "error.workspace.unregistered"
  };
  if (typeof workspace !== "string" || !workspace.trim() || !isAbsolute(workspace.trim())) return unregistered;
  const requested = workspace.trim();
  const list = Array.isArray(registered) ? registered.filter((item) => typeof item === "string" && isAbsolute(item)) : [];
  if (!list.some((item) => sameWorkspace(item, requested))) return unregistered;
  const found = await nearestProjectRoot(requested);
  if (!found || !found.root)
    return {
      ok: false,
      error: `\u5DE5\u4F5C\u533A\u76EE\u5F55\u4E0D\u53EF\u7528: ${requested}`,
      code: "error.workspace.unavailable",
      params: { path: requested }
    };
  const source = PROJECT_SOURCES.find((item) => item.key === "dsh");
  const root = {
    key: `project-dsh:${projectIdentity(found.root)}`,
    kind: "project-dsh",
    scope: "project",
    localeKey: source.localeKey,
    label: source.label,
    rank: source.rank,
    mutable: true,
    native: true,
    toggleable: true,
    path: join(found.root, source.directory, "skills"),
    projectRoot: found.root,
    projectName: basename(found.root) || found.root,
    workspaceCwds: [found.cwd]
  };
  const checked = await checkedWritableRootDefinition(root);
  if (!checked) return unregistered;
  if (checked.ok === false) return checked;
  return { root: checked };
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
    return {
      ok: false,
      error: `\u76EE\u5F55\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84: ${target}`,
      code: "error.browse.absolute",
      params: { path: target }
    };
  }
  let canonical;
  let directory;
  try {
    canonical = await fs.realpath(target);
    directory = await fs.stat(canonical);
  } catch (caught) {
    const error = caught;
    return {
      ok: false,
      error: `\u65E0\u6CD5\u8BFB\u53D6\u76EE\u5F55: ${target}`,
      code: "error.browse.unreadable",
      params: {
        path: target,
        error: String(error && error.message ? error.message : error)
      }
    };
  }
  if (!directory.isDirectory()) {
    return {
      ok: false,
      error: `\u4E0D\u662F\u76EE\u5F55: ${target}`,
      code: "error.browse.notDirectory",
      params: { path: target }
    };
  }
  const entries = [];
  let truncated = false;
  try {
    const items = await fs.readdir(canonical, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory() || item.isSymbolicLink()) continue;
      const childPath = join(canonical, item.name);
      const childStat = await lstatOrNull(childPath);
      if (!childStat || !childStat.isDirectory() || childStat.isSymbolicLink())
        continue;
      if (entries.length >= MAX_BROWSE_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push({
        name: item.name,
        path: childPath,
        hidden: item.name.startsWith(".")
      });
    }
  } catch (caught) {
    const error = caught;
    return {
      ok: false,
      error: `\u65E0\u6CD5\u8BFB\u53D6\u76EE\u5F55: ${canonical}`,
      code: "error.browse.unreadable",
      params: {
        path: canonical,
        error: String(error && error.message ? error.message : error)
      }
    };
  }
  entries.sort(
    (a, b) => a.name.localeCompare(b.name, void 0, {
      sensitivity: "base",
      numeric: true
    })
  );
  const crumbs = [];
  let cursor = canonical;
  for (; ; ) {
    const parent = dirname(cursor);
    crumbs.unshift({
      name: parent === cursor ? cursor : basename(cursor),
      path: cursor,
      hidden: false
    });
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
  if (root && typeof root === "object" && typeof root.key === "string")
    return root;
  if (typeof root !== "string") return null;
  const resolved = resolve(root);
  return userRoots().find((item) => resolve(item.path) === resolved) || null;
}
function rootByKey(key) {
  return userRoots().find((item) => item.key === key) || null;
}
function writableRootDefinition(root) {
  const definition = rootDefinition(root);
  if (definition?.key === "agents") {
    const canonical = rootByKey("agents");
    return canonical && resolve(definition.path) === resolve(canonical.path) ? canonical : null;
  }
  if (!definition || definition.mutable !== true) return null;
  if (definition.key === "dsh")
    return resolve(definition.path) === resolve(dshRootPath()) ? rootByKey("dsh") : null;
  if (definition.scope !== "project" || definition.kind !== "project-dsh" || typeof definition.projectRoot !== "string" || !isAbsolute(definition.projectRoot) || definition.key !== `project-dsh:${projectIdentity(definition.projectRoot)}` || resolve(definition.path) !== resolve(join(definition.projectRoot, ".dsh", "skills")))
    return null;
  return definition;
}
async function checkedUserRootAncestors(definition) {
  for (let path = resolve(definition.path); ; path = dirname(path)) {
    const st = await lstatOrNull(path);
    if (st && (!st.isDirectory() || st.isSymbolicLink()))
      return { ok: false, error: `\u6280\u80FD\u76EE\u5F55\u4E0D\u5B89\u5168\uFF0C\u62D2\u7EDD\u5199\u5165: ${path}`, code: "error.root.unsafe", params: { path } };
    if (dirname(path) === path) break;
  }
  return definition;
}
async function checkedWritableRootDefinition(root) {
  const definition = writableRootDefinition(root);
  if (definition?.key === "agents") return checkedUserRootAncestors(definition);
  if (!definition || definition.scope !== "project") return definition;
  if (await overlapsUserSkillRoot(definition.path)) {
    return {
      ok: false,
      error: `\u9879\u76EE\u6280\u80FD\u76EE\u5F55\u4E0E\u7528\u6237\u6280\u80FD\u76EE\u5F55\u91CD\u53E0\uFF0C\u62D2\u7EDD\u5199\u5165: ${definition.path}`,
      code: "error.root.unsafe",
      params: { path: definition.path }
    };
  }
  for (const path of [join(definition.projectRoot, ".dsh"), definition.path]) {
    const st = await lstatOrNull(path);
    if (st && (!st.isDirectory() || st.isSymbolicLink())) {
      return {
        ok: false,
        error: `\u9879\u76EE\u6280\u80FD\u76EE\u5F55\u4E0D\u5B89\u5168\uFF0C\u62D2\u7EDD\u5199\u5165: ${path}`,
        code: "error.root.unsafe",
        params: { path }
      };
    }
  }
  return definition;
}
async function checkedRepositoryRootDefinition(root) {
  const definition = await checkedWritableRootDefinition(root);
  if (!definition || definition.ok === false || definition.scope === "project" || definition.key === "agents") return definition;
  return checkedUserRootAncestors(definition);
}
async function repositoryDestinations() {
  const result = [];
  for (const root of userRoots().filter((item) => item.key === "dsh" || item.key === "agents")) {
    let error;
    try {
      const checked = await checkedRepositoryRootDefinition(root);
      if (!checked || checked.ok === false) error = checked || { code: "error.root.unsafe", error: "\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u4E0D\u53EF\u7528" };
    } catch (caught) {
      const exception = caught;
      error = { code: "error.root.unsafe", error: exception.message, params: { path: root.path } };
    }
    result.push({ key: root.key, path: resolve(root.path), label: root.label, localeKey: root.localeKey, available: !error, ...error ? { error } : {} });
  }
  return result;
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
    if (isSameOrDescendant(candidate, userPath) || isSameOrDescendant(userPath, candidate))
      return true;
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
function entryPath(root, name) {
  if (typeof name !== "string" || name === "" || name === "." || name === ".." || name.startsWith(".") || name.length > MAX_ENTRY_NAME_LENGTH || /[\\/:*?"<>|\0]/.test(name) || /[. ]$/.test(name) || WINDOWS_DEVICE_NAME_RE.test(name) || basename(name) !== name)
    return null;
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
          const block = /^([>|])(?:([1-9])[-+]?|[-+]([1-9])?)?\s*$/.exec(m[2]);
          if (block) {
            const content = [];
            while (i + 1 < end && (/^\s/.test(lines[i + 1]) || lines[i + 1] === "")) {
              i++;
              content.push(lines[i]);
            }
            const explicitIndentation = block[2] || block[3];
            const indentation = explicitIndentation ? Number(explicitIndentation) : content.filter((line) => line.trim() !== "").reduce(
              (min, line) => Math.min(min, (/^\s*/.exec(line) || [""])[0].length),
              Infinity
            );
            const normalized = content.map(
              (line) => Number.isFinite(indentation) ? line.slice(Math.min(indentation, line.length)) : line
            );
            map[m[1]] = block[1] === ">" ? normalized.join(" ").replace(/\s+/g, " ").trim() : explicitIndentation ? normalized.join("\n").replace(/^\n+|\n+$/g, "") : normalized.join("\n").trim();
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
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'")
    return s.slice(1, -1).replace(/''/g, "'");
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
    } catch (caught) {
      const error = caught;
      if (!TRANSIENT_RENAME_CODES.has(error && error.code || "") || attempt >= maxAttempts)
        throw error;
      await new Promise(
        (resolvePromise) => setTimeout(resolvePromise, delayMs * attempt)
      );
    }
  }
}
async function removeMovedPath(path) {
  const st = await lstatOrNull(path);
  if (!st) return;
  if (st.isDirectory() && !st.isSymbolicLink())
    await fs.rm(path, { recursive: true, force: false });
  else await fs.unlink(path);
}
async function movePathWithFallback(source, destination, options = {}) {
  try {
    await renameWithRetry(source, destination, options);
    return { copied: false, cleanupError: null };
  } catch (caught) {
    const error = caught;
    if (!error || error.code !== "EXDEV") throw error;
  }
  const quarantine = join(
    dirname(source),
    `.${basename(source)}.dssm-move-${randomUUID()}`
  );
  try {
    await fs.cp(source, destination, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true
    });
    await renameWithRetry(source, quarantine, options);
  } catch (caught) {
    const error = caught;
    await removeMovedPath(destination).catch(() => void 0);
    throw error;
  }
  let cleanupError = null;
  try {
    await removeMovedPath(quarantine);
  } catch (caught) {
    const error = caught;
    cleanupError = error;
  }
  return { copied: true, cleanupError, quarantine };
}
async function writeFileAtomically(path, content) {
  const temp = join(
    dirname(path),
    `.${basename(path)}.dssm-${randomUUID()}.tmp`
  );
  try {
    await fs.writeFile(temp, content, "utf8");
    await fs.rename(temp, path);
  } catch (caught) {
    const error = caught;
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
  const definition = rootDefinition(root);
  if (definition && (!definition.mutable || definition.key === "agents")) {
    if (!validDiscoveryName(name)) return null;
    return (await discoverReadonlyEntries(definition.path)).entries.find(
      (entry) => entry.name === name
    ) || null;
  }
  const directory = definition ? definition.path : root;
  try {
    const bundlePath = entryPath(directory, name);
    if (bundlePath === null) return null;
    const rootPath = resolve(directory);
    const rootStat = await lstatOrNull(rootPath);
    if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink())
      return null;
    const rootReal = await resolvedPath(rootPath);
    const bundleStat = await lstatOrNull(bundlePath);
    if (bundleStat && bundleStat.isDirectory() && !bundleStat.isSymbolicLink()) {
      const bundleDoc = join(bundlePath, "SKILL.md");
      const docStat = await lstatOrNull(bundleDoc);
      if (docStat && docStat.isFile() && !docStat.isSymbolicLink() && await isInsideResolvedRoot(rootReal, bundleDoc)) {
        return {
          kind: "bundle",
          docPath: bundleDoc,
          entryPath: bundlePath,
          realDocPath: await fs.realpath(bundleDoc),
          realEntryPath: await fs.realpath(bundlePath),
          linked: false
        };
      }
    }
    const flatDoc = resolve(rootPath, `${name}.md`);
    if (!isSameOrDescendant(rootPath, flatDoc) || rootPath === flatDoc)
      return null;
    const flatStat = await lstatOrNull(flatDoc);
    if (flatStat && flatStat.isFile() && !flatStat.isSymbolicLink() && await isInsideResolvedRoot(rootReal, flatDoc)) {
      const realDocPath = await fs.realpath(flatDoc);
      return {
        kind: "flat",
        docPath: flatDoc,
        entryPath: flatDoc,
        realDocPath,
        realEntryPath: realDocPath,
        linked: false
      };
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
  if (!doc.hasFrontmatter)
    diagnostics.push({
      level: "error",
      code: "diagnostic.frontmatter.missing"
    });
  if (doc.hasFrontmatter && !declaredName)
    diagnostics.push({ level: "error", code: "diagnostic.name.missing" });
  else if (declaredName && !KEBAB_RE.test(toKebab(declaredName)))
    diagnostics.push({
      level: "error",
      code: "diagnostic.name.invalid",
      params: { name: declaredName }
    });
  if (doc.hasFrontmatter && !description)
    diagnostics.push({
      level: "error",
      code: "diagnostic.description.missing"
    });
  if (!invocationPolicyValid)
    diagnostics.push({ level: "error", code: "diagnostic.invocation.invalid" });
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
    loadable: doc.hasFrontmatter && description !== "" && KEBAB_RE.test(KEBAB_RE.test(declaredName) ? declaredName : toKebab(declaredName)),
    diagnostics
  };
}
async function scanEntries(root, options = {}) {
  const definition = rootDefinition(root);
  if (definition && (!definition.mutable || definition.key === "agents")) {
    const discovered = await discoverReadonlyEntries(definition.path);
    if (options.metadataOnly) return discovered;
    const entries2 = [];
    for (const entry of discovered.entries) {
      try {
        entries2.push({
          ...entryOf(
            entry.name,
            entry.kind,
            entry.docPath,
            parseSkillDoc(await fs.readFile(entry.realDocPath, "utf8"))
          ),
          ...entry
        });
      } catch {
      }
    }
    return { ...discovered, entries: entries2 };
  }
  const directory = definition ? definition.path : root;
  const rootStat = await lstatOrNull(resolve(directory));
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink())
    return { exists: false, entries: [] };
  let items;
  try {
    items = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return { exists: false, entries: [] };
  }
  const byName = /* @__PURE__ */ new Map();
  const rootReal = await resolvedPath(directory);
  for (const it of items) {
    try {
      if (it.isSymbolicLink()) continue;
      if (it.isDirectory() && entryPath(directory, it.name) !== null) {
        const docPath = join(directory, it.name, "SKILL.md");
        const st = await lstatOrNull(docPath);
        if (!st || !st.isFile() || st.isSymbolicLink() || !await isInsideResolvedRoot(rootReal, docPath))
          continue;
        const doc = options.metadataOnly ? { map: {}, hasFrontmatter: false } : parseSkillDoc(await fs.readFile(docPath, "utf8"));
        byName.set(it.name, {
          ...entryOf(it.name, "bundle", docPath, doc),
          entryPath: join(directory, it.name),
          realDocPath: await fs.realpath(docPath),
          realEntryPath: await fs.realpath(join(directory, it.name)),
          linked: false
        });
      } else if (it.isFile() && it.name.toLowerCase().endsWith(".md") && it.name.toLowerCase() !== "skill.md" && entryPath(directory, it.name.slice(0, -3)) !== null) {
        const skillName = it.name.slice(0, -3);
        if (byName.has(skillName)) continue;
        const docPath = join(directory, it.name);
        if (!await isInsideResolvedRoot(rootReal, docPath)) continue;
        const doc = options.metadataOnly ? { map: {}, hasFrontmatter: false } : parseSkillDoc(await fs.readFile(docPath, "utf8"));
        const realDocPath = await fs.realpath(docPath);
        byName.set(skillName, {
          ...entryOf(skillName, "flat", docPath, doc),
          entryPath: docPath,
          realDocPath,
          realEntryPath: realDocPath,
          linked: false
        });
      }
    } catch {
    }
  }
  const entries = [...byName.values()].sort(
    (a, b) => a.name.localeCompare(b.name)
  );
  return { exists: true, entries };
}
async function scanDeduplicatedRoots(roots = userRoots(), options = {}) {
  const results = await Promise.all(
    roots.map(async (root) => [root, options.metadataOnly ? await scanEntries(root, { metadataOnly: true }) : await scanEntries(root)])
  );
  const scans = /* @__PURE__ */ new Map();
  const groups = /* @__PURE__ */ new Map();
  for (const [root, scan] of results) {
    scans.set(root.key, scan);
    for (const entry of scan.entries) {
      const identity = pathIdentity(
        entry.realEntryPath || entry.entryPath || entry.docPath
      );
      const group = groups.get(identity) || [];
      group.push({ root, entry });
      groups.set(identity, group);
    }
  }
  const winners = /* @__PURE__ */ new Set();
  for (const group of groups.values()) {
    group.sort(
      (left, right) => Number(left.entry.linked) - Number(right.entry.linked) || left.root.rank - right.root.rank
    );
    const winner = group[0];
    winner.entry.providerRank = Math.min(
      ...group.map((item) => item.root.rank)
    );
    winner.entry.policyAliases = group.map((item) => ({
      rootKey: item.root.key,
      name: item.entry.name
    }));
    winners.add(winner.entry);
  }
  for (const scan of scans.values()) {
    scan.entries = scan.entries.filter((entry) => winners.has(entry));
  }
  return scans;
}
async function visibleEntryForRoot(root, name) {
  if (!validDiscoveryName(name)) return null;
  const roots = root.scope === "project" ? [root] : userRoots();
  const scans = await scanDeduplicatedRoots(roots, { metadataOnly: true });
  return scans.get(root.key)?.entries.find((entry) => entry.name === name) || null;
}
function defaultManagerState() {
  const sources = /* @__PURE__ */ Object.create(null);
  const disabledSkills = /* @__PURE__ */ Object.create(null);
  const enabledSkills = /* @__PURE__ */ Object.create(null);
  for (const root of userRoots()) {
    sources[root.key] = true;
    disabledSkills[root.key] = [];
    enabledSkills[root.key] = [];
  }
  return { version: 1, sources, disabledSkills, enabledSkills, categories: /* @__PURE__ */ Object.create(null), categoryMembers: /* @__PURE__ */ Object.create(null), categoryOrder: /* @__PURE__ */ Object.create(null) };
}
function validStateSkillName(name) {
  return validDiscoveryName(name);
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
    if (!userRoots().some((root) => root.key === key) && !PROJECT_ROOT_KEY_RE.test(key))
      continue;
    if (!Array.isArray(list) || list.some((name) => !validStateSkillName(name)))
      return false;
  }
  return true;
}
function validManagerStateDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1)
    return false;
  if (!value.sources || typeof value.sources !== "object" || Array.isArray(value.sources))
    return false;
  if (!validPolicyLists(value.disabledSkills) || !validPolicyLists(value.enabledSkills, true))
    return false;
  for (const root of userRoots()) {
    if (root.key === "dsh") {
      if (value.sources.dsh !== void 0 && typeof value.sources.dsh !== "boolean") return false;
      continue;
    }
    if (typeof value.sources[root.key] !== "boolean") return false;
    const list = value.disabledSkills[root.key];
    if (!Array.isArray(list) || list.some((name) => !validStateSkillName(name)))
      return false;
  }
  for (const [key, flag] of Object.entries(value.sources)) {
    if (PROJECT_ROOT_KEY_RE.test(key) && typeof flag !== "boolean") return false;
  }
  const enabledSkills = value.enabledSkills || {};
  for (const key of /* @__PURE__ */ new Set([
    ...Object.keys(value.disabledSkills),
    ...Object.keys(enabledSkills)
  ])) {
    const disabled = new Set(value.disabledSkills[key] || []);
    if ((enabledSkills[key] || []).some((name) => disabled.has(name)))
      return false;
  }
  return true;
}
function migrateManagerStateDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1)
    return value;
  const addedSources = ["ccswitch", "cursor", "copilot", "windsurf", "windsurf-user", "trae", "trae-cn", "openclaw", "clawdbot", "roo", "codebuddy", "workbuddy", "qoder", "qoder-cn", "lingma"];
  for (const key of addedSources) {
    for (const field of ["sources", "disabledSkills", "enabledSkills"]) {
      if (value[field] && typeof value[field] === "object" && !Array.isArray(value[field]) && value[field][key] === void 0)
        value[field][key] = field === "sources" ? true : [];
    }
  }
  return value;
}
function normalizeManagerState(value) {
  const normalized = defaultManagerState();
  if (!value || typeof value !== "object" || Array.isArray(value))
    return normalized;
  for (const root of userRoots()) {
    if (value.sources && typeof value.sources[root.key] === "boolean")
      normalized.sources[root.key] = value.sources[root.key];
    const list = value.disabledSkills && value.disabledSkills[root.key];
    if (Array.isArray(list))
      normalized.disabledSkills[root.key] = [
        ...new Set(list.filter((name) => validStateSkillName(name)))
      ].sort();
    const enabled = value.enabledSkills && value.enabledSkills[root.key];
    if (Array.isArray(enabled))
      normalized.enabledSkills[root.key] = [
        ...new Set(enabled.filter((name) => validStateSkillName(name)))
      ].sort();
  }
  if (value.sources && typeof value.sources === "object" && !Array.isArray(value.sources)) {
    for (const [key, flag] of Object.entries(value.sources)) {
      if (PROJECT_ROOT_KEY_RE.test(key) && !key.startsWith("project-dsh:") && typeof flag === "boolean")
        normalized.sources[key] = flag;
    }
  }
  for (const field of ["disabledSkills", "enabledSkills"]) {
    const source = value[field];
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [key, list] of Object.entries(source)) {
        if (!PROJECT_ROOT_KEY_RE.test(key) || !Array.isArray(list)) continue;
        normalized[field][key] = [
          ...new Set(list.filter(validStateSkillName))
        ].sort();
      }
    }
  }
  normalized.categories = normalizeCategories(value.categories);
  normalized.categoryMembers = normalizeCategoryMembers(value.categoryMembers, normalized.categories);
  normalized.categoryOrder = normalizeCategoryOrder(value.categoryOrder, normalized.categories);
  return normalized;
}
const CATEGORY_NAME_MAX = 24;
function categoryRootKey(key) {
  if (rootByKey(key) || PROJECT_ROOT_KEY_RE.test(key)) return key;
  return null;
}
function normalizeCategories(value) {
  const categories = /* @__PURE__ */ Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return categories;
  for (const [key, list] of Object.entries(value)) {
    if (!categoryRootKey(key) || !Array.isArray(list)) continue;
    const seen = /* @__PURE__ */ new Set();
    categories[key] = [];
    for (const item of list) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const id = typeof item.id === "string" ? item.id : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!/^[a-z0-9]{8,32}$/.test(id) || !name || name.length > CATEGORY_NAME_MAX || seen.has(id)) continue;
      seen.add(id);
      categories[key].push({ id, name });
    }
  }
  return categories;
}
function normalizeCategoryMembers(value, categories) {
  const members = /* @__PURE__ */ Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return members;
  for (const [key, record] of Object.entries(value)) {
    if (!categoryRootKey(key) || !record || typeof record !== "object" || Array.isArray(record)) continue;
    const ids = new Set((categories[key] || []).map((item) => item.id));
    members[key] = /* @__PURE__ */ Object.create(null);
    for (const [name, id] of Object.entries(record)) {
      if (validStateSkillName(name) && typeof id === "string" && ids.has(id)) members[key][name] = id;
    }
  }
  return members;
}
function normalizeCategoryOrder(value, categories) {
  const order = /* @__PURE__ */ Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return order;
  for (const [key, groups] of Object.entries(value)) {
    if (!categoryRootKey(key) || !groups || typeof groups !== "object" || Array.isArray(groups)) continue;
    const validIds = /* @__PURE__ */ new Set(["", ...(categories[key] || []).map((item) => item.id)]);
    order[key] = /* @__PURE__ */ Object.create(null);
    for (const [id, names] of Object.entries(groups)) {
      if (!validIds.has(id) || !Array.isArray(names)) continue;
      order[key][id] = [...new Set(names.filter(validStateSkillName))];
    }
  }
  return order;
}
async function readManagerState() {
  try {
    const raw = await fs.readFile(managerStatePath(), "utf8");
    const parsed = migrateManagerStateDocument(JSON.parse(raw));
    if (!validManagerStateDocument(parsed))
      throw codedError("invalid manager state schema", "error.state.invalid");
    return {
      state: normalizeManagerState(parsed),
      warning: null,
      writable: true
    };
  } catch (caught) {
    const error = caught;
    if (error && error.code === "ENOENT")
      return { state: defaultManagerState(), warning: null, writable: true };
    return {
      state: failClosedManagerState(),
      writable: false,
      warning: {
        code: "warning.state.invalid",
        params: { path: managerStatePath() },
        error: `\u6280\u80FD\u7BA1\u7406\u5668\u72B6\u6001\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF0C\u6240\u6709\u6280\u80FD\u5DF2\u5B89\u5168\u505C\u7528\u4E14\u72B6\u6001\u5199\u5165\u5DF2\u9501\u5B9A: ${managerStatePath()}`
      }
    };
  }
}
async function writeManagerState(value) {
  await fs.mkdir(managerHomePath(), { recursive: true });
  await writeFileAtomically(
    managerStatePath(),
    `${JSON.stringify(normalizeManagerState(value), null, 2)}
`
  );
}
function managerSkillOverride(policy, rootKey, name, policyAliases = []) {
  if ((policy.enabledSkills[rootKey] || []).includes(name)) return true;
  if ((policy.disabledSkills[rootKey] || []).includes(name)) return false;
  let inheritedEnable = false;
  for (const alias of policyAliases) {
    if (alias.rootKey === rootKey && alias.name === name) continue;
    if ((policy.disabledSkills[alias.rootKey] || []).includes(alias.name))
      return false;
    if ((policy.enabledSkills[alias.rootKey] || []).includes(alias.name))
      inheritedEnable = true;
  }
  if (inheritedEnable) return true;
  return void 0;
}
function effectiveSkillPolicy(policyResult, root, entry) {
  const override = managerSkillOverride(
    policyResult.state,
    root.key,
    entry.name,
    entry.policyAliases
  );
  const sourceEnabled = root.kind === "project-dsh" || policyResult.state.sources[root.key] !== false;
  if (policyResult.writable === false || !sourceEnabled || override === false) {
    return {
      override,
      sourceEnabled,
      modelInvocable: false,
      userInvocable: false,
      enabled: false
    };
  }
  if (override === true) {
    return {
      override,
      sourceEnabled,
      modelInvocable: true,
      userInvocable: true,
      enabled: true
    };
  }
  const modelInvocable = entry.invocationPolicyValid && entry.modelInvocable;
  const userInvocable = entry.invocationPolicyValid && entry.userInvocable;
  return {
    override,
    sourceEnabled,
    modelInvocable,
    userInvocable,
    enabled: modelInvocable && userInvocable
  };
}
function invalidManagerStateWrite() {
  return {
    ok: false,
    code: "error.state.invalid",
    params: { path: managerStatePath() },
    error: `\u6280\u80FD\u7BA1\u7406\u5668\u72B6\u6001\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF0C\u5DF2\u62D2\u7EDD\u8986\u76D6: ${managerStatePath()}`
  };
}
async function setSourceEnabled(key, enabled, log, options = {}) {
  let root = rootByKey(key);
  if (!root && PROJECT_ROOT_KEY_RE.test(key) && !key.startsWith("project-dsh:"))
    root = (await projectRoots(options.projectCwds)).find((item) => item.key === key);
  if (!root || root.kind === "project-dsh" || !root.toggleable)
    return readonlyError("toggle");
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  current.state.sources[root.key] = enabled === true;
  await writeManagerState(current.state);
  if (log)
    log(
      enabled ? "source-enable" : "source-disable",
      `${enabled ? "\u542F\u7528" : "\u505C\u7528"}\u6765\u6E90 ${root.key}: ${root.path}`
    );
  return { root: root.key, enabled: enabled === true };
}
async function checkedPolicyRootDefinition(root) {
  const definition = rootDefinition(root);
  if (!definition || !definition.toggleable) return null;
  if (definition.scope !== "project") {
    const canonical = rootByKey(definition.key);
    return canonical && resolve(canonical.path) === resolve(definition.path) ? canonical : null;
  }
  const source = projectSourceDefinition(definition.kind);
  const validProjectRoot = source && PROJECT_ROOT_KEY_RE.test(definition.key) && typeof definition.projectRoot === "string" && isAbsolute(definition.projectRoot) && definition.key === `${definition.kind}:${projectIdentity(definition.projectRoot)}` && resolve(definition.path) === resolve(
    join(
      definition.projectRoot,
      source.directory,
      "skills"
    )
  );
  if (!validProjectRoot) return null;
  if (!await projectSourceSafe(definition)) {
    return {
      ok: false,
      error: `\u9879\u76EE\u6280\u80FD\u76EE\u5F55\u4E0D\u5B89\u5168\uFF0C\u62D2\u7EDD\u5199\u5165\u72B6\u6001: ${definition.path}`,
      code: "error.root.unsafe",
      params: { path: definition.path }
    };
  }
  return definition;
}
async function applyPolicySkillEnabled(definition, name, enabled, state2) {
  const resolved = await resolveEntry(definition, name);
  if (resolved === null)
    return {
      ok: false,
      error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`,
      code: "error.skill.notFound",
      params: { name }
    };
  let summary;
  try {
    summary = entryOf(
      name,
      resolved.kind,
      resolved.docPath,
      parseSkillDoc(
        await fs.readFile(resolved.realDocPath || resolved.docPath, "utf8")
      )
    );
  } catch {
    return {
      ok: false,
      error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`,
      code: "error.skill.notFound",
      params: { name }
    };
  }
  if (!summary.hasFrontmatter) {
    return {
      ok: false,
      error: `\u6280\u80FD\u7F3A\u5C11\u5B8C\u6574 frontmatter\uFF0C\u65E0\u6CD5${enabled ? "\u542F\u7528" : "\u505C\u7528"}: ${name}`,
      code: "error.skill.noFrontmatter",
      params: { name, action: enabled ? "enable" : "disable" }
    };
  }
  if (!summary.loadable) {
    return {
      ok: false,
      error: `\u6280\u80FD\u7ED3\u6784\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5${enabled ? "\u542F\u7528" : "\u505C\u7528"}: ${name}`,
      code: "error.skill.notLoadable",
      params: { name, action: enabled ? "enable" : "disable" }
    };
  }
  const disabled = new Set(state2.disabledSkills[definition.key] || []);
  const explicitlyEnabled = new Set(state2.enabledSkills[definition.key] || []);
  if (enabled) {
    disabled.delete(name);
    explicitlyEnabled.add(name);
  } else {
    explicitlyEnabled.delete(name);
    disabled.add(name);
  }
  state2.disabledSkills[definition.key] = [...disabled].sort();
  state2.enabledSkills[definition.key] = [...explicitlyEnabled].sort();
  return { root: definition.key, name, enabled: enabled === true };
}
async function setPolicySkillEnabled(root, name, enabled, log) {
  const definition = await checkedPolicyRootDefinition(root);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("toggle");
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  const result = await applyPolicySkillEnabled(definition, name, enabled, current.state);
  if (result && result.ok === false) return result;
  await writeManagerState(current.state);
  if (log)
    log(
      enabled ? "policy-enable" : "policy-disable",
      `${enabled ? "\u542F\u7528" : "\u505C\u7528"} ${definition.key}/${name}\uFF08\u672C\u5730\u7B56\u7565\uFF0C\u6E90\u6587\u4EF6\u4E0D\u53D8\uFF09`
    );
  return result;
}
async function setSkillEnabled(root, name, enabled, log) {
  return setPolicySkillEnabled(root, name, enabled, log);
}
function categoryError(code, error, params) {
  return { ok: false, code, error, ...params ? { params } : {} };
}
async function resolvedCategoryRoot(key, options = {}) {
  const rootKey = categoryRootKey(key);
  if (!rootKey) return null;
  const user = rootByKey(rootKey);
  if (user) return user;
  if (!PROJECT_ROOT_KEY_RE.test(rootKey)) return null;
  return (await projectRoots(options.projectCwds)).find((item) => item.key === rootKey) || null;
}
async function writableCategoryState(key, options = {}) {
  const root = await resolvedCategoryRoot(key, options);
  if (!root) return categoryError("error.category.root", `\u6280\u80FD\u6765\u6E90\u4E0D\u5B58\u5728: ${key}`, { root: key });
  const current = await readManagerState();
  if (current.writable === false) return invalidManagerStateWrite();
  if (!current.state.categories[root.key]) current.state.categories[root.key] = [];
  if (!current.state.categoryMembers[root.key]) current.state.categoryMembers[root.key] = /* @__PURE__ */ Object.create(null);
  if (!current.state.categoryOrder[root.key]) current.state.categoryOrder[root.key] = /* @__PURE__ */ Object.create(null);
  return { rootKey: root.key, root, state: current.state };
}
async function createCategory(key, name, log, options = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  const label = String(name || "").trim();
  if (!label || label.length > CATEGORY_NAME_MAX)
    return categoryError("error.category.name", "\u5206\u7C7B\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u4E0D\u80FD\u8D85\u8FC7 24 \u4E2A\u5B57\u7B26");
  if (ready.state.categories[ready.rootKey].some((item) => item.name === label))
    return categoryError("error.category.duplicate", `\u5DF2\u6709\u540C\u540D\u5206\u7C7B: ${label}`, { name: label });
  const category = { id: randomBytes(8).toString("hex"), name: label };
  ready.state.categories[ready.rootKey].push(category);
  ready.state.categoryOrder[ready.rootKey][category.id] = [];
  await writeManagerState(ready.state);
  if (log) log("category-create", `\u5728 ${ready.rootKey} \u6DFB\u52A0\u5206\u7C7B ${label}`);
  return { root: ready.rootKey, category };
}
async function renameCategory(key, id, name, log, options = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  const label = String(name || "").trim();
  const list = ready.state.categories[ready.rootKey];
  const category = list.find((item) => item.id === id);
  if (!category) return categoryError("error.category.notFound", "\u5206\u7C7B\u4E0D\u5B58\u5728", { id });
  if (!label || label.length > CATEGORY_NAME_MAX)
    return categoryError("error.category.name", "\u5206\u7C7B\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E14\u4E0D\u80FD\u8D85\u8FC7 24 \u4E2A\u5B57\u7B26");
  if (list.some((item) => item !== category && item.name === label))
    return categoryError("error.category.duplicate", `\u5DF2\u6709\u540C\u540D\u5206\u7C7B: ${label}`, { name: label });
  category.name = label;
  await writeManagerState(ready.state);
  if (log) log("category-rename", `\u91CD\u547D\u540D ${ready.rootKey} \u5206\u7C7B\u4E3A ${label}`);
  return { root: ready.rootKey, category };
}
async function deleteCategory(key, id, log, options = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  const list = ready.state.categories[ready.rootKey];
  if (!list.some((item) => item.id === id)) return categoryError("error.category.notFound", "\u5206\u7C7B\u4E0D\u5B58\u5728", { id });
  ready.state.categories[ready.rootKey] = list.filter((item) => item.id !== id);
  delete ready.state.categoryOrder[ready.rootKey][id];
  for (const [skillName, categoryId] of Object.entries(ready.state.categoryMembers[ready.rootKey])) {
    if (categoryId === id) delete ready.state.categoryMembers[ready.rootKey][skillName];
  }
  await writeManagerState(ready.state);
  if (log) log("category-delete", `\u5220\u9664 ${ready.rootKey} \u5206\u7C7B ${id}\uFF0C\u6280\u80FD\u7559\u5728\u672A\u5206\u7C7B`);
  return { root: ready.rootKey, id };
}
async function assignSkillCategory(key, skillName, categoryId, log, options = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  if (!validStateSkillName(skillName))
    return categoryError("error.skill.notFound", `\u6280\u80FD\u4E0D\u5B58\u5728: ${skillName}`, { name: skillName });
  if (categoryId) {
    const entry = await resolveEntry(ready.root, skillName);
    if (!entry)
      return categoryError("error.skill.notFound", `\u6280\u80FD\u4E0D\u5B58\u5728: ${skillName}`, { name: skillName });
    if (!ready.state.categories[ready.rootKey].some((item) => item.id === categoryId))
      return categoryError("error.category.notFound", "\u5206\u7C7B\u4E0D\u5B58\u5728", { id: categoryId });
    const previousId = ready.state.categoryMembers[ready.rootKey][skillName] || "";
    if (previousId !== categoryId) {
      ready.state.categoryOrder[ready.rootKey][previousId] = (ready.state.categoryOrder[ready.rootKey][previousId] || []).filter((name) => name !== skillName);
      const targetOrder = ready.state.categoryOrder[ready.rootKey][categoryId] || [];
      if (!targetOrder.includes(skillName)) targetOrder.push(skillName);
      ready.state.categoryOrder[ready.rootKey][categoryId] = targetOrder;
    }
    ready.state.categoryMembers[ready.rootKey][skillName] = categoryId;
  } else {
    const previousId = ready.state.categoryMembers[ready.rootKey][skillName] || "";
    if (previousId) {
      ready.state.categoryOrder[ready.rootKey][previousId] = (ready.state.categoryOrder[ready.rootKey][previousId] || []).filter((name) => name !== skillName);
      const looseOrder = ready.state.categoryOrder[ready.rootKey][""] || [];
      if (!looseOrder.includes(skillName)) looseOrder.push(skillName);
      ready.state.categoryOrder[ready.rootKey][""] = looseOrder;
    }
    delete ready.state.categoryMembers[ready.rootKey][skillName];
  }
  await writeManagerState(ready.state);
  if (log) log("category-assign", `${ready.rootKey}/${skillName} \u5F52\u5165 ${categoryId || "\u672A\u5206\u7C7B"}`);
  return { root: ready.rootKey, name: skillName, categoryId: categoryId || null };
}
async function moveSkillInCategory(key, skillName, categoryId, targetName, position = "before", log, options = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  if (!validStateSkillName(skillName))
    return categoryError("error.skill.notFound", `\u6280\u80FD\u4E0D\u5B58\u5728: ${skillName}`, { name: skillName });
  if (categoryId && !ready.state.categories[ready.rootKey].some((item) => item.id === categoryId))
    return categoryError("error.category.notFound", "\u5206\u7C7B\u4E0D\u5B58\u5728", { id: categoryId });
  if (position !== "before" && position !== "after")
    return categoryError("error.category.position", "\u6280\u80FD\u6392\u5E8F\u4F4D\u7F6E\u65E0\u6548");
  const entries = (await scanEntries(ready.root)).entries.map((entry) => entry.name);
  if (!entries.includes(skillName))
    return categoryError("error.skill.notFound", `\u6280\u80FD\u4E0D\u5B58\u5728: ${skillName}`, { name: skillName });
  if (targetName && (!validStateSkillName(targetName) || !entries.includes(targetName)))
    return categoryError("error.skill.notFound", `\u6392\u5E8F\u76EE\u6807\u4E0D\u5B58\u5728: ${targetName}`, { name: targetName });
  const members = ready.state.categoryMembers[ready.rootKey];
  const orders = ready.state.categoryOrder[ready.rootKey];
  const previousId = members[skillName] || "";
  const orderedNames = (id) => {
    const available = entries.filter((name) => (members[name] || "") === id).sort((a, b) => a.localeCompare(b));
    const availableSet = new Set(available);
    const saved = (orders[id] || []).filter((name) => availableSet.has(name));
    return [...saved, ...available.filter((name) => !saved.includes(name))];
  };
  if (targetName && (members[targetName] || "") !== categoryId)
    return categoryError("error.category.target", "\u6392\u5E8F\u76EE\u6807\u4E0D\u5C5E\u4E8E\u76EE\u6807\u5206\u7C7B", { name: targetName, category: categoryId });
  const sourceOrder = orderedNames(previousId).filter((name) => name !== skillName);
  const targetOrder = previousId === categoryId ? sourceOrder : orderedNames(categoryId).filter((name) => name !== skillName);
  let index = targetName ? targetOrder.indexOf(targetName) : -1;
  if (index < 0) index = targetOrder.length;
  else if (position === "after") index += 1;
  targetOrder.splice(index, 0, skillName);
  if (previousId !== categoryId) orders[previousId] = sourceOrder;
  orders[categoryId] = targetOrder;
  if (categoryId) members[skillName] = categoryId;
  else delete members[skillName];
  await writeManagerState(ready.state);
  if (log) log("category-order", `${ready.rootKey}/${skillName} \u79FB\u81F3 ${categoryId || "\u672A\u5206\u7C7B"} ${position} ${targetName || "\u672B\u5C3E"}`);
  return { root: ready.rootKey, name: skillName, categoryId: categoryId || null, order: targetOrder };
}
async function setCategoryEnabled(key, categoryId, enabled, log, options = {}) {
  const ready = await writableCategoryState(key, options);
  if ("ok" in ready) return ready;
  const root = ready.root;
  if (categoryId && categoryId !== "*" && !ready.state.categories[ready.rootKey].some((item) => item.id === categoryId))
    return categoryError("error.category.notFound", "\u5206\u7C7B\u4E0D\u5B58\u5728", { id: categoryId });
  const scanned = (await scanEntries(root)).entries.map((entry) => entry.name);
  const members = ready.state.categoryMembers[ready.rootKey];
  const names = categoryId === "*" ? scanned : categoryId ? Object.entries(members).filter(([, id]) => id === categoryId).map(([name]) => name) : scanned.filter((name) => !members[name]);
  const skipped = [];
  const changedNames = [];
  for (const name of names) {
    const result = await applyPolicySkillEnabled(root, name, enabled, ready.state);
    if (result && result.ok === false) {
      if (result.code === "error.skill.notLoadable" || result.code === "error.skill.noFrontmatter") skipped.push(name);
      else if (result.code !== "error.skill.notFound") return result;
      continue;
    }
    changedNames.push(name);
  }
  if (changedNames.length) await writeManagerState(ready.state);
  if (log)
    for (const name of changedNames)
      log(enabled ? "policy-enable" : "policy-disable", `${enabled ? "\u542F\u7528" : "\u505C\u7528"} ${ready.rootKey}/${name}\uFF08\u672C\u5730\u7B56\u7565\uFF0C\u6E90\u6587\u4EF6\u4E0D\u53D8\uFF09`);
  return { root: ready.rootKey, categoryId: categoryId || null, enabled: enabled === true, changed: changedNames.length, skipped };
}
async function safeExistingEntryPaths(root, name) {
  const paths = [];
  const bundle = entryPath(root, name);
  if (bundle === null) return paths;
  const flat = resolve(root, `${name}.md`);
  const bundleStat = await lstatOrNull(bundle);
  if (bundleStat && (bundleStat.isDirectory() || bundleStat.isSymbolicLink()))
    paths.push({ path: bundle, fileName: name, recursive: true });
  const flatStat = await lstatOrNull(flat);
  if (flatStat && (flatStat.isFile() || flatStat.isSymbolicLink()))
    paths.push({ path: flat, fileName: `${name}.md`, recursive: false });
  return paths;
}
async function readTrashMetadata(id) {
  if (entryPath(trashRootPath(), id) === null) return null;
  try {
    const value = JSON.parse(
      await fs.readFile(join(trashRootPath(), id, "metadata.json"), "utf8")
    );
    if (!value || value.id !== id || typeof value.name !== "string" || !Array.isArray(value.entries))
      return null;
    return value;
  } catch {
    return null;
  }
}
async function publishTrashStage(stage, finalPath, metadata, renameOptions) {
  try {
    await renameWithRetry(stage, finalPath, renameOptions);
    return { fallback: false, cleanupError: null };
  } catch (caught) {
    const error = caught;
    if (!TRANSIENT_RENAME_CODES.has(error && error.code || "")) throw error;
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
    await fs.writeFile(
      join(finalPath, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}
`,
      "utf8"
    );
  } catch (caught) {
    const error = caught;
    await fs.rm(finalPath, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
  let cleanupError = null;
  try {
    await fs.rm(stage, { recursive: true, force: true });
  } catch (caught) {
    const error = caught;
    cleanupError = error;
  }
  return { fallback: true, cleanupError };
}
function trashRootMetadata(definition) {
  if (definition.scope !== "project" && rootByKey(definition.key))
    return { key: definition.key, scope: "user", label: definition.label, ...definition.localeKey ? { localeKey: definition.localeKey } : {} };
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
  if (metadata.root.scope === "user" && rootByKey(metadata.root.key))
    return checkedWritableRootDefinition(rootByKey(metadata.root.key));
  if (metadata.root.scope !== "project" || metadata.root.kind !== "project-dsh" || typeof metadata.root.key !== "string" || typeof metadata.root.projectRoot !== "string" || !isAbsolute(metadata.root.projectRoot))
    return {
      ok: false,
      error: `\u56DE\u6536\u7AD9\u6761\u76EE\u6765\u6E90\u975E\u6CD5: ${metadata.id}`,
      code: "error.trash.invalid",
      params: { id: metadata.id }
    };
  const target = await projectRootForRecord(metadata.root.projectRoot, options.registeredWorkspaces);
  if (!("root" in target)) return target;
  const scopedRoots = options.projectCwds === void 0 ? null : await projectRoots(options.projectCwds);
  const root = target.root.key === metadata.root.key && (!scopedRoots || scopedRoots.some((item) => item.key === target.root.key)) ? target.root : null;
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
  const resolved = await resolveEntry(definition, name);
  if (resolved === null && !options.repositoryEntryOnly)
    return {
      ok: false,
      error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`,
      code: "error.skill.notFound",
      params: { name }
    };
  const targets = (await safeExistingEntryPaths(definition.path, name)).filter((target) => !options.repositoryEntryOnly || target.fileName === name);
  if (!targets.length) return { ok: false, error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`, code: "error.skill.notFound", params: { name } };
  if (definition.key === "agents") {
    for (const target of targets) {
      if ((await lstatOrNull(target.path))?.isSymbolicLink())
        return { ok: false, error: `\u6280\u80FD\u76EE\u5F55\u4E0D\u5B89\u5168\uFF0C\u62D2\u7EDD\u5199\u5165: ${target.path}`, code: "error.root.unsafe", params: { path: target.path } };
    }
  }
  const id = options.repositoryTrash?.id || options.catalogTrash?.id || `${Date.now()}-${randomUUID()}`;
  if (!/^\d+-[a-f0-9-]{36}$/.test(id)) throw codedError("\u56DE\u6536\u7AD9\u6761\u76EE\u7F16\u53F7\u975E\u6CD5", "error.trash.invalid", { id });
  const trashRoot = trashRootPath();
  const stage = join(trashRoot, `.stage-${randomUUID()}`);
  const finalPath = join(trashRoot, id);
  const moved = [];
  await fs.mkdir(stage, { recursive: true });
  try {
    for (const target of targets) {
      const destination = join(stage, target.fileName);
      const transferred = await movePathWithFallback(
        target.path,
        destination,
        options.renameOptions
      );
      if (transferred.cleanupError && log)
        log(
          "trash-source-warning",
          `\u6280\u80FD\u5DF2\u8DE8\u76D8\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C\u4F46\u6E90\u76D8\u9690\u85CF\u526F\u672C\u7B49\u5F85\u540E\u7EED\u6E05\u7406: ${transferred.quarantine}\uFF08${transferred.cleanupError.message || transferred.cleanupError}\uFF09`
        );
      moved.push({ ...target, destination });
    }
    const metadata = {
      version: 2,
      id,
      name,
      deletedAt: (/* @__PURE__ */ new Date()).toISOString(),
      entries: moved.map((item) => item.fileName),
      root: trashRootMetadata(definition),
      ...options.repositoryTrash ? { repository: options.repositoryTrash.repository } : {},
      ...options.catalogTrash ? { catalog: options.catalogTrash.ids } : {}
    };
    await fs.writeFile(
      join(stage, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}
`,
      "utf8"
    );
    const published = await publishTrashStage(
      stage,
      finalPath,
      metadata,
      options.renameOptions
    );
    if (published.cleanupError && log)
      log(
        "trash-stage-warning",
        `\u56DE\u6536\u7AD9\u5DF2\u53D1\u5E03\uFF0C\u4F46\u4E34\u65F6\u76EE\u5F55\u7B49\u5F85\u540E\u7EED\u6E05\u7406: ${stage}\uFF08${published.cleanupError.message || published.cleanupError}\uFF09`
      );
    if (log) log("trash", `\u79FB\u5230\u56DE\u6536\u7AD9 ${name} -> ${finalPath}`);
    return { id, name, deletedAt: metadata.deletedAt, root: metadata.root };
  } catch (caught) {
    const error = caught;
    const rollbackFailures = [];
    for (const item of moved.reverse()) {
      try {
        await movePathWithFallback(
          item.destination,
          item.path,
          options.renameOptions
        );
      } catch (caught2) {
        const rollbackError = caught2;
        rollbackFailures.push({
          path: item.destination,
          error: String(
            rollbackError && rollbackError.message ? rollbackError.message : rollbackError
          )
        });
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
  return result.sort(
    (a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt))
  );
}
async function restoreTrash(id, log, options = {}) {
  const metadata = await readTrashMetadata(id);
  if (!metadata)
    return {
      ok: false,
      error: `\u56DE\u6536\u7AD9\u6761\u76EE\u4E0D\u5B58\u5728: ${id}`,
      code: "error.trash.notFound",
      params: { id }
    };
  const definition = await restoreRootDefinition(metadata, options);
  if (!definition || definition.ok === false)
    return definition || readonlyError("restore");
  const root = definition.path;
  const conflicts = await safeExistingEntryPaths(root, metadata.name);
  if (conflicts.length)
    return {
      ok: false,
      error: `\u65E0\u6CD5\u6062\u590D\uFF0C\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728: ${metadata.name}`,
      code: "error.trash.conflict",
      params: { name: metadata.name }
    };
  await fs.mkdir(root, { recursive: true });
  const itemRoot = join(trashRootPath(), id);
  const moved = [];
  let committed = false;
  try {
    for (const fileName of metadata.entries) {
      const source = join(itemRoot, fileName);
      const destination = join(root, fileName);
      if (!isSameOrDescendant(itemRoot, source) || !isSameOrDescendant(root, destination))
        throw codedError("\u56DE\u6536\u7AD9\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5", "error.trash.invalid", { id });
      await movePathWithFallback(source, destination, options.renameOptions);
      moved.push({ source, destination });
    }
    if (options.repositoryRestore) {
      await fs.rename(itemRoot, join(trashRootPath(), `.restored-${id}`));
    } else await fs.rm(itemRoot, { recursive: true, force: true });
    committed = true;
    if (log) log("restore", `\u4ECE\u56DE\u6536\u7AD9\u6062\u590D ${metadata.name} -> ${root}`);
    return { id, name: metadata.name, root: trashRootMetadata(definition) };
  } catch (caught) {
    const error = caught;
    if (committed) throw error;
    for (const item of moved.reverse())
      await movePathWithFallback(
        item.destination,
        item.source,
        options.renameOptions
      ).catch(() => void 0);
    throw error;
  }
}
async function forgetCategoryMember(metadata) {
  const key = metadata.root?.key;
  if (!key || !validStateSkillName(metadata.name)) return;
  const current = await readManagerState();
  if (current.writable === false) return;
  const members = current.state.categoryMembers[key];
  const orders = current.state.categoryOrder[key];
  const hasMember = !!(members && members[metadata.name]);
  const hasOrder = !!(orders && Object.values(orders).some((names) => names.includes(metadata.name)));
  if (!hasMember && !hasOrder) return;
  if (members) delete members[metadata.name];
  if (orders) {
    for (const id of Object.keys(orders))
      orders[id] = orders[id].filter((name) => name !== metadata.name);
  }
  await writeManagerState(current.state);
}
async function permanentlyDeleteTrash(id, log) {
  const metadata = await readTrashMetadata(id);
  if (!metadata)
    return {
      ok: false,
      error: `\u56DE\u6536\u7AD9\u6761\u76EE\u4E0D\u5B58\u5728: ${id}`,
      code: "error.trash.notFound",
      params: { id }
    };
  await fs.rm(join(trashRootPath(), id), { recursive: true, force: true });
  await forgetCategoryMember(metadata);
  if (log) log("trash-delete", `\u6C38\u4E45\u5220\u9664\u56DE\u6536\u7AD9\u6761\u76EE ${metadata.name} (${id})`);
  return { id, name: metadata.name };
}
async function analyzeSource(source) {
  let st;
  try {
    st = await fs.lstat(source);
  } catch {
    return {
      kind: "none",
      error: `\u8DEF\u5F84\u4E0D\u5B58\u5728: ${source}`,
      code: "error.source.notFound",
      params: { path: source }
    };
  }
  if (st.isSymbolicLink())
    return {
      kind: "none",
      error: `\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${source}`,
      code: "error.source.symlink",
      params: { path: source }
    };
  if (st.isDirectory()) {
    const sk = join(source, "SKILL.md");
    const skSt = await lstatOrNull(sk);
    if (skSt && skSt.isSymbolicLink())
      return {
        kind: "none",
        error: `\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${sk}`,
        code: "error.source.symlink",
        params: { path: sk }
      };
    if (skSt && skSt.isFile()) {
      return {
        kind: "single",
        rawName: basename(source),
        kebab: toKebab(basename(source)),
        source,
        isDir: true,
        skillFile: sk
      };
    }
    return { kind: "batch", rawName: basename(source), source, isDir: true };
  }
  if (st.isFile() && source.toLowerCase().endsWith(".md")) {
    if (basename(source).toLowerCase() === "skill.md") {
      const parent = dirname(source);
      return {
        kind: "single",
        rawName: basename(parent),
        kebab: toKebab(basename(parent)),
        source: parent,
        isDir: true,
        skillFile: source
      };
    }
    const rawName = basename(source).slice(0, -3);
    return {
      kind: "single",
      rawName,
      kebab: toKebab(rawName),
      source,
      isDir: false,
      skillFile: source
    };
  }
  return {
    kind: "none",
    error: `\u65E0\u6CD5\u8BC6\u522B\u7684 skill \u6765\u6E90: ${source}`,
    code: "error.source.unrecognized",
    params: { path: source }
  };
}
async function collectCandidates(dir) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const it of items) {
    if (it.isSymbolicLink())
      throw codedError(
        `\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${join(dir, it.name)}`,
        "error.source.symlink",
        { path: join(dir, it.name) }
      );
    if (it.isDirectory()) {
      const sk = join(dir, it.name, "SKILL.md");
      const st = await lstatOrNull(sk);
      if (st && st.isSymbolicLink())
        throw codedError(
          `\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${sk}`,
          "error.source.symlink",
          { path: sk }
        );
      if (st && st.isFile()) {
        out.push({
          source: join(dir, it.name),
          kebab: toKebab(it.name),
          rawName: it.name,
          isDir: true
        });
      }
    } else if (it.isFile() && it.name.toLowerCase().endsWith(".md") && it.name.toLowerCase() !== "skill.md") {
      out.push({
        source: join(dir, it.name),
        kebab: toKebab(it.name.slice(0, -3)),
        rawName: it.name.slice(0, -3),
        isDir: false
      });
    }
  }
  return out;
}
async function assertNoSymbolicLinks(source) {
  const pending = [{ path: source, depth: 0 }];
  while (pending.length) {
    const current = pending.pop();
    if (current.depth > MAX_SOURCE_DEPTH)
      throw codedError(
        `skill \u6765\u6E90\u76EE\u5F55\u5C42\u7EA7\u8D85\u8FC7 ${MAX_SOURCE_DEPTH} \u5C42: ${source}`,
        "error.source.tooDeep",
        { depth: MAX_SOURCE_DEPTH, path: source }
      );
    const st = await fs.lstat(current.path);
    if (st.isSymbolicLink())
      throw codedError(
        `\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${current.path}`,
        "error.source.symlink",
        { path: current.path }
      );
    if (!st.isDirectory()) continue;
    const items = await fs.readdir(current.path, { withFileTypes: true });
    for (const item of items) {
      const path = join(current.path, item.name);
      if (item.isSymbolicLink())
        throw codedError(
          `\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: ${path}`,
          "error.source.symlink",
          { path }
        );
      if (item.isDirectory()) pending.push({ path, depth: current.depth + 1 });
    }
  }
}
function temporaryPath(target, kind) {
  return join(
    dirname(target),
    `.${basename(target)}.dssm-${kind}-${randomUUID()}`
  );
}
async function preflightCandidates(pending, conflicts, failed) {
  for (const group of [pending, conflicts]) {
    for (let i = group.length - 1; i >= 0; i--) {
      const candidate = group[i];
      try {
        await assertNoSymbolicLinks(candidate.source);
      } catch (caught) {
        const error = caught;
        failed.push(
          attachCode(
            {
              source: candidate.source,
              error: String(error && error.message ? error.message : error)
            },
            error
          )
        );
        group.splice(i, 1);
      }
    }
  }
}
async function copyToTemporary(source, target, isDir) {
  const temp = temporaryPath(target, "stage");
  try {
    await assertNoSymbolicLinks(source);
    if (isDir)
      await fs.cp(source, temp, { recursive: true, dereference: false });
    else await fs.copyFile(source, temp);
    await assertNoSymbolicLinks(temp);
    return temp;
  } catch (caught) {
    const error = caught;
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
  } catch (caught) {
    const error = caught;
    await fs.rm(stage, { recursive: true, force: true }).catch(() => void 0);
    const rollbackFailures = [];
    for (const item of backups.reverse()) {
      try {
        await fs.rename(item.backup, item.path);
      } catch (caught2) {
        const rollbackError = caught2;
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
    } catch (caught) {
      const error = caught;
      warnings.push({
        code: "warning.backupUncleaned",
        params: {
          path: item.backup,
          error: String(error && error.message ? error.message : error)
        },
        error: `\u65E7\u7248\u672C\u5907\u4EFD\u672A\u6E05\u7406: ${item.backup}\uFF08${String(error && error.message ? error.message : error)}\uFF09`
      });
    }
  }
  return warnings;
}
async function importSkill(source, log, options = {}) {
  const requestedRoot = Object.prototype.hasOwnProperty.call(options, "root") ? options.root : rootByKey("dsh");
  const definition = await checkedWritableRootDefinition(requestedRoot);
  if (definition && definition.ok === false) return definition;
  if (!definition) return readonlyError("create");
  const targetRoot = definition.path;
  const conflict = options.conflict === "overwrite" ? "overwrite" : "skip";
  const dryRun = options.dryRun === true;
  const analysis = await analyzeSource(source);
  if (analysis.kind === "none")
    return {
      ok: false,
      error: analysis.error || "\u65E0\u6CD5\u8BC6\u522B\u7684 skill \u6765\u6E90",
      code: analysis.code || "error.source.unrecognized",
      params: analysis.params
    };
  if (await pathsOverlap(analysis.source, targetRoot))
    return {
      ok: false,
      error: "\u5BFC\u5165\u6765\u6E90\u4E0D\u80FD\u4E0E DSH \u6280\u80FD\u76EE\u5F55\u76F8\u540C\u3001\u5305\u542B\u6216\u4F4D\u4E8E\u5176\u4E2D",
      code: "error.import.overlap"
    };
  let candidates = [];
  if (analysis.kind === "single") {
    candidates = [
      {
        source: analysis.source,
        kebab: analysis.kebab,
        rawName: analysis.rawName,
        isDir: analysis.isDir
      }
    ];
  } else {
    try {
      candidates = await collectCandidates(source);
    } catch (caught) {
      const error = caught;
      return attachCode(
        {
          ok: false,
          error: String(error && error.message ? error.message : error)
        },
        error
      );
    }
    if (candidates.length === 0)
      return {
        ok: false,
        error: `\u76EE\u5F55\u4E0B\u672A\u627E\u5230\u4EFB\u4F55 skill \u6761\u76EE\uFF08\u9700\u542B SKILL.md \u7684\u5B50\u76EE\u5F55\u6216 .md \u6587\u4EF6\uFF09: ${source}`,
        code: "error.import.emptySource",
        params: { path: source }
      };
  }
  const pending = [];
  const conflicts = [];
  const failed = [];
  const imported = [];
  const skipped = [];
  const nameCount = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    if (candidate.kebab && KEBAB_RE.test(candidate.kebab) && entryPath(targetRoot, candidate.kebab) !== null)
      nameCount.set(candidate.kebab, (nameCount.get(candidate.kebab) || 0) + 1);
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
      failed.push({
        source: c.source,
        error: `\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 kebab-case \u540D\u79F0\uFF08\u539F\u59CB\u540D: ${c.rawName || basename(c.source)}\uFF09`,
        code: "error.import.invalidName",
        params: { name: c.rawName || basename(c.source) }
      });
      continue;
    }
    if (nameCount.get(c.kebab) > 1) {
      failed.push({
        source: c.source,
        error: `\u6279\u91CF\u6765\u6E90\u4E2D\u5B58\u5728\u591A\u4E2A\u540C\u540D\u63D2\u4EF6: ${c.kebab}`,
        code: "error.import.duplicateName",
        params: { name: c.kebab }
      });
      continue;
    }
    const dest = c.isDir ? join(targetRoot, c.kebab) : join(targetRoot, `${c.kebab}.md`);
    const paths = [
      join(targetRoot, c.kebab),
      join(targetRoot, `${c.kebab}.md`)
    ];
    const existing = [];
    for (const path of paths) {
      try {
        await fs.stat(path);
        existing.push(path);
      } catch {
      }
    }
    if (existing.length) {
      conflicts.push({
        name: c.kebab,
        source: c.source,
        isDir: c.isDir,
        paths: existing
      });
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
  if (!dryRun && options.beforeImport) await options.beforeImport(pending, conflicts, failed);
  if (pending.length > 0 || conflict === "overwrite" && conflicts.length > 0) {
    await fs.mkdir(targetRoot, { recursive: true });
  }
  for (const p of pending) {
    try {
      const warnings = await replaceWithCopy(p.source, p.dest, p.isDir);
      imported.push({ name: p.name, overwritten: false, warnings });
      if (log) log("import", `\u5BFC\u5165 ${p.source} -> ${p.dest}`);
    } catch (caught) {
      const e = caught;
      failed.push(
        attachCode(
          { source: p.source, error: String(e && e.message ? e.message : e) },
          e
        )
      );
    }
  }
  if (conflict === "overwrite") {
    for (const c of conflicts) {
      try {
        const dest = c.isDir ? join(targetRoot, c.name) : join(targetRoot, `${c.name}.md`);
        const warnings = await replaceWithCopy(
          c.source,
          dest,
          c.isDir,
          c.paths
        );
        imported.push({ name: c.name, overwritten: true, warnings });
        if (log) log("import-overwrite", `\u8986\u76D6\u5BFC\u5165 ${c.source} -> ${dest}`);
      } catch (caught) {
        const e = caught;
        failed.push(
          attachCode(
            { source: c.source, error: String(e && e.message ? e.message : e) },
            e
          )
        );
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
    throw codedError(`\u4E0A\u4F20\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5: ${raw}`, "error.upload.path", {
      path: raw
    });
  }
  const directory = raw.endsWith("/");
  const parts = raw.split("/").filter(
    (part, index, all) => directory && index === all.length - 1 ? false : true
  );
  if (!parts.length || parts.length > MAX_SOURCE_DEPTH || parts.some(
    (part) => !part || part === "." || part === ".." || part.length > MAX_ENTRY_NAME_LENGTH || WINDOWS_DEVICE_NAME_RE.test(part)
  )) {
    throw codedError(`\u4E0A\u4F20\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5: ${raw}`, "error.upload.path", {
      path: raw
    });
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
  if (decodedLength > maxBytes)
    throw codedError(`\u4E0A\u4F20\u5185\u5BB9\u8D85\u8FC7 ${maxBytes} \u5B57\u8282\u9650\u5236`, code, {
      limit: maxBytes
    });
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
  return attachCode(
    {
      ok: false,
      error: String(error && error.message ? error.message : error)
    },
    error
  );
}
async function writeUploadedEntries(contentRoot, entries) {
  if (!Array.isArray(entries) || entries.length === 0)
    throw codedError("\u4E0A\u4F20\u5185\u5BB9\u4E3A\u7A7A", "error.upload.empty");
  if (entries.length > MAX_UPLOAD_ENTRIES)
    throw codedError(
      `\u4E0A\u4F20\u6761\u76EE\u8D85\u8FC7 ${MAX_UPLOAD_ENTRIES} \u4E2A`,
      "error.upload.tooMany",
      { limit: MAX_UPLOAD_ENTRIES }
    );
  let total = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    const normalized = normalizeUploadPath(entry && entry.path);
    const key = normalized.path.toLowerCase();
    if (seen.has(key))
      throw codedError(
        `\u4E0A\u4F20\u5185\u5BB9\u5305\u542B\u91CD\u590D\u8DEF\u5F84: ${normalized.path}`,
        "error.upload.duplicate",
        { path: normalized.path }
      );
    seen.add(key);
    if (normalized.directory) continue;
    const bytes = decodeUploadBase64(
      entry && entry.data,
      MAX_UPLOAD_ENTRY_BYTES
    );
    total += bytes.length;
    if (total > MAX_UPLOAD_TOTAL_BYTES)
      throw codedError(
        `\u4E0A\u4F20\u5185\u5BB9\u603B\u5927\u5C0F\u8D85\u8FC7 ${MAX_UPLOAD_TOTAL_BYTES} \u5B57\u8282`,
        "error.upload.tooLarge",
        { limit: MAX_UPLOAD_TOTAL_BYTES }
      );
    const target = join(contentRoot, ...normalized.path.split("/"));
    if (!isSameOrDescendant(contentRoot, target))
      throw codedError(
        `\u4E0A\u4F20\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5: ${normalized.path}`,
        "error.upload.path",
        { path: normalized.path }
      );
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}
async function writeUploadedZip(contentRoot, encoded) {
  const archive = decodeUploadBase64(
    encoded,
    MAX_UPLOAD_ARCHIVE_BYTES,
    "error.upload.archiveTooLarge"
  );
  let count = 0;
  let total = 0;
  let files;
  try {
    files = unzipSync(archive, {
      filter(info) {
        const normalized = normalizeUploadPath(info.name);
        count += 1;
        if (count > MAX_UPLOAD_ENTRIES)
          throw codedError(
            `ZIP \u6761\u76EE\u8D85\u8FC7 ${MAX_UPLOAD_ENTRIES} \u4E2A`,
            "error.upload.tooMany",
            { limit: MAX_UPLOAD_ENTRIES }
          );
        if (!normalized.directory && info.originalSize > MAX_UPLOAD_ENTRY_BYTES)
          throw codedError(
            `ZIP \u6761\u76EE\u8FC7\u5927: ${normalized.path}`,
            "error.upload.tooLarge",
            { limit: MAX_UPLOAD_ENTRY_BYTES }
          );
        total += normalized.directory ? 0 : info.originalSize;
        if (total > MAX_UPLOAD_TOTAL_BYTES)
          throw codedError(
            `ZIP \u89E3\u538B\u540E\u603B\u5927\u5C0F\u8D85\u8FC7 ${MAX_UPLOAD_TOTAL_BYTES} \u5B57\u8282`,
            "error.upload.tooLarge",
            { limit: MAX_UPLOAD_TOTAL_BYTES }
          );
        return !normalized.directory;
      }
    });
  } catch (caught) {
    const error = caught;
    if (error && /^error\./.test(String(error.code || ""))) throw error;
    throw codedError(
      `ZIP \u65E0\u6CD5\u89E3\u538B: ${String(error && error.message ? error.message : error)}`,
      "error.upload.zipInvalid"
    );
  }
  const entries = Object.entries(files).map(([path, bytes]) => ({
    path,
    data: Buffer.from(bytes).toString("base64")
  }));
  await writeUploadedEntries(contentRoot, entries);
}
async function prepareUploadedSource(sessionRoot, input) {
  const contentRoot = join(sessionRoot, "content");
  await fs.mkdir(contentRoot, { recursive: true });
  if (input && input.zip !== void 0)
    await writeUploadedZip(contentRoot, input.zip);
  else await writeUploadedEntries(contentRoot, input && input.entries);
  const rootSkill = join(contentRoot, "SKILL.md");
  const rootSkillStat = await lstatOrNull(rootSkill);
  if (!rootSkillStat || !rootSkillStat.isFile()) return contentRoot;
  const doc = parseSkillDoc(await fs.readFile(rootSkill, "utf8"));
  const fallback = String(input && input.name || "uploaded-skill").replace(/\.zip$/i, "").replace(/^skill\.md$/i, "uploaded-skill");
  const skillName = toKebab(doc.map.name || fallback);
  if (!skillName || !KEBAB_RE.test(skillName) || entryPath(contentRoot, skillName) === null) {
    throw codedError(
      `\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 kebab-case \u540D\u79F0\uFF08\u539F\u59CB\u540D: ${doc.map.name || fallback}\uFF09`,
      "error.import.invalidName",
      { name: doc.map.name || fallback }
    );
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
  } catch (caught) {
    const error = caught;
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
  if (!name || !KEBAB_RE.test(name) || entryPath(root, name) === null)
    return {
      ok: false,
      error: `\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 kebab-case \u540D\u79F0\uFF08\u539F\u59CB\u540D: ${requestedName}\uFF09`,
      code: "error.import.invalidName",
      params: { name: requestedName }
    };
  if (!description)
    return {
      ok: false,
      error: "\u6280\u80FD\u7B80\u4ECB\u4E0D\u80FD\u4E3A\u7A7A",
      code: "error.create.descriptionRequired"
    };
  if (!body)
    return {
      ok: false,
      error: "\u6280\u80FD\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A",
      code: "error.create.bodyRequired"
    };
  if (description.length > 500 || body.length > 1 << 18)
    return { ok: false, error: "\u6280\u80FD\u5185\u5BB9\u8FC7\u957F", code: "error.create.tooLarge" };
  if (await safeExistingEntryPaths(root, name).then((items) => items.length > 0))
    return {
      ok: false,
      error: `\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728: ${name}`,
      code: "error.create.conflict",
      params: { name }
    };
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
  } catch (caught) {
    const error = caught;
    await fs.rm(stage, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
  if (log) log("create", `\u521B\u5EFA ${join(target, "SKILL.md")}`);
  return { name, path: join(target, "SKILL.md"), root: definition.key };
}
async function skillDetail(key, name, options = {}) {
  const scopedRoots = await projectRoots(options.projectCwds);
  const root = options.workspaceBound ? scopedRoots.find((item) => item.key === key) : rootByKey(key) || scopedRoots.find((item) => item.key === key);
  if (!root)
    return {
      ok: false,
      error: `\u672A\u77E5\u6280\u80FD\u6765\u6E90: ${key}`,
      code: "error.root.unknown",
      params: { root: key }
    };
  const entry = await visibleEntryForRoot(root, name);
  if (!entry)
    return {
      ok: false,
      error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`,
      code: "error.skill.notFound",
      params: { name }
    };
  let raw;
  try {
    raw = await fs.readFile(entry.realDocPath || entry.docPath, "utf8");
  } catch {
    return {
      ok: false,
      error: `\u6280\u80FD\u4E0D\u5B58\u5728: ${name}`,
      code: "error.skill.notFound",
      params: { name }
    };
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
    document: raw,
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
  const userScans = await scanDeduplicatedRoots(user);
  const items = user.flatMap(
    (root) => userScans.get(root.key).entries.map((entry) => ({ root, entry, policy: effectiveSkillPolicy(policyResult, root, entry) }))
  );
  const cwd = options && typeof options.cwd === "string" ? options.cwd : void 0;
  if (cwd) {
    const roots = await projectRoots([cwd]);
    for (const root of roots) {
      const scanned = (await scanDeduplicatedRoots([root])).get(root.key);
      for (const entry of scanned.entries) items.push({ root, entry, policy: effectiveSkillPolicy(policyResult, root, entry) });
    }
  }
  for (const group of groupLoadableSkillsByName(items).values()) {
    const { root, entry, policy } = selectSkillWinner(group);
    const hasNativeCopy = group.some(({ root: root2, entry: entry2 }) => root2.native || entry2.policyAliases?.some((alias) => user.some((item) => item.key === alias.rootKey && item.native)));
    const hasExplicitDisable = group.some((item) => item.policy.override === false);
    if (!hasNativeCopy && !hasExplicitDisable && !policy.sourceEnabled) continue;
    const project = root.scope === "project";
    const policyOnly = root.mutable && root.key !== "agents";
    const overlayRank = group.length > 1 ? Math.min(...group.map((item) => Math.min(item.root.rank, item.entry.providerRank ?? item.root.rank))) - 1 : void 0;
    const needsOverlay = !policyOnly || group.length > 1 || policy.override !== void 0 || !entry.invocationPolicyValid || policyResult.writable === false;
    if (!needsOverlay) continue;
    candidates.push({
      name: canonicalSkillName({ root, entry, policy }),
      description: entry.description,
      invocation: {
        modelInvocable: policy.modelInvocable,
        userInvocable: policy.userInvocable
      },
      provider: "dsh-skills-manager-external",
      source: project ? root.kind : root.key === "dsh" ? "user-dsh" : `agent-${root.key}`,
      rank: overlayRank ?? (project ? root.rank - 1 : root.key === "dsh" ? USER_DSH_POLICY_RANK : entry.providerRank ?? root.rank),
      locator: {
        rootKey: root.key,
        entryName: entry.name,
        path: entry.docPath,
        realEntryPath: entry.realEntryPath,
        realDocPath: entry.realDocPath
      },
      resourceBase: {
        kind: "directory",
        path: entry.kind === "bundle" ? entry.realEntryPath : root.path
      },
      path: entry.docPath,
      metadata: {
        dshSkillsManager: {
          root: root.key,
          readOnly: !root.mutable,
          sourceReadOnly: !root.mutable,
          policyOnly
        }
      }
    });
  }
  return candidates;
}
async function getProviderSkill(candidate, options = {}) {
  const locator = candidate && candidate.locator;
  if (!locator || typeof locator.path !== "string" || typeof locator.rootKey !== "string" || typeof locator.realEntryPath !== "string" || typeof locator.realDocPath !== "string")
    return void 0;
  let root = rootByKey(locator.rootKey);
  if (!root && PROJECT_ROOT_KEY_RE.test(locator.rootKey) && typeof options.cwd === "string") {
    root = (await projectRoots([options.cwd])).find(
      (item) => item.key === locator.rootKey
    );
  }
  if (!root) return void 0;
  try {
    const entry = await resolveEntry(root, String(locator.entryName || ""));
    if (!entry || resolve(entry.docPath) !== resolve(locator.path))
      return void 0;
    if (pathIdentity(entry.realEntryPath) !== pathIdentity(locator.realEntryPath))
      return void 0;
    if (pathIdentity(entry.realDocPath) !== pathIdentity(locator.realDocPath))
      return void 0;
    const doc = parseSkillDoc(
      await fs.readFile(entry.realDocPath || entry.docPath, "utf8")
    );
    const summary = entryOf(locator.entryName, entry.kind, entry.docPath, doc);
    if (!summary.loadable) return void 0;
    const invocationName = KEBAB_RE.test(summary.declaredName) ? summary.declaredName : toKebab(summary.declaredName);
    if (invocationName !== candidate.name && summary.declaredName !== candidate.name) return void 0;
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
  const declared = item.entry.declaredName || "";
  if (KEBAB_RE.test(declared)) return declared;
  const kebab = toKebab(declared);
  return kebab || declared || item.entry.name;
}
function groupLoadableSkillsByName(items) {
  const groups = /* @__PURE__ */ new Map();
  const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  for (const item of [...items].sort(
    (a, b) => a.root.rank - b.root.rank || Number(b.root.scope === "project") - Number(a.root.scope === "project") || compareText(a.root.key, b.root.key) || compareText(a.entry.name, b.entry.name)
  )) {
    if (!item.entry.loadable) continue;
    const name = canonicalSkillName(item);
    const group = groups.get(name) || [];
    group.push(item);
    groups.set(name, group);
  }
  return groups;
}
function isCopyDisabled(item) {
  return !item.policy.sourceEnabled || item.policy.override === false;
}
function selectSkillWinner(group) {
  return group.find((item) => !isCopyDisabled(item)) || group[0];
}
function markWinners(items) {
  const winners = /* @__PURE__ */ new Map();
  for (const [canonicalName, group] of groupLoadableSkillsByName(items)) {
    const winner = selectSkillWinner(group);
    winners.set(canonicalName, winner);
    for (const item of group) {
      delete item.view.winner;
      delete item.view.shadowedBy;
      delete item.view.fallbackTo;
      delete item.view.enabled;
      if (isCopyDisabled(item)) {
        item.view.enabled = false;
        if (item !== winner && (winner.policy.modelInvocable || winner.policy.userInvocable)) {
          item.view.fallbackTo = { root: winner.root.key, name: winner.entry.name, scope: winner.root.scope || "user" };
        }
      } else if (item !== winner) {
        item.view.shadowedBy = { root: winner.root.key, name: winner.entry.name };
      }
    }
    if (!isCopyDisabled(winner)) winner.view.winner = true;
    winner.view.enabled = winner.policy.enabled;
    winner.view.canonicalName = canonicalName;
  }
  return winners;
}
async function listWorkspaces(registered) {
  const paths = Array.isArray(registered) ? registered.filter((item) => typeof item === "string" && isAbsolute(item)) : [];
  const rows = /* @__PURE__ */ new Map();
  for (const path of paths) {
    const found = await nearestProjectRoot(path);
    if (!found || !found.root) {
      const key2 = `missing:${pathIdentity(path)}`;
      if (!rows.has(key2))
        rows.set(key2, { name: basename(path) || path, path, registeredPaths: [path], available: false, skillCount: 0, roots: [] });
      continue;
    }
    const key = pathIdentity(found.root);
    const existing = rows.get(key);
    if (existing) {
      if (!existing.registeredPaths.some((item) => sameWorkspace(item, path))) existing.registeredPaths.push(path);
      continue;
    }
    rows.set(key, {
      name: basename(found.root) || found.root,
      path: found.root,
      projectRoot: found.root,
      registeredPaths: [path],
      available: true,
      skillCount: 0,
      roots: await projectRoots([found.cwd])
    });
  }
  for (const row of rows.values()) {
    if (row.roots.length) {
      const scans = await scanDeduplicatedRoots(row.roots, { metadataOnly: true });
      row.skillCount = [...scans.values()].reduce((total, scan) => total + scan.entries.length, 0);
    }
  }
  return [...rows.values()].map(({ roots: _roots, ...row }) => row).sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}
async function workspaceSkills(workspace, registered) {
  const unregistered = { ok: false, error: "\u8BF7\u9009\u62E9\u5DF2\u767B\u8BB0\u7684\u5DE5\u4F5C\u533A", code: "error.workspace.unregistered" };
  if (typeof workspace !== "string" || !workspace.trim() || !isAbsolute(workspace.trim())) return unregistered;
  const requested = workspace.trim();
  const list = Array.isArray(registered) ? registered.filter((item) => typeof item === "string" && isAbsolute(item)) : [];
  if (!list.some((item) => sameWorkspace(item, requested))) return unregistered;
  const found = await nearestProjectRoot(requested);
  if (!found || !found.root)
    return { ok: false, error: `\u5DE5\u4F5C\u533A\u76EE\u5F55\u4E0D\u53EF\u7528: ${requested}`, code: "error.workspace.unavailable", params: { path: requested } };
  const snapshot = await state({ projectCwds: [found.cwd] });
  const identity = pathIdentity(found.root);
  const roots = snapshot.roots.filter((root) => root.scope === "project" && root.projectRoot && pathIdentity(root.projectRoot) === identity);
  return {
    project: { root: found.root, name: basename(found.root) || found.root, workspaceCwds: [found.cwd] },
    roots,
    warnings: snapshot.warnings
  };
}
async function state(options = {}) {
  const user = userRoots();
  const userScans = await scanDeduplicatedRoots(user);
  const projectWarnings = [];
  const scoped = await projectRoots(options.projectCwds, projectWarnings);
  const policyResult = await readManagerState();
  const trash = await listTrash();
  const result = {
    roots: [],
    // 创建、导入、仓库安装共用的用户级写入位置，由后端校验过可写性。
    writeDestinations: await repositoryDestinations(),
    projects: [],
    summary: { total: 0, enabled: 0, disabled: 0, issues: 0 },
    trash,
    warnings: [
      ...policyResult.warning ? [policyResult.warning] : [],
      ...projectWarnings
    ]
  };
  const all = [];
  for (const root of [...scoped, ...user]) {
    const { exists, entries, truncated } = root.scope === "project" ? (await scanDeduplicatedRoots([root])).get(root.key) : userScans.get(root.key);
    if (root.scope === "project" && !exists && root.kind !== "project-dsh")
      continue;
    if (truncated)
      result.warnings.push({
        code: "warning.scan.truncated",
        params: { path: root.path },
        error: `\u6280\u80FD\u626B\u63CF\u8FBE\u5230\u904D\u5386\u4E0A\u9650\uFF0C\u90E8\u5206\u6280\u80FD\u672A\u663E\u793A: ${root.path}`
      });
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
        path: e.docPath,
        categoryId: policyResult.state.categoryMembers[root.key]?.[e.name] || null
      });
      all.push({
        root,
        entry: e,
        managerEnabled,
        policy,
        view: skills[skills.length - 1]
      });
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
      ...root.projectRoot ? {
        projectRoot: root.projectRoot,
        projectName: root.projectName,
        workspaceCwds: root.workspaceCwds
      } : {},
      exists,
      truncated: truncated === true,
      enabled: policyResult.writable !== false && (root.kind === "project-dsh" || policyResult.state.sources[root.key] !== false),
      skills,
      categories: policyResult.state.categories[root.key] || [],
      categoryOrder: policyResult.state.categoryOrder[root.key] || {}
    });
  }
  const userItems = all.filter((item) => item.root.scope !== "project");
  markWinners(userItems);
  const projectGroups = /* @__PURE__ */ new Map();
  for (const item of all.filter(
    (candidate) => candidate.root.scope === "project"
  )) {
    const group = projectGroups.get(item.root.projectRoot) || [];
    group.push(item);
    projectGroups.set(item.root.projectRoot, group);
  }
  for (const projectItems of projectGroups.values()) {
    const userCopies = userItems.map((item) => ({
      ...item,
      view: { ...item.view }
    }));
    markWinners([...projectItems, ...userCopies]);
  }
  const seenProjects = /* @__PURE__ */ new Set();
  for (const root of result.roots.filter((item) => item.scope === "project")) {
    if (seenProjects.has(root.projectRoot)) continue;
    seenProjects.add(root.projectRoot);
    result.projects.push({
      root: root.projectRoot,
      name: root.projectName,
      workspaceCwds: root.workspaceCwds
    });
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
  assignSkillCategory,
  browseDirectories,
  checkedRepositoryRootDefinition,
  createCategory,
  createSkill,
  createWorkspaceIndex,
  deleteCategory,
  deleteSkill,
  entryPath,
  getProviderSkill,
  importSkill,
  importUploadedSkill,
  indexRegisteredWorkspaces,
  listProviderCandidates,
  listTrash,
  listWorkspaces,
  logPath,
  managerHomePath,
  managerStatePath,
  moveSkillInCategory,
  parseBoolValue,
  parseSkillDoc,
  permanentlyDeleteTrash,
  projectRootForRecord,
  projectRoots,
  readManagerState,
  renameCategory,
  renameWithRetry,
  repositoryDestinations,
  resolveAgentsHome,
  resolveDshHome,
  resolveEntry,
  resolveWorkspaceTarget,
  restoreTrash,
  scanEntries,
  setCategoryEnabled,
  setSkillEnabled,
  setSourceEnabled,
  skillDetail,
  state,
  toKebab,
  trashRootPath,
  unquote,
  userRoots,
  workspaceSkills
};
