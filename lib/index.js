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
  setCategoryEnabled,
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
  getSidebarEntry,
  setSidebarEntry,
  getOnlineUpdate,
  setOnlineUpdate
} from "./core.js";
import { registerPluginUpdater } from "./plugin-updater.js";
import { createRepositoryManager } from "./repositories.js";
import { installationSourceKey } from "./repository-updates.js";
import { listClawHub, searchClawHub } from "./clawhub-catalog.js";
import { searchSkillsSh } from "./skills-sh-catalog.js";
import { loadCatalogPackage, readCatalogSkill } from "./catalog-skill.js";
const name = "skills-manager";
const inject = ["connection", "skills", "tools", "sessions"];
const CLIENT_MARKER_HEADER = "x-dsh-skills-manager";
const MAX_LOG_BYTES = 1 << 20;
const MAX_UPLOAD_BODY_BYTES = 88 << 20;
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
function json(res, code, payload, headOnly = false) {
  if (!res || res.writableEnded || res.destroyed) return;
  res.once("error", () => {
  });
  try {
    const body = JSON.stringify(payload);
    res.writeHead(code, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body)
    });
    res.end(headOnly ? void 0 : body);
  } catch {
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
function externalSkillProvider(control, invalidators) {
  invalidators.add(control.invalidate);
  if (control.signal && typeof control.signal.addEventListener === "function") {
    control.signal.addEventListener("abort", () => {
      invalidators.delete(control.invalidate);
    }, { once: true });
  }
  return {
    name: "dsh-skills-manager-external",
    list: async (options) => listProviderCandidates(options),
    get: async (candidate, options) => getProviderSkill(candidate, options)
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
    const dispose = skills.registerProvider((control) => externalSkillProvider(control, invalidators));
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
function apply(ctx, config) {
  const hostDisabled = config?.updater === false || config?.onlineUpdate === false;
  const isUpdateEnabled = async () => {
    if (hostDisabled) return false;
    return await getOnlineUpdate();
  };
  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: "/api/michengai/dsh-skills-manager/update",
    packageName: "@michengai/dsh-skills-manager",
    manifestUrl: new URL("../package.json", import.meta.url),
    isEnabled: isUpdateEnabled
  }), "skills-manager: plugin updater");
  const log = makeLog();
  const repositories = createRepositoryManager({ log, registeredWorkspaces: () => registeredWorkspacePaths(ctx) });
  const findUserRoot = (key) => userRoots().find((root) => root.key === key);
  const providerInvalidators = /* @__PURE__ */ new Set();
  const invalidateSkills = () => {
    for (const invalidate of providerInvalidators) invalidate();
  };
  const afterWrite = () => notifyChatCatalog(ctx, invalidateSkills);
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
    if (typeof ctx.on === "function") ctx.on("tools/pre-execute", (exec, next) => {
      if (exec && exec.name === "create_skill") return Promise.resolve({ kind: "ask", reason: "Create a new skill under DSH_HOME/skills" });
      return next();
    });
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
  const scopedOptions = (scope, sessionId) => scope ?? projectOptions(sessionId);
  const requestRoot = async (key, cwds, sessionId) => cwds ? (await projectRoots(cwds)).find((root) => root.key === key) : findUserRoot(key) || (await projectRoots(projectOptions(sessionId).projectCwds)).find((root) => root.key === key);
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
    return snapshot;
  };
  const stateWithSources = async (req) => attachSources(await state(projectOptions(req.headers.get("x-dsh-skills-session"))));
  const handlePost = async (req, action, options) => {
    const mutationError = validateMutationRequest(req);
    if (mutationError) {
      return jsonResponse(mutationError.statusCode, { ok: false, code: mutationError.code, error: mutationError.error });
    }
    const body = await readJsonBody(req, options?.maxBytes);
    if (options?.isRepo && (!body || typeof body !== "object" || Array.isArray(body))) {
      return jsonResponse(400, { ok: false, code: "error.repo.invalid", error: "\u4ED3\u5E93\u53C2\u6570\u5FC5\u987B\u662F\u5BF9\u8C61" });
    }
    const execute = async () => {
      const scope = await workspaceScope(body);
      if (scope && "ok" in scope && scope.ok === false) return scope;
      return action(body, scope);
    };
    return runFetch(() => options?.queued !== false ? enqueueMutation(execute) : execute(), options?.afterSuccess);
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
          return runFetch(async () => ({ enabled: await getSidebarEntry() }), void 0, req.method === "HEAD");
        }
        return handlePost(req, async (b) => {
          if (!b || typeof b.enabled !== "boolean") {
            throw Object.assign(new Error("enabled \u5FC5\u987B\u662F\u5E03\u5C14\u503C"), { statusCode: 400, code: "error.proto.invalidParams" });
          }
          const enabled = await setSidebarEntry(b.enabled);
          return { enabled };
        });
      }
    },
    {
      path: `${API_PREFIX}/online-update`,
      methods: ["GET", "HEAD", "POST"],
      fetch: (req) => {
        if (req.method === "GET" || req.method === "HEAD") {
          return runFetch(async () => ({ enabled: await isUpdateEnabled(), locked: hostDisabled }), void 0, req.method === "HEAD");
        }
        return handlePost(req, async (b) => {
          if (!b || typeof b.enabled !== "boolean") {
            throw Object.assign(new Error("enabled \u5FC5\u987B\u662F\u5E03\u5C14\u503C"), { statusCode: 400, code: "error.proto.invalidParams" });
          }
          if (hostDisabled) {
            throw Object.assign(new Error("\u5728\u7EBF\u66F4\u65B0\u5DF2\u88AB\u5BBF\u4E3B\u914D\u7F6E\u9501\u5B9A\u7981\u7528"), { statusCode: 403, code: "error.update.disabled" });
          }
          const enabled = await setOnlineUpdate(b.enabled);
          return { enabled };
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
      fetch: (req) => handlePost(req, async (b) => {
        if (b.root !== void 0 && b.root !== "dsh" && b.root !== "agents") throw Object.assign(new Error("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548"), { statusCode: 400, code: "error.repo.invalid" });
        if (b.workspace !== void 0 && b.root !== void 0 && b.root !== "dsh") throw Object.assign(new Error("\u5DE5\u4F5C\u533A\u53EA\u80FD\u5B89\u88C5\u5230\u9879\u76EE DSH skills"), { statusCode: 400, code: "error.repo.invalid" });
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        const pack = await loadCatalogPackage(b);
        const catalogId = b.catalog === "skillsh" ? `skillsh:${b.source}/${b.skillId}` : `clawhub:${b.owner}/${b.slug}`;
        return enqueueMutation(() => repositories.installCatalog(catalogId, pack, { root: b.root, ...b.workspace === void 0 ? {} : { workspace: b.workspace } }));
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
      path: `${API_PREFIX}/repositories/uninstall`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.uninstall(b), { isRepo: true, afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/repositories/preview`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.preview(b), { isRepo: true })
    },
    {
      path: `${API_PREFIX}/repositories/update`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.update(b), { isRepo: true, afterSuccess: afterWrite })
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
      fetch: (req) => handlePost(req, (b, scope) => setSourceEnabled(String(b.root || ""), true, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/source-disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => setSourceEnabled(String(b.root || ""), false, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))), { afterSuccess: afterWrite })
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
      fetch: (req) => handlePost(req, (b, scope) => createCategory(String(b.root || ""), String(b.name || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))))
    },
    {
      path: `${API_PREFIX}/category-rename`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => renameCategory(String(b.root || ""), String(b.id || ""), String(b.name || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))))
    },
    {
      path: `${API_PREFIX}/category-delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => deleteCategory(String(b.root || ""), String(b.id || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))))
    },
    {
      path: `${API_PREFIX}/category-assign`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => assignSkillCategory(String(b.root || ""), String(b.name || ""), String(b.category || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))))
    },
    {
      path: `${API_PREFIX}/category-move`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => moveSkillInCategory(String(b.root || ""), String(b.name || ""), String(b.category || ""), b.targetName ? String(b.targetName) : void 0, b.position === void 0 ? "before" : String(b.position), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))))
    },
    {
      path: `${API_PREFIX}/category-enable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => setCategoryEnabled(String(b.root || ""), String(b.category || ""), true, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))), { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/category-disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => setCategoryEnabled(String(b.root || ""), String(b.category || ""), false, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))), { afterSuccess: afterWrite })
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
      fetch: (req) => handlePost(req, (b, scope) => skillDetail(String(b.root || "dsh"), String(b.name || ""), scope ? { ...scope, workspaceBound: true } : projectOptions(req.headers.get("x-dsh-skills-session"))))
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
        return importSkill(String(b.source || ""), log, {
          conflict: b.conflict === "overwrite" ? "overwrite" : "skip",
          dryRun: b.dryRun === true,
          ...target ? { root: target.root } : b.root === "agents" ? { root: await requestRoot("agents", void 0, req.headers.get("x-dsh-skills-session")) } : {}
        });
      }, { afterSuccess: afterWrite })
    },
    {
      path: `${API_PREFIX}/upload`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b) => {
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        return importUploadedSkill({ name: b.name, entries: b.entries, zip: b.zip }, log, {
          conflict: b.conflict === "overwrite" ? "overwrite" : "skip",
          ...target ? { root: target.root } : b.root === "agents" ? { root: await requestRoot("agents", void 0, req.headers.get("x-dsh-skills-session")) } : {}
        });
      }, { afterSuccess: afterWrite, maxBytes: MAX_UPLOAD_BODY_BYTES })
    }
  ];
  ctx.effect(() => {
    if (ctx.connection?.fetch?.register) {
      const disposers = routes.map(
        (route) => ctx.connection.fetch.register({
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
    }
    if (ctx.webServer?.register) {
      const routeMap = /* @__PURE__ */ new Map();
      for (const r of routes) routeMap.set(r.path, r);
      return ctx.webServer.register({
        kind: "prefix",
        path: API_PREFIX,
        handler: async (req, res) => {
          const u = new URL(req.url, "http://localhost");
          const path = u.pathname.replace(/\/+$/, "");
          const route = routeMap.get(path);
          if (!route) {
            json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
            return;
          }
          if (!route.methods.includes(req.method)) {
            json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` });
            return;
          }
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
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
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve(Buffer.concat(chunks)));
                req.on("error", reject);
              });
            }
            const fetchReq = new Request(u.toString(), {
              method: req.method,
              headers,
              body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : void 0
            });
            const response = await route.fetch(fetchReq);
            res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
            if (req.method === "HEAD") {
              res.end();
              return;
            }
            const responseBuf = Buffer.from(await response.arrayBuffer());
            res.end(responseBuf);
          } catch (caught) {
            const e = caught;
            json(res, Number.isInteger(e && e.statusCode) ? e.statusCode : 500, {
              ok: false,
              ...e && typeof e.code === "string" ? { code: e.code } : {},
              ...e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {},
              error: String(e && e.message ? e.message : e)
            });
          }
        }
      });
    }
    return () => {
    };
  }, "skills-manager: API routes");
}
export {
  activeSessionCwds,
  apply,
  inject,
  name,
  notifyChatCatalog,
  registerAgentSkillProviders
};
