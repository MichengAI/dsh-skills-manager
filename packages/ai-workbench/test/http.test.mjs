import test from "node:test";
import assert from "node:assert/strict";
import * as http from "../lib/host/http.js";

const { validateOrigin, routeRequest, sendJson } = http;
const diagnosticsPath = "/api/dsh-ai-workbench/diagnostics";

function request(overrides = {}) {
  return {
    method: "GET",
    url: diagnosticsPath,
    headers: { host: "localhost" },
    ...overrides,
  };
}

test("origin fence accepts localhost, IPv6 loopback, IPv4 loopback, and valid ports", () => {
  for (const host of [
    "localhost",
    "localhost:1",
    "localhost:65535",
    "[::1]",
    "[::1]:1",
    "[::1]:65535",
    "127.0.0.1",
    "127.0.0.1:3080",
    "127.255.255.255:65535",
  ]) {
    assert.equal(validateOrigin({ headers: { host } }), null, host);
  }
});

test("origin fence rejects missing, malformed, and cross-site origins", () => {
  for (const req of [
    null,
    undefined,
    {},
    { headers: { host: "localhost:" } },
    { headers: { host: "[::1]:" } },
    { headers: { host: "127.999.999.999" } },
    { headers: { host: "127.0.0.1:0" } },
    { headers: { host: "127.0.0.1:65536" } },
    { headers: { host: "127.0.0.1:abc" } },
    { headers: { host: "127.0.0.1:3080", "sec-fetch-site": "cross-site" } },
  ]) {
    assert.equal(validateOrigin(req)?.statusCode, 403, JSON.stringify(req));
  }
});

test("origin fence rejects non-string and unknown Fetch Metadata values", () => {
  for (const fetchSite of [
    undefined,
    null,
    42,
    ["same-origin"],
    "same-origin, cross-site",
    "future-value",
  ]) {
    const headers = { host: "localhost" };
    Object.defineProperty(headers, "sec-fetch-site", { value: fetchSite, enumerable: true });
    assert.equal(validateOrigin({ headers })?.statusCode, 403, String(fetchSite));
  }
});

test("origin fence reads sec-fetch-site exactly once", () => {
  let reads = 0;
  const headers = {
    host: "localhost",
    get "sec-fetch-site"() {
      reads += 1;
      return reads === 1 ? "same-origin" : "cross-site";
    },
  };

  assert.equal(validateOrigin({ headers }), null);
  assert.equal(reads, 1);
});

test("origin fence fails closed for an exception from the sec-fetch-site getter", () => {
  let reads = 0;
  const headers = {
    host: "localhost",
    get "sec-fetch-site"() {
      reads += 1;
      throw new Error("sec-fetch-site getter secret");
    },
  };

  assert.equal(validateOrigin({ headers })?.statusCode, 403);
  assert.equal(reads, 1);
});

test("origin fence rejects non-canonical ports with leading zeroes", () => {
  for (const host of ["localhost:00001", "127.0.0.1:03080", "[::1]:065535"]) {
    assert.equal(validateOrigin({ headers: { host } })?.statusCode, 403, host);
  }
});

test("origin fence accepts recognized same-site Fetch Metadata values", () => {
  for (const fetchSite of ["same-origin", "same-site", "none", "SAME-ORIGIN"]) {
    assert.equal(validateOrigin({ headers: { host: "localhost", "sec-fetch-site": fetchSite } }), null, fetchSite);
  }
});

test("origin fence accepts an explicit local Origin matching the Host", () => {
  for (const [host, origin] of [
    ["localhost", "http://localhost"],
    ["localhost:3080", "http://localhost:3080"],
    ["127.0.0.1:3080", "https://127.0.0.1:3080"],
    ["[::1]:3080", "http://[::1]:3080"],
  ]) {
    assert.equal(validateOrigin({ headers: { host, origin } }), null, `${host} <- ${origin}`);
  }
});

