import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkSessionInput, draftFromTemplate, workspaceItemsFromFeed } from "../lib/client/work-home.js";
import { findWorkTemplate } from "../lib/shared/work-templates.js";

test("template selection replaces the draft without creating a session", () => {
  const draft = draftFromTemplate(findWorkTemplate("teaching-weekly"), {
    text: "旧任务",
    attachments: [{ type: "image", mediaType: "image/png", data: "QQ==", name: "a.png" }],
    workspaceId: "w1",
  }, ["skill:dsh:spreadsheets", "skill:dsh:documents"]);
  assert.equal(draft.text, "汇总本周课表与考勤数据，分析教学运行情况并生成周报。");
  assert.equal(draft.workspaceId, "w1");
  assert.equal(draft.attachments.length, 1);
  assert.deepEqual(draft.execution.capabilityIds, ["skill:dsh:spreadsheets", "skill:dsh:documents"]);
});

test("session input keeps Work overrides and workspace selection", () => {
  const input = buildWorkSessionInput({
    text: "整理材料",
    attachments: [{ type: "image", mediaType: "image/png", data: "QQ==", name: "a.png" }],
    workspaceId: "w1",
    capabilityIds: ["skill:dsh:documents"],
    execution: { modelPolicy: "manual", provider: "p1", model: "m1", intensity: "deep" },
  });
  assert.deepEqual(input, {
    mode: "work",
    text: "整理材料",
    attachments: [{ type: "image", mediaType: "image/png", data: "QQ==", name: "a.png" }],
    workspaceId: "w1",
    capabilityIds: ["skill:dsh:documents"],
    execution: { modelPolicy: "manual", provider: "p1", model: "m1", intensity: "deep" },
  });
});

test("workspace adapter reads only safe state.items rows", () => {
  assert.deepEqual(workspaceItemsFromFeed({ state: { items: [
    { id: "w1", title: "教学空间", path: "/tmp/teaching" },
    { id: "bad", title: "缺少路径" },
    null,
  ] } }), [{ id: "w1", title: "教学空间", path: "/tmp/teaching" }]);
});

test("workspace adapter reads the runtime top-level items and workspace id", () => {
  assert.deepEqual(workspaceItemsFromFeed({
    workspaceId: "runtime-workspace",
    items: [{ path: "/tmp/runtime", title: "运行时工作空间" }],
  }), [{ id: "runtime-workspace", title: "运行时工作空间", path: "/tmp/runtime" }]);
});
