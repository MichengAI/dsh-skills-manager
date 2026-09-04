export const API_PREFIX = "/api/dsh-ai-workbench";
const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

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

function validLoopbackHost(host) {
  const match = /^(localhost|\[::1\]|127(?:\.\d{1,3}){3})(?::(\d+))?$/i.exec(host);
  if (!match) return false;
  if (match[2] !== undefined && !validPort(match[2])) return false;
  return match[1].toLowerCase() === "localhost" || match[1] === "[::1]" || validIpv4(match[1]);
}

function canonicalLoopbackHost(host) {
  try {
    return new URL(`http://${host}`).host.toLowerCase();
  } catch {
    return null;
  }
}

function validLocalOrigin(origin, host) {
  if (typeof origin !== "string" || origin.length === 0 || /\s/.test(origin)) return false;

  const authorityMatch = /^(?:http|https):\/\/([^/?#]*)$/i.exec(origin);
  if (authorityMatch == null || !validLoopbackHost(authorityMatch[1].toLowerCase())) return false;

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

  return parsed.host.toLowerCase() === canonicalLoopbackHost(host);
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
    ) {
      return badRequest();
    }
  } catch {
    return badRequest();
  }

  let path;
  try {
    path = new URL(url, "http://localhost").pathname.replace(/\/+$/, "");
  } catch {
    return badRequest();
  }

  const denied = validateOrigin({ headers });
  if (denied) return denied;

  try {
    if (method === "GET" && path === `${API_PREFIX}/diagnostics`) {
      const diagnostics = services == null ? undefined : services.diagnostics;
      if (typeof diagnostics !== "function") return internalError();
      return { statusCode: 200, body: { ok: true, data: await Reflect.apply(diagnostics, services, []) } };
    }
  } catch {
    return internalError();
  }
  return { statusCode: 404, body: { ok: false, code: "not-found", error: "not found" } };
}

export function sendJson(res, result) {
  const body = JSON.stringify(result.body);
  res.writeHead(result.statusCode, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}
