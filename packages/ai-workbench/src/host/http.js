export function validateOrigin(req) {
  const host = String(req.headers?.host || "").toLowerCase();
  const loopback = host === "localhost" || host.startsWith("localhost:") || host === "[::1]" || host.startsWith("[::1]:") || /^127(?:\.\d{1,3}){3}(?::\d+)?$/.test(host);
  if (!loopback || req.headers?.["sec-fetch-site"] === "cross-site") {
    return { statusCode: 403, body: { ok: false, code: "forbidden-origin", error: "forbidden origin" } };
  }
  return null;
}

export async function routeRequest(req, services) {
  const denied = validateOrigin(req);
  if (denied) return denied;
  const path = new URL(req.url, "http://localhost").pathname.replace(/\/+$/, "");
  if (req.method === "GET" && path === "/api/dsh-ai-workbench/diagnostics") {
    return { statusCode: 200, body: { ok: true, data: services.diagnostics() } };
  }
  return { statusCode: 404, body: { ok: false, code: "not-found", error: "not found" } };
}

export function sendJson(res, result) {
  const body = JSON.stringify(result.body);
  res.writeHead(result.statusCode, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}