test("origin fence rejects foreign, malformed, and mismatched explicit Origins", () => {
  for (const headers of [
    { host: "localhost", origin: "https://evil.example" },
    { host: "localhost", origin: "http://127.0.0.1" },
    { host: "localhost:3080", origin: "http://localhost:3081" },
    { host: "localhost", origin: "not-an-origin" },
    { host: "localhost", origin: "http://localhost/path" },
    { host: "localhost", origin: "http://user@localhost" },
    { host: "localhost", origin: "http://localhost:bad" },
    { host: "localhost", origin: "http://localhost:00080" },
    { host: "localhost", origin: undefined },
  ]) {
    assert.equal(validateOrigin({ headers })?.statusCode, 403, JSON.stringify(headers));
  }
});

test("origin fence preserves explicit default-port semantics", () => {
  for (const [host, origin] of [
    ["localhost", "http://localhost:80"],
    ["localhost:80", "http://localhost"],
    ["localhost", "https://localhost:443"],
    ["localhost:443", "https://localhost"],
    ["[::1]", "http://[::1]:80"],
    ["127.0.0.1:80", "https://127.0.0.1"],
  ]) {
    assert.equal(validateOrigin({ headers: { host, origin } })?.statusCode, 403, `${host} <- ${origin}`);
  }

  for (const [host, origin] of [
    ["localhost:80", "http://localhost:80"],
    ["localhost:443", "http://localhost:443"],
    ["[::1]:80", "https://[::1]:80"],
    ["127.0.0.1", "http://127.0.0.1"],
  ]) {
    assert.equal(validateOrigin({ headers: { host, origin } }), null, `${host} <- ${origin}`);
  }
});

test("origin fence fails closed when the explicit Origin getter throws", () => {
  let reads = 0;
  const headers = {
    host: "localhost",
    get origin() {
      reads += 1;
      throw new Error("origin getter secret");
    },
  };

  assert.equal(validateOrigin({ headers })?.statusCode, 403);
  assert.equal(reads, 1);
});

test("origin fence preserves host-only behavior when Origin is absent", () => {
  assert.equal(validateOrigin({ headers: { host: "localhost:3080" } }), null);
  assert.equal(validateOrigin({ headers: { host: "localhost:3080", "sec-fetch-site": "cross-site" } })?.statusCode, 403);
});

test("http API prefix is exported for host registration", () => {
  assert.equal(http.API_PREFIX, "/api/dsh-ai-workbench");
});

test("diagnostics route returns the probe snapshot", async () => {
  const result = await routeRequest(
    request({ headers: { host: "127.0.0.1:3080" } }),
    { diagnostics: () => ({ compatible: false, failures: ["slot:root"] }) },
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.compatible, false);
});

test("routeRequest rejects absolute request targets", async () => {
  for (const url of [
    "http://evil.example/api/dsh-ai-workbench/diagnostics",
    "http://localhost/api/dsh-ai-workbench/diagnostics",
    "//evil.example/api/dsh-ai-workbench/diagnostics",
    "/\\evil.example/api/dsh-ai-workbench/diagnostics",
  ]) {
    const result = await routeRequest(request({ url }), { diagnostics: () => ({}) });
    assert.equal(result.statusCode, 400, url);
    assert.equal(result.body.code, "bad-request", url);
  }
});

test("routeRequest returns a structured 400 for null, undefined, and invalid requests", async () => {
  for (const req of [null, undefined, request({ url: null }), request({ url: "%" })]) {
    const result = await routeRequest(req, { diagnostics: () => ({}) });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.code, "bad-request");
  }
});

test("routeRequest resolves structured errors for throwing request and service proxies", async () => {
  const throwingUrl = new Proxy(request(), {
    get(target, property, receiver) {
      if (property === "url") throw new Error("url getter secret");
      return Reflect.get(target, property, receiver);
    },
  });
  const throwingMethod = new Proxy(request(), {
    get(target, property, receiver) {
      if (property === "method") throw new Error("method getter secret");
      return Reflect.get(target, property, receiver);
    },
  });
  const throwingDiagnostics = new Proxy({}, {
    get() {
      throw new Error("diagnostics getter secret");
    },
  });

  for (const [name, req, services, statusCode, code] of [
    ["url getter", throwingUrl, { diagnostics: () => ({}) }, 400, "bad-request"],
    ["method getter", throwingMethod, { diagnostics: () => ({}) }, 400, "bad-request"],
    ["diagnostics getter", request(), throwingDiagnostics, 500, "internal-error"],
  ]) {
    const [outcome] = await Promise.allSettled([routeRequest(req, services)]);
    assert.equal(outcome.status, "fulfilled", name);
    assert.deepEqual(outcome.value, {
      statusCode,
      body: { ok: false, code, error: statusCode === 400 ? "bad request" : "internal server error" },
    }, name);
  }
});

