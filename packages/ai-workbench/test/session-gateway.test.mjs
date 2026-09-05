import test from "node:test";
import assert from "node:assert/strict";
import { createSessionGateway } from "../lib/host/session-gateway.js";
import { routeRequest } from "../lib/host/http.js";

function ok(value) {
  return { rpcId: "rpc", result: { ok: true, value } };
}

function errorResponse(code, message = code) {
  return { rpcId: "rpc", result: { ok: false, error: { code, message } } };
}

function createDeps(overrides = {}) {
  const calls = [];
  const meta = new Map();
  const deps = {
    apiProxy: {
      sessions: {
        create: async (request) => {
          calls.push(["create", request.payload]);
          return ok({ sessionId: request.payload.sessionId });
        },
        prompt: async (request) => {
          calls.push(["prompt", request.payload]);
          return ok({ accepted: true });
        },
        models: async (request) => {
          calls.push(["session-models", request.payload]);
          return ok({
            current: { provider: "openai", model: "gpt-5" },
            groups: [{ id: "openai", models: [{ id: "gpt-5", reasoning: { efforts: [{ id: "standard" }, { id: "high" }] } }] }],
          });
        },
        selectModel: async (request) => {
          calls.push(["select-model", request.payload]);
          return ok({ selected: true });
        },
      },
      llm: {
        models: async (request) => {
          calls.push(["llm-models", request.payload]);
          return ok({
            current: { provider: "openai", model: "gpt-5", apiKey: "secret" },
            groups: [{
              id: "openai",
              label: "OpenAI",
              secret: "do-not-leak",
              models: [{ id: "gpt-5", label: "GPT-5", settings: { apiKey: "secret" }, reasoning: { efforts: [{ id: "standard" }, { id: "high" }] } }],
            }],
          });
        },
      },
    },
    repository: {
      putSessionMeta: async (id, value) => { calls.push(["put-meta", id, value]); meta.set(id, value); return value; },
      deleteSessionMeta: async (id) => { calls.push(["delete-meta", id]); meta.delete(id); },
    },
    permissionPresets: { set: async (...args) => calls.push(["permission", ...args]) },
    sessions: { get: (id) => ({ id }) },
    id: () => "session-1",
    rpcId: () => "rpc-1",
    ...overrides,
  };
  return { calls, meta, deps };
}

test("Chat always uses the restricted preset and ignores Work-only fields", async () => {
  const { calls, deps } = createDeps();
  const gateway = createSessionGateway(deps);

  await gateway.start({
    mode: "chat",
    text: "你好",
    workspaceId: "forged-workspace",
    capabilityIds: ["shell"],
    execution: { modelPolicy: "manual", provider: "evil", model: "model" },
    deepThinking: true,
    attachments: [],
  });

  assert.deepEqual(calls.find(([kind]) => kind === "create")[1], {
    sessionId: "session-1",
    agentPreset: "zf-chat-workbench-v1",
  });
  assert.equal(calls.some(([kind]) => kind === "permission"), false);
  assert.equal(calls.some(([kind]) => kind === "llm-models"), false);
  assert.doesNotMatch(calls.find(([kind]) => kind === "prompt")[1].content[0].text, /shell|forged-workspace|evil/);
});

test("Work uses standard, workspace-write, and records selected capabilities", async () => {
  const { calls, meta, deps } = createDeps();
  const gateway = createSessionGateway(deps);

  const result = await gateway.start({
    mode: "work",
    text: "整理材料",
    workspaceId: "w1",
    capabilityIds: ["skill:docs"],
    attachments: [],
  });

  assert.equal(result.agentPreset, "standard");
  assert.deepEqual(calls.find(([kind]) => kind === "create")[1], {
    sessionId: "session-1",
    agentPreset: "standard",
    workspaceId: "w1",
  });
  assert.equal(calls.find(([kind]) => kind === "permission")[2], "workspace-write");
  assert.deepEqual(meta.get("session-1").capabilityIds, ["skill:docs"]);
  assert.match(calls.find(([kind]) => kind === "prompt")[1].content[0].text, /skill:docs/);
});

