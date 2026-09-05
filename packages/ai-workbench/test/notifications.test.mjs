import test from "node:test";
import assert from "node:assert/strict";
import { createNotifier } from "../lib/host/notifications.js";
import { createNotificationService } from "../lib/host/notification-service.js";

test("macOS notifier escapes script values and never throws", async () => {
  let call;
  const notifier = createNotifier({ platform: "darwin", spawn: (...args) => { call = args; } });
  await notifier.notify({ title: "标题\\\"", body: "内容\\\"" });
  assert.equal(call[0], "osascript");
  assert.match(call[1][1], /标题\\\\\\\"/);
});

test("notification service persists a sanitized summary before delivery", async () => {
  const records = [];
  const service = createNotificationService({
    repository: {
      putNotification: async (record) => (records.push(record), record),
    },
    notifier: { notify: async () => {} },
    id: () => "n1",
    now: () => "2026-09-04T00:00:00.000Z",
  });
  await service.create({ kind: "reminder", title: "提醒", summary: "a\n".repeat(200), automationId: "a1", runId: "r1" });
  assert.equal(records[0].id, "n1");
  assert.equal(records[0].readAt, null);
  assert.ok(records[0].summary.length <= 120);
  assert.doesNotMatch(records[0].summary, /\n/);
});
