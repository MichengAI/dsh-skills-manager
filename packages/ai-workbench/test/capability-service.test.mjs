import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilityService } from "../lib/host/capability-service.js";
import { routeRequest } from "../lib/host/http.js";
import { workbenchApi } from "../lib/client/api.js";

const preferencesPath = "/api/dsh-ai-workbench/capability-preferences";

function putRequest(body, headers = {}) {
  return {
    method: "PUT",
    url: preferencesPath,
    headers: { host: "localhost", "content-type": "application/json", "x-dsh-workbench-action": "1", ...headers },
    body: JSON.stringify(body),
  };
}

function getRequest(headers = {}) {
  return { method: "GET", url: preferencesPath, headers: { host: "localhost", ...headers } };
}

test("preference updates preserve first-seen order and reject malformed IDs", async () => {
  let saved;
  const service = createCapabilityService({
    repository: {
      getCapabilityPreferences: () => ({ enabledIds: ["tool:web"] }),
      putCapabilityPreferences: async (value) => (saved = value),
    },
  });

  const result = await service.replace(["skill:dsh:documents", "tool:web", "tool:web"]);
  assert.deepEqual(result.enabledIds, ["skill:dsh:documents", "tool:web"]);
  assert.deepEqual(saved.enabledIds, result.enabledIds);

  for (const id of [
    "../../shell",
    "skill:dsh",
    "skill:dsh:documents:extra",
    "tool:",
    "business:oa:extra",
    "permission:admin",
    "tool:unsafe/value",
  ]) {
    await assert.rejects(() => service.replace([id]), (error) => error.code === "invalid-capabilities" && error.statusCode === 400);
  }
});

test("preference updates enforce the 200-entry and 200-character limits", async () => {
  const service = createCapabilityService({
    repository: { putCapabilityPreferences: async (value) => value },
  });

  const ids = Array.from({ length: 200 }, (_, index) => `tool:item-${index}`);
  assert.equal((await service.replace(ids)).enabledIds.length, 200);
  await assert.rejects(() => service.replace([...ids, "tool:overflow"]), /invalid capabilities/);
  await assert.rejects(() => service.replace([`tool:${"x".repeat(198)}`]), /invalid capabilities/);
});

test("concurrent replacements are persisted in invocation order", async () => {
  const calls = [];
  let releaseFirst;
  const firstWrite = new Promise((resolve) => { releaseFirst = resolve; });
  const service = createCapabilityService({
    repository: {
      putCapabilityPreferences: async (value) => {
        calls.push(value.enabledIds[0]);
        if (calls.length === 1) await firstWrite;
        return value;
      },
    },
  });

  const first = service.replace(["tool:first"]);
  const second = service.replace(["tool:second"]);
  await Promise.resolve();
  assert.deepEqual(calls, ["tool:first"]);

  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ["tool:first", "tool:second"]);
});

test("preference persistence never invokes permission or tool registration APIs", async () => {
  const calls = [];
  const service = createCapabilityService({
    repository: { putCapabilityPreferences: async (value) => value },
    permissionPresets: { set: () => calls.push("permission") },
    toolRegistry: { register: () => calls.push("tool-registration") },
  });

  await service.replace(["business:oa", "tool:web"]);
  assert.deepEqual(calls, []);
});

test("GET returns advisory preferences without requiring mutation headers", async () => {
  const service = createCapabilityService({
    repository: { getCapabilityPreferences: () => ({ enabledIds: ["tool:web"], updatedAt: "2026-09-05T00:00:00.000Z" }) },
  });
  const result = await routeRequest(getRequest(), { capabilityService: service });
  assert.deepEqual(result, {
    statusCode: 200,
    body: { ok: true, data: { enabledIds: ["tool:web"], updatedAt: "2026-09-05T00:00:00.000Z" } },
  });
});

test("PUT requires the exact action header and JSON content type", async () => {
  let writes = 0;
  const service = createCapabilityService({
    repository: { putCapabilityPreferences: async (value) => { writes++; return value; } },
  });

  const missingAction = await routeRequest(putRequest({ enabledIds: [] }, { "x-dsh-workbench-action": undefined }), { capabilityService: service });
  assert.equal(missingAction.statusCode, 403);
  assert.equal(missingAction.body.code, "action-required");

  const wrongAction = await routeRequest(putRequest({ enabledIds: [] }, { "x-dsh-workbench-action": "true" }), { capabilityService: service });
  assert.equal(wrongAction.statusCode, 403);
  assert.equal(wrongAction.body.code, "action-required");

  const wrongContentType = await routeRequest(putRequest({ enabledIds: [] }, { "content-type": "text/plain" }), { capabilityService: service });
  assert.equal(wrongContentType.statusCode, 415);
  assert.equal(wrongContentType.body.code, "content-type-required");
  assert.equal(writes, 0);
});

test("PUT validates and persists advisory capability IDs", async () => {
  let saved;
  const service = createCapabilityService({
    repository: { putCapabilityPreferences: async (value) => (saved = value) },
  });
  const result = await routeRequest(putRequest({ enabledIds: ["tool:web", "tool:web", "skill:dsh:documents"] }), { capabilityService: service });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data.enabledIds, ["tool:web", "skill:dsh:documents"]);
  assert.deepEqual(saved.enabledIds, result.body.data.enabledIds);

  const invalid = await routeRequest(putRequest({ enabledIds: ["permission:admin"] }), { capabilityService: service });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.code, "invalid-capabilities");
});

test("client API reads and writes capability preferences using the workbench routes", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return { ok: true, status: 200, async json() { return { ok: true, data: { enabledIds: ["tool:web"] } }; } };
  };

  try {
    assert.deepEqual(await workbenchApi.capabilityPreferences(), { enabledIds: ["tool:web"] });
    assert.deepEqual(await workbenchApi.saveCapabilityPreferences(["tool:web"]), { enabledIds: ["tool:web"] });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0][0], preferencesPath);
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls[0][1].headers["x-dsh-workbench-action"], undefined);
  assert.equal(calls[1][0], preferencesPath);
  assert.equal(calls[1][1].method, "PUT");
  assert.equal(calls[1][1].headers["x-dsh-workbench-action"], "1");
  assert.equal(calls[1][1].body, JSON.stringify({ enabledIds: ["tool:web"] }));
});
