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
  projectRoots,
  resolveWorkspaceTarget,
  listWorkspaces,
  workspaceSkills,
  logPath
} from "./core.js";
import { registerPluginUpdater } from "./plugin-updater.js";
import { createRepositoryManager } from "./repositories.js";
import { installationSourceKey } from "./repository-updates.js";
import { listClawHub, searchClawHub } from "./clawhub-catalog.js";
import { searchSkillsSh } from "./skills-sh-catalog.js";
import { loadCatalogPackage, readCatalogSkill } from "./catalog-skill.js";
const name = "skills-manager";
const inject = ["webServer", "skills", "tools", "sessions"];
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
function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (c) => {
      if (settled) return;
      size += c.length;
      if (size > limit) {
        const error = new Error("body too large");
        error.statusCode = 413;
        error.code = "error.proto.bodyTooLarge";
        fail(error);
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (settled) return;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = raw ? JSON.parse(raw) : {};
        settled = true;
        resolve(body);
      } catch (caught) {
        const e = caught;
        const error = new Error(`invalid JSON body: ${e.message}`);
        error.statusCode = 400;
        error.code = "error.proto.invalidJson";
        fail(error);
      }
    });
    req.on("error", fail);
  });
}
function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return void 0;
  }
}
function canonicalAuthority(authority, parsed) {
  const port = parsed.port !== "" ? parsed.port : new URL(`https://${authority}`).port;
  return port === "" ? parsed.hostname : `${parsed.hostname}:${port}`;
}
function isCanonicalAuthority(authority, parsed) {
  return canonicalAuthority(authority, parsed) === authority.toLowerCase();
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    if (typeof entry !== "string") return false;
    const entryUrl = parseAuthority(entry);
    if (!entryUrl || !isCanonicalAuthority(entry, entryUrl)) return false;
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
  });
}
function validateRequestOrigin(req, trustedHosts = []) {
  const host = typeof req.headers.host === "string" ? req.headers.host : "";
  const hostUrl = parseAuthority(host);
  if (!hostUrl || !isCanonicalAuthority(host, hostUrl)) {
    return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
  }
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) {
    return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
  }
  if (req.headers["sec-fetch-site"] === "cross-site") {
    return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
  }
  const origin = req.headers.origin;
  if (typeof origin === "string") {
    try {
      if (new URL(origin).host !== hostUrl.host) {
        return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
      }
    } catch {
      return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
    }
  }
  return null;
}
function validateMutationRequest(req, trustedHosts) {
  const hostError = validateRequestOrigin(req, trustedHosts);
  if (hostError) return hostError;
  if (req.headers[CLIENT_MARKER_HEADER] !== "1") return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden mutation request" };
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { statusCode: 415, code: "error.proto.contentType", error: "content-type must be application/json" };
  return null;
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
function run(res, task, afterSuccess, headOnly = false) {
  return Promise.resolve().then(task).then((r) => {
    if (r && typeof r === "object" && "ok" in r && r.ok === false) json(res, 400, r, headOnly);
    else {
      try {
        if (afterSuccess) afterSuccess();
      } catch {
      }
      json(res, 200, { ok: true, data: r }, headOnly);
    }
  }).catch((e) => {
    try {
      json(res, Number.isInteger(e && e.statusCode) ? e.statusCode : 500, {
        ok: false,
        ...e && typeof e.code === "string" ? { code: e.code } : {},
        ...e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {},
        error: String(e && e.message ? e.message : e)
      }, headOnly);
    } catch {
    }
  });
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
function apply(ctx) {
  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: "/api/michengai/dsh-skills-manager/update",
    packageName: "@michengai/dsh-skills-manager",
    manifestUrl: new URL("../package.json", import.meta.url)
  }), "skills-manager: plugin updater");
  const log = makeLog();
  const repositories = createRepositoryManager({ log, registeredWorkspaces: () => registeredWorkspacePaths(ctx) });
  const getTrustedHosts = () => {
    try {
      const rawCtx = ctx;
      const root = rawCtx.root || rawCtx;
      const candidate = root.webRuntime || root.webStartup;
      if (candidate && typeof candidate === "object" && Array.isArray(candidate.trustedHosts)) {
        return candidate.trustedHosts;
      }
    } catch {
    }
    return [];
  };
  const roots = userRoots();
  const rootByKey = Object.fromEntries(roots.map((r) => [r.key, r]));
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
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/api/dsh-skills-manager",
    handler: async (req, res) => {
      const u = new URL(req.url, "http://localhost");
      const path = u.pathname.replace(/\/+$/, "");
      const sessionId = req.headers["x-dsh-skills-session"];
      const projectOptions = () => ({ projectCwds: activeSessionCwds(ctx, sessionId) });
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
      const scopedOptions = (scope) => scope ?? projectOptions();
      const requestRoot = async (key, cwds) => cwds ? (await projectRoots(cwds)).find((root) => root.key === key) : rootByKey[key] || (await projectRoots(projectOptions().projectCwds)).find((root) => root.key === key);
      const withScope = async (body, action) => {
        const scope = await workspaceScope(body);
        if (scope && "ok" in scope && scope.ok === false) return scope;
        return action(scope);
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
        return snapshot;
      };
      const stateWithSources = async () => attachSources(await state(projectOptions()));
      try {
        const hostError = validateRequestOrigin(req, getTrustedHosts());
        if (hostError) {
          json(res, hostError.statusCode, { ok: false, code: hostError.code, error: hostError.error });
          return;
        }
        if (req.method === "GET" && path === "/api/dsh-skills-manager/state") {
          return run(res, stateWithSources);
        }
        if ((req.method === "GET" || req.method === "HEAD") && path === "/api/dsh-skills-manager/workspaces") {
          return run(res, async () => ({ items: await listWorkspaces(registeredWorkspacePaths(ctx) ?? []) }), void 0, req.method === "HEAD");
        }
        if ((req.method === "GET" || req.method === "HEAD") && path === "/api/dsh-skills-manager/repositories") {
          return run(res, () => enqueueMutation(() => repositories.list()), void 0, req.method === "HEAD");
        }
        if (req.method === "GET" && (path === "/api/dsh-skills-manager/clawhub/list" || path === "/api/dsh-skills-manager/clawhub/search")) {
          const searching = path.endsWith("/search");
          const allowed = searching ? ["q", "limit"] : ["limit", "cursor", "sort"];
          if ([...u.searchParams.keys()].some((key) => !allowed.includes(key) || u.searchParams.getAll(key).length !== 1) || searching && !u.searchParams.has("q")) {
            json(res, 400, { ok: false, code: "error.catalog.query", error: "\u76EE\u5F55\u67E5\u8BE2\u53C2\u6570\u65E0\u6548" });
            return;
          }
          const parameter = (key) => u.searchParams.get(key) ?? void 0;
          return run(res, () => searching ? searchClawHub(parameter("q"), { limit: parameter("limit") }) : listClawHub({ limit: parameter("limit"), sort: parameter("sort"), cursor: parameter("cursor") }));
        }
        if (req.method === "GET" && path === "/api/dsh-skills-manager/skills-sh/search") {
          const queries = u.searchParams.getAll("q");
          if (queries.length !== 1) {
            json(res, 400, { ok: false, code: "error.catalog.query", error: "\u641C\u7D22\u8BCD\u4E0D\u80FD\u4E3A\u7A7A\u4E14\u4E0D\u80FD\u8D85\u8FC7 100 \u4E2A\u5B57\u7B26" });
            return;
          }
          return run(res, () => searchSkillsSh(queries[0]));
        }
        if (req.method === "HEAD") {
          if (path === "/api/dsh-skills-manager/state") return run(res, stateWithSources, void 0, true);
          json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` }, true);
          return;
        }
        if (req.method !== "POST") {
          json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` });
          return;
        }
        const requestError = validateMutationRequest(req, getTrustedHosts());
        if (requestError) {
          json(res, requestError.statusCode, { ok: false, code: requestError.code, error: requestError.error });
          return;
        }
        const body = await readBody(req, path === "/api/dsh-skills-manager/upload" ? MAX_UPLOAD_BODY_BYTES : void 0);
        if (path.startsWith("/api/dsh-skills-manager/repositories/") && (!body || typeof body !== "object" || Array.isArray(body))) {
          json(res, 400, { ok: false, code: "error.repo.invalid", error: "\u4ED3\u5E93\u53C2\u6570\u5FC5\u987B\u662F\u5BF9\u8C61" });
          return;
        }
        if (path === "/api/dsh-skills-manager/browse") {
          return run(res, () => browseDirectories(body.path));
        }
        if (path === "/api/dsh-skills-manager/repositories/refresh") return run(res, () => repositories.refresh(body));
        if (path === "/api/dsh-skills-manager/catalog/detail") return run(res, () => readCatalogSkill(body));
        if (path === "/api/dsh-skills-manager/catalog/install") {
          return run(res, async () => {
            if (body.root !== void 0 && body.root !== "dsh" && body.root !== "agents") throw Object.assign(new Error("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548"), { statusCode: 400, code: "error.repo.invalid" });
            if (body.workspace !== void 0 && body.root !== void 0 && body.root !== "dsh") throw Object.assign(new Error("\u5DE5\u4F5C\u533A\u53EA\u80FD\u5B89\u88C5\u5230\u9879\u76EE DSH skills"), { statusCode: 400, code: "error.repo.invalid" });
            const target = await workspaceTarget(body);
            if (target && "ok" in target && target.ok === false) return target;
            const pack = await loadCatalogPackage(body);
            const catalogId = body.catalog === "skillsh" ? `skillsh:${body.source}/${body.skillId}` : `clawhub:${body.owner}/${body.slug}`;
            return enqueueMutation(() => repositories.installCatalog(catalogId, pack, { root: body.root, ...body.workspace === void 0 ? {} : { workspace: body.workspace } }));
          }, afterWrite);
        }
        return enqueueMutation(() => {
          switch (path) {
            case "/api/dsh-skills-manager/repositories/add":
              return run(res, () => repositories.add(body));
            case "/api/dsh-skills-manager/repositories/remove":
              return run(res, () => repositories.remove(body));
            case "/api/dsh-skills-manager/repositories/detail":
              return run(res, () => repositories.detail(body));
            case "/api/dsh-skills-manager/repositories/install":
              return run(res, () => repositories.install(body, registeredWorkspacePaths(ctx)), afterWrite);
            case "/api/dsh-skills-manager/repositories/uninstall":
              return run(res, () => repositories.uninstall(body), afterWrite);
            case "/api/dsh-skills-manager/repositories/preview":
              return run(res, () => repositories.preview(body));
            case "/api/dsh-skills-manager/repositories/update":
              return run(res, () => repositories.update(body), afterWrite);
            case "/api/dsh-skills-manager/repositories/rollback":
              return run(res, () => repositories.rollback(body), afterWrite);
            case "/api/dsh-skills-manager/workspace-skills":
              return run(res, async () => {
                const snapshot = await workspaceSkills(body.workspace, registeredWorkspacePaths(ctx));
                return "roots" in snapshot ? attachSources(snapshot) : snapshot;
              });
            case "/api/dsh-skills-manager/enable":
              return run(res, () => withScope(body, async (scope) => setSkillEnabled(await requestRoot(String(body.root || "dsh"), scope?.projectCwds), String(body.name || ""), true, log)), afterWrite);
            case "/api/dsh-skills-manager/disable":
              return run(res, () => withScope(body, async (scope) => setSkillEnabled(await requestRoot(String(body.root || "dsh"), scope?.projectCwds), String(body.name || ""), false, log)), afterWrite);
            case "/api/dsh-skills-manager/source-enable":
              return run(res, () => withScope(body, (scope) => setSourceEnabled(String(body.root || ""), true, log, scopedOptions(scope))), afterWrite);
            case "/api/dsh-skills-manager/source-disable":
              return run(res, () => withScope(body, (scope) => setSourceEnabled(String(body.root || ""), false, log, scopedOptions(scope))), afterWrite);
            case "/api/dsh-skills-manager/category-create":
              return run(res, () => withScope(body, (scope) => createCategory(String(body.root || ""), String(body.name || ""), log, scopedOptions(scope))));
            case "/api/dsh-skills-manager/category-rename":
              return run(res, () => withScope(body, (scope) => renameCategory(String(body.root || ""), String(body.id || ""), String(body.name || ""), log, scopedOptions(scope))));
            case "/api/dsh-skills-manager/category-delete":
              return run(res, () => withScope(body, (scope) => deleteCategory(String(body.root || ""), String(body.id || ""), log, scopedOptions(scope))));
            case "/api/dsh-skills-manager/category-assign":
              return run(res, () => withScope(body, (scope) => assignSkillCategory(String(body.root || ""), String(body.name || ""), String(body.category || ""), log, scopedOptions(scope))));
            case "/api/dsh-skills-manager/category-move":
              return run(res, () => withScope(body, (scope) => moveSkillInCategory(String(body.root || ""), String(body.name || ""), String(body.category || ""), body.targetName ? String(body.targetName) : void 0, body.position === void 0 ? "before" : String(body.position), log, scopedOptions(scope))));
            case "/api/dsh-skills-manager/category-enable":
              return run(res, () => withScope(body, (scope) => setCategoryEnabled(String(body.root || ""), String(body.category || ""), true, log, scopedOptions(scope))), afterWrite);
            case "/api/dsh-skills-manager/category-disable":
              return run(res, () => withScope(body, (scope) => setCategoryEnabled(String(body.root || ""), String(body.category || ""), false, log, scopedOptions(scope))), afterWrite);
            case "/api/dsh-skills-manager/delete":
              return run(res, () => withScope(body, async (scope) => {
                const target = await workspaceTarget(body);
                if (target && "ok" in target && target.ok === false) return target;
                const root = target ? target.root : await requestRoot(String(body.root || "dsh"), scope?.projectCwds);
                return repositories.trashSkill(root, String(body.name || ""));
              }), afterWrite);
            case "/api/dsh-skills-manager/trash-restore":
              return run(res, () => withScope(body, (scope) => repositories.restoreTrash(String(body.id || ""), { ...scope ?? {}, registeredWorkspaces: registeredWorkspacePaths(ctx) })), afterWrite);
            case "/api/dsh-skills-manager/trash-delete":
              return run(res, () => repositories.permanentlyDeleteTrash(String(body.id || "")));
            case "/api/dsh-skills-manager/detail":
              return run(res, () => withScope(body, (scope) => skillDetail(String(body.root || "dsh"), String(body.name || ""), scope ? { ...scope, workspaceBound: true } : projectOptions())));
            case "/api/dsh-skills-manager/create":
              return run(res, async () => {
                const target = await workspaceTarget(body);
                if (target && "ok" in target && target.ok === false) return target;
                return createSkill(
                  { name: body.name, description: body.description, body: body.body },
                  log,
                  { root: target ? target.root : await requestRoot(String(body.root || "dsh")) }
                );
              }, afterWrite);
            case "/api/dsh-skills-manager/import":
              return run(res, async () => {
                const target = await workspaceTarget(body);
                if (target && "ok" in target && target.ok === false) return target;
                return importSkill(String(body.source || ""), log, {
                  conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                  dryRun: body.dryRun === true,
                  ...target ? { root: target.root } : body.root === "agents" ? { root: await requestRoot("agents") } : {}
                });
              }, body.dryRun === true ? void 0 : afterWrite);
            case "/api/dsh-skills-manager/upload":
              return run(res, async () => {
                const target = await workspaceTarget(body);
                if (target && "ok" in target && target.ok === false) return target;
                return importUploadedSkill({ name: body.name, entries: body.entries, zip: body.zip }, log, {
                  conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                  ...target ? { root: target.root } : body.root === "agents" ? { root: await requestRoot("agents") } : {}
                });
              }, afterWrite);
            default:
              json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
          }
        });
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
  }), "skills-manager: API route");
}
export {
  activeSessionCwds,
  apply,
  inject,
  name,
  notifyChatCatalog,
  registerAgentSkillProviders
};
