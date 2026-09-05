import test from "node:test";
import assert from "node:assert/strict";
import { scheduleCopy, sortAutomations, validateAutomationDraft } from "../lib/client/schedule-fields.js";

test("automation view models format schedules and sort by next run", () => {
  assert.match(scheduleCopy({ kind: "daily", time: "08:00" }), /每天/);
  assert.deepEqual(sortAutomations([{ id: "b", nextRunAt: "2026-09-05" }, { id: "a", nextRunAt: "2026-09-04" }]).map((item) => item.id), ["a", "b"]);
});

test("automation editor validates reminder and Work-specific fields", () => {
  assert.equal(validateAutomationDraft({ name: "", prompt: "", type: "reminder", schedule: { kind: "daily", time: "08:00" } }).name, "请输入任务名称");
  assert.equal(validateAutomationDraft({ name: "任务", prompt: "执行", type: "work", workspaceRef: "", schedule: { kind: "daily", time: "08:00" } }).workspaceRef, "Work 任务需要选择工作空间");
  assert.deepEqual(validateAutomationDraft({ name: "任务", prompt: "执行", type: "work", workspaceRef: "workspace:1", schedule: { kind: "daily", time: "08:00" } }), {});
});
