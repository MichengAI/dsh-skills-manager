import { createModeService } from "./mode-service.js";
import { assertMode, parseDraft, parseSettings, sanitizeModelCatalog } from "../shared/contracts.js";

export const API_PREFIX = "/api/dsh-ai-workbench";
const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);
const MAX_JSON_BODY_BYTES = 1 << 20;

function forbiddenOrigin() {
  return { statusCode: 403, body: { ok: false, code: "forbidden-origin", error: "forbidden origin" } };
}

function validPort(port) {
  if (!/^[1-9]\d{0,4}$/.test(port)) return false;
  const value = Number(port);
  return value <= 65535;
}

function validIpv4(host) {
  const octets = host.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((octet) => /^(?:0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255);
}

function parseLoopbackAuthority(authority) {
  if (typeof authority !== "string") return null;
  const match = /^(localhost|\[::1\]|127(?:\.\d{1,3}){3})(?::(\d+))?$/i.exec(authority);
  if (!match) return null;
  if (match[2] !== undefined && !validPort(match[2])) return null;
  const normalizedHost = match[1].toLowerCase();
  if (normalizedHost !== "localhost" && normalizedHost !== "[::1]" && !validIpv4(normalizedHost)) {
    return null;
  }
  return { host: normalizedHost, port: match[2] ?? null };
}

function validLoopbackHost(host) {
  return parseLoopbackAuthority(host) !== null;
}

function validLocalOrigin(origin, host) {
  if (typeof origin !== "string" || origin.length === 0 || /\s/.test(origin)) return false;

  const authorityMatch = /^(?:http|https):\/\/([^/?#]*)$/i.exec(origin);
  const originAuthority = authorityMatch == null ? null : parseLoopbackAuthority(authorityMatch[1]);
  const hostAuthority = parseLoopbackAuthority(host);
  if (originAuthority == null || hostAuthority == null) return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== ""
  ) return false;

  // Host has no scheme, so preserve the existing convention of accepting
  // either http or https while keeping omitted and explicit ports distinct.
  return originAuthority.host === hostAuthority.host && originAuthority.port === hostAuthority.port;
}

export function validateOrigin(req) {
  try {
    const headers = req != null && typeof req === "object" && req.headers != null && typeof req.headers === "object" ? req.headers : null;
    const host = typeof headers?.host === "string" ? headers.host.toLowerCase() : "";
    const hasFetchSite = headers !== null && Reflect.has(headers, "sec-fetch-site");
    const fetchSite = hasFetchSite ? headers["sec-fetch-site"] : undefined;
    if (
      !validLoopbackHost(host)
      || (hasFetchSite && typeof fetchSite !== "string")
      || (hasFetchSite && !ALLOWED_FETCH_SITES.has(fetchSite.toLowerCase()))
    ) return forbiddenOrigin();
    const hasOrigin = headers !== null && Reflect.has(headers, "origin");
    const origin = hasOrigin ? headers.origin : undefined;
    if (hasOrigin && !validLocalOrigin(origin, host)) return forbiddenOrigin();
  } catch {
    return forbiddenOrigin();
  }
  return null;
}

function badRequest() {
  return { statusCode: 400, body: { ok: false, code: "bad-request", error: "bad request" } };
}

function internalError() {
  return { statusCode: 500, body: { ok: false, code: "internal-error", error: "internal server error" } };
}

function typedError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code, public: true });
}

function chatUnavailable() {
  return typedError("Chat preset is unavailable", 503, "chat-preset-unavailable");
}

