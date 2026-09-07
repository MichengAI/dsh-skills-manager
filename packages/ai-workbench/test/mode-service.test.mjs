import test from "node:test";
import assert from "node:assert/strict";
import { createModeService, historyTitle } from "../lib/host/mode-service.js";
import {
  assertMode,
  parseDraft,
  parseSessionMeta,
  parseSettings,
} from "../lib/shared/contracts.js";

function session(id, createdAt) {
  return { header: { id, createdAt } };
}

test("history title explains failed and imported sessions without a host title", () => {
  assert.equal(historyTitle({ mode: "work", setupStatus: "failed" }, null), "任务启动失败");
  assert.equal(historyTitle({ mode: "chat", origin: "migration" }, null), "导入的未命名会话");
  assert.equal(historyTitle({ mode: "chat", origin: "user" }, null), "未命名对话");
  assert.equal(historyTitle({ mode: "work" }, "  周报任务  "), "周报任务");
});

test("unclassified sessions become virtual imported Work history without writes", async () => {
  const writes = [];
  const titles = [];
  const metas = new Map([
    ["chat-1", { sessionId: "chat-1", mode: "chat", origin: "user", createdAt: "2026-09-02T00:00:00.000Z" }],
  ]);
  const service = createModeService({
    repository: {
      getSessionMeta: (id) => metas.get(id) || null,
      putSessionMeta: async (...args) => writes.push(args),
    },
    sessionQuery: {
      listSessions: async () => [
        session("invalid-time", "not-a-date"),
        session("old-1", 1756684800000),
        session("chat-1", 1756771200000),
      ],
      readTitleSnapshots: async (ids) => {
        titles.push(ids);
        return ids.map((sessionId) => ({
          sessionId,
          status: "fulfilled",
          value: { title: { title: sessionId === "old-1" ? "旧任务" : sessionId } },
        }));
      },
    },
  });

  assert.deepEqual(await service.listHistory("work"), [
    {
      sessionId: "old-1",
      mode: "work",
      origin: "migration",
      imported: true,
      createdAt: "2025-09-01T00:00:00.000Z",
      title: "旧任务",
    },
    {
      sessionId: "invalid-time",
      mode: "work",
      origin: "migration",
      imported: true,
      createdAt: "1970-01-01T00:00:00.000Z",
      title: "invalid-time",
    },
  ]);
  assert.deepEqual(await service.listHistory("chat"), [{
    sessionId: "chat-1",
    mode: "chat",
    origin: "user",
    createdAt: "2026-09-02T00:00:00.000Z",
    title: "chat-1",
  }]);
  assert.deepEqual(titles, [["invalid-time", "old-1", "chat-1"], ["invalid-time", "old-1", "chat-1"]]);
  assert.deepEqual(writes, []);
});

test("prepared sessions stay out of ordinary mode history while legacy sessions remain visible", async () => {
  const metas = new Map([
    ["prepared-1", {
      sessionId: "prepared-1",
      mode: "work",
      origin: "user",
      lifecycle: "prepared",
      draftKey: "home-work",
      createdAt: "2026-09-05T12:00:00.000Z",
    }],
    ["active-1", {
      sessionId: "active-1",
      mode: "work",
      origin: "user",
      lifecycle: "active",
      createdAt: "2026-09-04T12:00:00.000Z",
    }],
  ]);
  const service = createModeService({
    repository: {
      getSessionMeta: (id) => metas.get(id) || null,
      putSessionMeta: async () => undefined,
    },
    sessionQuery: {
      listSessions: async () => [
        session("prepared-1", "2026-09-05T12:00:00.000Z"),
        session("active-1", "2026-09-04T12:00:00.000Z"),
      ],
      readTitleSnapshots: async (ids) => ids.map((sessionId) => ({
        sessionId,
        status: "fulfilled",
        value: { title: { title: sessionId } },
      })),
    },
  });

  assert.deepEqual((await service.listHistory("work")).map((item) => item.sessionId), ["active-1"]);
});