test("routeRequest returns 500 when diagnostics are missing or throw", async () => {
  for (const services of [
    {},
    { diagnostics: () => { throw new Error("diagnostics failed"); } },
  ]) {
    const result = await routeRequest(request(), services);
    assert.equal(result.statusCode, 500);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.code, "internal-error");
  }
});

test("routeRequest returns 404 for an unknown route", async () => {
  const result = await routeRequest(request({ url: "/api/dsh-ai-workbench/unknown" }), {
    diagnostics: () => ({}),
  });
  assert.equal(result.statusCode, 404);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "not-found");
});

test("sendJson writes status, JSON headers, and response body", () => {
  const result = { statusCode: 200, body: { ok: true, message: "✓" } };
  const calls = {};
  const response = {
    writeHead(statusCode, headers) {
      calls.statusCode = statusCode;
      calls.headers = headers;
    },
    end(body) {
      calls.body = body;
    },
  };

  sendJson(response, result);

  const expectedBody = JSON.stringify(result.body);
  assert.equal(calls.statusCode, 200);
  assert.equal(calls.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(calls.headers["content-length"], Buffer.byteLength(expectedBody));
  assert.equal(calls.body, expectedBody);
});

function workbenchRequest(overrides = {}) {
  return {
    method: "GET",
    url: "/api/dsh-ai-workbench/bootstrap?mode=work",
    headers: { host: "localhost" },
    ...overrides,
  };
}

function jsonMutationRequest(url, body, overrides = {}) {
  const { headers: headerOverrides = {}, ...requestOverrides } = overrides;
  return workbenchRequest({
    method: "PUT",
    url,
    headers: {
      host: "localhost",
      "x-dsh-workbench-action": "1",
      "content-type": "application/json",
      ...headerOverrides,
    },
    body,
    ...requestOverrides,
  });
}

function modeServices(overrides = {}) {
  const writes = [];
  const repository = {
    getSettings: async () => ({ schemaVersion: 1, brandName: "正方 AI 工作台", theme: "light", defaultMode: "work", lastMode: "work", localDisplayName: "本地用户", voiceEnabled: true }),
    getDraft: async (mode) => ({ mode, text: `${mode}-draft`, attachments: [], workspaceId: null, capabilityIds: [], execution: null }),
    putDraft: async (mode, draft) => { writes.push(["draft", mode, draft]); return { ...draft, mode, updatedAt: "2026-09-05T00:00:00.000Z" }; },
    putSettings: async (settings) => { writes.push(["settings", settings]); return settings; },
    getSessionMeta: async () => null,
    putSessionMeta: async (...args) => { writes.push(["session", ...args]); },
    ...overrides.repository,
  };
  const sessionQuery = {
    listSessions: async () => [],
    readTitleSnapshots: async () => [],
    ...overrides.sessionQuery,
  };
  return { diagnostics: () => ({}), repository, sessionQuery, writes, ...overrides };
}

test("bootstrap returns settings, the selected draft, and mode-filtered history", async () => {
  const services = modeServices({
    modeService: { listHistory: async (mode) => [{ sessionId: `${mode}-1`, mode }] },
  });
  const result = await routeRequest(workbenchRequest(), services);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, {
    settings: await services.repository.getSettings(),
    draft: await services.repository.getDraft("work"),
    history: [{ sessionId: "work-1", mode: "work" }],
  });
});

