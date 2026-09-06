import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkSessionInput, capabilityItemsFromWorkbench, draftFromTemplate, subscribeWorkspaceRuntime, workspaceAddGuidance, workspaceFeedFromWorkbench, workspaceItemsFromFeed } from "../lib/client/work-home.js";
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

test("workspace adapter reads the real workspace row id from top-level items", () => {
  assert.deepEqual(workspaceItemsFromFeed({
    items: [{ workspaceId: "w1", title: "教学", path: "/x" }],
  }), [{ id: "w1", title: "教学", path: "/x" }]);
});

test("workspace adapter reads the injected DSH workspace runtime snapshot", () => {
  const snapshot = { items: [{ workspaceId: "w-runtime", title: "运行时空间", path: "/tmp/runtime" }] };
  const workspaces = { getSnapshot: () => snapshot, subscribe: () => () => {} };

  assert.equal(workspaceFeedFromWorkbench({ workspaces }), snapshot);
});

test("workspace adapter reads the DSH workspace list observable", () => {
  const snapshot = { items: [{ workspaceId: "dsh-workspace", title: "DSH 工作区", path: "/tmp/dsh" }] };
  let subscribed = false;
  const workspaces = {
    list: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        subscribed = true;
        listener();
        return () => {};
      },
    },
  };

  assert.equal(workspaceFeedFromWorkbench({ workspaces }), snapshot);
  subscribeWorkspaceRuntime(workspaces, () => {});
  assert.equal(subscribed, true);
});

test("workspace runtime subscriptions refresh consumers and clean up", () => {
  const updates = [];
  let disposed = false;
  const workspaces = {
    subscribe(listener) {
      listener();
      return () => { disposed = true; };
    },
  };

  const dispose = subscribeWorkspaceRuntime(workspaces, () => updates.push("updated"));
  dispose();

  assert.deepEqual(updates, ["updated"]);
  assert.equal(disposed, true);
});

test("Work selection hides capabilities that the catalog marks unavailable", () => {
  assert.deepEqual(capabilityItemsFromWorkbench({ capabilities: [
    { id: "tool:web", name: "联网搜索", available: true },
    { id: "skill:dsh:broken", name: "损坏技能", available: false },
  ] }), [{ id: "tool:web", title: "联网搜索" }]);
});

test("workspace add guidance explains the verified DSH fallback", () => {
  assert.match(workspaceAddGuidance({ create() {} }), /返回 DSH/);
  assert.match(workspaceAddGuidance({ pickDirectory() {}, create() {} }), /选择本机目录/);
});
