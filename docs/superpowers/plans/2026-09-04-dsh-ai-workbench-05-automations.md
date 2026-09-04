# DSH AI Workbench Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable local reminders and scheduled Work tasks with simple recurrence choices, idempotent execution, approval-aware status, local notifications, and one Work history record per Work run.

**Architecture:** A host-owned scheduler reads automation definitions from the workbench KV repository and arms only the nearest timer. Due occurrences are claimed by the durable key `automationId + plannedAt`; occurrences for one automation run serially. Work runs use the trusted session gateway, DSH `workspace-write`, and DSH session events for approval/completion. Reminder runs never create an Agent. The browser provides CRUD pages and opens the official Conversation for run details.

**Tech Stack:** Node.js timers and `Intl`, DSH ApiProxy/session events/permissions, JSON KV storage, React 18, native OS notifications with browser/log fallback, Node test runner.

---

### Task 1: Define automation contracts and deterministic schedule calculation

**Files:**
- Create: `packages/ai-workbench/src/shared/automation-contracts.js`
- Create: `packages/ai-workbench/src/shared/schedule.js`
- Create: `packages/ai-workbench/test/schedule.test.mjs`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing schedule tests**

```js
// packages/ai-workbench/test/schedule.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence, latestMissedOccurrence } from "../lib/shared/schedule.js";

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
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `TZ=Asia/Shanghai pnpm --dir packages/ai-workbench run build && TZ=Asia/Shanghai node --test packages/ai-workbench/test/schedule.test.mjs`

Expected: FAIL because the schedule module does not exist.

- [ ] **Step 3: Implement validation and local-time schedule functions**

`automation-contracts.js` must accept these schedule shapes only:

```js
{ kind: "once", at }
{ kind: "daily", time }
{ kind: "weekly", weekdays, time }
{ kind: "monthly", day, time }
{ kind: "workdays", time }
{ kind: "interval", every, unit, anchorAt }
```

Validate `time` as `HH:mm`, every entry in `weekdays` as unique `0..6` where 0 is Sunday, monthly `day` as `1..31`, interval `every` as `1..999`, units as `minute|hour|day`, automation type as `reminder|work`, and status as `active|paused|completed|disabled_by_error`. A Work automation requires `workspaceRef` in the normalized form `workspace:<id>` or `path:<absolute-path>`, while a reminder rejects `workspaceRef` and all capability selections.

Implement `schedule.js` with local `Date` setters, always zeroing seconds and milliseconds for calendar schedules. `nextOccurrence(rule, afterMs)` returns the first time strictly greater than `afterMs`. Monthly schedules skip a month that does not contain day 29–31; they never clamp to the month's final day. `latestMissedOccurrence(rule, previousPlannedAt, nowMs)` returns `null` when nothing is due, the once timestamp for an overdue once rule, or only the most recent due timestamp for a recurring rule. Reject invalid dates instead of relying on Date normalization.

Also export:

```js
export function runKey(automationId, plannedAt) {
  return `${automationId}:${new Date(plannedAt).toISOString()}`;
}
```

- [ ] **Step 4: Run schedule tests in two time zones**

Run: `TZ=Asia/Shanghai pnpm --dir packages/ai-workbench test`

Expected: PASS, including once, daily, weekly single-day, weekly specified-days, monthly skip, workdays, interval, and catch-up cases.

Run: `TZ=America/New_York node --test packages/ai-workbench/test/schedule.test.mjs`

Expected: PASS for the DST-specific fixture that preserves the configured local clock time across a spring transition. If the target Node version cannot satisfy this with local Date arithmetic, add `@js-temporal/polyfill` and pin its tested version rather than shipping a DST bug.

- [ ] **Step 5: Commit schedule semantics**

```bash
git add packages/ai-workbench
git commit -m "feat: define automation schedule rules"
```

### Task 2: Add durable automation and run repositories plus CRUD APIs

**Files:**
- Create: `packages/ai-workbench/src/host/automation-service.js`
- Create: `packages/ai-workbench/test/automation-service.test.mjs`
- Modify: `packages/ai-workbench/src/host/repository.js`
- Modify: `packages/ai-workbench/src/host/http.js`
- Modify: `packages/ai-workbench/src/client/api.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing CRUD and idempotency tests**