test("manual Work model is checked against the catalog before publishing", async () => {
  const { calls, meta, deps } = createDeps({
    apiProxy: {
      ...createDeps().deps.apiProxy,
      llm: { models: async () => ok({ groups: [{ id: "openai", models: [{ id: "gpt-5" }] }] }) },
    },
  });
  const gateway = createSessionGateway(deps);

  await assert.rejects(
    gateway.start({ mode: "work", text: "x", attachments: [], execution: { modelPolicy: "manual", provider: "openai", model: "missing" } }),
    (error) => error.code === "model-unavailable" && error.statusCode === 409,
  );
  assert.equal(calls.some(([kind]) => kind === "create"), false);
  assert.equal(meta.has("session-1"), false);
  assert.ok(calls.some(([kind]) => kind === "delete-meta"));
});

test("deep reasoning applies only an effort available to the live session model", async () => {
  const { calls, deps } = createDeps();
  const gateway = createSessionGateway(deps);

  const result = await gateway.start({ mode: "work", text: "x", attachments: [], deepThinking: true });

  assert.deepEqual(result.reasoning, { requested: true, applied: true, reason: null });
  assert.deepEqual(calls.find(([kind]) => kind === "select-model")[1], {
    sessionId: "session-1",
    provider: "openai",
    model: "gpt-5",
    reasoningEffort: "high",
  });
});

test("published setup failures retain failed metadata and session id", async () => {
  const { calls, meta, deps } = createDeps({
    apiProxy: {
      ...createDeps().deps.apiProxy,
      sessions: {
        ...createDeps().deps.apiProxy.sessions,
        selectModel: async () => errorResponse("model-selection-failed", "cannot select model"),
      },
    },
  });
  const gateway = createSessionGateway(deps);

  await assert.rejects(
    gateway.start({ mode: "work", text: "x", attachments: [], deepThinking: true }),
    (error) => error.code === "model-selection-failed" && error.sessionId === "session-1",
  );
  assert.equal(meta.get("session-1").setupStatus, "failed");
  assert.equal(meta.get("session-1").setupErrorCode, "model-selection-failed");
  assert.equal(calls.some(([kind]) => kind === "delete-meta"), false);
});

test("models route returns a de-identified catalog", async () => {
  const { deps } = createDeps();
  const result = await routeRequest({
    method: "GET",
    url: "/api/dsh-ai-workbench/models",
    headers: { host: "localhost" },
  }, { apiProxy: deps.apiProxy });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, {
    groups: [{
      id: "openai",
      label: "OpenAI",
      models: [{ id: "gpt-5", label: "GPT-5", reasoning: { efforts: ["standard", "high"] } }],
    }],
  });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("session route enforces a 1 MiB payload and returns structured gateway errors", async () => {
  const { deps } = createDeps({
    sessionGateway: {
      start: async () => {
        throw Object.assign(new Error("cannot select model"), { code: "model-selection-failed", statusCode: 409, sessionId: "session-1", public: true });
      },
    },
  });
  const base = {
    method: "POST",
    url: "/api/dsh-ai-workbench/sessions",
    headers: { host: "localhost", "x-dsh-workbench-action": "1", "content-type": "application/json" },
  };
  const failed = await routeRequest({ ...base, body: JSON.stringify({ mode: "work", text: "x", attachments: [] }) }, deps);
  assert.equal(failed.statusCode, 409);
  assert.deepEqual(failed.body.error, { code: "model-selection-failed", message: "cannot select model", sessionId: "session-1" });

  const oversized = await routeRequest({ ...base, body: Buffer.alloc((1 << 20) + 1, 0x61) }, deps);
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.body.code, "payload-too-large");
});
