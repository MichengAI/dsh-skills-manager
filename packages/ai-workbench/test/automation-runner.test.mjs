import test from "node:test";
import assert from "node:assert/strict";
import { createAutomationRunner } from "../lib/host/automation-runner.js";

function setup() {
  const runs = new Map([["r1", { id: "r1", automationId: "a1", status: "scheduled" }]]);
  const updates = [];
  return {
    updates,
    service: {
      updateRun: async (id, patch) => { const next = { ...runs.get(id), ...patch }; runs.set(id, next); updates.push(next); return next; },
    },
    gateway: { startAutomation: async () => ({ sessionId: "s1" }) },
    notifications: { create: async (input) => updates.push({ notification: input }) },
    run: runs.get("r1"),
  };
}

test("reminder completes without creating a session and work binds a fresh session", async () => {
  const reminder = setup();
  const runner = createAutomationRunner(reminder);
  await runner.execute({ id: "a1", name: "提醒", type: "reminder", prompt: "提示", notificationPolicy: {} }, reminder.run);
  assert.equal(reminder.updates.findLast((item) => item.status)?.status, "succeeded");

  const work = setup();
  const workRunner = createAutomationRunner(work);
  await workRunner.execute({ id: "a1", name: "任务", type: "work", prompt: "执行", notificationPolicy: {} }, work.run);
  assert.equal(work.updates.find((item) => item.sessionId)?.sessionId, "s1");
});

test("approval and terminal events update state without answering approvals", async () => {
  const setupValue = setup();
  const runner = createAutomationRunner(setupValue);
  await runner.execute({ id: "a1", name: "任务", type: "work", prompt: "执行", notificationPolicy: {} }, setupValue.run);
  await runner.handleEvent({ id: "s1" }, { type: "approval/asked", data: { approvalId: "p1", toolName: "write", reason: "需要写入" } });
  assert.equal(setupValue.updates.at(-1).status, "waiting_approval");
  await runner.handleEvent({ id: "s1" }, { type: "approval/decided", data: { approved: false } });
  assert.equal(setupValue.updates.at(-1).status, "rejected");
  await runner.handleEvent({ id: "s1" }, { type: "turn/end", data: { reason: { kind: "completed" } } });
  assert.equal(setupValue.updates.at(-1).status, "rejected");
});
