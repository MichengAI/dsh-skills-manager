# DSH AI Workbench Shell and Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the branded Work/Chat shell, independent drafts and histories, route placeholders, and non-destructive migration of existing DSH sessions into Work.

**Architecture:** Keep the official DSH Conversation, Details, Settings, and session files untouched. Store only workbench-owned mode metadata, drafts, and preferences in one JSON KV unit. A small host API exposes those records; a client store owns navigation and renders a custom Sidebar into the Root proven in plan 01.

**Tech Stack:** Node.js ESM, DSH JSON KV storage, DSH session query/runtime APIs, React 18, Node test runner, browser History API.

---

### Task 1: Build the workbench metadata repository

**Files:**
- Create: `packages/ai-workbench/src/host/repository.js`
- Create: `packages/ai-workbench/test/repository.test.mjs`
- Modify: `packages/ai-workbench/src/index.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write the failing repository tests**

```js
// packages/ai-workbench/test/repository.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRepository } from "../lib/host/repository.js";

function memoryUnit(seed = {}) {
  const tables = structuredClone(seed);
  return {
    async loadAll() { return { tables, global: null }; },
    async putRecord(table, key, value) { (tables[table] ||= {})[key] = structuredClone(value); },
    async deleteRecord(table, key) { delete (tables[table] ||= {})[key]; },
    async close() {},
    snapshot: () => structuredClone(tables),
  };
}

test("drafts and session metadata are independent by mode", async () => {
  const unit = memoryUnit();
  const repo = await createRepository(unit);
  await repo.putDraft("work", { text: "整理周报", workspaceId: "w1", attachments: [] });
  await repo.putDraft("chat", { text: "解释 RAG", attachments: [] });
  await repo.putSessionMeta("s1", { mode: "chat", origin: "user", createdAt: "2026-09-04T00:00:00.000Z" });
  assert.equal((await repo.getDraft("work")).text, "整理周报");
  assert.equal((await repo.getDraft("chat")).text, "解释 RAG");
  assert.equal((await repo.getSessionMeta("s1")).mode, "chat");
});

