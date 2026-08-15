// dsh-skills-manager host half：设置面板的 HTTP 后端（webServer prefix 路由）
// - 零第三方 import（仅 node: 内置 + 本地 core.js）
// - 路由：/api/dsh-skills-manager/state | enable | disable | delete | import
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

/** 自定义请求头使跨站 fetch 必须预检；本地接口不提供 CORS 响应。 */
function validateMutationRequest(req) {
  if (req.headers[CLIENT_MARKER_HEADER] !== "1") return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden mutation request" };
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { statusCode: 415, code: "error.proto.contentType", error: "content-type must be application/json" };
  return null;
}

function json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** 成功统一包成 { ok: true, data }；核心返回 { ok:false, error } 时透传为 400。 */
function run(res, p, afterSuccess) {
  p.then((r) => {
    if (r && r.ok === false) json(res, 400, r);
    else {
      try {
        if (afterSuccess) afterSuccess();
      } catch {
        /* 目录刷新失败不影响已完成的文件操作 */
      }
      json(res, 200, { ok: true, data: r });
    }
  }).catch((e) => {
    try {
      json(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
    } catch {
      /* response already closed */
    }
  });
}

function apply(ctx) {
  const log = makeLog();
  const roots = userRoots();
  const rootByKey = Object.fromEntries(roots.map((r) => [r.key, r.path]));
  let invalidateSkills = () => {};
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
        if (req.method === "GET" && path === "/api/dsh-skills-manager/state") {
          run(res, state());
          return;
        }
        if (req.method !== "POST") {
          json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` });
          return;
        }
        const requestError = validateMutationRequest(req);
        if (requestError) {
          json(res, requestError.statusCode, { ok: false, error: requestError.error });
          return;
        }
        const body = await readBody(req);
        switch (path) {
          case "/api/dsh-skills-manager/enable": {
            run(res, setSkillEnabled(rootByKey[String(body.root || "dsh")], String(body.name || ""), true), invalidateSkills);
            return;
          }
          case "/api/dsh-skills-manager/disable": {
            run(res, setSkillEnabled(rootByKey[String(body.root || "dsh")], String(body.name || ""), false), invalidateSkills);
            return;
          }
          case "/api/dsh-skills-manager/delete": {
            run(res, deleteSkill(rootByKey.dsh, String(body.name || ""), log), invalidateSkills);
            return;
          }
          case "/api/dsh-skills-manager/import":
            run(res, importSkill(String(body.source || ""), log, {
              conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
              dryRun: body.dryRun === true,
            }), body.dryRun === true ? undefined : invalidateSkills);
            return;
          default:
            json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
        }
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

export { apply, inject, name };