function contentType(headers) {
  return String(headers?.["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
}

function toBuffer(chunk) {
  if (typeof chunk === "string") return Buffer.from(chunk, "utf8");
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  throw typedError("invalid request body", 400, "invalid-json");
}

async function readJsonBody(req) {
  let source;
  try {
    const hasBody = req && Object.prototype.hasOwnProperty.call(req, "body");
    source = hasBody && req.body !== undefined ? req.body : req;
  } catch {
    throw typedError("invalid request body", 400, "invalid-json");
  }

  let raw;
  if (source == null) {
    raw = Buffer.alloc(0);
  } else if (typeof source === "string" || Buffer.isBuffer(source) || source instanceof Uint8Array) {
    raw = toBuffer(source);
  } else if (typeof source[Symbol.asyncIterator] === "function") {
    const chunks = [];
    let size = 0;
    for await (const chunk of source) {
      const buffer = toBuffer(chunk);
      size += buffer.length;
      if (size > MAX_JSON_BODY_BYTES) throw typedError("payload too large", 413, "payload-too-large");
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks, size);
  } else {
    throw typedError("invalid request body", 400, "invalid-json");
  }

  if (raw.length > MAX_JSON_BODY_BYTES) throw typedError("payload too large", 413, "payload-too-large");
  if (raw.length === 0) throw typedError("request body required", 400, "invalid-json");
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw typedError("malformed JSON", 400, "invalid-json");
  }
}

function resultFromError(error) {
  if (error?.public === true && Number.isInteger(error.statusCode) && typeof error.code === "string") {
    if (typeof error.sessionId === "string") {
      return {
        statusCode: error.statusCode,
        body: {
          ok: false,
          code: error.code,
          error: { code: error.code, message: String(error.message || "request failed"), sessionId: error.sessionId },
        },
      };
    }
    return {
      statusCode: error.statusCode,
      body: { ok: false, code: error.code, error: String(error.message || "request failed") },
    };
  }
  return internalError();
}

function success(data) {
  return { statusCode: 200, body: { ok: true, data } };
}

function unwrapProxy(response) {
  if (response?.result?.ok === true) return response.result.value;
  const error = response?.result?.error || {};
  throw typedError(
    typeof error.message === "string" ? error.message : "DSH model catalog unavailable",
    502,
    typeof error.code === "string" ? error.code : "dsh-models-unavailable",
  );
}

async function handleSession(req, services) {
  if (req.headers?.["x-dsh-workbench-action"] !== "1") {
    throw typedError("action header required", 403, "action-required");
  }
  if (contentType(req.headers) !== "application/json") {
    throw typedError("content-type must be application/json", 415, "content-type-required");
  }
  const body = await readJsonBody(req);
  const chatAvailable = services?.features?.chat?.available === true || services?.chatAvailable === true;
  if (body?.mode === "chat" && !chatAvailable) throw chatUnavailable();
  if (typeof services?.sessionGateway?.start !== "function") return internalError();
  const data = await services.sessionGateway.start(body);
  return { statusCode: 201, body: { ok: true, data } };
}

async function handleModels(services) {
  if (typeof services?.apiProxy?.llm?.models !== "function") return internalError();
  const catalog = unwrapProxy(await services.apiProxy.llm.models({ rpcId: `workbench-models-${Date.now()}`, payload: {} }));
  return success(sanitizeModelCatalog(catalog));
}

function modeServiceFor(services) {
  if (services?.modeService) return services.modeService;
  if (services?.repository && services?.sessionQuery) {
    return createModeService({ repository: services.repository, sessionQuery: services.sessionQuery });
  }
  return null;
}

async function handleBootstrap(parsed, services) {
  const mode = assertMode(parsed.searchParams.get("mode"));
  const repository = services?.repository;
  const modeService = modeServiceFor(services);
  if (
    !repository
    || typeof repository.getSettings !== "function"
    || typeof repository.getDraft !== "function"
    || !modeService
    || typeof modeService.listHistory !== "function"
  ) return internalError();
  const [settings, draft, history] = await Promise.all([
    repository.getSettings(),
    repository.getDraft(mode),
    modeService.listHistory(mode),
  ]);
  return success({ settings, draft, history });
}

async function handleMutation(req, path, services) {
  const headers = req.headers;
  if (headers?.["x-dsh-workbench-action"] !== "1") {
    throw typedError("action header required", 403, "action-required");
  }
  if (contentType(headers) !== "application/json") {
    throw typedError("content-type must be application/json", 415, "content-type-required");
  }

  const repository = services?.repository;
  if (!repository) return internalError();
  if (path === `${API_PREFIX}/settings`) {
    if (typeof repository.putSettings !== "function") return internalError();
    const settings = parseSettings(await readJsonBody(req));
    return success(await repository.putSettings(settings));
  }

  const draftMode = path.slice(`${API_PREFIX}/drafts/`.length);
  if (!new Set(["work", "chat"]).has(draftMode) || typeof repository.putDraft !== "function") {
    return { statusCode: 404, body: { ok: false, code: "not-found", error: "not found" } };
  }
  const draft = parseDraft(await readJsonBody(req), draftMode);
  return success(await repository.putDraft(draftMode, draft));
}

export async function routeRequest(req, services) {
  let url;
  let method;
  let headers;
  try {
    if (req == null || typeof req !== "object") return badRequest();
    url = req.url;
    method = req.method;
    headers = req.headers;
    if (
      typeof url !== "string"
      || url.length === 0
      || /[\u0000-\u0020]/.test(url)
      || /%(?![0-9a-f]{2})/i.test(url)
      || !url.startsWith("/")
      || url.startsWith("//")
    ) {
      return badRequest();
    }
  } catch {
    return badRequest();
  }

  let parsed;
  let path;
  try {
    parsed = new URL(url, "http://localhost");
    if (parsed.origin !== "http://localhost") return badRequest();
    path = parsed.pathname.replace(/\/+$/, "");
  } catch {
    return badRequest();
  }

  const denied = validateOrigin({ headers });
  if (denied) return denied;

  try {
    if (method === "GET" && path === `${API_PREFIX}/diagnostics`) {
      const diagnostics = services == null ? undefined : services.diagnostics;
      if (typeof diagnostics !== "function") return internalError();
      return success(await Reflect.apply(diagnostics, services, []));
    }
    if (method === "GET" && path === `${API_PREFIX}/bootstrap`) return await handleBootstrap(parsed, services);
    if (method === "GET" && path === `${API_PREFIX}/models`) return await handleModels(services);
    if (method === "POST" && path === `${API_PREFIX}/sessions`) {
      return await handleSession(req, services);
    }
    if (
      method === "PUT"
      && (
        path === `${API_PREFIX}/settings`
        || path === `${API_PREFIX}/drafts/work`
        || path === `${API_PREFIX}/drafts/chat`
      )
    ) {
      return await handleMutation(req, path, services);
    }
  } catch (error) {
    return resultFromError(error);
  }
  return { statusCode: 404, body: { ok: false, code: "not-found", error: "not found" } };
}

export function sendJson(res, result) {
  const body = JSON.stringify(result.body);
  res.writeHead(result.statusCode, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}