test("bootstrap supports Chat and rejects a missing or unknown mode", async () => {
  const services = modeServices({ modeService: { listHistory: async () => [] } });
  const chat = await routeRequest(workbenchRequest({ url: "/api/dsh-ai-workbench/bootstrap?mode=chat" }), services);
  assert.equal(chat.statusCode, 200);
  assert.equal(chat.body.data.draft.mode, "chat");
  for (const url of ["/api/dsh-ai-workbench/bootstrap", "/api/dsh-ai-workbench/bootstrap?mode=admin"]) {
    const result = await routeRequest(workbenchRequest({ url }), services);
    assert.equal(result.statusCode, 400, url);
    assert.equal(result.body.code, "invalid-mode", url);
  }
});

test("session route separates preparation from message submission", async () => {
  const services = modeServices({
    features: { chat: { available: true } },
    sessionGateway: {
      prepare: async (input) => ({ sessionId: "prepared-1", mode: input.mode, lifecycle: "prepared" }),
      markActive: async (input) => ({ sessionId: input.sessionId, mode: "work", lifecycle: "active" }),
      start: async () => ({ sessionId: "active-1", mode: "work" }),
    },
  });
  const result = await routeRequest(workbenchRequest({
    method: "POST",
    url: "/api/dsh-ai-workbench/sessions",
    headers: { host: "localhost", "x-dsh-workbench-action": "1", "content-type": "application/json" },
    body: JSON.stringify({ intent: "prepare", mode: "work", draftKey: "draft-1" }),
  }), services);

  assert.equal(result.statusCode, 201);
  assert.deepEqual(result.body.data, { sessionId: "prepared-1", mode: "work", lifecycle: "prepared" });

  const active = await routeRequest(workbenchRequest({
    method: "POST",
    url: "/api/dsh-ai-workbench/sessions",
    headers: { host: "localhost", "x-dsh-workbench-action": "1", "content-type": "application/json" },
    body: JSON.stringify({ intent: "active", sessionId: "prepared-1" }),
  }), services);
  assert.equal(active.statusCode, 201);
  assert.deepEqual(active.body.data, { sessionId: "prepared-1", mode: "work", lifecycle: "active" });
});

test("draft endpoints save independent Work and Chat drafts", async () => {
  const services = modeServices();
  const work = await routeRequest(jsonMutationRequest("/api/dsh-ai-workbench/drafts/work", JSON.stringify({
    text: "整理材料",
    workspaceId: "w1",
    capabilityIds: ["docs"],
    attachments: [],
    execution: { modelPolicy: "auto", intensity: "deep" },
  })), services);
  const chat = await routeRequest(jsonMutationRequest("/api/dsh-ai-workbench/drafts/chat", Buffer.from(JSON.stringify({
    text: "解释制度",
    workspaceId: "forged",
    capabilityIds: ["shell"],
    execution: { modelPolicy: "manual", provider: "x", model: "y" },
    attachments: [],
  }))), services);

  assert.equal(work.statusCode, 200);
  assert.equal(work.body.data.workspaceId, "w1");
  assert.equal(chat.statusCode, 200);
  assert.equal(chat.body.data.workspaceId, null);
  assert.deepEqual(chat.body.data.capabilityIds, []);
  assert.equal(chat.body.data.execution, null);
  assert.deepEqual(services.writes.map(([kind, mode]) => [kind, mode]), [["draft", "work"], ["draft", "chat"]]);
});

test("settings endpoint validates, saves, and returns settings", async () => {
  const services = modeServices();
  const result = await routeRequest(jsonMutationRequest("/api/dsh-ai-workbench/settings", JSON.stringify({
    defaultMode: "chat",
    lastMode: "chat",
    localDisplayName: "老师",
    voiceEnabled: false,
  })), services);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.defaultMode, "chat");
  assert.equal(result.body.data.voiceEnabled, false);
  assert.equal(services.writes[0][0], "settings");
});

