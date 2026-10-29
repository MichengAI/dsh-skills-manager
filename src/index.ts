import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostContext, ProviderControl, Agent } from "./host-types.js";
import type { Log, Serialize, CreateInput, UploadInput, SkillRequest, RepositoryInput, ScopeOptions, SkillRoot, OperationError, RootView, Diagnostic } from "./types.js";
import type { ProviderCandidate } from "./core.js";
import type { CodedError } from "./types.js";
// dsh-skills-manager host half：设置面板的 HTTP 后端（connection.fetch 路由）
// - host 路由基于 Web Fetch 标准并由宿主 connection.admit / owner 门禁统一准入
// - 路由：状态、启停、详情、创建、导入、回收站
// - 写接口执行防 CSRF 标记头与同源 Origin 校验；参数与操作保护由业务层负责
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
  setOnlineUpdate,
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

async function readJsonBody(request: Request, limit = 1 << 20): Promise<RequestBody> {
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) {
    const error: CodedError = new Error("body too large");
    error.statusCode = 413;
    error.code = "error.proto.bodyTooLarge";
    throw error;
  }
  if (!text.trim()) return {} as RequestBody;
  try {
    return JSON.parse(text);
  } catch (caught) {
    const e = caught as CodedError;
    const error: CodedError = new Error(`invalid JSON body: ${e.message}`);
    error.statusCode = 400;
    error.code = "error.proto.invalidJson";
    throw error;
  }
}

/** 写接口额外要求自定义头与 JSON；跨站与未登录由官方宿主 connection.admit / owner 门禁负责。 */
function validateMutationRequest(req: Request) {
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

function jsonResponse(code: number, payload: unknown, headOnly = false): Response {
  const body = JSON.stringify(payload);
  return new Response(headOnly ? null : body, {
    status: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": String(Buffer.byteLength(body)),
    },
  });
}

