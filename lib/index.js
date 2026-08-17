// dsh-skills-manager host half：设置面板的 HTTP 后端（webServer prefix 路由）
// - 零第三方 import（仅 node: 内置 + 本地 core.js）
// - 路由：/api/dsh-skills-manager/state | enable | disable | delete | import
// - 全部接口先校验 loopback Host；写接口再校验请求标记与 JSON
// - $DSH_HOME\skills 可上传、删除、启停；$DSH_AGENTS_HOME\skills 仅允许查看

import { appendFile, rename, rm, stat } from "node:fs/promises";
import { state, setSkillEnabled, deleteSkill, importSkill, userRoots, logPath } from "./core.js";

const name = "skills-manager";
const inject = ["webServer", "skills"];
const CLIENT_MARKER_HEADER = "x-dsh-skills-manager";
const MAX_LOG_BYTES = 1 << 20;

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
        await appendFile(file, `${JSON.stringify({ ts: new Date().toISOString(), event, detail })}\n`, "utf8");
      } catch {
        /* 日志失败不阻塞主流程 */
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

/** 只允许 loopback Host，避免 DNS rebinding 读取 /state 或改写本地技能。 */
function validateLoopbackHost(req) {
  const host = String(req.headers.host || "").toLowerCase();
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return { statusCode: 403, code: "error.proto.forbiddenHost", error: "forbidden host" };
  return null;
}

/** 写接口额外要求自定义头与 JSON；自定义头迫使跨站 fetch 预检，且本接口不回 CORS。 */
function validateMutationRequest(req) {
  const hostError = validateLoopbackHost(req);
  if (hostError) return hostError;
  if (req.headers[CLIENT_MARKER_HEADER] !== "1") return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden mutation request" };
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { statusCode: 415, code: "error.proto.contentType", error: "content-type must be application/json" };
  return null;
}

function json(res, code, payload, headOnly) {
  if (!res || res.writableEnded || res.destroyed) return;
  res.once("error", () => {});
  try {
    const body = JSON.stringify(payload);
    res.writeHead(code, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
    });
    // HEAD 按 RFC 语义返回与实体一致的 content-length，但不输出 body。
    res.end(headOnly ? undefined : body);
  } catch {
    /* 客户端已断开 */
  }
}

/** 成功统一包成 { ok: true, data }；核心返回 { ok:false, error } 时透传为 400。 */
function run(res, task, afterSuccess, headOnly) {
  return Promise.resolve().then(task).then((r) => {
    if (r && r.ok === false) json(res, 400, r, headOnly);
    else {
      try {
        if (afterSuccess) afterSuccess();
      } catch {
        /* 目录刷新失败不影响已完成的文件操作 */
      }
      json(res, 200, { ok: true, data: r }, headOnly);
    }
  }).catch((e) => {
    try {
      json(res, Number.isInteger(e && e.statusCode) ? e.statusCode : 500, {
        ok: false,
        ...(e && e.code ? { code: e.code } : {}),
        error: String(e && e.message ? e.message : e),
      }, headOnly);
    } catch {
      /* response already closed */
    }
  });
}

/** 文件写入后刷新宿主技能目录，并通知 Web 端重拉 `/` 菜单缓存。 */
function notifyChatCatalog(ctx, invalidateSkills) {
  try {
    if (typeof invalidateSkills === "function") invalidateSkills();
  } catch {
    /* 目录缓存失效失败不影响已完成的文件操作 */
  }
  try {
    if (typeof ctx.emit === "function") ctx.emit("commands/change");
  } catch {
    /* 命令目录刷新失败不影响已完成的文件操作 */
  }
  try {
    const sessions = typeof ctx.get === "function" ? ctx.get("sessions") : undefined;
    const list = sessions && typeof sessions.list === "function" ? sessions.list() : [];
    for (const session of list) {
      const id = session && (session.id ?? session.header?.id);
      const preset = session && session.header && typeof session.header.agentPreset === "string"
        ? session.header.agentPreset
        : undefined;
      if (id == null || !preset || typeof ctx.emit !== "function") continue;
      // Web `/` 技能菜单缓存在 dsh-client-ui-skill，只在 agent-preset/selected 时失效；
      // skills/change 未进入官方转发白名单，只能借用这条已转发事件。
      ctx.emit("agent-preset/selected", id, preset);
    }
  } catch {
    /* 斜杠菜单刷新失败不影响已完成的文件操作 */
  }
}

function apply(ctx) {
  const log = makeLog();
  const roots = userRoots();
  const rootByKey = Object.fromEntries(roots.map((r) => [r.key, r.path]));
  let invalidateSkills = () => {};
  const afterWrite = () => notifyChatCatalog(ctx, invalidateSkills);
  let mutationQueue = Promise.resolve();
  const enqueueMutation = (task) => {
    const queued = mutationQueue.then(task, task);
    mutationQueue = queued.catch(() => undefined);
    return queued;
  };
  ctx.effect(() => ctx.skills.registerProvider((control) => {
    invalidateSkills = control.invalidate;
    return {
      name: "dsh-skills-manager-refresh",
      list: async () => [],
      get: async () => undefined,
    };
  }), "skills-manager catalog invalidator");

  const route = ctx.webServer.register({
    kind: "prefix",
    path: "/api/dsh-skills-manager",
    handler: async (req, res) => {
      const u = new URL(req.url, "http://localhost");
      const path = u.pathname.replace(/\/+$/, "");
      try {
        const hostError = validateLoopbackHost(req);
        if (hostError) {
          json(res, hostError.statusCode, { ok: false, code: hostError.code, error: hostError.error });
          return;
        }
        if (req.method === "GET" && path === "/api/dsh-skills-manager/state") {
          return run(res, state);
        }
        if (req.method === "HEAD") {
          // HEAD 复用 GET/405 的载荷计算 content-length，保持与实体一致的响应头语义。
          if (path === "/api/dsh-skills-manager/state") return run(res, state, undefined, true);
          json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` }, true);
          return;
        }
        if (req.method !== "POST") {
          json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` });
          return;
        }
        const requestError = validateMutationRequest(req);
        if (requestError) {
          json(res, requestError.statusCode, { ok: false, code: requestError.code, error: requestError.error });
          return;
        }
        const body = await readBody(req);
        return enqueueMutation(() => {
          switch (path) {
            case "/api/dsh-skills-manager/enable":
              return run(res, () => setSkillEnabled(rootByKey[String(body.root || "dsh")], String(body.name || ""), true, log), afterWrite);
            case "/api/dsh-skills-manager/disable":
              return run(res, () => setSkillEnabled(rootByKey[String(body.root || "dsh")], String(body.name || ""), false, log), afterWrite);
            case "/api/dsh-skills-manager/delete":
              return run(res, () => deleteSkill(rootByKey[String(body.root || "dsh")], String(body.name || ""), log), afterWrite);
            case "/api/dsh-skills-manager/import":
              return run(res, () => importSkill(String(body.source || ""), log, {
                conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                dryRun: body.dryRun === true,
              }), body.dryRun === true ? undefined : afterWrite);
            default:
              json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
          }
        });
      } catch (e) {
        json(res, Number.isInteger(e && e.statusCode) ? e.statusCode : 500, {
          ok: false,
          ...(e && e.code ? { code: e.code } : {}),
          error: String(e && e.message ? e.message : e),
        });
      }
    },
  });
  return route;
}

export { apply, inject, name, notifyChatCatalog };