test("writes are serialized in invocation order", async () => {
  const unit = memoryUnit();
  const repo = await createRepository(unit);
  await Promise.all([
    repo.putDraft("work", { text: "first", attachments: [] }),
    repo.putDraft("work", { text: "second", attachments: [] }),
  ]);
  assert.equal((await repo.getDraft("work")).text, "second");
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/repository.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/host/repository.js`.

- [ ] **Step 3: Implement the repository**

```js
// packages/ai-workbench/src/host/repository.js
const TABLES = ["session_modes", "drafts", "settings", "capability_preferences", "automations", "automation_runs", "home_content", "notifications"];

export async function openWorkbenchUnit(storage) {
  return storage.backend.get("json").kv.open({
    name: "dsh_ai_workbench",
    version: 1,
    tables: TABLES,
    hasGlobal: false,
  });
}

export async function createRepository(unit) {
  const loaded = await unit.loadAll();
  const tables = Object.fromEntries(TABLES.map((name) => [name, new Map(Object.entries(loaded.tables[name] || {}))]));
  let writes = Promise.resolve();

  function enqueue(operation) {
    const next = writes.then(operation, operation);
    writes = next.catch(() => undefined);
    return next;
  }

  function get(table, key) {
    const value = tables[table].get(key);
    return value == null ? null : structuredClone(value);
  }

  async function put(table, key, value) {
    const saved = structuredClone(value);
    return enqueue(async () => {
      await unit.putRecord(table, key, saved);
      tables[table].set(key, saved);
      return structuredClone(saved);
    });
  }

  async function remove(table, key) {
    return enqueue(async () => {
      await unit.deleteRecord(table, key);
      tables[table].delete(key);
    });
  }

  function list(table) {
    return [...tables[table].values()].map((value) => structuredClone(value));
  }

  return {
    getDraft: (mode) => get("drafts", mode) || { mode, text: "", attachments: [], updatedAt: null },
    putDraft: (mode, draft) => put("drafts", mode, { ...draft, mode, updatedAt: new Date().toISOString() }),
    getSessionMeta: (sessionId) => get("session_modes", sessionId),
    putSessionMeta: (sessionId, meta) => put("session_modes", sessionId, { ...meta, sessionId }),
    listSessionMeta: () => list("session_modes"),
    getSettings: () => get("settings", "global") || { schemaVersion: 1, brandName: "正方 AI 工作台", theme: "light", defaultMode: "work", lastMode: "work", localDisplayName: "本地用户", voiceEnabled: true },
    putSettings: (settings) => put("settings", "global", settings),
    getCapabilityPreferences: () => get("capability_preferences", "global") || { enabledIds: [], updatedAt: null },
    putCapabilityPreferences: (value) => put("capability_preferences", "global", value),
    listAutomations: () => list("automations"),
    getAutomation: (id) => get("automations", id),
    putAutomation: (record) => put("automations", record.id, record),
    deleteAutomation: (id) => remove("automations", id),
    listAutomationRuns: () => list("automation_runs"),
    putAutomationRun: (record) => put("automation_runs", record.id, record),
    getHomeContent: (id) => get("home_content", id),
    putHomeContent: (record) => put("home_content", record.id, record),
    listNotifications: () => list("notifications"),
    putNotification: (record) => put("notifications", record.id, record),
    deleteNotification: (id) => remove("notifications", id),
    close: () => writes.then(() => unit.close()),
  };
}
```

Add `src/host/repository.js` to the host build entry list. In `src/index.js`, open the unit before route registration and return a disposer that unregisters the route and closes the unit:

```js
const unit = await openWorkbenchUnit(ctx.storage);
const repository = await createRepository(unit);
const disposeRoute = ctx.webServer.register({
  kind: "prefix",
  path: "/api/dsh-ai-workbench",
  handler: async (req, res) => sendJson(res, await routeRequest(req, { diagnostics, repository, sessionQuery: ctx.sessionQuery })),
});
return async () => { disposeRoute(); await repository.close(); };
```

- [ ] **Step 4: Run the repository and package tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS, including serialized-write coverage.

- [ ] **Step 5: Commit the storage boundary**

```bash
git add packages/ai-workbench
git commit -m "feat: add workbench metadata repository"
```

### Task 2: Add validated mode, draft, settings, and history APIs

**Files:**
- Create: `packages/ai-workbench/src/shared/contracts.js`
- Create: `packages/ai-workbench/src/host/mode-service.js`
- Create: `packages/ai-workbench/test/mode-service.test.mjs`
- Modify: `packages/ai-workbench/src/host/http.js`
- Modify: `packages/ai-workbench/test/http.test.mjs`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing mode service tests**

```js
// packages/ai-workbench/test/mode-service.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createModeService } from "../lib/host/mode-service.js";

test("unclassified DSH sessions are exposed as imported Work records", async () => {
  const metas = new Map([["chat-1", { sessionId: "chat-1", mode: "chat", origin: "user" }]]);
  const service = createModeService({
    repository: { getSessionMeta: (id) => metas.get(id) || null, putSessionMeta: async () => {} },
    sessionQuery: { listSessions: async () => [
      { header: { id: "old-1", createdAt: 1756684800000 } },
      { header: { id: "chat-1", createdAt: 1756771200000 } },
    ], readTitleSnapshots: async (ids) => ids.map((sessionId) => ({ sessionId, status: "fulfilled", value: { title: { title: sessionId === "old-1" ? "旧任务" : "校园问答" } } })) },
  });
  const work = await service.listHistory("work");
  assert.deepEqual(work.map((item) => [item.sessionId, item.origin]), [["old-1", "migration"]]);
  assert.deepEqual((await service.listHistory("chat")).map((item) => item.sessionId), ["chat-1"]);
});

test("explicit metadata never converts an existing session", async () => {
  const writes = [];
  const service = createModeService({
    repository: { getSessionMeta: () => ({ sessionId: "s1", mode: "work" }), putSessionMeta: async (...args) => writes.push(args) },
    sessionQuery: { listSessions: async () => [] },
  });
  await assert.rejects(() => service.assignSession("s1", { mode: "chat", origin: "user" }), /mode-conflict/);
  assert.equal(writes.length, 0);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/mode-service.test.mjs`

Expected: FAIL because the mode service is absent.

- [ ] **Step 3: Implement validation and non-destructive classification**

```js
// packages/ai-workbench/src/shared/contracts.js
export const MODES = new Set(["work", "chat"]);
export const ORIGINS = new Set(["user", "automation", "migration"]);

export function assertMode(value) {
  if (!MODES.has(value)) throw Object.assign(new Error("invalid mode"), { statusCode: 400, code: "invalid-mode" });
  return value;
}

export function parseSessionMeta(value) {
  const mode = assertMode(value?.mode);
  const origin = ORIGINS.has(value?.origin) ? value.origin : "user";
  return { mode, origin, automationId: value?.automationId || null, runId: value?.runId || null, createdAt: value?.createdAt || new Date().toISOString() };
}

export function parseDraft(value, mode) {
  assertMode(mode);
  if (typeof value?.text !== "string" || value.text.length > 20000) throw Object.assign(new Error("invalid draft"), { statusCode: 400, code: "invalid-draft" });
  const mediaTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!Array.isArray(value.attachments) || value.attachments.length > 20) throw Object.assign(new Error("invalid attachments"), { statusCode: 400, code: "invalid-attachments" });
  const attachments = value.attachments.map((item) => {
    if (!mediaTypes.has(item?.mediaType) || typeof item?.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data)) throw Object.assign(new Error("invalid attachment"), { statusCode: 400, code: "invalid-attachment" });
    return { mediaType: item.mediaType, data: item.data, name: typeof item.name === "string" ? item.name.slice(0, 255) : undefined };
  });
  const execution = mode === "work" && value.execution ? {
    modelPolicy: value.execution.modelPolicy === "manual" ? "manual" : "auto",
    provider: typeof value.execution.provider === "string" ? value.execution.provider : null,
    model: typeof value.execution.model === "string" ? value.execution.model : null,
    intensity: value.execution.intensity === "deep" ? "deep" : "standard",
  } : null;
  if (execution?.modelPolicy === "manual" && (!execution.provider || !execution.model)) throw Object.assign(new Error("manual model is incomplete"), { statusCode: 400, code: "invalid-execution" });
  return {
    mode,
    text: value.text,
    workspaceId: mode === "work" && typeof value.workspaceId === "string" ? value.workspaceId : null,
    attachments,
    capabilityIds: mode === "work" && Array.isArray(value.capabilityIds) ? [...new Set(value.capabilityIds)].slice(0, 50) : [],
    execution,
  };
}

export function parseSettings(value) {
  const defaultMode = assertMode(value?.defaultMode || "work");
  const lastMode = assertMode(value?.lastMode || defaultMode);
  const localDisplayName = typeof value?.localDisplayName === "string" && value.localDisplayName.trim() ? value.localDisplayName.trim().slice(0, 40) : "本地用户";
  return { schemaVersion: 1, brandName: "正方 AI 工作台", theme: "light", defaultMode, lastMode, localDisplayName, voiceEnabled: value?.voiceEnabled !== false };
}
```

```js
// packages/ai-workbench/src/host/mode-service.js
import { assertMode, parseSessionMeta } from "../shared/contracts.js";

export function createModeService({ repository, sessionQuery }) {
  return {
    async assignSession(sessionId, input) {
      const next = parseSessionMeta(input);
      const current = repository.getSessionMeta(sessionId);
      if (current && current.mode !== next.mode) throw Object.assign(new Error("mode-conflict"), { statusCode: 409, code: "mode-conflict" });
      return current || repository.putSessionMeta(sessionId, next);
    },
    async listHistory(mode) {
      assertMode(mode);
      const sessions = await sessionQuery.listSessions();
      const titleResults = await sessionQuery.readTitleSnapshots(sessions.map((session) => session.header.id));
      const titles = new Map(titleResults.filter((item) => item.status === "fulfilled").map((item) => [item.sessionId, item.value.title?.title || "未命名"]));
      return sessions
        .map((session) => {
          const sessionId = session.header.id;
          const createdAt = new Date(session.header.createdAt).toISOString();
          const meta = repository.getSessionMeta(sessionId) || { sessionId, mode: "work", origin: "migration", imported: true, createdAt };
          return { sessionId, title: titles.get(sessionId) || "未命名", createdAt, ...meta };
        })
        .filter((item) => item.mode === mode)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
  };
}
```

Extend `routeRequest` with JSON body parsing capped at 1 MiB and these exact routes:

```text
GET  /api/dsh-ai-workbench/bootstrap?mode=work|chat
PUT  /api/dsh-ai-workbench/drafts/work
PUT  /api/dsh-ai-workbench/drafts/chat
PUT  /api/dsh-ai-workbench/settings
```

`bootstrap` returns `{ settings, draft, history }`. Mutation routes must require `x-dsh-workbench-action: 1`, call `parseDraft` or `parseSettings`, return `400` for invalid input, and never write to DSH session files. `assignSession` remains a host-internal conflict guard and is not exposed as an HTTP route. Extend the host compatibility probe to require `sessionQuery.readTitleSnapshots`. Add HTTP tests for bootstrap, both draft modes, settings, the 1 MiB limit, the mutation header, and invalid modes.

- [ ] **Step 4: Run the mode/API tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS; the HTTP test names include `rejects mutation without action header` and `does not reclassify a session`.

- [ ] **Step 5: Commit the mode API**

```bash
git add packages/ai-workbench
git commit -m "feat: add isolated mode metadata APIs"
```

### Task 3: Add the client navigation and independent draft store

**Files:**
- Create: `packages/ai-workbench/src/client/api.js`
- Create: `packages/ai-workbench/src/client/store.js`
- Create: `packages/ai-workbench/test/client-store.test.mjs`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing reducer tests**

```js
// packages/ai-workbench/test/client-store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reduceWorkbench } from "../lib/client/store.js";

test("switching modes preserves separate drafts", () => {
  let state = reduceWorkbench(initialState(), { type: "draft/change", mode: "work", text: "汇总日报" });
  state = reduceWorkbench(state, { type: "mode/change", mode: "chat" });
  state = reduceWorkbench(state, { type: "draft/change", mode: "chat", text: "解释概念" });
  state = reduceWorkbench(state, { type: "mode/change", mode: "work" });
  assert.equal(state.drafts.work.text, "汇总日报");
  assert.equal(state.drafts.chat.text, "解释概念");
});

test("route defaults to the selected mode home", () => {
  const state = reduceWorkbench(initialState(), { type: "mode/change", mode: "chat" });
  assert.deepEqual(state.route, { name: "home", mode: "chat" });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/client-store.test.mjs`

Expected: FAIL because `lib/client/store.js` does not exist.

- [ ] **Step 3: Implement the API client and pure reducer**

```js
// packages/ai-workbench/src/client/api.js
const BASE = "/api/dsh-ai-workbench";

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.method && options.method !== "GET" ? { "x-dsh-workbench-action": "1" } : {}), ...options.headers },
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.error || "request failed"), { code: payload.code, status: response.status });
  return payload.data;
}

