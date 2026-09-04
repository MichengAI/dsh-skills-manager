import test from "node:test";
import assert from "node:assert/strict";
import { validateOrigin, routeRequest } from "../lib/host/http.js";

test("origin fence accepts loopback and rejects cross-site", () => {
  assert.equal(validateOrigin({ headers: { host: "localhost:3080" } }), null);
  assert.equal(validateOrigin({ headers: { host: "evil.example", "sec-fetch-site": "cross-site" } }).statusCode, 403);
});

test("diagnostics route returns the probe snapshot", async () => {
  const result = await routeRequest(
    { method: "GET", url: "/api/dsh-ai-workbench/diagnostics", headers: { host: "127.0.0.1:3080" } },
    { diagnostics: () => ({ compatible: false, failures: ["slot:root"] }) },
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.compatible, false);
});
