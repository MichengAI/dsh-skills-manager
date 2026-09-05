import test from "node:test";
import assert from "node:assert/strict";
import { createAutomationService } from "../lib/host/automation-service.js";

function makeRepository() {
  const automations = new Map();
  const runs = new Map();
  return {
    putAutomation: async (value) => (automations.set(value.id, structuredClone(value)), structuredClone(value)),
    getAutomation: (id) => structuredClone(automations.get(id) || null),
    listAutomations: () => [...automations.values()].map((value) => structuredClone(value)),
    deleteAutomation: async (id) => automations.delete(id),
    putAutomationRun: async (value) => (runs.set(value.id, structuredClone(value)), structuredClone(value)),
    getAutomationRun: (id) => structuredClone(runs.get(id) || null),
    listAutomationRuns: () => [...runs.values()].map((value) => structuredClone(value)),
    deleteAutomationRun: async (id) => runs.delete(id),
  };
}

test("create computes next run and update preserves identity", async () => {
  const repository = makeRepository();
  const service = createAutomationService({ repository, id: () => "a1", now: () => "2026-09-04T01:00:00.000Z" });
  const created = await service.create({
    name: "日报",
    type: "reminder",
    prompt: "写日报",
    schedule: { kind: "once", at: "2026-09-05T08:00:00+08:00" },
    timezone: "Asia/Shanghai",
    enabled: true,
  });
  assert.equal(created.id, "a1");
  assert.equal(created.nextRunAt, "2026-09-05T00:00:00.000Z");
  const updated = await service.update("a1", { name: "每日简报" });
  assert.equal(updated.id, "a1");
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.name, "每日简报");
});

test("run claim uses automation plus planned time as durable identity", async () => {
  const repository = makeRepository();
  let id = 0;
  const service = createAutomationService({ repository, id: () => (id++ === 0 ? "a1" : "run-2"), now: () => "2026-09-04T01:00:00.000Z" });
  await service.create({ name: "提醒", type: "reminder", prompt: "提示", schedule: { kind: "daily", time: "08:00" } });
  const first = await service.claim("a1", "2026-09-04T02:00:00.000Z");
  const second = await service.claim("a1", "2026-09-04T02:00:00.000Z");
  assert.equal(first.claimed, true);
  assert.deepEqual(second, { claimed: false, runId: first.run.id });
  assert.equal(first.run.idempotencyKey, "a1:2026-09-04T02:00:00.000Z");
});

test("reminders reject Work-only fields and deleting an active run is refused", async () => {
  const repository = makeRepository();
  const service = createAutomationService({ repository, id: () => "a1", now: () => "2026-09-04T01:00:00.000Z" });
  await assert.rejects(() => service.create({ name: "提醒", type: "reminder", prompt: "提示", workspaceRef: "workspace:1", schedule: { kind: "daily", time: "08:00" } }), (error) => error.code === "invalid-automation");
  await service.create({ name: "任务", type: "work", prompt: "执行", workspaceRef: "workspace:1", schedule: { kind: "daily", time: "08:00" } });
  const claimed = await service.claim("a1", "2026-09-04T02:00:00.000Z");
  await service.updateRun(claimed.run.id, { status: "running" });
  await assert.rejects(() => service.remove("a1"), (error) => error.code === "automation-active" && error.statusCode === 409);
});

test("resume keeps one missed once and collapses recurring misses", async () => {
  const repository = makeRepository();
  let id = 0;
  const service = createAutomationService({ repository, id: () => `a${++id}`, now: () => "2026-09-03T10:00:00.000Z" });
  await service.create({ name: "一次", type: "reminder", prompt: "提示", schedule: { kind: "once", at: "2026-09-04T08:00:00.000Z" } });
  await service.create({ name: "每日", type: "reminder", prompt: "提示", schedule: { kind: "daily", time: "08:00" } });
  const resumed = await service.resume("2026-09-04T10:00:00.000Z");
  assert.equal(resumed.length, 2);
  assert.equal((await service.get("a1")).nextRunAt, "2026-09-04T08:00:00.000Z");
});