export const workbenchApi = {
  bootstrap: (mode) => request(`/bootstrap?mode=${encodeURIComponent(mode)}`),
  saveDraft: (mode, draft) => request(`/drafts/${mode}`, { method: "PUT", body: JSON.stringify(draft) }),
  saveSettings: (settings) => request("/settings", { method: "PUT", body: JSON.stringify(settings) }),
};
```

```js
// packages/ai-workbench/src/client/store.js
export function initialState() {
  return {
    mode: "work",
    route: { name: "home", mode: "work" },
    drafts: { work: { text: "", attachments: [], capabilityIds: [] }, chat: { text: "", attachments: [] } },
    history: { work: [], chat: [] },
    loading: false,
    error: null,
    sidebarCollapsed: false,
    dialog: null,
  };
}

export function reduceWorkbench(state, action) {
  switch (action.type) {
    case "mode/change":
      return { ...state, mode: action.mode, route: { name: "home", mode: action.mode }, dialog: null };
    case "draft/change":
      return { ...state, drafts: { ...state.drafts, [action.mode]: { ...state.drafts[action.mode], text: action.text } } };
    case "draft/replace":
      return { ...state, drafts: { ...state.drafts, [action.mode]: action.draft } };
    case "bootstrap/start":
      return { ...state, loading: true, error: null };
    case "bootstrap/success":
      return { ...state, loading: false, drafts: { ...state.drafts, [action.mode]: action.data.draft }, history: { ...state.history, [action.mode]: action.data.history } };
    case "bootstrap/error":
      return { ...state, loading: false, error: action.error };
    case "navigate":
      return { ...state, route: action.route, dialog: null };
    case "dialog/open":
      return { ...state, dialog: action.dialog };
    case "dialog/close":
      return { ...state, dialog: null };
    case "sidebar/toggle":
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    default:
      return state;
  }
}
```

Add both client modules to the non-bundled test output entries while keeping `src/client.js` bundled for the browser.

- [ ] **Step 4: Run reducer and package tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS, including both draft-isolation tests.

- [ ] **Step 5: Commit the client state seam**

```bash
git add packages/ai-workbench
git commit -m "feat: add Work Chat navigation state"
```

### Task 4: Render the brand shell, mode-specific navigation, and placeholders

**Files:**
- Create: `packages/ai-workbench/src/client/brand.js`
- Create: `packages/ai-workbench/src/client/sidebar.js`
- Create: `packages/ai-workbench/src/client/shell.js`
- Create: `packages/ai-workbench/src/client/dialog.js`
- Create: `packages/ai-workbench/assets/logo-source.png`
- Create: `packages/ai-workbench/assets/ai-orb.png`
- Create: `packages/ai-workbench/test/sidebar-model.test.mjs`
- Modify: `packages/ai-workbench/src/client/root.js`
- Modify: `packages/ai-workbench/src/client/styles.js`
- Modify: `packages/ai-workbench/src/client.js`

- [ ] **Step 1: Write the failing navigation-model test**

```js
// packages/ai-workbench/test/sidebar-model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { navigationFor } from "../lib/client/sidebar.js";