```js
// packages/ai-workbench/test/automation-service.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createAutomationService } from "../lib/host/automation-service.js";

test("create computes next run and update preserves identity", async () => {
  const records = new Map();
  const repo = {
    putAutomation: async (value) => (records.set(value.id, value), value),
    getAutomation: (id) => records.get(id) || null,
    listAutomations: () => [...records.values()],
    deleteAutomation: async (id) => records.delete(id),
    listAutomationRuns: () => [],
  };
  const service = createAutomationService({ repository: repo, id: () => "a1", now: () => "1970-01-01T00:00:01.000Z", next: () => "1970-01-01T00:00:02.000Z" });
  const created = await service.create({
    name: "日报",
    type: "reminder",
    prompt: "写日报",
    schedule: { kind: "once", at: "2026-09-05T08:00:00+08:00" },
    timezone: "Asia/Shanghai",
    notificationPolicy: { onSuccess: true, onFailure: true, onApprovalRequired: true },
    enabled: true,
  });
  assert.equal(created.id, "a1");
  assert.equal(created.nextRunAt, "1970-01-01T00:00:02.000Z");
  const updated = await service.update("a1", { ...created, name: "每日简报" });
  assert.equal(updated.id, "a1");
  assert.equal(updated.createdAt, created.createdAt);
});

test("run claim uses automation plus planned time as durable identity", async () => {
  const service = createAutomationService({ repository: fakeRepositoryWithRunKeyConflict(), id: () => "run-2", now: () => "1970-01-01T00:00:03.000Z", next: () => "1970-01-01T00:00:04.000Z" });
  const first = await service.claim("a1", "1970-01-01T00:00:02.000Z");
  const second = await service.claim("a1", "1970-01-01T00:00:02.000Z");
  assert.equal(first.claimed, true);
  assert.deepEqual(second, { claimed: false, runId: first.run.id });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/automation-service.test.mjs`

Expected: FAIL because `automation-service.js` does not exist.

- [ ] **Step 3: Implement records and validated CRUD**

Extend the repository with `getAutomationRun`, `getAutomationRunByKey`, `deleteAutomationRun`, and list filters. Persist each run under its UUID and include a unique `idempotencyKey`; because KV has no transaction/index, serialize `claim` through the service write chain, scan the in-memory run map for the key, and only then insert it with `status: "scheduled"`.

Automation records must contain:

```js
{
  id, name, type, prompt, enabled, status,
  schedule, timezone, workspaceRef,
  capabilitySelection, executionProfile, notificationPolicy,
  createdAt, updatedAt, lastRunAt, nextRunAt
}
```

For v1, `timezone` is a persisted snapshot of the operating system's IANA time zone; the editor displays it read-only. `createAutomationService` must also expose `syncSystemTimezone(timezone, now)`. When the system time zone differs from a stored definition, update that definition's `timezone`, recompute its future `nextRunAt` from the structured local-time rule, preserve past run timestamps, and persist the change. Reject an empty or invalid IANA zone as `400 invalid-automation`.

Run records must contain:

```js
{
  id, idempotencyKey, automationId, plannedAt, startedAt, finishedAt,
  status, sessionId, errorCode, errorMessage,
  approvalId, approvalToolName, approvalReason, skipReason
}
```

`createAutomationService` must expose `list({ query, status })`, `get(id)`, `create(input)`, `update(id,input)`, `remove(id)`, `setEnabled(id,enabled)`, `listRuns(automationId)`, `claim(automationId,plannedAt)`, `updateRun(id,patch)`, `advance(id,now)`, and `resume(now)`. Persist all timestamps as ISO 8601 strings. `advance` marks a completed once definition `completed` with `nextRunAt: null`; recurring definitions receive the first future occurrence. `resume` leaves one overdue once occurrence due and replaces a recurring overdue `nextRunAt` with only the latest missed occurrence. Deleting an automation with a `running` or `waiting_approval` run returns `409 automation-active`; deleting never removes historical run records.

