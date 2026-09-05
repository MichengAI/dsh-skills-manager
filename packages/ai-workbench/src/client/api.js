export const BASE = "/api/dsh-ai-workbench";

const MODES = new Set(["work", "chat"]);

function clientError(message, code) {
  return Object.assign(new Error(message), { code, status: 400 });
}

function responseError(message, code, status, cause, sessionId) {
  return Object.assign(new Error(message), {
    code,
    status,
    ...(cause !== undefined ? { cause } : {}),
    ...(typeof sessionId === "string" ? { sessionId } : {}),
  });
}

function assertMode(mode) {
  if (!MODES.has(mode)) throw clientError("invalid mode", "invalid-mode");
  return mode;
}

function assertPath(path) {
  if (
    typeof path !== "string"
    || !path.startsWith("/")
    || path.startsWith("//")
    || path.includes("\\")
    || path.includes("://")
  ) throw clientError("invalid request path", "invalid-request-path");

  const pathname = path.split(/[?#]/, 1)[0];
  for (const segment of pathname.split("/")) {
    let decodedSegment;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      throw clientError("invalid request path", "invalid-request-path");
    }
    if (segment === "." || segment === ".." || decodedSegment === "." || decodedSegment === "..") {
      throw clientError("invalid request path", "invalid-request-path");
    }
  }
  return path;
}

export async function request(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    ...(options.headers || {}),
    "content-type": "application/json",
    ...(method !== "GET" ? { "x-dsh-workbench-action": "1" } : {}),
  };
  const requestPath = assertPath(path);
  let response;
  try {
    response = await fetch(`${BASE}${requestPath}`, { ...options, method, headers });
  } catch (cause) {
    throw responseError("network error", "network-error", 0, cause);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw responseError("invalid response", "invalid-response", response.status, cause);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw responseError("invalid response", "invalid-response", response.status);
  }

  const hasData = Object.prototype.hasOwnProperty.call(payload, "data");
  if (!response.ok) {
    const structuredError = payload.ok === false && payload.error && typeof payload.error === "object"
      ? payload.error
      : payload;
    if (payload.ok === false && typeof (structuredError.code || payload.code) === "string") {
      const code = structuredError.code || payload.code;
      const message = structuredError.message || (typeof payload.error === "string" ? payload.error : "request failed");
      throw responseError(message, code, response.status, undefined, structuredError.sessionId);
    }
    throw responseError("invalid response", "invalid-response", response.status);
  }

  if (payload.ok !== true || !hasData || payload.data === undefined) {
    throw responseError("invalid response", "invalid-response", response.status);
  }
  return payload.data;
}

export const workbenchApi = {
  bootstrap: (mode) => request(`/bootstrap?mode=${encodeURIComponent(assertMode(mode))}`),
  startSession: (input) => request("/sessions", { method: "POST", body: JSON.stringify(input) }),
  listModels: () => request("/models"),
  saveDraft: (mode, draft) => request(`/drafts/${assertMode(mode)}`, { method: "PUT", body: JSON.stringify(draft) }),
  saveSettings: (settings) => request("/settings", { method: "PUT", body: JSON.stringify(settings) }),
};
