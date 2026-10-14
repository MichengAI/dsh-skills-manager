import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostContext, ProviderControl, Agent } from "./host-types.js";
import type { Log, Serialize, CreateInput, UploadInput, SkillRequest, RepositoryInput, ScopeOptions, SkillRoot, OperationError, RootView, Diagnostic } from "./types.js";
import type { ProviderCandidate } from "./core.js";
import type { CodedError } from "./types.js";
// dsh-skills-manager host half：设置面板的 HTTP 后端（webServer prefix 路由）
// - host 路由仅依赖 node: 内置与本地 core.js；ZIP 解压封装在 core
// - 路由：状态、启停、详情、创建、导入、回收站
// - 全部接口先校验 DSH Web 信任的 Host；写接口再校验请求标记与 JSON
// - 所有来源的启停只写 manager 状态，不改原始 Skill 文件
// - $DSH_HOME\skills 与活动项目 .dsh/skills 可创建、回收与恢复；Agent 来源文件保持只读

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
  logPath,
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
// 文件夹上传允许 64 MiB 原始内容；Base64 会膨胀约 1/3，再为最多 1000 条路径预留余量。
const MAX_UPLOAD_BODY_BYTES = 88 << 20;

function makeLog(): Log {
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

function readBody(req: IncomingMessage, limit = 1 << 20) {
  return new Promise<RequestBody>((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks: Buffer[] = [];
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (c) => {
      if (settled) return;
      size += c.length;
      if (size > limit) {
        const error: CodedError = new Error("body too large");
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
        const body: RequestBody = raw ? JSON.parse(raw) : {};
        settled = true;
        resolve(body);
      } catch (caught) { const e = caught as CodedError;
        const error: CodedError = new Error(`invalid JSON body: ${e.message}`);
        error.statusCode = 400;
        error.code = "error.proto.invalidJson";
        fail(error);
      }
    });
    req.on("error", fail);
  });
}

/** 将裸 `host[:port]` authority 解析为 URL；非法形态返回 undefined。 */
function parseAuthority(authority: string) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return undefined;
  }
}

/**
 * 返回 authority 的规范形态。用 http/https 双重解析保留显式的 :80 / :443，
 * 避免默认端口被 WHATWG URL 自动剥离后意外扩大为任意端口授权。
 */
function canonicalAuthority(authority: string, parsed: URL) {
  const port = parsed.port !== "" ? parsed.port : new URL(`https://${authority}`).port;
  return port === "" ? parsed.hostname : `${parsed.hostname}:${port}`;
}

/** 只接受纯净、规范的 host[:port]，拒绝路径、userinfo、空白和非规范端口。 */
function isCanonicalAuthority(authority: string, parsed: URL) {
  return canonicalAuthority(authority, parsed) === authority.toLowerCase();
}

/** 与 DSH `/api` 信任栅栏一致：localhost、IPv6 loopback 或 IPv4 127/8。 */
function isLoopbackHostname(hostname: string) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** 带端口的 trustedHosts 条目精确匹配；不带端口的条目匹配同主机的任意端口。 */
function isTrustedAuthority(hostUrl: URL, trustedHosts: string[]) {
  return trustedHosts.some((entry) => {
    if (typeof entry !== "string") return false;
    const entryUrl = parseAuthority(entry);
    if (!entryUrl || !isCanonicalAuthority(entry, entryUrl)) return false;
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host;
  });
}

/**
 * 复用 DSH Web runtime 的 trustedHosts（LAN IP + `--trusted-host`），同时
 * 保留 loopback 默认值；未知 Host、跨站 Fetch 或异源 Origin 继续拒绝。
 */