test("assignSession rejects a conflicting mode and does not write", async () => {
  const writes = [];
  const service = createModeService({
    repository: {
      getSessionMeta: () => ({ sessionId: "s1", mode: "work", origin: "user" }),
      putSessionMeta: async (...args) => writes.push(args),
    },
    sessionQuery: { listSessions: async () => [], readTitleSnapshots: async () => [] },
  });

  await assert.rejects(
    () => service.assignSession("s1", { mode: "chat", origin: "user" }),
    (error) => error.statusCode === 409 && error.code === "mode-conflict",
  );
  assert.deepEqual(writes, []);
});

test("assignSession keeps an existing mode and writes only new classifications", async () => {
  const writes = [];
  const metas = new Map();
  const service = createModeService({
    repository: {
      getSessionMeta: (id) => metas.get(id) || null,
      putSessionMeta: async (id, value) => {
        writes.push([id, value]);
        metas.set(id, value);
        return value;
      },
    },
    sessionQuery: { listSessions: async () => [], readTitleSnapshots: async () => [] },
  });

  const assigned = await service.assignSession("s1", { mode: "chat", origin: "user" });
  assert.equal(assigned.mode, "chat");
  assert.equal((await service.assignSession("s1", { mode: "chat", origin: "automation" })).origin, "user");
  assert.equal(writes.length, 1);
});

