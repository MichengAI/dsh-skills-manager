import test from "node:test";
import assert from "node:assert/strict";
import { workbenchApi } from "../lib/client/api.js";

function jsonResponse(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async json() {
      return payload;
    },
  };
}

test("API uses the workbench base and JSON headers for bootstrap and mutations", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return jsonResponse({ ok: true, data: { saved: true } });
  };

  try {
    await workbenchApi.bootstrap("chat");
    await workbenchApi.saveDraft("work", { text: "任务", attachments: [] });
    await workbenchApi.saveSettings({ defaultMode: "work" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0][0], "/api/dsh-ai-workbench/bootstrap?mode=chat");
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls[0][1].headers["content-type"], "application/json");
  assert.equal(calls[0][1].headers["x-dsh-workbench-action"], undefined);

  assert.equal(calls[1][0], "/api/dsh-ai-workbench/drafts/work");
  assert.equal(calls[1][1].method, "PUT");
  assert.equal(calls[1][1].headers["content-type"], "application/json");
  assert.equal(calls[1][1].headers["x-dsh-workbench-action"], "1");
  assert.equal(calls[1][1].body, JSON.stringify({ text: "任务", attachments: [] }));

  assert.equal(calls[2][0], "/api/dsh-ai-workbench/settings");
  assert.equal(calls[2][1].method, "PUT");
  assert.equal(calls[2][1].headers["x-dsh-workbench-action"], "1");
});

test("API returns response data and rejects invalid modes before fetching", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return jsonResponse({ ok: true, data: { value: 1 } });
  };

  try {
    assert.deepEqual(await workbenchApi.bootstrap("work"), { value: 1 });
    assert.throws(() => workbenchApi.saveDraft("work/../../outside", { text: "", attachments: [] }), /invalid mode/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls, 1);
});

test("API errors include the server code and HTTP status", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(
    { ok: false, code: "invalid-draft", error: "invalid draft" },
    { ok: false, status: 400 },
  );

  try {
    await assert.rejects(
      () => workbenchApi.saveDraft("chat", { text: "", attachments: [] }),
      (error) => error instanceof Error
        && error.message === "invalid draft"
        && error.code === "invalid-draft"
        && error.status === 400,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
