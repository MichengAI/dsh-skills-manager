import { appendFile, rename, rm, stat, realpath } from "node:fs/promises";
import {
  state,
  setSkillEnabled,
  setSourceEnabled,
  createCategory,
  renameCategory,
  deleteCategory,
  assignSkillCategory,
  moveSkillInCategory,
  moveCategory,
  sortCategoriesByName,
  setCategoryEnabled,
  setSkillNote,
  importSkill,
  importUploadedSkill,
  browseDirectories,
  createSkill,
  skillDetail,
  listProviderCandidates,
  getProviderSkill,
  userRoots,
  setRootPath,
  addCustomSources,
  updateCustomSource,
  removeCustomSource,
  scanCustomSourceCandidates,
  projectRoots,
  resolveWorkspaceTarget,
  listWorkspaces,
  workspaceSkills,
  logPath,
  getEntryLocation,
  setEntryLocation,
  collectPresetRoots
} from "./core.js";
import { createRepositoryManager } from "./repositories.js";
import { installationSourceKey } from "./repository-updates.js";
import { attachProvenance } from "./provenance.js";
import { listClawHub, searchClawHub } from "./clawhub-catalog.js";
import { searchSkillsSh } from "./skills-sh-catalog.js";
import { loadCatalogPackage, readCatalogSkill } from "./catalog-skill.js";
const name = "skills-manager";
const inject = ["skills", "tools", "sessions"];
const CLIENT_MARKER_HEADER = "x-dsh-skills-manager";
const MAX_LOG_BYTES = 1 << 20;
const MAX_UPLOAD_BODY_BYTES = 88 << 20;
const MAX_BRIDGE_BODY_BYTES = MAX_UPLOAD_BODY_BYTES;
function makeLog() {
  const file = logPath();
  let queue = Promise.resolve();
  return async (event, detail) => {
    queue = queue.then(async () => {
      try {
        const current = await stat(file).catch(() => null);
        if (current && current.size >= MAX_LOG_BYTES) {
          await rm(`${file}.1`, { force: true });
          await rename(file, `${file}.1`);
        }
        await appendFile(file, `${JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event, detail })}
`, "utf8");
      } catch {
      }
    });
    await queue;
  };
}
async function readJsonBody(request, limit = 1 << 20) {
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) {
    const error = new Error("body too large");
    error.statusCode = 413;
    error.code = "error.proto.bodyTooLarge";
    throw error;
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (caught) {
    const e = caught;
    const error = new Error(`invalid JSON body: ${e.message}`);
    error.statusCode = 400;
    error.code = "error.proto.invalidJson";
    throw error;
  }
}
function validateMutationRequest(req) {
  const marker = req.headers.get(CLIENT_MARKER_HEADER) || req.headers.get("x-michengai-client");
  if (marker !== "1") return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden mutation request" };
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const reqHost = req.headers.get("host") || new URL(req.url).host;
      if (originHost !== reqHost) {
        return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden cross-origin mutation request" };
      }
    } catch {
      return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden origin" };
    }
  }
  const contentType = String(req.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { statusCode: 415, code: "error.proto.contentType", error: "content-type must be application/json" };
  return null;
}
function extractHostName(hostHeader) {
  if (!hostHeader) return "";
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const closeIdx = trimmed.indexOf("]");
    return closeIdx !== -1 ? trimmed.slice(1, closeIdx) : trimmed;
  }
  const firstColon = trimmed.indexOf(":");
  const lastColon = trimmed.lastIndexOf(":");
  if (firstColon !== -1 && firstColon === lastColon) {
    return trimmed.slice(0, firstColon);
  }
  return trimmed;
}
function isLoopbackHost(hostname) {
  if (!hostname) return false;
  const name2 = hostname.trim().toLowerCase();
  if (name2 === "localhost" || name2 === "localhost." || name2 === "::1") return true;
  const parts = name2.split(".");
  if (parts.length === 4 && parts[0] === "127") {
    if (parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255)) {
      return true;
    }
  }
  if (name2.startsWith("::ffff:")) {
    const rest = name2.slice(7);
    if (isLoopbackHost(rest)) return true;
    const hexMatch = rest.match(/^7f[0-9a-f]{2}:[0-9a-f]{1,4}$/i);
    if (hexMatch) return true;
  }
  return false;
}
function isLoopbackAddress(value) {
  return isLoopbackHost(extractHostName(value));
}
function sendJsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(body))
  });
  res.end(body);
}
function jsonResponse(code, payload, headOnly = false) {
  const body = JSON.stringify(payload);
  return new Response(headOnly ? null : body, {
    status: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": String(Buffer.byteLength(body))
    }
  });
}
async function runFetch(task, afterSuccess, headOnly = false) {
  try {
    const r = await task();
    if (r && typeof r === "object" && "ok" in r && r.ok === false) {
      return jsonResponse(400, r, headOnly);
    }
    if (afterSuccess) {
      try {
        afterSuccess();
      } catch {
      }
    }
    return jsonResponse(200, { ok: true, data: r }, headOnly);
  } catch (caught) {
    const e = caught;
    const status = Number.isInteger(e && e.statusCode) ? e.statusCode : 500;
    return jsonResponse(status, {
      ok: false,
      ...e && typeof e.code === "string" ? { code: e.code } : {},
      ...e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {},
      error: String(e && e.message ? e.message : e)
    }, headOnly);
  }
}
function notifyChatCatalog(ctx, invalidateSkills) {
  try {
    if (typeof invalidateSkills === "function") invalidateSkills();
  } catch {
  }
  try {
    if (typeof ctx.emit === "function") ctx.emit("commands/change");
  } catch {
  }
  try {
    const sessions = typeof ctx.get === "function" ? ctx.get("sessions") : void 0;
    const list = sessions && typeof sessions.list === "function" ? sessions.list() : [];
    for (const session of list) {
      const id = session && (session.id ?? session.header?.id);
      const preset = session && session.header && typeof session.header.agentPreset === "string" ? session.header.agentPreset : void 0;
      if (id == null || !preset || typeof ctx.emit !== "function") continue;
      ctx.emit("agent-preset/selected", id, preset);
    }
  } catch {
  }
}
function registeredWorkspacePaths(ctx) {
  try {
    const registry = typeof ctx.get === "function" ? ctx.get("workspaceRegistry") : void 0;
    if (!registry || typeof registry.list !== "function") return void 0;
    return [...registry.list()].flatMap((item) => {
      const path = item?.path ?? item?.cwd;
      return typeof path === "string" && path.trim() ? [path.trim()] : [];
    });
  } catch {
    return void 0;
  }
}
function activeSessionCwds(ctx, sessionId) {
  if (typeof sessionId !== "string" || !sessionId.trim()) return [];
  const sessions = ctx.sessions || (typeof ctx.get === "function" ? ctx.get("sessions") : void 0);
  if (!sessions) return [];
  const session = typeof sessions.get === "function" ? sessions.get(sessionId) : (typeof sessions.list === "function" ? sessions.list() : []).find((item) => (item.id ?? item.header?.id) === sessionId);
  const cwd = session?.header?.cwd;
  return typeof cwd === "string" && cwd.trim() ? [cwd.trim()] : [];
}
const PRESET_ROOTS_TTL_MS = 2e3;
const MISS_REFRESH_COOLDOWN_MS = 1500;
const presetRootsCache = /* @__PURE__ */ new WeakMap();
function invalidatePresetRootsCache(hostCtx) {
  if (hostCtx && typeof hostCtx === "object") presetRootsCache.delete(hostCtx);
}
async function getPresetRootsCached(hostCtx, forceRefresh = false) {
  if (!hostCtx || typeof hostCtx !== "object") return [];
  const now = Date.now();
  const entry = presetRootsCache.get(hostCtx);
  if (!forceRefresh && entry) {
    if (entry.roots && entry.expiresAt > now) return entry.roots;
    if (entry.pending) return entry.pending;
  }
  const pending = collectPresetRoots(hostCtx).then((roots) => {
    const doneAt = Date.now();
    presetRootsCache.set(hostCtx, { expiresAt: doneAt + PRESET_ROOTS_TTL_MS, refreshedAt: doneAt, roots });
    return roots;
  }).catch((err) => {
    presetRootsCache.delete(hostCtx);
    throw err;
  });
  presetRootsCache.set(hostCtx, { expiresAt: now + PRESET_ROOTS_TTL_MS, refreshedAt: entry?.refreshedAt ?? 0, roots: forceRefresh ? void 0 : entry?.roots, pending });
  return pending;
}
async function getPresetRootsOnMiss(hostCtx) {
  if (!hostCtx || typeof hostCtx !== "object") return [];
  const entry = presetRootsCache.get(hostCtx);
  if (entry?.roots && Date.now() - entry.refreshedAt < MISS_REFRESH_COOLDOWN_MS) {
    return entry.roots;
  }
  return getPresetRootsCached(hostCtx, true);
}
async function resolveAgentPresetScope(hostCtx, agentCtx, options = {}) {
  if (!hostCtx || !agentCtx) return options;
  const getService = typeof hostCtx.get === "function" ? hostCtx.get.bind(hostCtx) : void 0;
  const agentPresets = getService?.("agentPresets");
  const activePresetId = typeof agentPresets?.composedPreset === "function" ? agentPresets.composedPreset(agentCtx) : void 0;
  if (typeof activePresetId !== "string" || !activePresetId.trim()) return options;
  const allPresets = await getPresetRootsCached(hostCtx);
  const matchingPresets = allPresets.filter((root) => root.presetId === activePresetId && root.toggleable);
  return matchingPresets.length > 0 ? { ...options, presetRoots: matchingPresets } : options;
}
function externalSkillProvider(control, invalidators, hostCtx, agentCtx) {
  invalidators.add(control.invalidate);
  if (control.signal && typeof control.signal.addEventListener === "function") {
    control.signal.addEventListener("abort", () => {
      invalidators.delete(control.invalidate);
    }, { once: true });
  }
  return {
    name: "dsh-skills-manager-external",
    list: async (options) => listProviderCandidates(await resolveAgentPresetScope(hostCtx, agentCtx, options)),
    get: async (candidate, options) => getProviderSkill(candidate, await resolveAgentPresetScope(hostCtx, agentCtx, options))
  };
}
function registerAgentSkillProviders(ctx, invalidators) {
  if (typeof ctx.on !== "function") return () => {
  };
  const registrations = /* @__PURE__ */ new Map();
  const install = (agent) => {
    if (!agent || registrations.has(agent.id)) return;
    const agentCtx = agent.ctx;
    const skills = agentCtx && typeof agentCtx.get === "function" ? agentCtx.get("skills") : agentCtx && agentCtx.skills;
    if (!skills || typeof skills.registerProvider !== "function") return;
    const dispose = skills.registerProvider((control) => externalSkillProvider(control, invalidators, ctx, agentCtx));
    registrations.set(agent.id, dispose);
  };
  const uninstall = (agent) => {
    if (!agent) return;
    const dispose = registrations.get(agent.id);
    registrations.delete(agent.id);
    if (typeof dispose === "function") dispose();
  };
  const stopCreated = ctx.on("agent/created", ({ agent }) => install(agent));
  const stopDisposed = ctx.on("agent/disposed", ({ agent }) => uninstall(agent));
  const agents = typeof ctx.get === "function" ? ctx.get("agents") : void 0;
  if (agents && typeof agents.list === "function") {
    for (const agent of agents.list()) install(agent);
  }
  return () => {
    if (typeof stopCreated === "function") stopCreated();
    if (typeof stopDisposed === "function") stopDisposed();
    for (const dispose of registrations.values()) {
      if (typeof dispose === "function") dispose();
    }
    registrations.clear();
  };
}
function safeGetService(target, name2) {
  if (!target || typeof target !== "object") return void 0;
  const targetObj = target;
  if (typeof targetObj.get === "function") {
    try {
      const found = targetObj.get(name2);
      if (found !== void 0) return found;
    } catch {
    }
  }
  try {
    return targetObj[name2];
  } catch {
    return void 0;
  }
}
function safeGetMethod(target, name2) {
  if (!target || typeof target !== "object") return void 0;
  try {
    const fn = target[name2];
    return typeof fn === "function" ? fn.bind(target) : void 0;
  } catch {
    return void 0;
  }
}
function hasConnectionFetch(target) {
  const conn = safeGetService(target, "connection");
  return typeof conn?.fetch?.register === "function";
}
function isDangerFullAccess(ctx, exec) {
  try {
    const agent = exec?.agent;
    const session = agent?.session;
    const sandboxPolicy = safeGetService(ctx, "sandboxPolicy") || safeGetService(agent?.ctx, "sandboxPolicy");
    if (sandboxPolicy && typeof sandboxPolicy.resolve === "function") {
      const resolved = sandboxPolicy.resolve(session ? { session } : {});
      if (resolved?.mode === "danger-full-access") return true;
    }
    const sessionProjections = safeGetService(ctx, "sessionProjections") || safeGetService(agent?.ctx, "sessionProjections");
    if (session && sessionProjections && typeof sessionProjections.stateOf === "function") {
      const mode = sessionProjections.stateOf(session, "sandboxMode");
      if (mode === "danger-full-access") return true;
    }
    const header = session?.header;
    if (header?.sandboxMode === "danger-full-access" || header?.sandbox?.mode === "danger-full-access") {
      return true;
    }
    return false;
  } catch (err) {
    if (ctx.logger && typeof ctx.logger.warn === "function") {
      ctx.logger.warn(`skills-manager: probe isDangerFullAccess failed: ${String(err)}`);
    }
    return false;
  }
}
function apply(ctx, config) {
  const log = makeLog();
  const repositories = createRepositoryManager({
    log,
    maxRepositoryBytes: config?.maxRepositoryBytes,
    maxTransientBytes: config?.maxTransientBytes,
    gitTimeoutMs: config?.gitTimeoutMs,
    registeredWorkspaces: () => registeredWorkspacePaths(ctx),
    getPresetRoots: () => getPresetRootsCached(ctx)
  });
  const findUserRoot = (key) => userRoots().find((root) => root.key === key);
  const providerInvalidators = /* @__PURE__ */ new Set();
  const invalidateSkills = () => {
    invalidatePresetRootsCache(ctx);
    for (const invalidate of providerInvalidators) invalidate();
  };
  const afterWrite = () => notifyChatCatalog(ctx, invalidateSkills);
  if (typeof ctx.on === "function") {
    ctx.effect(() => ctx.on("agent-preset/selected", () => invalidatePresetRootsCache(ctx)), "skills-manager preset cache invalidation");
  }
  let mutationQueue = Promise.resolve();
  const enqueueMutation = (task) => {
    const queued = mutationQueue.then(task, task);
    mutationQueue = queued.catch(() => void 0);
    return queued;
  };
  ctx.effect(() => ctx.skills.registerProvider((control) => externalSkillProvider(control, providerInvalidators)), "skills-manager global external skills provider");
  ctx.effect(() => registerAgentSkillProviders(ctx, providerInvalidators), "skills-manager agent-scoped external skills providers");
  if (ctx.tools && typeof ctx.tools.register === "function") {
    ctx.effect(() => ctx.tools.register({
      name: "create_skill",
      description: "Create a new local DSH skill in DSH_HOME/skills. Use only when the user explicitly asks to create or save a reusable skill.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name; it will be normalized to kebab-case." },
          description: { type: "string", description: "A concise routing description for when to use the skill." },
          body: { type: "string", description: "Markdown instructions that form the skill body." }
        },
        required: ["name", "description", "body"],
        additionalProperties: false
      },
      output: {
        schema: { type: "object" },
        render: (_args, value) => [{ type: "text", text: value && value.ok === false ? `Skill creation failed${typeof value.code === "string" ? ` (${value.code})` : ""}.` : `Created DSH skill ${value.name} at ${value.path}` }]
      },
      async execute(args) {
        return enqueueMutation(async () => {
          const result = await createSkill(args, log);
          if (!result || result.ok !== false) afterWrite();
          return result;
        });
      },
      presentCall(args) {
        return { card: "generic", title: "Create DSH skill", kind: "edit", rawInput: args && args.name ? String(args.name) : void 0 };
      }
    }), "skills-manager create_skill tool");
    if (typeof ctx.on === "function") {
      const registerPreExecute = () => ctx.on("tools/pre-execute", (exec, next) => {
        if (exec && exec.name === "create_skill") {
          if (isDangerFullAccess(ctx, exec)) return next();
          return Promise.resolve({
            kind: "ask",
            reason: "Create a new skill under DSH_HOME/skills",
            displayReason: {
              en: "Create a new skill under DSH_HOME/skills",
              zh: "\u5728 DSH_HOME/skills \u76EE\u5F55\u4E0B\u521B\u5EFA\u65B0\u6280\u80FD"
            }
          });
        }
        return next();
      });
      if (typeof ctx.effect === "function") {
        ctx.effect(registerPreExecute, "skills-manager create_skill pre-execute guard");
      } else {
        registerPreExecute();
      }
    }
  }
  const API_PREFIX = "/api/michengai/dsh-skills-manager";
  const projectOptions = (sessionId) => ({ projectCwds: activeSessionCwds(ctx, sessionId ?? void 0) });
  const workspaceTarget = async (body) => {
    if (body.workspace === void 0) return null;
    return resolveWorkspaceTarget(body.workspace, registeredWorkspacePaths(ctx));
  };
  const workspaceScope = async (body) => {
    const target = await workspaceTarget(body);
    if (!target) return null;
    if ("ok" in target && target.ok === false) return target;
    return { projectCwds: target.root.workspaceCwds ?? [] };
  };
  const scopedOptions = (scope, sessionId, presetRoots) => ({
    ...scope ?? projectOptions(sessionId),
    ...presetRoots ? { presetRoots } : {}
  });
  const requestRoot = async (key, cwds, sessionId) => {
    if (cwds) return (await projectRoots(cwds)).find((root) => root.key === key);
    const user = findUserRoot(key);
    if (user) return user;
    const project = (await projectRoots(projectOptions(sessionId).projectCwds)).find((root) => root.key === key);
    if (project) return project;
    const presets = await getPresetRootsCached(ctx);
    const hit = presets.find((root) => root.key === key);
    if (hit) return hit;
    if (key.startsWith("preset-")) {
      return (await getPresetRootsOnMiss(ctx)).find((root) => root.key === key);
    }
    return void 0;
  };
  const attachSources = async (snapshot) => {
    try {
      const sources = await repositories.sources();
      for (const root of snapshot.roots) {
        const realRoot = await realpath(root.path).catch(() => root.path);
        for (const skill of root.skills || []) skill.installSource = sources[installationSourceKey(realRoot, skill.name)] ?? null;
      }
    } catch (caught) {
      const error = caught;
      snapshot.warnings.push({ code: "error.repo.state", error: error.message });
    }
    try {
      await attachProvenance(snapshot);
    } catch (caught) {
      const error = caught;
      snapshot.warnings.push({ code: "error.repo.state", error: error.message });
    }
    return snapshot;
  };
  const stateWithSources = async (req) => {
    const presetRoots = await getPresetRootsCached(ctx, true);
    return attachSources(await state({ ...projectOptions(req.headers.get("x-dsh-skills-session")), presetRoots }));
  };
  const handlePost = async (req, action, options) => {
    const mutationError = validateMutationRequest(req);
    if (mutationError) {
      return jsonResponse(mutationError.statusCode, { ok: false, code: mutationError.code, error: mutationError.error });
    }
    let body;
    try {
      body = await readJsonBody(req, options?.maxBytes);
    } catch (caught) {
      const e = caught;
      return jsonResponse(Number.isInteger(e && e.statusCode) ? e.statusCode : 400, {
        ok: false,
        code: e && typeof e.code === "string" ? e.code : "error.proto.invalidJson",
        error: String(e && e.message ? e.message : e)
      });
    }
    if (options?.isRepo && (!body || typeof body !== "object" || Array.isArray(body))) {
      return jsonResponse(400, { ok: false, code: "error.repo.invalid", error: "\u4ED3\u5E93\u53C2\u6570\u5FC5\u987B\u662F\u5BF9\u8C61" });
    }
    const execute = async () => {
      const scope = await workspaceScope(body);
      if (scope && "ok" in scope && scope.ok === false) return scope;
      return action(body, scope, req);
    };
    const afterSuccess = options?.afterSuccess ? () => options.afterSuccess(body) : void 0;
    return runFetch(() => options?.queued !== false ? enqueueMutation(execute) : execute(), afterSuccess);
  };
  const routes = [
    {
      path: `${API_PREFIX}/state`,
      methods: ["GET", "HEAD"],
      fetch: (req) => runFetch(() => stateWithSources(req), void 0, req.method === "HEAD")
    },
    {
      path: `${API_PREFIX}/sidebar-entry`,
      methods: ["GET", "HEAD", "POST"],
      fetch: (req) => {
        if (req.method === "GET" || req.method === "HEAD") {
          return runFetch(async () => {
            const location = await getEntryLocation();
            return { ok: true, location, enabled: location !== "settings" };
          }, void 0, req.method === "HEAD");
        }
        return handlePost(req, async (b) => {
          if (!b) {
            throw Object.assign(new Error("\u8BF7\u6C42\u4F53\u4E0D\u80FD\u4E3A\u7A7A"), { statusCode: 400, code: "error.proto.invalidParams" });
          }
          if (typeof b.location === "string") {
            if (b.location !== "both" && b.location !== "sidebar" && b.location !== "settings") {
              throw Object.assign(new Error("location \u5FC5\u987B\u662F both\u3001sidebar \u6216 settings"), { statusCode: 400, code: "error.proto.invalidParams" });
            }
            const location = await setEntryLocation(b.location);
            return { ok: true, location, enabled: location !== "settings" };
          }
          if (typeof b.enabled === "boolean") {
            const location = await setEntryLocation(b.enabled ? "both" : "settings");
            return { ok: true, location, enabled: location !== "settings" };
          }
          throw Object.assign(new Error("\u7F3A\u5C11\u5408\u6CD5\u7684 location \u6216 enabled \u53C2\u6570"), { statusCode: 400, code: "error.proto.invalidParams" });
        });
      }
    },
    {
      path: `${API_PREFIX}/workspaces`,
      methods: ["GET", "HEAD"],
      fetch: (req) => runFetch(async () => ({ items: await listWorkspaces(registeredWorkspacePaths(ctx) ?? []) }), void 0, req.method === "HEAD")
    },
    {
      path: `${API_PREFIX}/repositories`,
      methods: ["GET", "HEAD"],
      fetch: (req) => runFetch(() => enqueueMutation(() => repositories.list()), void 0, req.method === "HEAD")
    },
    {
      path: `${API_PREFIX}/clawhub/list`,
      methods: ["GET"],
      fetch: (req) => {
        const u = new URL(req.url);
        const allowed = ["limit", "cursor", "sort"];
        if ([...u.searchParams.keys()].some((key) => !allowed.includes(key) || u.searchParams.getAll(key).length !== 1)) {
          return Promise.resolve(jsonResponse(400, { ok: false, code: "error.catalog.query", error: "\u76EE\u5F55\u67E5\u8BE2\u53C2\u6570\u65E0\u6548" }));
        }
        const parameter = (key) => u.searchParams.get(key) ?? void 0;
        return runFetch(() => listClawHub({ limit: parameter("limit"), sort: parameter("sort"), cursor: parameter("cursor") }));
      }
    },
    {
      path: `${API_PREFIX}/clawhub/search`,
      methods: ["GET"],
      fetch: (req) => {
        const u = new URL(req.url);
        const allowed = ["q", "limit"];
        if ([...u.searchParams.keys()].some((key) => !allowed.includes(key) || u.searchParams.getAll(key).length !== 1) || !u.searchParams.has("q")) {
          return Promise.resolve(jsonResponse(400, { ok: false, code: "error.catalog.query", error: "\u76EE\u5F55\u67E5\u8BE2\u53C2\u6570\u65E0\u6548" }));
        }
        const parameter = (key) => u.searchParams.get(key) ?? void 0;
        return runFetch(() => searchClawHub(parameter("q"), { limit: parameter("limit") }));
      }
    },
    {
      path: `${API_PREFIX}/skills-sh/search`,
      methods: ["GET"],
      fetch: (req) => {
        const u = new URL(req.url);
        const queries = u.searchParams.getAll("q");
        if (queries.length !== 1) {
          return Promise.resolve(jsonResponse(400, { ok: false, code: "error.catalog.query", error: "\u641C\u7D22\u8BCD\u4E0D\u80FD\u4E3A\u7A7A\u4E14\u4E0D\u80FD\u8D85\u8FC7 100 \u4E2A\u5B57\u7B26" }));
        }
        return runFetch(() => searchSkillsSh(queries[0]));
      }
    },
    {
      path: `${API_PREFIX}/browse`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => browseDirectories(b.path), { queued: false })
    },
    {
      path: `${API_PREFIX}/repositories/refresh`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.refresh(b), { queued: false, isRepo: true })
    },
    {
      path: `${API_PREFIX}/catalog/detail`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => readCatalogSkill(b), { queued: false })
    },
    {
      path: `${API_PREFIX}/catalog/install`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, _scope, request) => {
        if (b.root !== void 0 && b.root !== "dsh" && b.root !== "agents") {
          const matchesPreset = (rootsList) => typeof b.root === "string" && rootsList.some((r) => r.key === b.root && r.mutable && r.native === false);
          let isValidPreset = matchesPreset(await getPresetRootsCached(ctx));
          if (!isValidPreset && typeof b.root === "string" && b.root.startsWith("preset-")) {
            isValidPreset = matchesPreset(await getPresetRootsOnMiss(ctx));
          }
          if (!isValidPreset) throw Object.assign(new Error("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548"), { statusCode: 400, code: "error.repo.invalid" });
        }
        if (b.workspace !== void 0 && b.root !== void 0 && b.root !== "dsh") throw Object.assign(new Error("\u5DE5\u4F5C\u533A\u53EA\u80FD\u5B89\u88C5\u5230\u9879\u76EE DSH skills"), { statusCode: 400, code: "error.repo.invalid" });
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        const pack = await loadCatalogPackage(b, fetch, request?.signal);
        if (request?.signal?.aborted) {
          throw Object.assign(new Error("\u76EE\u5F55\u6280\u80FD\u8BF7\u6C42\u5DF2\u53D6\u6D88"), { statusCode: 499, code: "error.catalog.cancelled" });
        }
        const catalogId = b.catalog === "skillsh" ? `skillsh:${b.source}/${b.skillId}` : `clawhub:${b.owner}/${b.slug}`;
        return enqueueMutation(() => {
          if (request?.signal?.aborted) {
            throw Object.assign(new Error("\u76EE\u5F55\u6280\u80FD\u8BF7\u6C42\u5DF2\u53D6\u6D88"), { statusCode: 499, code: "error.catalog.cancelled" });
          }
          return repositories.installCatalog(catalogId, pack, { root: b.root, ...b.workspace === void 0 ? {} : { workspace: b.workspace } });
        });
      }, { queued: false, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/repositories/add`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.add(b), { isRepo: true })
    },
    {
      path: `${API_PREFIX}/repositories/remove`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.remove(b), { isRepo: true })
    },
    {
      path: `${API_PREFIX}/repositories/detail`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.detail(b), { isRepo: true })
    },
    {
      path: `${API_PREFIX}/repositories/install`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.install(b, registeredWorkspacePaths(ctx)), { isRepo: true, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/repositories/installMany`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.installMany(b, registeredWorkspacePaths(ctx)), { isRepo: true, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/repositories/uninstall`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.uninstall(b), { isRepo: true, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/repositories/uninstallMany`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.uninstallMany(b, registeredWorkspacePaths(ctx)), { isRepo: true, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/repositories/preview`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.preview(b), { isRepo: true })
    },
    {
      path: `${API_PREFIX}/repositories/previewMany`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.previewMany(b), { isRepo: true })
    },
    {
      path: `${API_PREFIX}/repositories/update`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.update(b), { isRepo: true, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/repositories/updateMany`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.updateMany(b), { isRepo: true, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/repositories/rollback`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.rollback(b), { isRepo: true, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/workspace-skills`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b) => {
        const snapshot = await workspaceSkills(b.workspace, registeredWorkspacePaths(ctx));
        return "roots" in snapshot ? attachSources(snapshot) : snapshot;
      })
    },
    {
      path: `${API_PREFIX}/enable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => setSkillEnabled(await requestRoot(String(b.root || "dsh"), scope?.projectCwds, req.headers.get("x-dsh-skills-session")), String(b.name || ""), true, log), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => setSkillEnabled(await requestRoot(String(b.root || "dsh"), scope?.projectCwds, req.headers.get("x-dsh-skills-session")), String(b.name || ""), false, log), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/source-enable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => {
        const presetRoots = await getPresetRootsCached(ctx);
        return setSourceEnabled(String(b.root || ""), true, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), presetRoots));
      }, { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/source-disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => {
        const presetRoots = await getPresetRootsCached(ctx);
        return setSourceEnabled(String(b.root || ""), false, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), presetRoots));
      }, { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/root-path`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => setRootPath(String(b.key || ""), b.path === void 0 ? null : b.path), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/custom-source-add`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => addCustomSources(Array.isArray(b.sources) ? b.sources : b), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/custom-source-update`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => updateCustomSource(String(b.id || ""), b), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/custom-source-remove`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => removeCustomSource(String(b.id || "")), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/custom-source-scan`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => scanCustomSourceCandidates(b.path))
    },
    {
      path: `${API_PREFIX}/category-create`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => createCategory(String(b.root || ""), String(b.name || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx))))
    },
    {
      path: `${API_PREFIX}/category-rename`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => renameCategory(String(b.root || ""), String(b.id || ""), String(b.name || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx))))
    },
    {
      path: `${API_PREFIX}/category-delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => deleteCategory(String(b.root || ""), String(b.id || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx))))
    },
    {
      path: `${API_PREFIX}/category-assign`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => assignSkillCategory(String(b.root || ""), String(b.name || ""), String(b.category || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx))))
    },
    {
      path: `${API_PREFIX}/category-move`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => moveSkillInCategory(String(b.root || ""), String(b.name || ""), String(b.category || ""), b.targetName ? String(b.targetName) : void 0, b.position === void 0 ? "before" : String(b.position), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx))))
    },
    {
      path: `${API_PREFIX}/category-reorder`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => {
        const root = String(b.root || "");
        const options = scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx));
        if (b.direction) {
          return sortCategoriesByName(root, b.direction === "desc" ? "desc" : "asc", log, options);
        }
        return moveCategory(root, String(b.id || ""), b.targetId ? String(b.targetId) : void 0, b.position === "after" ? "after" : "before", log, options);
      })
    },
    {
      path: `${API_PREFIX}/category-enable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => setCategoryEnabled(String(b.root || ""), String(b.category || ""), true, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx))), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/category-disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => setCategoryEnabled(String(b.root || ""), String(b.category || ""), false, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx))), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/skill-note`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => setSkillNote(String(b.root || ""), String(b.name || ""), String(b.note || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"), await getPresetRootsCached(ctx))), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => {
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        const root = target ? target.root : await requestRoot(String(b.root || "dsh"), scope?.projectCwds, req.headers.get("x-dsh-skills-session"));
        return repositories.trashSkill(root, String(b.name || ""));
      }, { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/trash-restore`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => repositories.restoreTrash(String(b.id || ""), { ...scope ?? {}, registeredWorkspaces: registeredWorkspacePaths(ctx) }), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/trash-delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.permanentlyDeleteTrash(String(b.id || "")))
    },
    {
      path: `${API_PREFIX}/detail`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => {
        const presetRoots = await getPresetRootsCached(ctx);
        return skillDetail(String(b.root || "dsh"), String(b.name || ""), {
          ...scope ? { ...scope, workspaceBound: true } : projectOptions(req.headers.get("x-dsh-skills-session")),
          presetRoots
        });
      })
    },
    {
      path: `${API_PREFIX}/create`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b) => {
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        return createSkill(
          { name: b.name, description: b.description, body: b.body },
          log,
          { root: target ? target.root : await requestRoot(String(b.root || "dsh"), void 0, req.headers.get("x-dsh-skills-session")) }
        );
      }, { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/import`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b) => {
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        const root = target ? target.root : await requestRoot(String(b.root || "dsh"), void 0, req.headers.get("x-dsh-skills-session"));
        return importSkill(String(b.source || ""), log, {
          conflict: b.conflict === "overwrite" ? "overwrite" : "skip",
          dryRun: b.dryRun === true,
          root
        });
      }, { afterSuccess: (b) => {
        if (b.dryRun !== true) afterWrite();
      } })
    },
    {
      path: `${API_PREFIX}/upload`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b) => {
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        const root = target ? target.root : await requestRoot(String(b.root || "dsh"), void 0, req.headers.get("x-dsh-skills-session"));
        return importUploadedSkill({ name: b.name, entries: b.entries, zip: b.zip }, log, {
          conflict: b.conflict === "overwrite" ? "overwrite" : "skip",
          root
        });
      }, { afterSuccess: afterWrite, maxBytes: MAX_UPLOAD_BODY_BYTES })
    }
  ];
  let disposeWebServerFallback;
  const unregisterFallback = () => {
    if (disposeWebServerFallback) {
      try {
        disposeWebServerFallback();
      } catch {
      }
      disposeWebServerFallback = void 0;
    }
  };
  const registerConnectionRoutes = (connCtx) => {
    if (!hasConnectionFetch(connCtx)) return () => {
    };
    const connection = safeGetService(connCtx, "connection");
    unregisterFallback();
    const doRegister = () => {
      const disposers = routes.map(
        (route) => connection.fetch.register({
          path: route.path,
          methods: route.methods,
          requestBody: route.requestBody ?? "buffered",
          fetch: route.fetch
        })
      );
      return () => {
        for (const disposer of disposers) {
          try {
            disposer();
          } catch {
          }
        }
      };
    };
    const connEffect = safeGetMethod(connCtx, "effect");
    if (connEffect) {
      return connEffect(doRegister, "skills-manager: connection fetch routes");
    }
    return doRegister();
  };
  const registerWebServerFallback = (webCtx) => {
    const webServer = safeGetService(webCtx, "webServer");
    if (!webServer?.register) return () => {
    };
    if (hasConnectionFetch(ctx)) return () => {
    };
    const doRegister = () => {
      if (hasConnectionFetch(ctx)) return () => {
      };
      const routeMap = /* @__PURE__ */ new Map();
      for (const r of routes) routeMap.set(r.path, r);
      let rawDisposer;
      try {
        rawDisposer = webServer.register({
          kind: "prefix",
          path: API_PREFIX,
          handler: async (req, res) => {
            if (hasConnectionFetch(ctx)) {
              unregisterFallback();
              sendJsonResponse(res, 503, {
                ok: false,
                code: "error.proto.serviceUnavailable",
                error: "service transitioned to authenticated connection, please retry"
              });
              return;
            }
            const host = extractHostName(req.headers?.host);
            if (!host || !isLoopbackHost(host)) {
              sendJsonResponse(res, 403, { ok: false, code: "error.proto.forbidden", error: "forbidden host header" });
              return;
            }
            const remote = extractHostName(req.socket?.remoteAddress);
            if (!remote || !isLoopbackHost(remote)) {
              sendJsonResponse(res, 403, { ok: false, code: "error.proto.forbidden", error: "forbidden remote access" });
              return;
            }
            const site = req.headers?.["sec-fetch-site"];
            const siteStr = Array.isArray(site) ? site[0] : site;
            if (siteStr !== void 0 && siteStr !== "same-origin" && siteStr !== "none") {
              sendJsonResponse(res, 403, { ok: false, code: "error.proto.forbidden", error: "forbidden cross-origin request" });
              return;
            }
            const u = new URL(req.url, "http://localhost");
            const path = u.pathname.replace(/\/+$/, "");
            let candidatePath = "";
            const idx = path.lastIndexOf(API_PREFIX);
            if (idx === 0) {
              candidatePath = path;
            } else if (idx > 0) {
              const prefix = path.slice(0, idx);
              if (prefix.startsWith("/") && !prefix.includes("//") && !prefix.split("/").includes("..")) {
                candidatePath = path.slice(idx);
              } else {
                sendJsonResponse(res, 404, { ok: false, code: "error.proto.notFound", error: `unknown action: ${path}` });
                return;
              }
            } else {
              sendJsonResponse(res, 404, { ok: false, code: "error.proto.notFound", error: `unknown action: ${path}` });
              return;
            }
            if (candidatePath !== API_PREFIX && !candidatePath.startsWith(`${API_PREFIX}/`)) {
              sendJsonResponse(res, 404, { ok: false, code: "error.proto.notFound", error: `unknown action: ${path}` });
              return;
            }
            const route = routeMap.get(candidatePath);
            if (!route) {
              sendJsonResponse(res, 404, { ok: false, code: "error.proto.notFound", error: `unknown action: ${path}` });
              return;
            }
            if (!route.methods.includes(req.method)) {
              sendJsonResponse(res, 405, { ok: false, code: "error.proto.methodNotAllowed", error: `method not allowed: ${req.method}` });
              return;
            }
            const contentLength = req.headers?.["content-length"];
            if (contentLength && Number(contentLength) > MAX_BRIDGE_BODY_BYTES) {
              sendJsonResponse(res, 413, { ok: false, code: "error.proto.bodyTooLarge", error: "request body too large" });
              return;
            }
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers || {})) {
              if (v !== void 0) {
                if (Array.isArray(v)) for (const item of v) headers.append(k, item);
                else headers.set(k, v);
              }
            }
            try {
              let bodyBuffer = null;
              if (req.method !== "GET" && req.method !== "HEAD") {
                bodyBuffer = await new Promise((resolve, reject) => {
                  const chunks = [];
                  let totalBytes = 0;
                  let settled = false;
                  const safeOff = (emitter, event, fn) => {
                    try {
                      if (typeof emitter?.removeListener === "function") emitter.removeListener(event, fn);
                      else if (typeof emitter?.off === "function") emitter.off(event, fn);
                    } catch {
                    }
                  };
                  const cleanup = () => {
                    safeOff(req, "data", onData);
                    safeOff(req, "end", onEnd);
                    safeOff(req, "error", onError);
                    safeOff(req, "aborted", onAbort);
                    safeOff(res, "close", onClose);
                  };
                  const onAbort = () => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    const err = new Error("request aborted");
                    err.statusCode = 400;
                    err.code = "error.proto.aborted";
                    reject(err);
                  };
                  const onClose = () => {
                    if (settled || res.writableEnded) return;
                    onAbort();
                  };
                  const onData = (chunk) => {
                    if (settled) return;
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_BRIDGE_BODY_BYTES) {
                      settled = true;
                      cleanup();
                      const err = new Error("request body too large");
                      err.statusCode = 413;
                      err.code = "error.proto.bodyTooLarge";
                      reject(err);
                      return;
                    }
                    chunks.push(chunk);
                  };
                  const onEnd = () => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    resolve(Buffer.concat(chunks));
                  };
                  const onError = (err) => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(err);
                  };
                  req.on("data", onData);
                  req.on("end", onEnd);
                  req.on("error", onError);
                  req.on("aborted", onAbort);
                  res.on("close", onClose);
                });
              }
              const fetchReq = new Request(u.toString(), {
                method: req.method,
                headers,
                body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : void 0
              });
              const response = await route.fetch(fetchReq);
              const responseBuf = Buffer.from(await response.arrayBuffer());
              if (!res.headersSent) {
                res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
                if (req.method === "HEAD") {
                  res.end();
                } else {
                  res.end(responseBuf);
                }
              }
            } catch (caught) {
              const e = caught;
              if (e && e.code === "error.proto.aborted") {
                return;
              }
              if (res.headersSent) {
                try {
                  res.end();
                } catch {
                }
                return;
              }
              sendJsonResponse(res, Number.isInteger(e && e.statusCode) ? e.statusCode : 500, {
                ok: false,
                ...e && typeof e.code === "string" ? { code: e.code } : {},
                ...e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {},
                error: String(e && e.message ? e.message : e)
              });
            }
          }
        });
      } catch (err) {
        ctx.logger?.warn?.(`Skills Manager webServer route registration failed: ${err}`);
      }
      const disposer = () => {
        try {
          rawDisposer?.();
        } catch {
        }
      };
      disposeWebServerFallback = disposer;
      return disposer;
    };
    const webEffect = safeGetMethod(webCtx, "effect");
    if (webEffect) {
      return webEffect(doRegister, "skills-manager: webServer fallback route");
    }
    return doRegister();
  };
  let connectionDisposer;
  let webServerDisposer;
  if (hasConnectionFetch(ctx)) {
    connectionDisposer = registerConnectionRoutes(ctx);
  } else {
    const hostInject = safeGetMethod(ctx, "inject");
    if (hostInject) {
      hostInject(["webServer"], (webScope) => {
        webServerDisposer = registerWebServerFallback(webScope);
      });
      hostInject(["connection"], (connScope) => {
        if (hasConnectionFetch(connScope)) {
          connectionDisposer = registerConnectionRoutes(connScope);
        }
      });
    } else {
      if (safeGetService(ctx, "webServer")) {
        webServerDisposer = registerWebServerFallback(ctx);
      } else {
        ctx.logger?.warn?.("Skills Manager routes require authenticated connection.fetch or webServer");
      }
    }
  }
  return () => {
    try {
      connectionDisposer?.();
    } catch {
    }
    try {
      webServerDisposer?.();
    } catch {
    }
    unregisterFallback();
  };
}
export {
  activeSessionCwds,
  apply,
  inject,
  name,
  notifyChatCatalog,
  registerAgentSkillProviders
};