/** 成功统一包成 { ok: true, data }；核心返回 { ok:false, error } 时透传为 400。 */
async function runFetch(task: () => unknown, afterSuccess?: () => void, headOnly = false): Promise<Response> {
  try {
    const r = await task();
    if (r && typeof r === "object" && "ok" in r && (r as any).ok === false) {
      return jsonResponse(400, r, headOnly);
    }
    if (afterSuccess) {
      try { afterSuccess(); } catch { /* 目录刷新失败不影响已完成的文件操作 */ }
    }
    return jsonResponse(200, { ok: true, data: r }, headOnly);
  } catch (caught) {
    const e = caught as CodedError;
    const status = Number.isInteger(e && e.statusCode) ? e.statusCode! : 500;
    return jsonResponse(status, {
      ok: false,
      ...(e && typeof e.code === "string" ? { code: e.code } : {}),
      ...(e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {}),
      error: String(e && e.message ? e.message : e),
    }, headOnly);
  }
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

export interface PluginConfig {
  updater?: boolean;
  onlineUpdate?: boolean;
}

function apply(ctx: HostContext, config?: PluginConfig) {
  const hostDisabled = config?.updater === false || config?.onlineUpdate === false;
  const isUpdateEnabled = async () => {
    if (hostDisabled) return false;
    return await getOnlineUpdate();
  };

  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: "/api/michengai/dsh-skills-manager/update",
    packageName: "@michengai/dsh-skills-manager",
    manifestUrl: new URL("../package.json", import.meta.url),
    isEnabled: isUpdateEnabled,
  }), "skills-manager: plugin updater");
  const log = makeLog();
  const repositories = createRepositoryManager({ log, registeredWorkspaces: () => registeredWorkspacePaths(ctx) });
  // 目录可被 roots.json 改写，来源定义必须在每次请求时重新读取，不能缓存在启动时。
  const findUserRoot = (key: string) => userRoots().find((root) => root.key === key);

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

  const API_PREFIX = "/api/michengai/dsh-skills-manager";
  const projectOptions = (sessionId?: string | null) => ({ projectCwds: activeSessionCwds(ctx, sessionId ?? undefined) });
  const workspaceTarget = async (body: RequestBody) => {
    if (body.workspace === undefined) return null;
    return resolveWorkspaceTarget(body.workspace, registeredWorkspacePaths(ctx));
  };
  const workspaceScope = async (body: RequestBody): Promise<{ projectCwds: string[] } | OperationError | null> => {
    const target = await workspaceTarget(body);
    if (!target) return null;
    if ("ok" in target && target.ok === false) return target;
    return { projectCwds: (target as { root: SkillRoot }).root.workspaceCwds ?? [] };
  };
  const scopedOptions = (scope: { projectCwds: string[] } | null, sessionId?: string | null) => scope ?? projectOptions(sessionId);
  const requestRoot = async (key: string, cwds?: string[], sessionId?: string | null) => cwds ? (await projectRoots(cwds)).find((root) => root.key === key) : findUserRoot(key) || (await projectRoots(projectOptions(sessionId).projectCwds)).find((root) => root.key === key);

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
  const stateWithSources = async (req: Request) => attachSources(await state(projectOptions(req.headers.get("x-dsh-skills-session"))));

  const handlePost = async (
    req: Request,
    action: (body: RequestBody, scope: { projectCwds: string[] } | null) => Promise<unknown>,
    options?: { maxBytes?: number; afterSuccess?: (body: RequestBody) => void; isRepo?: boolean; queued?: boolean }
  ) => {
    const mutationError = validateMutationRequest(req);
    if (mutationError) {
      return jsonResponse(mutationError.statusCode, { ok: false, code: mutationError.code, error: mutationError.error });
    }
    let body: RequestBody;
    try {
      body = await readJsonBody(req, options?.maxBytes);
    } catch (caught) {
      const e = caught as CodedError;
      return jsonResponse(Number.isInteger(e && e.statusCode) ? e.statusCode! : 400, {
        ok: false,
        code: (e && typeof e.code === "string") ? e.code : "error.proto.invalidJson",
        error: String(e && e.message ? e.message : e),
      });
    }
    if (options?.isRepo && (!body || typeof body !== "object" || Array.isArray(body))) {
      return jsonResponse(400, { ok: false, code: "error.repo.invalid", error: "仓库参数必须是对象" });
    }
    const execute = async () => {
      const scope = await workspaceScope(body);
      if (scope && "ok" in scope && scope.ok === false) return scope;
      return action(body, scope as { projectCwds: string[] } | null);
    };
    const afterSuccess = options?.afterSuccess ? () => options.afterSuccess!(body) : undefined;
    return runFetch(() => (options?.queued !== false ? enqueueMutation(execute) : execute()), afterSuccess);
  };

  interface ApiFetchRoute {
    path: string;
    methods: string[];
    requestBody?: "buffered" | "streaming";
    fetch: (request: Request) => Promise<Response>;
  }

  const routes: ApiFetchRoute[] = [
    {
      path: `${API_PREFIX}/state`,
      methods: ["GET", "HEAD"],
      fetch: (req) => runFetch(() => stateWithSources(req), undefined, req.method === "HEAD"),
    },
    {
      path: `${API_PREFIX}/sidebar-entry`,
      methods: ["GET", "HEAD", "POST"],
      fetch: (req) => {
        if (req.method === "GET" || req.method === "HEAD") {
          return runFetch(async () => ({ enabled: await getSidebarEntry() }), undefined, req.method === "HEAD");
        }
        return handlePost(req, async (b) => {
          if (!b || typeof b.enabled !== "boolean") {
            throw Object.assign(new Error("enabled 必须是布尔值"), { statusCode: 400, code: "error.proto.invalidParams" });
          }
          const enabled = await setSidebarEntry(b.enabled);
          return { enabled };
        });
      },
    },
    {
      path: `${API_PREFIX}/online-update`,
      methods: ["GET", "HEAD", "POST"],
      fetch: (req) => {
        if (req.method === "GET" || req.method === "HEAD") {
          return runFetch(async () => ({ enabled: await isUpdateEnabled(), locked: hostDisabled }), undefined, req.method === "HEAD");
        }
        return handlePost(req, async (b) => {
          if (!b || typeof b.enabled !== "boolean") {
            throw Object.assign(new Error("enabled 必须是布尔值"), { statusCode: 400, code: "error.proto.invalidParams" });
          }
          if (hostDisabled) {
            throw Object.assign(new Error("在线更新已被宿主配置锁定禁用"), { statusCode: 403, code: "error.update.disabled" });
          }
          const enabled = await setOnlineUpdate(b.enabled);
          return { enabled };
        });
      },
    },
    {
      path: `${API_PREFIX}/workspaces`,
      methods: ["GET", "HEAD"],
      fetch: (req) => runFetch(async () => ({ items: await listWorkspaces(registeredWorkspacePaths(ctx) ?? []) }), undefined, req.method === "HEAD"),
    },
    {
      path: `${API_PREFIX}/repositories`,
      methods: ["GET", "HEAD"],
      fetch: (req) => runFetch(() => enqueueMutation(() => repositories.list()), undefined, req.method === "HEAD"),
    },
    {
      path: `${API_PREFIX}/clawhub/list`,
      methods: ["GET"],
      fetch: (req) => {
        const u = new URL(req.url);
        const allowed = ["limit", "cursor", "sort"];
        if ([...u.searchParams.keys()].some((key) => !allowed.includes(key) || u.searchParams.getAll(key).length !== 1)) {
          return Promise.resolve(jsonResponse(400, { ok: false, code: "error.catalog.query", error: "目录查询参数无效" }));
        }
        const parameter = (key: string) => u.searchParams.get(key) ?? undefined;
        return runFetch(() => listClawHub({ limit: parameter("limit"), sort: parameter("sort"), cursor: parameter("cursor") }));
      },
    },
    {
      path: `${API_PREFIX}/clawhub/search`,
      methods: ["GET"],
      fetch: (req) => {
        const u = new URL(req.url);
        const allowed = ["q", "limit"];
        if ([...u.searchParams.keys()].some((key) => !allowed.includes(key) || u.searchParams.getAll(key).length !== 1) || !u.searchParams.has("q")) {
          return Promise.resolve(jsonResponse(400, { ok: false, code: "error.catalog.query", error: "目录查询参数无效" }));
        }
        const parameter = (key: string) => u.searchParams.get(key) ?? undefined;
        return runFetch(() => searchClawHub(parameter("q")!, { limit: parameter("limit") }));
      },
    },
    {
      path: `${API_PREFIX}/skills-sh/search`,
      methods: ["GET"],
      fetch: (req) => {
        const u = new URL(req.url);
        const queries = u.searchParams.getAll("q");
        if (queries.length !== 1) {
          return Promise.resolve(jsonResponse(400, { ok: false, code: "error.catalog.query", error: "搜索词不能为空且不能超过 100 个字符" }));
        }
        return runFetch(() => searchSkillsSh(queries[0]));
      },
    },
    {
      path: `${API_PREFIX}/browse`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => browseDirectories(b.path), { queued: false }),
    },
    {
      path: `${API_PREFIX}/repositories/refresh`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.refresh(b), { queued: false, isRepo: true }),
    },
    {
      path: `${API_PREFIX}/catalog/detail`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => readCatalogSkill(b), { queued: false }),
    },
    {
      path: `${API_PREFIX}/catalog/install`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b) => {
        if (b.root !== undefined && b.root !== "dsh" && b.root !== "agents") throw Object.assign(new Error("技能安装位置无效"), { statusCode: 400, code: "error.repo.invalid" });
        if (b.workspace !== undefined && b.root !== undefined && b.root !== "dsh") throw Object.assign(new Error("工作区只能安装到项目 DSH skills"), { statusCode: 400, code: "error.repo.invalid" });
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        const pack = await loadCatalogPackage(b);
        const catalogId = b.catalog === "skillsh" ? `skillsh:${b.source}/${b.skillId}` : `clawhub:${b.owner}/${b.slug}`;
        return enqueueMutation(() => repositories.installCatalog(catalogId, pack, { root: b.root, ...(b.workspace === undefined ? {} : { workspace: b.workspace }) }));
      }, { queued: false, afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/repositories/add`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.add(b), { isRepo: true }),
    },
    {
      path: `${API_PREFIX}/repositories/remove`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.remove(b), { isRepo: true }),
    },
    {
      path: `${API_PREFIX}/repositories/detail`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.detail(b), { isRepo: true }),
    },
    {
      path: `${API_PREFIX}/repositories/install`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.install(b, registeredWorkspacePaths(ctx)), { isRepo: true, afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/repositories/uninstall`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.uninstall(b), { isRepo: true, afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/repositories/preview`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.preview(b), { isRepo: true }),
    },
    {
      path: `${API_PREFIX}/repositories/update`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.update(b), { isRepo: true, afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/repositories/rollback`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.rollback(b), { isRepo: true, afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/workspace-skills`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b) => {
        const snapshot = await workspaceSkills(b.workspace, registeredWorkspacePaths(ctx));
        return "roots" in snapshot ? attachSources(snapshot) : snapshot;
      }),
    },
    {
      path: `${API_PREFIX}/enable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => setSkillEnabled(await requestRoot(String(b.root || "dsh"), scope?.projectCwds, req.headers.get("x-dsh-skills-session")), String(b.name || ""), true, log), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => setSkillEnabled(await requestRoot(String(b.root || "dsh"), scope?.projectCwds, req.headers.get("x-dsh-skills-session")), String(b.name || ""), false, log), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/source-enable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => setSourceEnabled(String(b.root || ""), true, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/source-disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => setSourceEnabled(String(b.root || ""), false, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/root-path`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => setRootPath(String(b.key || ""), b.path === undefined ? null : b.path), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/custom-source-add`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => addCustomSources(Array.isArray(b.sources) ? b.sources : b), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/custom-source-update`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => updateCustomSource(String(b.id || ""), b), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/custom-source-remove`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => removeCustomSource(String(b.id || "")), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/custom-source-scan`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => scanCustomSourceCandidates(b.path)),
    },
    {
      path: `${API_PREFIX}/category-create`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => createCategory(String(b.root || ""), String(b.name || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session")))),
    },
    {
      path: `${API_PREFIX}/category-rename`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => renameCategory(String(b.root || ""), String(b.id || ""), String(b.name || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session")))),
    },
    {
      path: `${API_PREFIX}/category-delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => deleteCategory(String(b.root || ""), String(b.id || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session")))),
    },
    {
      path: `${API_PREFIX}/category-assign`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => assignSkillCategory(String(b.root || ""), String(b.name || ""), String(b.category || ""), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session")))),
    },
    {
      path: `${API_PREFIX}/category-move`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => moveSkillInCategory(String(b.root || ""), String(b.name || ""), String(b.category || ""), b.targetName ? String(b.targetName) : undefined, b.position === undefined ? "before" : String(b.position), log, scopedOptions(scope, req.headers.get("x-dsh-skills-session")))),
    },
    {
      path: `${API_PREFIX}/category-enable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => setCategoryEnabled(String(b.root || ""), String(b.category || ""), true, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/category-disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => setCategoryEnabled(String(b.root || ""), String(b.category || ""), false, log, scopedOptions(scope, req.headers.get("x-dsh-skills-session"))), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b, scope) => {
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        const root = target ? (target as { root: SkillRoot }).root : await requestRoot(String(b.root || "dsh"), scope?.projectCwds, req.headers.get("x-dsh-skills-session"));
        return repositories.trashSkill(root, String(b.name || ""));
      }, { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/trash-restore`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => repositories.restoreTrash(String(b.id || ""), { ...(scope ?? {}), registeredWorkspaces: registeredWorkspacePaths(ctx) }), { afterSuccess: afterWrite }),
    },
    {
      path: `${API_PREFIX}/trash-delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => repositories.permanentlyDeleteTrash(String(b.id || ""))),
    },
    {
      path: `${API_PREFIX}/detail`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b, scope) => skillDetail(String(b.root || "dsh"), String(b.name || ""), scope ? { ...scope, workspaceBound: true } : projectOptions(req.headers.get("x-dsh-skills-session")))),
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
          { root: target ? (target as { root: SkillRoot }).root : await requestRoot(String(b.root || "dsh"), undefined, req.headers.get("x-dsh-skills-session")) },
        );
      }, { afterSuccess: afterWrite }),
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
          ...(target ? { root: (target as { root: SkillRoot }).root } : b.root === "agents" ? { root: await requestRoot("agents", undefined, req.headers.get("x-dsh-skills-session")) } : {}),
        });
      }, { afterSuccess: (b) => { if (b.dryRun !== true) afterWrite(); } }),
    },
    {
      path: `${API_PREFIX}/upload`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, async (b) => {
        const target = await workspaceTarget(b);
        if (target && "ok" in target && target.ok === false) return target;
        return importUploadedSkill({ name: b.name, entries: b.entries, zip: b.zip }, log, {
          conflict: b.conflict === "overwrite" ? "overwrite" : "skip",
          ...(target ? { root: (target as { root: SkillRoot }).root } : b.root === "agents" ? { root: await requestRoot("agents", undefined, req.headers.get("x-dsh-skills-session")) } : {}),
        });
      }, { afterSuccess: afterWrite, maxBytes: MAX_UPLOAD_BODY_BYTES }),
    },
  ];

  ctx.effect(() => {
    // 方案 A：优先官方标准 connection.fetch.register
    if (ctx.connection?.fetch?.register) {
      const disposers = routes.map((route) =>
        ctx.connection!.fetch.register({
          path: route.path,
          methods: route.methods,
          requestBody: route.requestBody ?? "buffered",
          fetch: route.fetch,
        })
      );
      return () => {
        for (const disposer of disposers) {
          try {
            disposer();
          } catch {
            /* ignore */
          }
        }
      };
    }
    // 兜底：无 connection 时自动通过 webServer 桥接 Fetch 路由（兼顾老测试和纯 webServer 环境）
    let webServer: HostContext["webServer"] | undefined;
    try {
      webServer = ctx.webServer;
    } catch {
      // 真实 Cordis Context Proxy 在未 inject 且无该服务时抛错，安全捕获忽略
    }
    if (webServer?.register) {
      const routeMap = new Map<string, ApiFetchRoute>();
      for (const r of routes) routeMap.set(r.path, r);
      return webServer.register({
        kind: "prefix",
        path: API_PREFIX,
        handler: async (req, res) => {
          const u = new URL(req.url!, "http://localhost");
          const path = u.pathname.replace(/\/+$/, "");
          const route = routeMap.get(path);
          if (!route) {
            json(res, 404, { ok: false, code: "error.proto.unknownAction", error: `unknown action: ${path}` });
            return;
          }
          if (!route.methods.includes(req.method!)) {
            json(res, 405, { ok: false, code: "error.proto.method", error: `method not allowed: ${req.method}` });
            return;
          }
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v !== undefined) {
              if (Array.isArray(v)) for (const item of v) headers.append(k, item);
              else headers.set(k, v);
            }
          }
          try {
            let bodyBuffer: Buffer | null = null;
            if (req.method !== "GET" && req.method !== "HEAD") {
              bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
                const chunks: Buffer[] = [];
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve(Buffer.concat(chunks)));
                req.on("error", reject);
              });
            }
            const fetchReq = new Request(u.toString(), {
              method: req.method,
              headers,
              body: bodyBuffer && bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined,
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
            const e = caught as CodedError;
            json(res, Number.isInteger(e && e.statusCode) ? e.statusCode! : 500, {
              ok: false,
              ...(e && typeof e.code === "string" ? { code: e.code } : {}),
              ...(e && e.params && typeof e.params === "object" && !Array.isArray(e.params) ? { params: e.params } : {}),
              error: String(e && e.message ? e.message : e),
            });
          }
        },
      });
    }
    return () => {};
  }, "skills-manager: API routes");
}

export { activeSessionCwds, apply, inject, name, notifyChatCatalog, registerAgentSkillProviders };

/** 请求体由各业务入口现有校验解析，此类型只声明路由转交的字段。 */
type RequestBody = CreateInput & UploadInput & SkillRequest & RepositoryInput & {root?: string; source?: string; conflict?: string; dryRun?: boolean; workspace?: unknown; enabled?: boolean; category?: string; targetName?: string; position?: "before" | "after"; catalog?: string; skillId?: string; owner?: string; slug?: string; path?: unknown; key?: string; id?: string; label?: unknown; group?: unknown; sources?: unknown[]};
