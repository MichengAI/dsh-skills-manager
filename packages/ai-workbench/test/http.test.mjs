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
