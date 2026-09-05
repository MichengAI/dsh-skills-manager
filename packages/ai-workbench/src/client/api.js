export const BASE = "/api/dsh-ai-workbench";

const MODES = new Set(["work", "chat"]);

function clientError(message, code) {
  return Object.assign(new Error(message), { code, status: 400 });
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
  const response = await fetch(`${BASE}${assertPath(path)}`, { ...options, method, headers });

  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw Object.assign(new Error("invalid JSON response"), {
      code: "invalid-json-response",
      status: response.status,
      cause,
    });
  }

  if (!response.ok || payload?.ok === false) {
    throw Object.assign(new Error(payload?.error || "request failed"), {
      code: payload?.code || "request-failed",
      status: response.status,
    });
  }
  return payload?.data;
}

export const workbenchApi = {
  bootstrap: (mode) => request(`/bootstrap?mode=${encodeURIComponent(assertMode(mode))}`),
  saveDraft: (mode, draft) => request(`/drafts/${assertMode(mode)}`, { method: "PUT", body: JSON.stringify(draft) }),
  saveSettings: (settings) => request("/settings", { method: "PUT", body: JSON.stringify(settings) }),
};