test("assignSession serializes concurrent mode changes and keeps same-mode calls idempotent", async () => {
  const metas = new Map();
  const writes = [];
  const repository = {
    getSessionMeta: async (sessionId) => new Promise((resolve) => {
      setImmediate(() => resolve(metas.get(sessionId) || null));
    }),
    putSessionMeta: async (sessionId, value) => {
      await Promise.resolve();
      writes.push([sessionId, value.mode]);
      const saved = { ...value, sessionId };
      metas.set(sessionId, saved);
      return saved;
    },
  };
  const service = createModeService({
    repository,
    sessionQuery: { listSessions: async () => [], readTitleSnapshots: async () => [] },
  });

  const differentModes = await Promise.allSettled([
    service.assignSession("race", { mode: "work" }),
    service.assignSession("race", { mode: "chat" }),
  ]);
  assert.equal(differentModes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(differentModes.filter((result) => result.status === "rejected")[0].reason.code, "mode-conflict");
  assert.deepEqual(writes.filter(([sessionId]) => sessionId === "race").map(([, mode]) => mode), ["work"]);

  const sameMode = await Promise.allSettled([
    service.assignSession("same", { mode: "chat" }),
    service.assignSession("same", { mode: "chat" }),
  ]);
  assert.deepEqual(sameMode.map((result) => result.status), ["fulfilled", "fulfilled"]);
  assert.deepEqual(writes.filter(([sessionId]) => sessionId === "same").map(([, mode]) => mode), ["chat"]);
});

test("contracts validate modes, normalize session metadata, and isolate Chat drafts", () => {
  assert.equal(assertMode("work"), "work");
  assert.throws(() => assertMode("other"), (error) => error.statusCode === 400 && error.code === "invalid-mode");
  const meta = parseSessionMeta({ mode: "chat", origin: "unknown", automationId: "a1", runId: "r1" });
  assert.deepEqual({ ...meta, createdAt: undefined }, {
    mode: "chat",
    origin: "user",
    automationId: "a1",
    runId: "r1",
    createdAt: undefined,
  });
  assert.match(meta.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

  const work = parseDraft({
    mode: "work",
    text: "整理周报",
    workspaceId: "workspace-1",
    capabilityIds: ["docs", "docs", "search"],
    attachments: [{ mediaType: "image/png", data: "aGVsbG8=", name: "report.png" }],
    execution: { modelPolicy: "manual", provider: "openai", model: "gpt", intensity: "deep" },
  }, "work");
  assert.deepEqual(work, {
    mode: "work",
    text: "整理周报",
    workspaceId: "workspace-1",
    capabilityIds: ["docs", "search"],
    attachments: [{ mediaType: "image/png", data: "aGVsbG8=", name: "report.png" }],
    execution: { modelPolicy: "manual", provider: "openai", model: "gpt", intensity: "deep" },
  });

  const chat = parseDraft({
    mode: "chat",
    text: "解释这个文件",
    workspaceId: "forged-workspace",
    capabilityIds: ["shell"],
    execution: { modelPolicy: "manual", provider: "secret", model: "dangerous" },
    attachments: [],
  }, "chat");
  assert.deepEqual(chat, {
    mode: "chat",
    text: "解释这个文件",
    workspaceId: null,
    capabilityIds: [],
    attachments: [],
    execution: null,
  });
});

test("contracts reject oversized text, invalid attachments, and incomplete manual models", () => {
  assert.throws(() => parseDraft({ text: "x".repeat(20_001), attachments: [] }, "work"), /invalid draft/);
  assert.throws(() => parseDraft({ text: "x", attachments: [{ mediaType: "text/plain", data: "aGVsbG8=" }] }, "chat"), /invalid attachment/);
  assert.throws(() => parseDraft({ text: "x", attachments: [{ mediaType: "image/png", data: "not base64" }] }, "work"), /invalid attachment/);
  assert.throws(() => parseDraft({ text: "x", attachments: [], execution: { modelPolicy: "manual", provider: "openai" } }, "work"), /manual model/);
});

test("contracts reject malformed session metadata and non-string capability IDs", () => {
  for (const value of [null, "chat", 42, []]) {
    assert.throws(() => parseSessionMeta(value), (error) => error.statusCode === 400 && error.code === "invalid-session-meta");
  }
  for (const [field, value] of [["automationId", 42], ["runId", {}], ["createdAt", 0]]) {
    assert.throws(() => parseSessionMeta({ mode: "work", [field]: value }), (error) => error.statusCode === 400 && error.code === "invalid-session-meta");
  }
  assert.throws(
    () => parseDraft({ text: "x", attachments: [], capabilityIds: ["docs", 42] }, "work"),
    (error) => error.statusCode === 400 && error.code === "invalid-capability-ids",
  );
});

test("history converts non-coercible timestamps to the epoch", async () => {
  const service = createModeService({
    repository: { getSessionMeta: async () => null, putSessionMeta: async () => {} },
    sessionQuery: {
      listSessions: async () => [
        session("symbol-time", Symbol("invalid")),
        session("throwing-time", { valueOf() { throw new Error("cannot convert"); } }),
      ],
      readTitleSnapshots: async (ids) => ids.map((sessionId) => ({
        sessionId,
        status: "fulfilled",
        value: { title: { title: sessionId } },
      })),
    },
  });

  const history = await service.listHistory("work");
  assert.deepEqual(history.map(({ sessionId, createdAt }) => [sessionId, createdAt]), [
    ["symbol-time", "1970-01-01T00:00:00.000Z"],
    ["throwing-time", "1970-01-01T00:00:00.000Z"],
  ]);
});

test("settings are normalized to the light workbench contract", () => {
  assert.deepEqual(parseSettings({ defaultMode: "chat", lastMode: "work", localDisplayName: "  老师  ", voiceEnabled: false }), {
    schemaVersion: 1,
    brandName: "正方 AI 工作台",
    theme: "light",
    defaultMode: "chat",
    lastMode: "work",
    localDisplayName: "老师",
    voiceEnabled: false,
  });
});

test("settings reject null and non-object input", () => {
  for (const value of [null, "work", 42, []]) {
    assert.throws(() => parseSettings(value), (error) => error.statusCode === 400 && error.code === "invalid-settings");
  }
});