function validateRequestOrigin(req: IncomingMessage, trustedHosts: string[] = []) {
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

/** 写接口额外要求自定义头与 JSON；自定义头迫使跨站 fetch 预检，且本接口不回 CORS。 */
function validateMutationRequest(req: IncomingMessage, trustedHosts: string[]) {
  const hostError = validateRequestOrigin(req, trustedHosts);
  if (hostError) return hostError;
  if (req.headers[CLIENT_MARKER_HEADER] !== "1") return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden mutation request" };
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { statusCode: 415, code: "error.proto.contentType", error: "content-type must be application/json" };
  return null;
}

function json(res: ServerResponse, code: number, payload: unknown, headOnly = false) {
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
function run(res: ServerResponse, task: () => unknown, afterSuccess?: () => void, headOnly = false) {
  return Promise.resolve().then(task).then((r) => {
    if (r && typeof r === "object" && "ok" in r && r.ok === false) json(res, 400, r, headOnly);
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
      json(res, Number.isInteger(e && e.statusCode) ? e.statusCode! : 500, {
        ok: false,
        ...(e && typeof e.code === "string" ? { code: e.code } : {}),
        ...(e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {}),
        error: String(e && e.message ? e.message : e),
      }, headOnly);
    } catch {
      /* response already closed */
    }
  });
}

/** 文件写入后刷新宿主技能目录，并通知 Web 端重拉 `/` 菜单缓存。 */
function notifyChatCatalog(ctx: HostContext, invalidateSkills?: () => void) {
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

/**
 * 读取宿主登记的工作区路径。服务缺失、方法缺失或抛错都返回 undefined，
 * 由 resolveWorkspaceTarget 统一拒绝写项目，用户目录写入不受影响。
 */
function registeredWorkspacePaths(ctx: HostContext): string[] | undefined {
  try {
    const registry = typeof ctx.get === "function" ? ctx.get("workspaceRegistry") : undefined;
    if (!registry || typeof registry.list !== "function") return undefined;
    return [...registry.list()].flatMap((item) => {
      const path = item?.path ?? item?.cwd;
      return typeof path === "string" && path.trim() ? [path.trim()] : [];
    });
  } catch {
    return undefined;
  }
}

/** 仅从客户端当前选中的已知 Session 解析工作目录；缺失或失效时不回退其他会话。 */
function activeSessionCwds(ctx: HostContext, sessionId: unknown) {
  if (typeof sessionId !== "string" || !sessionId.trim()) return [];
  const sessions = ctx.sessions || (typeof ctx.get === "function" ? ctx.get("sessions") : undefined);
  if (!sessions) return [];
  const session = typeof sessions.get === "function" ? sessions.get(sessionId) :
    (typeof sessions.list === "function" ? sessions.list() : []).find((item) => (item.id ?? item.header?.id) === sessionId);
  const cwd = session?.header?.cwd;
  return typeof cwd === "string" && cwd.trim() ? [cwd.trim()] : [];
}

function externalSkillProvider(control: ProviderControl, invalidators: Set<() => void>) {
  invalidators.add(control.invalidate);
  if (control.signal && typeof control.signal.addEventListener === "function") {
    control.signal.addEventListener("abort", () => {
      invalidators.delete(control.invalidate);
    }, { once: true });
  }
  return {
    name: "dsh-skills-manager-external",
    list: async (options?: ScopeOptions) => listProviderCandidates(options),
    get: async (candidate: ProviderCandidate, options?: ScopeOptions) => getProviderSkill(candidate, options),
  };
}

/**
 * Agent presets register their filesystem provider in a nearer, preset-scoped
 * skill layer. Register the manager policy once more in each live agent's own
 * layer so disabled shared skills cannot fall through to that native provider.
 */
function registerAgentSkillProviders(ctx: HostContext, invalidators: Set<() => void>) {
  if (typeof ctx.on !== "function") return () => {};
  const registrations = new Map<string, () => void>();

  const install = (agent: Agent) => {
    if (!agent || registrations.has(agent.id)) return;
    const agentCtx = agent.ctx;
    const skills = agentCtx && typeof agentCtx.get === "function"
      ? agentCtx.get("skills")
      : agentCtx && agentCtx.skills;
    if (!skills || typeof skills.registerProvider !== "function") return;
    const dispose = skills.registerProvider((control) => externalSkillProvider(control, invalidators));
    registrations.set(agent.id, dispose);
  };

  const uninstall = (agent: Agent) => {
    if (!agent) return;
    const dispose = registrations.get(agent.id);
    registrations.delete(agent.id);
    if (typeof dispose === "function") dispose();
  };

  const stopCreated = ctx.on("agent/created", ({ agent }) => install(agent));
  const stopDisposed = ctx.on("agent/disposed", ({ agent }) => uninstall(agent));
  const agents = typeof ctx.get === "function" ? ctx.get("agents") : undefined;
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

function apply(ctx: HostContext) {
  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: "/api/michengai/dsh-skills-manager/update",
    packageName: "@michengai/dsh-skills-manager",
    manifestUrl: new URL("../package.json", import.meta.url),
  }), "skills-manager: plugin updater");
  const log = makeLog();
  const repositories = createRepositoryManager({ log, registeredWorkspaces: () => registeredWorkspacePaths(ctx) });
  const getTrustedHosts = () => {
    try {
      const rawCtx = ctx as unknown as Record<string, unknown>;
      // Cordis context proxy throws "cannot get property X without inject" on rawCtx.webRuntime or rawCtx.get
      // Check root properties or safe get without throwing
      const root = (rawCtx.root || rawCtx) as Record<string, unknown>;
      const candidate = root.webRuntime || root.webStartup;
      if (candidate && typeof candidate === "object" && Array.isArray((candidate as { trustedHosts?: unknown }).trustedHosts)) {
        return (candidate as { trustedHosts: string[] }).trustedHosts;
      }
    } catch {
      // ignore
    }
    return [];
  };
  const roots = userRoots();
  const rootByKey = Object.fromEntries(roots.map((r) => [r.key, r]));

  const providerInvalidators = new Set<() => void>();
  const invalidateSkills = () => {
    for (const invalidate of providerInvalidators) invalidate();
  };
  const afterWrite = () => notifyChatCatalog(ctx, invalidateSkills);
  let mutationQueue: Promise<unknown> = Promise.resolve();
  const enqueueMutation: Serialize = (task) => {
    const queued = mutationQueue.then(task, task);
    mutationQueue = queued.catch(() => undefined);
    return queued;
  };
  ctx.effect(() => ctx.skills.registerProvider((control) => externalSkillProvider(control, providerInvalidators)), "skills-manager global external skills provider");
  ctx.effect(() => registerAgentSkillProviders(ctx, providerInvalidators), "skills-manager agent-scoped external skills providers");

  if (ctx.tools && typeof ctx.tools.register === "function") {
    ctx.effect(() => ctx.tools!.register({
      name: "create_skill",
      description: "Create a new local DSH skill in DSH_HOME/skills. Use only when the user explicitly asks to create or save a reusable skill.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name; it will be normalized to kebab-case." },
          description: { type: "string", description: "A concise routing description for when to use the skill." },
          body: { type: "string", description: "Markdown instructions that form the skill body." },
        },
        required: ["name", "description", "body"],
        additionalProperties: false,
      },
      output: {
        schema: { type: "object" },
        render: (_args, value) => [{ type: "text", text: value && value.ok === false ? `Skill creation failed${typeof value.code === "string" ? ` (${value.code})` : ""}.` : `Created DSH skill ${value.name} at ${value.path}` }],
      },
      async execute(args) {
        return enqueueMutation(async () => {
          const result = await createSkill(args, log);
          if (!result || result.ok !== false) afterWrite();
          return result;
        });
      },
      presentCall(args) {
        return { card: "generic", title: "Create DSH skill", kind: "edit", rawInput: args && args.name ? String(args.name) : undefined };
      },
    }), "skills-manager create_skill tool");
    if (typeof ctx.on === "function") ctx.on("tools/pre-execute", (exec, next) => {
      if (exec && exec.name === "create_skill") return Promise.resolve({ kind: "ask", reason: "Create a new skill under DSH_HOME/skills" });
      return next();
    });
  }

  // Cordis can construct a plain function apply(), so its returned disposer
  // is not collected. Own the route explicitly for restart and startup failure.
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/api/dsh-skills-manager",
    handler: async (req, res) => {
      const u = new URL(req.url!, "http://localhost");
      const path = u.pathname.replace(/\/+$/, "");
      const sessionId = req.headers["x-dsh-skills-session"];
      const projectOptions = () => ({ projectCwds: activeSessionCwds(ctx, sessionId) });
      /** 请求体带 workspace 时只经登记列表解析；字段存在但无效也拒绝，不静默回退到用户目录。 */
      const workspaceTarget = async (body: RequestBody) => {
        if (body.workspace === undefined) return null;
        return resolveWorkspaceTarget(body.workspace, registeredWorkspacePaths(ctx));
      };
      /** 项目页操作带 workspace：先按登记路径校验，再只在该项目的来源里解析，不依赖当前会话。 */
      const workspaceScope = async (body: RequestBody): Promise<{ projectCwds: string[] } | OperationError | null> => {
        const target = await workspaceTarget(body);
        if (!target) return null;
        if ("ok" in target && target.ok === false) return target;
        return { projectCwds: (target as { root: SkillRoot }).root.workspaceCwds ?? [] };
      };
      const scopedOptions = (scope: { projectCwds: string[] } | null) => scope ?? projectOptions();
      /** 用户级写入只开放 DSH 与 Shared Agent 两处；带工作区的请求一律只写项目 DSH。 */
      const userWriteOptions = (body: RequestBody, target: unknown) => ({ allowRepositoryRoot: !target && body.root === "agents" });
      const requestRoot = async (key: string, cwds?: string[]) => cwds ? (await projectRoots(cwds)).find((root) => root.key === key) : rootByKey[key] || (await projectRoots(projectOptions().projectCwds)).find((root) => root.key === key);
      /** 单项操作的统一入口：有 workspace 就在其作用域内解析根，无则沿用当前会话。 */
      const withScope = async <T>(body: RequestBody, action: (scope: { projectCwds: string[] } | null) => Promise<T>) => {
        const scope = await workspaceScope(body);
        if (scope && "ok" in scope && scope.ok === false) return scope;
        return action(scope as { projectCwds: string[] } | null);
      };
      const attachSources = async <T extends { roots: RootView[]; warnings: Diagnostic[] }>(snapshot: T) => {
        try {
          const sources = await repositories.sources();
          for (const root of snapshot.roots) {
            const realRoot = await realpath(root.path).catch(() => root.path);
            for (const skill of root.skills || []) skill.installSource = sources[installationSourceKey(realRoot, skill.name)] ?? null;
          }
        } catch (caught) { const error = caught as CodedError; snapshot.warnings.push({ code: "error.repo.state", error: error.message }); }
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
          return run(res, async () => ({ items: await listWorkspaces(registeredWorkspacePaths(ctx) ?? []) }), undefined, req.method === "HEAD");
        }
        if ((req.method === "GET" || req.method === "HEAD") && path === "/api/dsh-skills-manager/repositories") {
          return run(res, () => enqueueMutation(() => repositories.list()), undefined, req.method === "HEAD");
        }
        if (req.method === "GET" && (path === "/api/dsh-skills-manager/clawhub/list" || path === "/api/dsh-skills-manager/clawhub/search")) {
          const searching = path.endsWith("/search");
          const allowed = searching ? ["q", "limit"] : ["limit", "cursor", "sort"];
          if ([...u.searchParams.keys()].some(key => !allowed.includes(key) || u.searchParams.getAll(key).length !== 1) || searching && !u.searchParams.has("q")) {
            json(res, 400, { ok: false, code: "error.catalog.query", error: "目录查询参数无效" });
            return;
          }
          const parameter = (key: string) => u.searchParams.get(key) ?? undefined;
          return run(res, () => searching ? searchClawHub(parameter("q")!, { limit: parameter("limit") }) : listClawHub({ limit: parameter("limit"), sort: parameter("sort"), cursor: parameter("cursor") }));
        }
        if (req.method === "GET" && path === "/api/dsh-skills-manager/skills-sh/search") {
          const queries = u.searchParams.getAll("q");
          if (queries.length !== 1) {
            json(res, 400, { ok: false, code: "error.catalog.query", error: "搜索词不能为空且不能超过 100 个字符" });
            return;
          }
          return run(res, () => searchSkillsSh(queries[0]));
        }
        if (req.method === "HEAD") {
          // HEAD 复用 GET/405 的载荷计算 content-length，保持与实体一致的响应头语义。
          if (path === "/api/dsh-skills-manager/state") return run(res, stateWithSources, undefined, true);
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
        const body = await readBody(req, path === "/api/dsh-skills-manager/upload" ? MAX_UPLOAD_BODY_BYTES : undefined);
        if (path.startsWith("/api/dsh-skills-manager/repositories/") && (!body || typeof body !== "object" || Array.isArray(body))) {
          json(res, 400, { ok: false, code: "error.repo.invalid", error: "仓库参数必须是对象" });
          return;
        }
        if (path === "/api/dsh-skills-manager/browse") {
          return run(res, () => browseDirectories(body.path));
        }
        // 网络只读阶段不占本地写入队列；最终文件和状态提交仍串行。
        if (path === "/api/dsh-skills-manager/repositories/refresh") return run(res, () => repositories.refresh(body));
        if (path === "/api/dsh-skills-manager/catalog/detail") return run(res, () => readCatalogSkill(body));
        if (path === "/api/dsh-skills-manager/catalog/install") {
          return run(res, async () => {
            if (body.root !== undefined && body.root !== "dsh" && body.root !== "agents") throw Object.assign(new Error("技能安装位置无效"), { statusCode: 400, code: "error.repo.invalid" });
            if (body.workspace !== undefined && body.root !== undefined && body.root !== "dsh") throw Object.assign(new Error("工作区只能安装到项目 DSH skills"), { statusCode: 400, code: "error.repo.invalid" });
            const target = await workspaceTarget(body);
            if (target && "ok" in target && target.ok === false) return target;
            const pack = await loadCatalogPackage(body);
            const catalogId = body.catalog === "skillsh" ? `skillsh:${body.source}/${body.skillId}` : `clawhub:${body.owner}/${body.slug}`;
            return enqueueMutation(() => repositories.installCatalog(catalogId, pack, { root: body.root, ...(body.workspace === undefined ? {} : { workspace: body.workspace }) }));
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
              return run(res, () => withScope(body, (scope) => moveSkillInCategory(String(body.root || ""), String(body.name || ""), String(body.category || ""), body.targetName ? String(body.targetName) : undefined, body.position === undefined ? "before" : String(body.position), log, scopedOptions(scope))));
            case "/api/dsh-skills-manager/category-enable":
              return run(res, () => withScope(body, (scope) => setCategoryEnabled(String(body.root || ""), String(body.category || ""), true, log, scopedOptions(scope))), afterWrite);
            case "/api/dsh-skills-manager/category-disable":
              return run(res, () => withScope(body, (scope) => setCategoryEnabled(String(body.root || ""), String(body.category || ""), false, log, scopedOptions(scope))), afterWrite);
            case "/api/dsh-skills-manager/delete":
                          return run(res, () => withScope(body, async (scope) => {
                            const target = await workspaceTarget(body);
                            if (target && "ok" in target && target.ok === false) return target;
                            const root = target ? (target as { root: SkillRoot }).root : await requestRoot(String(body.root || "dsh"), scope?.projectCwds);
                            return repositories.trashSkill(root, String(body.name || ""));
                          }), afterWrite);
            case "/api/dsh-skills-manager/trash-restore":
              return run(res, () => withScope(body, (scope) => repositories.restoreTrash(String(body.id || ""), { ...(scope ?? {}), registeredWorkspaces: registeredWorkspacePaths(ctx) })), afterWrite);
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
                  { root: target ? (target as { root: SkillRoot }).root : await requestRoot(String(body.root || "dsh")), ...userWriteOptions(body, target) },
                );
              }, afterWrite);
            case "/api/dsh-skills-manager/import":
              return run(res, async () => {
                const target = await workspaceTarget(body);
                if (target && "ok" in target && target.ok === false) return target;
                return importSkill(String(body.source || ""), log, {
                  conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                  dryRun: body.dryRun === true,
                  ...(target ? { root: (target as { root: SkillRoot }).root } : body.root === "agents" ? { root: await requestRoot("agents") } : {}),
                  ...userWriteOptions(body, target),
                });
              }, body.dryRun === true ? undefined : afterWrite);
            case "/api/dsh-skills-manager/upload":
              return run(res, async () => {
                const target = await workspaceTarget(body);
                if (target && "ok" in target && target.ok === false) return target;
                return importUploadedSkill({ name: body.name, entries: body.entries, zip: body.zip }, log, {
                  conflict: body.conflict === "overwrite" ? "overwrite" : "skip",
                  ...(target ? { root: (target as { root: SkillRoot }).root } : body.root === "agents" ? { root: await requestRoot("agents") } : {}),
                  ...userWriteOptions(body, target),
                });
              }, afterWrite);
            default:
              json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
          }
        });
      } catch (caught) { const e = caught as CodedError;
        json(res, Number.isInteger(e && e.statusCode) ? e.statusCode! : 500, {
          ok: false,
          ...(e && typeof e.code === "string" ? { code: e.code } : {}),
          ...(e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {}),
          error: String(e && e.message ? e.message : e),
        });
      }
    },
  }), "skills-manager: API route");
}

export { activeSessionCwds, apply, inject, name, notifyChatCatalog, registerAgentSkillProviders };

/** 请求体由各业务入口现有校验解析，此类型只声明路由转交的字段。 */
type RequestBody = CreateInput & UploadInput & SkillRequest & RepositoryInput & {root?: string; source?: string; conflict?: string; dryRun?: boolean; workspace?: unknown; enabled?: boolean; category?: string; targetName?: string; position?: "before" | "after"; catalog?: string; skillId?: string; owner?: string; slug?: string};
