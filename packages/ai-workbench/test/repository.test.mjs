import test from "node:test";
import assert from "node:assert/strict";
import { createRepository, openWorkbenchUnit, TABLES } from "../lib/host/repository.js";

function memoryUnit(seed = {}, hooks = {}) {
  const tables = structuredClone(seed);
  const calls = hooks.calls ?? [];
  return {
    async loadAll() {
      calls.push(["loadAll"]);
      return { tables, global: null };
    },
    async putRecord(table, key, value) {
      calls.push(["putRecord", table, key, structuredClone(value)]);
      await hooks.beforePut?.(table, key, value);
      (tables[table] ||= {})[key] = structuredClone(value);
    },
    async deleteRecord(table, key) {
      calls.push(["deleteRecord", table, key]);
      await hooks.beforeDelete?.(table, key);
      delete (tables[table] ||= {})[key];
    },
    async close() {
      calls.push(["close"]);
      await hooks.beforeClose?.();
    },
    snapshot: () => structuredClone(tables),
    calls,
  };
}

test("drafts and session metadata stay independent by mode", async () => {
  const repo = await createRepository(memoryUnit());

  const savedDraft = await repo.putDraft("work", { text: "整理周报", workspaceId: "w1", attachments: [] });
  await repo.putDraft("chat", { text: "解释 RAG", attachments: [] });
  const savedMeta = await repo.putSessionMeta("s1", { mode: "chat", origin: "user", createdAt: "2026-09-04T00:00:00.000Z" });

  assert.equal(savedDraft.mode, "work");
  assert.match(savedDraft.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  assert.equal(savedMeta.sessionId, "s1");
  assert.equal((await repo.getDraft("work")).text, "整理周报");
  assert.equal((await repo.getDraft("chat")).text, "解释 RAG");
  assert.equal((await repo.getSessionMeta("s1")).mode, "chat");
  assert.equal(await repo.getSessionMeta("work"), null);
  await repo.deleteSessionMeta("s1");
  assert.equal(await repo.getSessionMeta("s1"), null);
});

test("all repository records are cloned at the boundary", async () => {
  const repo = await createRepository(memoryUnit());
  const draft = await repo.putDraft("work", { text: "原始", attachments: [{ name: "a" }] });
  draft.attachments[0].name = "修改返回值";

  const loaded = await repo.getDraft("work");
  loaded.attachments[0].name = "修改读取值";
  assert.deepEqual(await repo.getDraft("work"), {
    mode: "work",
    text: "原始",
    attachments: [{ name: "a" }],
    updatedAt: loaded.updatedAt,
  });

  const listed = await repo.listAutomations();
  assert.deepEqual(listed, []);
});

test("writes are serialized in invocation order", async () => {
  const calls = [];
  let releaseFirst;
  const firstWrite = new Promise((resolve) => { releaseFirst = resolve; });
  const unit = memoryUnit({}, {
    calls,
    beforePut: async (_table, _key, value) => {
      calls.push(["put-start", value.text]);
      if (value.text === "first") await firstWrite;
      calls.push(["put-end", value.text]);
    },
  });
  const repo = await createRepository(unit);

  const first = repo.putDraft("work", { text: "first", attachments: [] });
  const second = repo.putDraft("work", { text: "second", attachments: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.filter(([name]) => name.startsWith("put-")), [["put-start", "first"]]);

  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(calls.filter(([name]) => name.startsWith("put-")), [
    ["put-start", "first"],
    ["put-end", "first"],
    ["put-start", "second"],
    ["put-end", "second"],
  ]);
  assert.equal((await repo.getDraft("work")).text, "second");
});

test("defaults match the workbench metadata contract", async () => {
  const repo = await createRepository(memoryUnit());

  assert.deepEqual(await repo.getDraft("work"), {
    mode: "work",
    text: "",
    attachments: [],
    updatedAt: null,
  });
  assert.deepEqual(await repo.getSettings(), {
    schemaVersion: 1,
    brandName: "正方 AI 工作台",
    theme: "light",
    defaultMode: "work",
    lastMode: "work",
    localDisplayName: "本地用户",
    voiceEnabled: true,
  });
  assert.deepEqual(await repo.getCapabilityPreferences(), { enabledIds: [], updatedAt: null });

  await repo.putSettings({ theme: "dark" });
  await repo.putCapabilityPreferences({ enabledIds: ["search"], updatedAt: "2026-09-05T00:00:00.000Z" });
  assert.deepEqual(await repo.getSettings(), { theme: "dark" });
  assert.deepEqual(await repo.getCapabilityPreferences(), { enabledIds: ["search"], updatedAt: "2026-09-05T00:00:00.000Z" });
});

test("openWorkbenchUnit opens the versioned workbench JSON KV contract", async () => {
  const calls = [];
  const expectedUnit = {};
  const storage = {
    backend: {
      get(kind) {
        calls.push(["get", kind]);
        return {
          kv: {
            open(options) {
              calls.push(["open", options]);
              return expectedUnit;
            },
          },
        };
      },
    },
  };

  assert.equal(await openWorkbenchUnit(storage), expectedUnit);
  assert.equal(calls[0][1], "json");
  assert.deepEqual(calls[1], ["open", {
    name: "dsh_ai_workbench",
    version: 1,
    tables: TABLES,
    hasGlobal: false,
  }]);
});

test("repository exposes automation, home content, run, and notification APIs", async () => {
  const repo = await createRepository(memoryUnit());
  const automation = { id: "a1", name: "每日总结" };
  const run = { id: "r1", automationId: "a1", status: "success" };
  const homeContent = { id: "home", title: "欢迎" };
  const notification = { id: "n1", level: "info" };

  await repo.putAutomation(automation);
  await repo.putAutomationRun(run);
  await repo.putHomeContent(homeContent);
  await repo.putNotification(notification);

  assert.deepEqual(await repo.getAutomation("a1"), automation);
  assert.deepEqual(await repo.listAutomations(), [automation]);
  assert.deepEqual(await repo.listAutomationRuns(), [run]);
  assert.deepEqual(await repo.getHomeContent("home"), homeContent);
  assert.deepEqual(await repo.listNotifications(), [notification]);

  await repo.deleteAutomation("a1");
  await repo.deleteNotification("n1");
  assert.equal(await repo.getAutomation("a1"), null);
  assert.deepEqual(await repo.listNotifications(), []);
});

test("close waits for queued writes before closing the unit", async () => {
  const calls = [];
  let releaseWrite;
  const pendingWrite = new Promise((resolve) => { releaseWrite = resolve; });
  const unit = memoryUnit({}, {
    calls,
    beforePut: async () => {
      await pendingWrite;
      calls.push(["write-finished"]);
    },
  });
  const repo = await createRepository(unit);
  const write = repo.putDraft("work", { text: "等待", attachments: [] });
  const closing = repo.close();

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.some(([name]) => name === "close"), false);

  releaseWrite();
  await Promise.all([write, closing]);
  assert.deepEqual(calls.filter(([name]) => name === "write-finished" || name === "close"), [
    ["write-finished"],
    ["close"],
  ]);
});

test("close is idempotent, waits for queued writes, and rejects the close race", async () => {
  const calls = [];
  let releaseWrite;
  const pendingWrite = new Promise((resolve) => { releaseWrite = resolve; });
  const unit = memoryUnit({}, {
    calls,
    beforePut: async (_table, _key, value) => {
      calls.push(["write-started", value.text]);
      await pendingWrite;
      calls.push(["write-finished", value.text]);
    },
  });
  const repo = await createRepository(unit);
  const write = repo.putDraft("work", { text: "已有写入", attachments: [] });
  await new Promise((resolve) => setImmediate(resolve));

  const closing = repo.close();
  assert.equal(repo.close(), closing);
  const latePut = repo.putDraft("chat", { text: "太晚", attachments: [] });
  const lateDelete = repo.deleteNotification("n1");
  await assert.rejects(latePut, (error) => error.code === "ERR_WORKBENCH_REPOSITORY_CLOSED");
  await assert.rejects(lateDelete, (error) => error.code === "ERR_WORKBENCH_REPOSITORY_CLOSED");
  assert.equal(calls.some(([name]) => name === "close"), false);

  releaseWrite();
  await Promise.all([write, closing]);
  assert.deepEqual(calls.filter(([name]) => ["write-started", "write-finished", "close"].includes(name)), [
    ["write-started", "已有写入"],
    ["write-finished", "已有写入"],
    ["close"],
  ]);
  assert.equal(calls.some(([name, table, key]) => name === "putRecord" && table === "drafts" && key === "chat"), false);
  assert.equal(calls.some(([name]) => name === "deleteRecord"), false);
});