Add exact routes:

```text
GET    /api/dsh-ai-workbench/automations?query=&status=
POST   /api/dsh-ai-workbench/automations
GET    /api/dsh-ai-workbench/automations/:id
PUT    /api/dsh-ai-workbench/automations/:id
DELETE /api/dsh-ai-workbench/automations/:id
POST   /api/dsh-ai-workbench/automations/:id/enabled
GET    /api/dsh-ai-workbench/automations/:id/runs
```

All mutations require the action header. Return `201` on create, `404 automation-not-found`, `409 automation-active`, and field-specific `400 invalid-automation` details. Add matching client API functions.

- [ ] **Step 4: Run CRUD, validation, and restart tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS, including duplicate claim, delete-active refusal, malformed time, missing Work workspace, and repository close/reopen persistence tests.

- [ ] **Step 5: Commit automation persistence**

```bash
git add packages/ai-workbench
git commit -m "feat: add durable automation records"
```

### Task 3: Implement the single-timer scheduler and restart catch-up

**Files:**
- Create: `packages/ai-workbench/src/host/scheduler.js`
- Create: `packages/ai-workbench/test/scheduler.test.mjs`
- Modify: `packages/ai-workbench/src/index.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing scheduler tests with a fake clock**

Cover these exact cases:

- only the nearest active automation arms a timer;
- creating, editing, pausing, resuming, and deleting cause re-arm;
- the run claim is persisted before execution starts;
- duplicate ticks cannot execute the same `automationId + plannedAt` twice;
- one overdue once task runs once after restart;
- a recurring task with ten missed occurrences runs only the latest one;
- a second occurrence for the same automation becomes `skipped` with `skipReason: previous_run_active` while a prior run is `running` or `waiting_approval`;
- scheduler disposal clears the timer and starts no later work.
- changing the fake system time zone recomputes future occurrences and re-arms the same single timer without executing an extra run.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/scheduler.test.mjs`

Expected: FAIL because `scheduler.js` does not exist.

- [ ] **Step 3: Implement one nearest timer and serial automation lanes**

```js
// packages/ai-workbench/src/host/scheduler.js
export function createScheduler({ automationService, execute, clock, systemTimeZone, log }) {
  let timer = null;
  let disposed = false;
  let generation = 0;
  const lanes = new Map();

  function clear() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  async function dispatch(automation, plannedAt) {
    const active = (await automationService.listRuns(automation.id)).find((run) => ["running", "waiting_approval"].includes(run.status));
    const claim = await automationService.claim(automation.id, plannedAt);
    if (!claim.claimed) return;
    if (active) {
      await automationService.updateRun(claim.run.id, { status: "skipped", finishedAt: new Date(clock.now()).toISOString(), skipReason: "previous_run_active" });
      return;
    }
    const previous = lanes.get(automation.id) || Promise.resolve();
    const current = previous.then(() => execute(automation, claim.run)).catch((error) => log("scheduler execute failed", error));
    lanes.set(automation.id, current);
    void current.finally(() => { if (lanes.get(automation.id) === current) lanes.delete(automation.id); });
  }

  async function tick(expectedGeneration) {
    if (disposed || expectedGeneration !== generation) return;
    clear();
    const now = clock.now();
    await automationService.syncSystemTimezone(systemTimeZone(), now);
    const items = await automationService.list({ status: "active" });
    for (const item of items) {
      if (!item.enabled || item.nextRunAt == null || Date.parse(item.nextRunAt) > now) continue;
      await dispatch(item, item.nextRunAt);
      await automationService.advance(item.id, now);
    }
    await arm();
  }

  async function arm() {
    clear();
    if (disposed) return;
    const ownGeneration = ++generation;
    const active = (await automationService.list({ status: "active" })).filter((item) => item.enabled && item.nextRunAt != null).sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt));
    if (!active.length) return;
    const delay = Math.max(0, Math.min(60_000, Date.parse(active[0].nextRunAt) - clock.now()));
    timer = clock.setTimeout(() => void tick(ownGeneration), delay);
  }

  return {
    start: arm,
    changed: arm,
    dispose() { disposed = true; generation += 1; clear(); },
  };
}
```

