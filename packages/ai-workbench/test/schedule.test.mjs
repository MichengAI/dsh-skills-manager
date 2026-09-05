import test from "node:test";
import assert from "node:assert/strict";
import {
  latestMissedOccurrence,
  nextOccurrence,
  runKey,
} from "../lib/shared/schedule.js";
import { normalizeAutomation, normalizeSchedule } from "../lib/shared/automation-contracts.js";

const at = (value) => new Date(value).getTime();

test("once runs exactly once", () => {
  const rule = { kind: "once", at: "2026-09-04T10:00:00+08:00" };
  assert.equal(nextOccurrence(rule, at("2026-09-04T09:00:00+08:00")), at("2026-09-04T10:00:00+08:00"));
  assert.equal(nextOccurrence(rule, at("2026-09-04T10:00:00+08:00")), null);
});

test("workday recurrence skips a weekend", () => {
  const rule = { kind: "workdays", time: "08:00" };
  assert.equal(new Date(nextOccurrence(rule, at("2026-09-04T09:00:00+08:00"))).toISOString(), "2026-09-07T00:00:00.000Z");
});

test("monthly day skips a month that does not contain that day", () => {
  const rule = { kind: "monthly", day: 31, time: "09:00" };
  assert.equal(new Date(nextOccurrence(rule, at("2027-02-01T00:00:00+08:00"))).toISOString(), "2027-03-31T01:00:00.000Z");
});

test("resume chooses only the latest missed recurring occurrence", () => {
  const rule = { kind: "daily", time: "08:00" };
  assert.equal(new Date(latestMissedOccurrence(rule, at("2026-09-01T08:00:00+08:00"), at("2026-09-04T10:00:00+08:00"))).toISOString(), "2026-09-04T00:00:00.000Z");
});

test("weekly, interval, and run keys are deterministic", () => {
  const weekly = nextOccurrence({ kind: "weekly", weekdays: [1, 3], time: "09:30" }, at("2026-09-06T10:00:00+08:00"));
  assert.equal(new Date(weekly).toISOString(), "2026-09-07T01:30:00.000Z");
  const interval = nextOccurrence({ kind: "interval", every: 2, unit: "hour", anchorAt: "2026-09-04T08:00:00+08:00" }, at("2026-09-04T09:00:00+08:00"));
  assert.equal(new Date(interval).toISOString(), "2026-09-04T02:00:00.000Z");
  assert.equal(runKey("a1", interval), "a1:2026-09-04T02:00:00.000Z");
});

test("invalid dates never rely on Date normalization", () => {
  assert.throws(() => nextOccurrence({ kind: "daily", time: "25:00" }, Date.now()), /invalid schedule/i);
  assert.throws(() => nextOccurrence({ kind: "once", at: "2026-02-30T09:00:00+08:00" }, Date.now()), /invalid schedule/i);
});

test("automation contracts restrict reminder and Work fields", () => {
  assert.deepEqual(normalizeSchedule({ kind: "weekly", weekdays: [1, 5], time: "09:00" }), {
    kind: "weekly",
    weekdays: [1, 5],
    time: "09:00",
  });
  assert.throws(() => normalizeAutomation({ name: "提醒", type: "reminder", prompt: "提示", workspaceRef: "workspace:1", schedule: { kind: "daily", time: "08:00" } }), /invalid automation/i);
  assert.throws(() => normalizeAutomation({ name: "任务", type: "work", prompt: "执行", schedule: { kind: "daily", time: "08:00" } }), /invalid automation/i);
  assert.equal(normalizeAutomation({ name: "任务", type: "work", prompt: "执行", workspaceRef: "workspace:1", schedule: { kind: "daily", time: "08:00" } }).workspaceRef, "workspace:1");
});
