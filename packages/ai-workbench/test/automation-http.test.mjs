import test from "node:test";
import assert from "node:assert/strict";
import { routeRequest } from "../lib/host/http.js";

const path = "/api/dsh-ai-workbench/automations";
const service = {
  list: async (filters) => ({ filters }),
  get: async (id) => ({ id }),
  create: async (input) => ({ ...input, id: "a1" }),
  update: async (id, input) => ({ id, ...input }),
  remove: async (id) => ({ id, deleted: true }),
  setEnabled: async (id, enabled) => ({ id, enabled }),
  listRuns: async (id) => [{ automationId: id }],
};

function request(method, url, body, headers = {}) {
  return {
    method,
    url,
    headers: { host: "localhost", ...(method !== "GET" ? { "content-type": "application/json", "x-dsh-workbench-action": "1" } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

test("automation routes expose list, detail, runs, and mutations", async () => {
  assert.deepEqual((await routeRequest(request("GET", `${path}?query=日报&status=active`), { automationService: service })).body.data, { filters: { query: "日报", status: "active" } });
  assert.deepEqual((await routeRequest(request("GET", `${path}/a1`), { automationService: service })).body.data, { id: "a1" });
  assert.deepEqual((await routeRequest(request("GET", `${path}/a1/runs`), { automationService: service })).body.data, [{ automationId: "a1" }]);
  assert.equal((await routeRequest(request("POST", path, { name: "日报" }), { automationService: service })).statusCode, 201);
  assert.equal((await routeRequest(request("PUT", `${path}/a1`, { name: "简报" }), { automationService: service })).body.data.name, "简报");
  assert.equal((await routeRequest(request("POST", `${path}/a1/enabled`, { enabled: false }), { automationService: service })).body.data.enabled, false);
  assert.equal((await routeRequest(request("DELETE", `${path}/a1`), { automationService: service })).body.data.deleted, true);
});

test("automation mutations keep the action and JSON protections", async () => {
  const missingAction = await routeRequest(request("POST", path, {}, { "x-dsh-workbench-action": undefined }), { automationService: service });
  assert.equal(missingAction.statusCode, 403);
  const wrongType = await routeRequest(request("POST", path, {}, { "content-type": "text/plain" }), { automationService: service });
  assert.equal(wrongType.statusCode, 415);
  const encodedSlash = await routeRequest(request("GET", `${path}/a%2Fb`), { automationService: service });
  assert.equal(encodedSlash.statusCode, 404);
});