test("settings endpoint rejects a missing or null JSON body", async () => {
  const services = modeServices();
  const missing = await routeRequest(workbenchRequest({
    method: "PUT",
    url: "/api/dsh-ai-workbench/settings",
    headers: { host: "localhost", "x-dsh-workbench-action": "1", "content-type": "application/json" },
  }), services);
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.body.code, "invalid-json");

  const empty = await routeRequest(jsonMutationRequest(
    "/api/dsh-ai-workbench/settings",
    "",
  ), services);
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.body.code, "invalid-json");

  const nullBody = await routeRequest(jsonMutationRequest(
    "/api/dsh-ai-workbench/settings",
    "null",
  ), services);
  assert.equal(nullBody.statusCode, 400);
  assert.equal(nullBody.body.code, "invalid-settings");
});

test("mutation endpoints require the action header and JSON content type", async () => {
  const services = modeServices();
  const noAction = await routeRequest(jsonMutationRequest(
    "/api/dsh-ai-workbench/drafts/work",
    JSON.stringify({ text: "x", attachments: [] }),
    { headers: { "x-dsh-workbench-action": undefined } },
  ), services);
  assert.equal(noAction.statusCode, 403);
  assert.equal(noAction.body.code, "action-required");
  const noJson = await routeRequest(jsonMutationRequest(
    "/api/dsh-ai-workbench/drafts/work",
    JSON.stringify({ text: "x", attachments: [] }),
    { headers: { "content-type": "text/plain" } },
  ), services);
  assert.equal(noJson.statusCode, 415);
  assert.equal(noJson.body.code, "content-type-required");
});

test("draft mutation routes are exact and do not match nested paths", async () => {
  const result = await routeRequest(jsonMutationRequest(
    "/api/dsh-ai-workbench/drafts/work/extra",
    JSON.stringify({ text: "x", attachments: [] }),
  ), modeServices());
  assert.equal(result.statusCode, 404);
  assert.equal(result.body.code, "not-found");
});

test("mutation endpoints reject malformed JSON and payloads over 1 MiB", async () => {
  const services = modeServices();
  const malformed = await routeRequest(jsonMutationRequest("/api/dsh-ai-workbench/drafts/work", "{"), services);
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.code, "invalid-json");

  const oversized = await routeRequest(jsonMutationRequest(
    "/api/dsh-ai-workbench/drafts/work",
    Buffer.alloc((1 << 20) + 1, 0x61),
  ), services);
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.body.code, "payload-too-large");
});

test("body reader accepts an IncomingMessage-style async iterable", async () => {
  const services = modeServices();
  const chunks = [
    Buffer.from('{"text":"异步读取","attachments":['),
    Buffer.from("]}"),
  ];
  const req = workbenchRequest({
    method: "PUT",
    url: "/api/dsh-ai-workbench/drafts/chat",
    headers: { host: "localhost", "x-dsh-workbench-action": "1", "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  });
  const result = await routeRequest(req, services);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.text, "异步读取");
});

test("invalid drafts return 400 and history does not reclassify sessions", async () => {
  const services = modeServices({
    modeService: undefined,
    sessionQuery: {
      listSessions: async () => [{ header: { id: "s1", createdAt: "2026-09-05T00:00:00.000Z" } }],
      readTitleSnapshots: async () => [],
    },
  });
  const invalidDraft = await routeRequest(jsonMutationRequest(
    "/api/dsh-ai-workbench/drafts/work",
    JSON.stringify({ text: "x", attachments: [{ mediaType: "text/plain", data: "aGVsbG8=" }] }),
  ), services);
  assert.equal(invalidDraft.statusCode, 400);
  assert.equal(invalidDraft.body.code, "invalid-attachment");

  const bootstrap = await routeRequest(workbenchRequest(), services);
  assert.equal(bootstrap.statusCode, 200);
  assert.equal(bootstrap.body.data.history[0].origin, "migration");
  assert.equal(bootstrap.body.data.history[0].imported, true);
  assert.equal(services.writes.some(([kind]) => kind === "session"), false);
});

test("service failures return a generic 500 without a stack", async () => {
  const result = await routeRequest(workbenchRequest(), modeServices({
    modeService: { listHistory: async () => { throw new Error("secret stack detail"); } },
  }));
  assert.deepEqual(result, {
    statusCode: 500,
    body: { ok: false, code: "internal-error", error: "internal server error" },
  });
  assert.equal(JSON.stringify(result).includes("secret stack detail"), false);
});