test("Work navigation exposes only the approved Work entries", () => {
  assert.deepEqual(navigationFor("work").map((item) => [item.id, item.available]), [
    ["new-work", true], ["workspace", false], ["capabilities", true], ["dashboard", false], ["automations", true], ["results", false],
  ]);
});

test("Chat navigation leaves future pages unavailable", () => {
  assert.deepEqual(navigationFor("chat").map((item) => [item.id, item.available]), [
    ["new-chat", true], ["agents", false], ["ai-tools", false],
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/sidebar-model.test.mjs`

Expected: FAIL because `sidebar.js` does not exist.

- [ ] **Step 3: Add assets and shell components**

Copy the user-provided source files without raster modification:

```bash
cp /Users/yekechao/Downloads/AI工作台完整前端切片/01_logo_完整.png packages/ai-workbench/assets/logo-source.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/02_AI球_完整.png packages/ai-workbench/assets/ai-orb.png
```

Render only the blue mark from `logo-source.png` inside a clipped `.daw-brand-mark` frame and render the product name as live text `正方 AI 工作台` beside it. Keep the source file byte-for-byte unchanged: at its native 190×55 size the mark occupies the first 50 px, so render the image at 152×44 inside a 40×44 overflow-hidden frame. This avoids a second rasterization step and prevents the source image's partial text from appearing. Add a browser assertion that the frame is exactly 40×44 and no source-image text is visible.

Implement and export this exact navigation model from `sidebar.js`:

```js
const WORK = [
  ["new-work", "新建任务", true, "home"],
  ["workspace", "工作空间", false, "workspace"],
  ["capabilities", "能力库", true, "capabilities"],
  ["dashboard", "数据看板", false, "dashboard"],
  ["automations", "自动化任务", true, "automations"],
  ["results", "成果空间", false, "results"],
];
const CHAT = [
  ["new-chat", "新建对话", true, "home"],
  ["agents", "智能体广场", false, "agents"],
  ["ai-tools", "AI 工具集", false, "ai-tools"],
];
export function navigationFor(mode) {
  return (mode === "chat" ? CHAT : WORK).map(([id, label, available, route]) => ({ id, label, available, route }));
}
```

`createSidebar(React)` must render, in order: live-text brand, Work/Chat segmented control, mode navigation, divider, searchable mode-specific history, local user footer, and the official Settings child slot. The local user label comes from `settings.localDisplayName` and defaults to `本地用户`; there is no sign-in UI. Its `sidebar` registration must declare `sidebar.settings` as a single root child and `sidebar.footer.action` as a list root child, then render both in the footer. Unavailable entries dispatch `{ type: "dialog/open", dialog: { title: label, message: "功能暂未开发" } }`. Available entries dispatch `navigate`. History entries call `ctx.sessions.open(sessionId)` and show `历史导入` for `origin === "migration"` and `自动化` for `origin === "automation"`.

`createWorkbenchShell(React)` must render one of `Home`, `Capabilities`, or `Automations` into the center when no session is bound; when a session is bound it delegates to `renderSlot("conversation")`. Settings continues to use the existing DSH Settings opener. `createDialog(React)` must implement an accessible `role="dialog"`, labelled title, close button, Escape handling, and focus restoration.

Update `root.js` so its Sidebar child is the workbench Sidebar and its center uses `WorkbenchShell`, while official `details` and `shell.overlay` seats remain unchanged. Update `client.js` to create one `useReducer(reduceWorkbench, initialState())` provider, load bootstrap on mode change, debounce draft writes by 500 ms, and register the shell only after compatibility passes.

Add CSS tokens and responsive rules:

```css
:root{--daw-blue:#2864f0;--daw-text:#171a22;--daw-muted:#777f90;--daw-line:#e4e8ef;--daw-panel:#f7f8fb;--daw-radius:12px}
.daw-brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:600;white-space:nowrap}
.daw-brand-mark{width:40px;height:44px;overflow:hidden;flex:0 0 40px}
.daw-brand-mark img{display:block;width:152px;height:44px;max-width:none}
.daw-mode-switch{display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:10px;background:#eceef3}
.daw-mode-switch button[aria-selected=true]{background:#fff;color:var(--daw-text);box-shadow:0 1px 4px rgba(24,32,56,.12)}
.daw-nav-button{display:flex;width:100%;height:44px;align-items:center;gap:12px;border:0;border-radius:10px;background:transparent;color:var(--daw-text)}
.daw-nav-button[aria-current=page]{background:#edf3ff;color:var(--daw-blue)}
@media(max-width:1023px){.daw-frame{grid-template-columns:56px minmax(0,1fr) 0!important}.daw-sidebar[data-expanded=true]{position:absolute;inset:0 auto 0 0;width:280px;z-index:30;box-shadow:12px 0 40px rgba(24,32,56,.14)}}
```

- [ ] **Step 4: Verify shell behavior in the real browser**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS, including navigation models and package regressions.

Run: `PATH=/opt/homebrew/opt/node/bin:$PATH dsh web`

At a 1584×992 viewport verify: brand text is selectable; Work and Chat each show only their navigation/history; mode switching restores the correct draft; all six unavailable entries show `功能暂未开发`; Settings opens; an existing DSH session renders and can return to its mode home. At 1023 px width verify the Sidebar collapses to 56 px and expands as an overlay.

- [ ] **Step 5: Commit the shell**

```bash
git add packages/ai-workbench
git commit -m "feat: add branded Work Chat shell"
```

### Task 5: Complete imported-history migration and rollback proof

**Files:**
- Create: `packages/ai-workbench/test/migration.test.mjs`
- Create: `packages/ai-workbench/test/fixtures/sessions.json`
- Modify: `packages/ai-workbench/src/host/mode-service.js`
- Modify: `packages/ai-workbench/README.md`

- [ ] **Step 1: Add a failing migration regression**

Create a fixture with three old unclassified sessions, one explicit Work session, and one explicit Chat session. Assert that:

```js
assert.deepEqual((await service.listHistory("work")).map((item) => item.sessionId), ["new-work", "old-3", "old-2", "old-1"]);
assert.deepEqual((await service.listHistory("chat")).map((item) => item.sessionId), ["new-chat"]);
assert.equal(repository.putSessionMeta.mock.calls.length, 0);
```

The last assertion proves that listing old sessions does not rewrite DSH data or eagerly persist migration markers.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/migration.test.mjs`

Expected: FAIL if history ordering, the imported marker, or no-write behavior is wrong.

- [ ] **Step 3: Normalize timestamps and preserve virtual migration metadata**

In `mode-service.js`, normalize a missing/invalid `createdAt` to `"1970-01-01T00:00:00.000Z"`, keep `origin: "migration"` virtual, and add `imported: true`. Never call `putSessionMeta` from `listHistory`.

Add this rollback section to the package README:

```markdown
## Roll back the shell

Disable or remove `@michengai/dsh-ai-workbench` from the Web profile and restart DSH Web. The official DSH shell returns immediately. Original session directories are unchanged; workbench metadata remains isolated in the `dsh_ai_workbench` JSON KV unit.
```

- [ ] **Step 4: Run regression and rollback smoke checks**

Run: `pnpm --dir packages/ai-workbench test && npm test`

Expected: both package suites PASS.

Disable the workbench plugin in the test Web profile and restart DSH Web.

Expected: the official DSH interface returns and all original sessions remain visible. Re-enable the plugin and verify the same sessions appear as Work records with `历史导入`.

- [ ] **Step 5: Commit the shell-and-mode checkpoint**

```bash
git add packages/ai-workbench
git commit -m "test: prove mode migration and shell rollback"
```
