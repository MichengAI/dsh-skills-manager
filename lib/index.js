// dsh-skills-manager host half：设置面板的 HTTP 后端（webServer prefix 路由）
// - 零第三方 import（仅 node: 内置 + 本地 core.js）
// - 路由：/api/dsh-skills-manager/state | enable | disable | delete | import
// - $DSH_HOME\skills 可上传、删除、启停；$DSH_AGENTS_HOME\skills 仅允许查看

import { appendFile } from "node:fs/promises";
import { state, setSkillEnabled, deleteSkill, importSkill, userRoots, logPath } from "./core.js";

const name = "skills-manager";
const inject = ["webServer", "skills"];

function makeLog() {
  const file = logPath();
  return async (event, detail) => {
    try {
      await appendFile(file, `${JSON.stringify({ ts: new Date().toISOString(), event, detail })}\n`, "utf8");
    } catch {
      /* 日志失败不阻塞主流程 */
    }
  };
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error(`invalid JSON body: ${e.message}`));
      }
    });
    req.on("error", reject);
  });
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
          json(res, 405, { ok: false, error: `method not allowed: ${req.method}` });
          return;
        }
        const body = await readBody(req);
        switch (path) {
          case "/api/dsh-skills-manager/enable": {
            run(res, String(body.root || "dsh") === "dsh" ? setSkillEnabled(rootByKey.dsh, String(body.name || ""), true) : Promise.resolve({ ok: false, error: "公共 Agent 技能目录不允许启用或停用" }), invalidateSkills);
            return;
          }
          case "/api/dsh-skills-manager/disable": {
            run(res, String(body.root || "dsh") === "dsh" ? setSkillEnabled(rootByKey.dsh, String(body.name || ""), false) : Promise.resolve({ ok: false, error: "公共 Agent 技能目录不允许启用或停用" }), invalidateSkills);
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
            json(res, 404, { ok: false, error: `unknown action: ${path}` });
        }
      } catch (e) {
        json(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
      }
    },
  });
  return route;
}

export { apply, inject, name };
