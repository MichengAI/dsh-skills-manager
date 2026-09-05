import test from "node:test";
import assert from "node:assert/strict";
import {
  isoFromLocalDateTime,
  localDateTimeInput,
  scheduleCopy,
  sortAutomations,
  validateAutomationDraft,
} from "../lib/client/schedule-fields.js";
import { automationInitialValue } from "../lib/client/automation-editor.js";

test("automation view models format schedules and sort by next run", () => {
  assert.match(scheduleCopy({ kind: "daily", time: "08:00" }), /每天/);
  assert.deepEqual(sortAutomations([{ id: "b", nextRunAt: "2026-09-05" }, { id: "a", nextRunAt: "2026-09-04" }]).map((item) => item.id), ["a", "b"]);
});

test("automation editor validates reminder and Work-specific fields", () => {
  assert.equal(validateAutomationDraft({ name: "", prompt: "", type: "reminder", schedule: { kind: "daily", time: "08:00" } }).name, "请输入任务名称");
  assert.equal(validateAutomationDraft({ name: "任务", prompt: "执行", type: "work", workspaceRef: "", schedule: { kind: "daily", time: "08:00" } }).workspaceRef, "Work 任务需要选择工作空间");
  assert.deepEqual(validateAutomationDraft({ name: "任务", prompt: "执行", type: "work", workspaceRef: "workspace:1", schedule: { kind: "daily", time: "08:00" } }), {});
});

test("automation editor validates every schedule shape before saving", () => {
  const base = { name: "任务", prompt: "执行", type: "reminder" };
  assert.equal(validateAutomationDraft({ ...base, schedule: { kind: "once", at: "" } }).at, "请选择执行时间");
  assert.equal(validateAutomationDraft({ ...base, schedule: { kind: "weekly", time: "08:00", weekdays: [] } }).weekdays, "请至少选择一天");
  assert.equal(validateAutomationDraft({ ...base, schedule: { kind: "monthly", time: "08:00", day: 32 } }).day, "请选择每月执行日期");
  assert.equal(validateAutomationDraft({ ...base, schedule: { kind: "interval", every: 0, unit: "minute", anchorAt: "" } }).interval, "请输入 1 到 999 的间隔值");
  assert.equal(validateAutomationDraft({ ...base, schedule: { kind: "interval", every: 1, unit: "hour", anchorAt: "" } }).anchorAt, "请选择开始时间");
});

test("automation editor uses local datetime inputs without changing the saved instant", () => {
  const instant = "2026-09-05T08:30:00.000Z";
  assert.equal(isoFromLocalDateTime(localDateTimeInput(instant)), instant);
  assert.match(scheduleCopy({ kind: "weekly", weekdays: [1, 3], time: "08:00" }), /周一、周三/);
  assert.match(scheduleCopy({ kind: "interval", every: 2, unit: "hour" }), /每 2 小时/);
});

test("automation templates preserve their schedule and notification choices in the editor", () => {
  const template = {
    name: "每日简报",
    type: "reminder",
    prompt: "整理待办",
    schedule: { kind: "workdays", time: "08:00" },
    notificationPolicy: { onSuccess: true, onFailure: false, onApprovalRequired: false },
  };
  const value = automationInitialValue(null, template);
  assert.deepEqual(value.schedule, template.schedule);
  assert.deepEqual(value.notificationPolicy, template.notificationPolicy);
});