Before the first `arm`, call `automationService.syncSystemTimezone(systemTimeZone(), now)` and then `automationService.resume(now)`. `resume` must recompute overdue definitions using `latestMissedOccurrence`: preserve one overdue once occurrence; set recurring `nextRunAt` to the latest missed occurrence; then persist the following future occurrence only after the missed occurrence has been claimed. Host process lifetime, not the browser tab, owns the scheduler. System sleep is explicitly not execution time; wake-up follows the same catch-up rule. The 60-second cap is a time-zone-change heartbeat sharing the same timer; a heartbeat with no due occurrence only checks the IANA zone and re-arms.

In `src/index.js`, create the scheduler after repository and services are ready, pass `() => Intl.DateTimeFormat().resolvedOptions().timeZone` as `systemTimeZone`, perform the time-zone sync and resume sequence above, call `await scheduler.start()`, subscribe CRUD mutations to `scheduler.changed()`, and dispose the scheduler before closing the repository.

- [ ] **Step 4: Run deterministic scheduler tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS without real sleeps; all tests use the fake clock and assert exact timer delays and run keys.

- [ ] **Step 5: Commit the scheduler**

```bash
git add packages/ai-workbench
git commit -m "feat: schedule idempotent local automations"
```

### Task 4: Execute reminders and approval-aware Work runs

**Files:**
- Create: `packages/ai-workbench/src/host/automation-runner.js`
- Create: `packages/ai-workbench/src/host/notifications.js`
- Create: `packages/ai-workbench/src/host/notification-service.js`
- Create: `packages/ai-workbench/test/automation-runner.test.mjs`
- Create: `packages/ai-workbench/test/notifications.test.mjs`
- Modify: `packages/ai-workbench/src/host/session-gateway.js`
- Modify: `packages/ai-workbench/src/index.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing lifecycle tests**

Test these event transitions:

```text
reminder: scheduled -> succeeded + notification, no session create
work: scheduled -> running -> succeeded on turn/end completed
work: scheduled -> running -> waiting_approval on approval/asked
work: waiting_approval -> running on approval/decided approved
work: waiting_approval -> rejected on approval/decided rejected
work: running -> failed on every non-completed turn/end reason
```

Also assert that every Work run creates a new session with `origin: automation`, `automationId`, and `runId`; no two run records share a session; an approval is never answered by the runner.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/automation-runner.test.mjs packages/ai-workbench/test/notifications.test.mjs`

Expected: FAIL because runner and notifications are absent.

- [ ] **Step 3: Implement the runner and safe local notifier**

Extend `sessionGateway` with `startAutomation(automation, run)` that always selects `standard`, creates a new UUID session, records Work metadata before session creation, resolves the live Session through `ctx.sessions.get(sessionId)`, calls `ctx.permissionPresets.set(session, "workspace-write")`, and prompts with the saved template. It must never reuse a prior session and must not call an approval response API.

`createAutomationRunner` must maintain `sessionId -> runId`, update a claimed run to `running`, and listen globally:

```js
ctx.on("session/event", async (session, event) => {
  const runId = runner.runForSession(session.id);
  if (!runId) return;
  if (event.type === "approval/asked") await runner.waitForApproval(runId, event.data);
  if (event.type === "approval/decided") await runner.recordApprovalDecision(runId, event.data);
  if (event.type === "turn/end") await runner.finishFromTurn(runId, event.data.reason);
}, { global: true });
```

Map only `reason.kind === "completed"` to `succeeded`; map every other terminal reason to `failed` with the exact reason kind. Persist state before notifying. A rejected approval maps to `rejected`. Use `waiting_approval` for the approval pause state.

`notifications.js` must expose `createNotifier({ platform, spawn, browserSink, log })`. On macOS use `spawn("osascript", ["-e", script], { stdio: "ignore" })`; escape backslashes and double quotes in title/body before interpolation. On Linux use `spawn("notify-send", [title, body], { stdio: "ignore" })`. On Windows use a browser event sink when connected and structured logs otherwise; do not construct an unverified PowerShell command. Native notification failure is logged and never changes run status.

