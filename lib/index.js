import { appendFile, rename, rm, stat } from "node:fs/promises";
import {
  state,
  setSkillEnabled,
  setSourceEnabled,
  deleteSkill,
  restoreTrash,
  permanentlyDeleteTrash,
  importSkill,
  importUploadedSkill,
  browseDirectories,
  createSkill,
  skillDetail,
  listProviderCandidates,
  getProviderSkill,
  userRoots,
  projectRoots,
  logPath
} from "./core.js";
const name = "skills-manager";
const inject = ["webServer", "webRuntime", "skills", "tools", "sessions"];
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
      } catch (e) {
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
function json(res, code, payload, headOnly) {
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
function run(res, task, afterSuccess, headOnly) {
  return Promise.resolve().then(task).then((r) => {
    if (r && r.ok === false) json(res, 400, r, headOnly);
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
        ...e && e.code ? { code: e.code } : {},
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
function activeSessionCwds(ctx) {
  try {
    const sessions = ctx.sessions || (typeof ctx.get === "function" ? ctx.get("sessions") : void 0);
    const list = sessions && typeof sessions.list === "function" ? sessions.list() : [];
    return [...new Set(list.map((session) => session && session.header && session.header.cwd).filter((cwd) => typeof cwd === "string" && cwd.trim() !== "").map((cwd) => cwd.trim()))];
  } catch {
    return [];
  }
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
  const log = makeLog();
  const trustedHosts = Array.isArray(ctx.webRuntime.trustedHosts) ? ctx.webRuntime.trustedHosts : [];
  const roots = userRoots();
  const rootByKey = Object.fromEntries(roots.map((r) => [r.key, r]));
  const projectOptions = () => ({ projectCwds: activeSessionCwds(ctx) });
  const requestRoot = async (key) => rootByKey[key] || (await projectRoots(projectOptions().projectCwds)).find((root) => root.key === key);
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
        render: (_args, value) => [{ type: "text", text: value && value.ok === false ? `Skill creation failed: ${value.error}` : `Created DSH skill ${value.name} at ${value.path}` }]
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
  const route = ctx.webServer.register({
    kind: "prefix",
    path: "/api/dsh-skills-manager",
    handler: async (req, res) => {
      const u = new URL(req.url, "http://localhost");
      const path = u.pathname.replace(/\/+$/, "");
      try {
        const hostError = validateRequestOrigin(req, trustedHosts);
        if (hostError) {
          json(res, hostError.statusCode, { ok: false, code: hostError.code, error: hostError.error });
          return;
        }
        if (req.method === "GET" && path === "/api/dsh-skills-manager/state") {
          return run(res, () => state(projectOptions()));
        }
        if (req.method === "HEAD") {
          if (path === "/api/dsh-skills-manager/state") return run(res, () => state(projectOptions()), void 0, true);
          json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` }, true);
          return;
        }
        if (req.method !== "POST") {
          json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` });
          return;
        }
        const requestError = validateMutationRequest(req, trustedHosts);
        if (requestError) {
          json(res, requestError.statusCode, { ok: false, code: requestError.code, error: requestError.error });
          return;
        }
        const body = await readBody(req, path === "/api/dsh-skills-manager/upload" ? MAX_UPLOAD_BODY_BYTES : void 0);
        if (path === "/api/dsh-skills-manager/browse") {
          return run(res, () => browseDirectories(body.path));
        }
        return enqueueMutation(() => {
          switch (path) {
            case "/api/dsh-skills-manager/enable":
              return run(res, async () => setSkillEnabled(await requestRoot(String(body.root || "dsh")), String(body.name || ""), true, log), afterWrite);
            case "/api/dsh-skills-manager/disable":
              return run(res, async () => setSkillEnabled(await requestRoot(String(body.root || "dsh")), String(body.name || ""), false, log), afterWrite);
            case "/api/dsh-skills-manager/source-enable":
              return run(res, () => setSourceEnabled(String(body.root || ""), true, log), afterWrite);
            case "/api/dsh-skills-manager/source-disable":
              return run(res, () => setSourceEnabled(String(body.root || ""), false, log), afterWrite);
            case "/api/dsh-skills-manager/delete":
              return run(res, async () => deleteSkill(await requestRoot(String(body.root || "dsh")), String(body.name || ""), log), afterWrite);
            case "/api/dsh-skills-manager/trash-restore":
              return run(res, () => restoreTrash(String(body.id || ""), log, projectOptions()), afterWrite);
            case "/api/dsh-skills-manager/trash-delete":
              return run(res, () => permanentlyDeleteTrash(String(body.id || ""), log));
            case "/api/dsh-skills-manager/detail":
              return run(res, () => skillDetail(String(body.root || "dsh"), String(body.name || ""), projectOptions()));
            case "/api/dsh-skills-manager/create":
              return run(res, async () => createSkill(
                { name: body.name, description: body.description, body: body.body },
                log,
                { root: await requestRoot(String(body.root || "dsh")) }
              ), afterWrite);
            case "/api/dsh-skills-manager/import":
              return run(res, () => importSkill(String(body.source || ""), log, {
                conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                dryRun: body.dryRun === true
              }), body.dryRun === true ? void 0 : afterWrite);
            case "/api/dsh-skills-manager/upload":
              return run(res, () => importUploadedSkill({ name: body.name, entries: body.entries, zip: body.zip }, log, {
                conflict: body.conflict === "overwrite" ? "overwrite" : "skip"
              }), afterWrite);
            default:
              json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
          }
        });
      } catch (e) {
        json(res, Number.isInteger(e && e.statusCode) ? e.statusCode : 500, {
          ok: false,
          ...e && e.code ? { code: e.code } : {},
          error: String(e && e.message ? e.message : e)
        });
      }
    }
  });
  return route;
}
export {
  activeSessionCwds,
  apply,
  inject,
  name,
  notifyChatCatalog,
  registerAgentSkillProviders
};
