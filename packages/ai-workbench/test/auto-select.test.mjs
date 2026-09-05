import test from "node:test";
import assert from "node:assert/strict";
import { recommendExecution } from "../lib/shared/auto-select.js";
import { WORK_TEMPLATES } from "../lib/shared/work-templates.js";

test("data reconciliation selects spreadsheet and deep execution", () => {
  assert.deepEqual(recommendExecution("核对科研与人事数据，汇总成果并生成简报", ["skill:dsh:spreadsheets", "skill:dsh:documents"]), {
    modelPolicy: "auto", intensity: "deep", capabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"], reason: "命中数据处理与文档生成规则",
  });
});

test("templates prefill but never send", () => {
  const template = WORK_TEMPLATES.find((item) => item.id === "teaching-weekly");
  assert.equal(template.action, "prefill");
  assert.ok(template.promptTemplate.includes("周报"));
  assert.equal(template.enabled, true);
});
