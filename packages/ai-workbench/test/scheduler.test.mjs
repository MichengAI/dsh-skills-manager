import test from "node:test";
import assert from "node:assert/strict";
import { createScheduler } from "../lib/host/scheduler.js";

function fakeClock(start = Date.parse("2026-09-04T00:00:00.000Z")) {
  let now = start;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    timers,
    advance: async (ms) => {
      now += ms;
      const due = [...timers.entries()].filter(([, timer]) => timer.delay <= ms);
      for (const [id, timer] of due) {
        timers.delete(id);
        await timer.callback();
      }
    },
  };
}

function automation(id, nextRunAt) {
  return { id, enabled: true, status: "active", nextRunAt, schedule: { kind: "once", at: nextRunAt } };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("scheduler arms only the nearest active automation", async () => {
  const clock = fakeClock();
  const service = {
    list: () => [automation("near", "2026-09-04T00:01:00.000Z"), automation("far", "2026-09-04T01:00:00.000Z")],
    syncSystemTimezone: async () => [],
    resume: async () => [],
  };
  const scheduler = createScheduler({ automationService: service, clock, systemTimeZone: () => "Asia/Shanghai" });
  await scheduler.start();
  assert.deepEqual([...clock.timers.values()].map(({ delay }) => delay), [60_000]);
  scheduler.dispose();
  assert.equal(clock.timers.size, 0);
});

test("scheduler claims before execution and duplicate ticks execute once", async () => {
  const clock = fakeClock();
  const calls = [];
  let claimed = false;
  const item = automation("a1", "2026-09-04T00:00:00.000Z");
  const service = {
    list: () => [item],
    listRuns: () => [],
    syncSystemTimezone: async () => [],
    resume: async () => [],
    claim: async () => {
      if (claimed) return { claimed: false, runId: "r1" };
      claimed = true;
      calls.push("claim");
      return { claimed: true, run: { id: "r1" } };
    },
    advance: async () => calls.push("advance"),
    updateRun: async () => {},
  };
  const scheduler = createScheduler({ automationService: service, clock, systemTimeZone: () => "Asia/Shanghai", execute: async () => calls.push("execute") });
  await scheduler.start();
  await clock.advance(60_000);
  await flush();
  assert.deepEqual(calls.slice(0, 3), ["claim", "execute", "advance"]);
  await scheduler.changed();
  assert.equal(calls.filter((value) => value === "execute").length, 1);
  scheduler.dispose();
});

test("scheduler skips a due occurrence while a prior run is active", async () => {
  const clock = fakeClock();
  let skipped;
  const item = automation("a1", "2026-09-04T00:00:00.000Z");
  const service = {
    list: () => [item],
    listRuns: () => [{ status: "running" }],
    syncSystemTimezone: async () => [],
    resume: async () => [],
    claim: async () => ({ claimed: true, run: { id: "r2" } }),
    updateRun: async (id, patch) => { skipped = { id, patch }; },
    advance: async () => {},
  };
  const scheduler = createScheduler({ automationService: service, clock, systemTimeZone: () => "Asia/Shanghai" });
  await scheduler.start();
  await clock.advance(60_000);
  await flush();
  assert.equal(skipped.patch.status, "skipped");
  assert.equal(skipped.patch.skipReason, "previous_run_active");
  scheduler.dispose();
});
