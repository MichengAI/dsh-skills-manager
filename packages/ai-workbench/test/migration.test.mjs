import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createModeService } from "../lib/host/mode-service.js";

const fixturePath = new URL("./fixtures/sessions.json", import.meta.url);

async function createFixtureService() {
  const sessions = JSON.parse(await readFile(fileURLToPath(fixturePath), "utf8"));
  const metadata = new Map([
    ["new-work", {
      sessionId: "new-work",
      mode: "work",
      origin: "user",
      createdAt: "2026-09-04T12:00:00.000Z",
    }],
    ["new-chat", {
      sessionId: "new-chat",
      mode: "chat",
      origin: "user",
      createdAt: "2026-09-04T11:00:00.000Z",
    }],
  ]);
  const putSessionMeta = mock.fn(async () => {
    throw new Error("listHistory must not persist migration metadata");
  });
  const repository = {
    getSessionMeta: async (sessionId) => metadata.get(sessionId) || null,
    putSessionMeta,
  };
  const sessionQuery = {
    listSessions: async () => sessions,
    readTitleSnapshots: async (ids) => ids.map((sessionId) => ({
      sessionId,
      status: "fulfilled",
      value: { title: { title: sessionId } },
    })),
  };
  return { service: createModeService({ repository, sessionQuery }), putSessionMeta };
}

test("migrates unclassified sessions into ordered virtual Work history", async () => {
  const { service } = await createFixtureService();

  const work = await service.listHistory("work");

  assert.deepEqual(work.map((item) => item.sessionId), ["new-work", "old-3", "old-2", "old-1"]);
  assert.deepEqual(work.slice(1).map(({ sessionId, mode, origin, imported, createdAt }) => [
    sessionId,
    mode,
    origin,
    imported,
    createdAt,
  ]), [
    ["old-3", "work", "migration", true, "2025-09-03T12:00:00.000Z"],
    ["old-2", "work", "migration", true, "1970-01-01T00:00:00.000Z"],
    ["old-1", "work", "migration", true, "1970-01-01T00:00:00.000Z"],
  ]);
});

test("keeps explicit Chat history isolated and listing never persists metadata", async () => {
  const { service, putSessionMeta } = await createFixtureService();

  assert.deepEqual((await service.listHistory("chat")).map((item) => item.sessionId), ["new-chat"]);
  assert.equal(putSessionMeta.mock.calls.length, 0);
});