`notification-service.js` must first persist `{ id, kind, title, summary, automationId, runId, createdAt, readAt: null }` through `repository.putNotification`, then attempt the native adapter. Sanitize control characters and truncate `summary` to 120 Unicode code points; never store or display full prompts, attachment data, credentials, paths, or error stacks. Add routes `GET /api/dsh-ai-workbench/notifications` and `POST /api/dsh-ai-workbench/notifications/:id/read`; reading is idempotent. A successful native notification remains in the app list as read, while a failed/unavailable native notification remains unread for the next browser launch.

The runner must honor each definition's `notificationPolicy`: send `success` only when `onSuccess` is true, `failure` and `rejected` only when `onFailure` is true, and `waiting_approval` only when `onApprovalRequired` is true. Reminder definitions always notify because notification is their sole effect. The policy suppresses only notification delivery and persistence; it never changes run state.

Notification copy:

```text
success: “自动化任务已完成” / automation name
failure or rejected: “自动化任务失败” / concise error
awaiting approval: “自动化任务等待批准” / tool name and reason
reminder: “提醒” / sanitized summary of at most 120 code points
```

- [ ] **Step 4: Run lifecycle and real-profile checks**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS for every transition and notifier escaping fixture.

In the test profile create one Work automation that requests a write outside its workspace. Verify it stops at the official approval UI, sends one waiting notification, stays `waiting_approval`, skips later overlapping occurrences, and continues only after the user decides in the linked Work session.

- [ ] **Step 5: Commit automation execution**

```bash
git add packages/ai-workbench
git commit -m "feat: run approval-aware Work automations"
```

### Task 5: Build automation list, editor, and run details UI

**Files:**
- Create: `packages/ai-workbench/src/client/automation-list.js`
- Create: `packages/ai-workbench/src/client/automation-editor.js`
- Create: `packages/ai-workbench/src/client/automation-detail.js`
- Create: `packages/ai-workbench/src/client/schedule-fields.js`
- Create: `packages/ai-workbench/test/automation-view-model.test.mjs`
- Modify: `packages/ai-workbench/src/client/shell.js`
- Modify: `packages/ai-workbench/src/client/styles.js`

- [ ] **Step 1: Write failing view-model tests**

Test search and status filters `全部/已开启/已暂停/已完成`, next-run copy for every schedule kind, editor visibility rules (Work-only workspace/capabilities/execution fields), validation messages, run status labels, and sort order by next run then updated time.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/automation-view-model.test.mjs`

Expected: FAIL because automation UI modules do not exist.

- [ ] **Step 3: Implement the list and editor**

The list page must match design image 4's hierarchy: `已安排的任务`, supporting copy, search, status tabs, top-right Create button, automation rows with status/next run, and a Suggestions section. Suggestions are local templates only; clicking one opens a populated editor and does not create an automation. An unread-notification strip at the top lists persisted summaries, links Work run notices to their details, and marks an item read only after the user opens or dismisses it.

The editor contains: name, type, prompt, schedule kind and fields, time zone display, enabled toggle, and for Work only workspace, capability selection, model policy, and execution intensity. There is no Cron text field. Save remains disabled until validation passes. Closing a dirty editor asks for confirmation.

The detail page shows automation definition, last/next run, ordered run history, and error/approval fields. A run with `sessionId` renders `查看完整过程`; clicking calls `ctx.sessions.open(sessionId)`. `waiting_approval` displays `请在完整过程内处理批准` and never offers a local approve button.

- [ ] **Step 4: Verify UI and host-lifetime behavior**

Run: `pnpm --dir packages/ai-workbench test && npm test`

Expected: all tests PASS.

In DSH Web verify create/edit/pause/resume/delete/search/filter/detail and suggestion flows. Close the browser while leaving DSH Web running; wait for a near-future reminder and verify the host records it. Reopen the browser and verify the run appears. Then stop the DSH host, pass a recurring occurrence, restart, and verify only the latest missed occurrence runs.

- [ ] **Step 5: Commit the automation checkpoint**

```bash
git add packages/ai-workbench
git commit -m "feat: add automation management UI"
```
