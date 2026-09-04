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
