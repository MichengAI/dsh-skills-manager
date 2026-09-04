# DSH AI Workbench Capability Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a simple, searchable capability catalog for ordinary users, preserve the existing Skills Manager for advanced operations, and make enabled defaults feed the Work composer.

**Architecture:** Normalize three sources into one client-safe capability model: the existing Skills Manager read-only snapshot, a plugin-owned DSH-tool manifest, and deployment-configured business systems. Workbench toggles change only workbench default preferences; they never edit a Skill or bypass DSH permissions. Missing sources are visible as unavailable rather than silently dropped.

**Tech Stack:** React 18, existing `/api/dsh-skills-manager/state`, DSH workbench JSON KV API, JSON manifests, Node test runner.

---

### Task 1: Define and normalize the unified capability model

**Files:**
- Create: `packages/ai-workbench/assets/capabilities.json`
- Create: `packages/ai-workbench/src/shared/capabilities.js`
- Create: `packages/ai-workbench/test/capabilities.test.mjs`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing normalization tests**

```js
// packages/ai-workbench/test/capabilities.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCapabilities, filterCapabilities } from "../lib/shared/capabilities.js";

test("Skills, tools, and business systems share one stable model", () => {
  const items = normalizeCapabilities({
    skillState: { roots: [{ key: "dsh", label: "DSH 技能", enabled: true, skills: [{ name: "documents", description: "创建文档", loadable: true, managerEnabled: true }] }] },
    manifest: { tools: [{ id: "web", name: "联网搜索", description: "搜索公开网页" }], businessSystems: [{ id: "oa", name: "OA", description: "校园办公", connected: false }] },
    enabledIds: ["skill:dsh:documents", "tool:web"],
  });
  assert.deepEqual(items.map(({ id, kind, enabled, available }) => ({ id, kind, enabled, available })), [
    { id: "skill:dsh:documents", kind: "skill", enabled: true, available: true },
    { id: "tool:web", kind: "tool", enabled: true, available: true },
    { id: "business:oa", kind: "business", enabled: false, available: false },
  ]);
});

test("filter matches name, description, source, and kind", () => {
  const items = [{ id: "skill:dsh:documents", name: "文档", description: "生成报告", source: "DSH 技能", kind: "skill" }];
  assert.equal(filterCapabilities(items, { query: "报告", kind: "all", source: "all" }).length, 1);
  assert.equal(filterCapabilities(items, { query: "", kind: "business", source: "all" }).length, 0);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/capabilities.test.mjs`

Expected: FAIL because `capabilities.js` does not exist.

- [ ] **Step 3: Add the manifest and pure normalizer**

Create `assets/capabilities.json` with this schema and only capabilities verified to exist in the target DSH profile:

```json
{
  "tools": [
    { "id": "web", "name": "联网搜索", "description": "搜索公开网页信息", "source": "DSH", "available": true },
    { "id": "local-files", "name": "工作区文件", "description": "读取和编辑已授权工作区内的文件", "source": "DSH", "available": true },
    { "id": "shell", "name": "本机命令", "description": "在 DSH 权限策略约束下运行本机命令", "source": "DSH", "available": true }
  ],
  "businessSystems": []
}
```

```js
// packages/ai-workbench/src/shared/capabilities.js
function clean(value) { return String(value || "").trim(); }

export function normalizeCapabilities({ skillState, manifest, enabledIds }) {
  const enabled = new Set(enabledIds || []);
  const skills = (skillState?.roots || []).flatMap((root) => (root.skills || []).map((skill) => ({
    id: `skill:${root.key}:${skill.name}`,
    name: skill.declaredName || skill.name,
    description: skill.description || "未提供简介",
    kind: "skill",
    source: root.label || root.key,
    available: Boolean(root.enabled && skill.loadable && skill.managerEnabled),
    enabled: enabled.has(`skill:${root.key}:${skill.name}`),
    details: { diagnostics: skill.diagnostics || [], path: skill.path || null, modelInvocable: skill.effectiveModelInvocable !== false },
  })));
  const tools = (manifest?.tools || []).map((item) => ({
    ...item, id: `tool:${item.id}`, kind: "tool", source: item.source || "DSH", available: item.available !== false, enabled: enabled.has(`tool:${item.id}`), details: {},
  }));
  const business = (manifest?.businessSystems || []).map((item) => ({
    ...item, id: `business:${item.id}`, kind: "business", source: item.source || item.name, available: item.connected === true, enabled: enabled.has(`business:${item.id}`), details: { connectionHint: item.connectionHint || null },
  }));
  return [...skills, ...tools, ...business].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "zh-CN"));
}

export function filterCapabilities(items, { query = "", kind = "all", source = "all" }) {
  const needle = clean(query).toLocaleLowerCase("zh-CN");
  return items.filter((item) => (kind === "all" || item.kind === kind) && (source === "all" || item.source === source) && (!needle || [item.name, item.description, item.source, item.kind].some((value) => clean(value).toLocaleLowerCase("zh-CN").includes(needle))));
}

export function summarizeCapabilities(items) {
  return { total: items.length, enabled: items.filter((item) => item.enabled).length, disabled: items.filter((item) => !item.enabled).length, unavailable: items.filter((item) => !item.available).length };
}
```

- [ ] **Step 4: Run the capability-model tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS for normalization, deterministic ordering, filtering, and summary counts.

- [ ] **Step 5: Commit the capability model**

```bash
git add packages/ai-workbench
git commit -m "feat: define unified capability catalog"
```

### Task 2: Add validated preference APIs without granting runtime permissions

**Files:**
- Create: `packages/ai-workbench/src/host/capability-service.js`
- Create: `packages/ai-workbench/test/capability-service.test.mjs`
- Modify: `packages/ai-workbench/src/host/http.js`
- Modify: `packages/ai-workbench/src/client/api.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing preference tests**

```js
// packages/ai-workbench/test/capability-service.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilityService } from "../lib/host/capability-service.js";

test("preference updates preserve order and reject malformed ids", async () => {
  let saved;
  const service = createCapabilityService({
    repository: { getCapabilityPreferences: () => ({ enabledIds: ["tool:web"] }), putCapabilityPreferences: async (value) => (saved = value) },
  });
  const result = await service.replace(["skill:dsh:documents", "tool:web", "tool:web"]);
  assert.deepEqual(result.enabledIds, ["skill:dsh:documents", "tool:web"]);
  assert.deepEqual(saved.enabledIds, result.enabledIds);
  await assert.rejects(() => service.replace(["../../shell"]), /invalid-capabilities/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/capability-service.test.mjs`

Expected: FAIL because `capability-service.js` does not exist.

- [ ] **Step 3: Implement preference replacement and API routes**

```js
// packages/ai-workbench/src/host/capability-service.js
const CAPABILITY_ID = /^(skill:[a-z0-9._-]+:[a-z0-9._-]+|tool:[a-z0-9._-]+|business:[a-z0-9._-]+)$/i;

export function createCapabilityService({ repository }) {
  return {
    get() { return repository.getCapabilityPreferences(); },
    async replace(ids) {
      if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => typeof id !== "string" || id.length > 200 || !CAPABILITY_ID.test(id))) {
        throw Object.assign(new Error("invalid capabilities"), { statusCode: 400, code: "invalid-capabilities" });
      }
      const unique = [...new Set(ids)];
      return repository.putCapabilityPreferences({ enabledIds: unique, updatedAt: new Date().toISOString() });
    },
  };
}
```

Add these routes:

```text
GET /api/dsh-ai-workbench/capability-preferences
PUT /api/dsh-ai-workbench/capability-preferences
```

The `PUT` body is `{ "enabledIds": [...] }`, requires the workbench action header, and rejects IDs outside the three declared namespaces. Add `capabilityPreferences()` and `saveCapabilityPreferences(enabledIds)` to the browser API. Preference IDs are advisory defaults only: the gateway never maps them to tool installation, permission changes, or approval decisions. The current catalog filters unavailable IDs before a normal send, while retained unavailable preferences remain visible for recovery after a source returns.

- [ ] **Step 4: Run API and concurrency tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS, including concurrent replacement ordering, malformed-ID rejection, and a test proving stored IDs do not invoke a permission or tool-registration API.

- [ ] **Step 5: Commit capability preferences**

```bash
git add packages/ai-workbench
git commit -m "feat: persist capability defaults"
```

### Task 3: Render the capability catalog page

**Files:**
- Create: `packages/ai-workbench/src/client/capability-source.js`
- Create: `packages/ai-workbench/src/client/capability-library.js`
- Create: `packages/ai-workbench/test/capability-source.test.mjs`
- Modify: `packages/ai-workbench/src/client/shell.js`
- Modify: `packages/ai-workbench/src/client/styles.js`

- [ ] **Step 1: Write failing source-degradation tests**

```js
// packages/ai-workbench/test/capability-source.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { loadCapabilitySources } from "../lib/client/capability-source.js";

test("missing Skills Manager degrades without hiding DSH tools", async () => {
  const result = await loadCapabilitySources({
    fetchJson: async (url) => { if (url.includes("skills-manager")) throw new Error("404"); return { enabledIds: ["tool:web"] }; },
    manifest: { tools: [{ id: "web", name: "联网搜索", description: "网页搜索" }], businessSystems: [] },
  });
  assert.equal(result.items.some((item) => item.id === "tool:web" && item.available), true);
  assert.equal(result.warnings[0].code, "skills-manager-unavailable");
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/capability-source.test.mjs`

Expected: FAIL because `capability-source.js` does not exist.

- [ ] **Step 3: Implement source loading and the page**

`loadCapabilitySources` must fetch `/api/dsh-skills-manager/state` and `/api/dsh-ai-workbench/capability-preferences` independently with `Promise.allSettled`, normalize available data, and return `{ items, warnings }`. A failed source adds an inline warning with Retry; it never makes the whole page blank.

`createCapabilityLibrary(React)` must render:

- title `能力库` and copy `查看可用于 Work 任务的 Skills、DSH 工具和业务系统`;
- summary cells for total, enabled, disabled;
- search input plus kind and source filters;
- grouped cards with name, short description, source, availability badge, default toggle, and Details;
- an empty-filter state and source-error state;
- a top-right `高级管理` button.

Disabled/unavailable toggles must be non-interactive and labelled with the reason. Toggle actions use optimistic UI, roll back on API error, and announce the error through `role="status"`. The Details dialog shows no raw secret values and exposes paths only for local Skills.

- [ ] **Step 4: Run component-level and browser checks**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS for filtering, source degradation, optimistic rollback, and accessible toggle labels.

In DSH Web verify all three groups, search, source filter, details, loading, empty, error, and unavailable states. Confirm toggling changes the default but does not mutate any `SKILL.md` or Skills Manager policy file.

- [ ] **Step 5: Commit the catalog page**

```bash
git add packages/ai-workbench
git commit -m "feat: add simple capability library"
```

### Task 4: Bridge to advanced Skills management and the Work selector

**Files:**
- Create: `packages/ai-workbench/src/client/settings-bridge.js`
- Create: `packages/ai-workbench/test/settings-bridge.test.mjs`
- Modify: `packages/ai-workbench/src/client/capability-library.js`
- Modify: `packages/ai-workbench/src/client/work-home.js`
- Modify: `packages/ai-workbench/src/client/sidebar.js`

- [ ] **Step 1: Write failing bridge and selector tests**

Test that the bridge finds the visible Settings trigger by `button[aria-haspopup="dialog"]`, opens it, selects a navigation button whose text is exactly `技能` or `Skills`, and returns `{ ok: false, reason: "skills-manager-unavailable" }` if either stable accessibility surface is missing. Test that Work's selected capability IDs start from enabled preferences, can be changed for the current draft, and never write global preferences.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/settings-bridge.test.mjs`

Expected: FAIL because `settings-bridge.js` does not exist.

- [ ] **Step 3: Implement the bounded accessibility bridge**

```js
// packages/ai-workbench/src/client/settings-bridge.js
export async function openSkillsManager(documentRef = document) {
  const trigger = [...documentRef.querySelectorAll('button[aria-haspopup="dialog"]')].find((node) => !node.disabled && node.offsetParent !== null);
  if (!trigger) return { ok: false, reason: "settings-unavailable" };
  trigger.click();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const dialog = documentRef.querySelector('[role="dialog"][aria-modal="true"]');
  const target = dialog && [...dialog.querySelectorAll("nav button")].find((node) => ["技能", "Skills"].includes(node.textContent.trim()));
  if (!target) return { ok: false, reason: "skills-manager-unavailable" };
  target.click();
  return { ok: true };
}
```

Keep this bridge isolated and covered because DSH does not currently expose a public `open settings section` API. The `高级管理` button calls it and shows `未检测到技能高级管理模块` on failure. Do not reproduce create/import/delete/trash functions in the workbench.

Update the custom Sidebar registration to declare and render the official `sidebar.settings` single root child and `sidebar.footer.action` list root child. This is required for the official Settings trigger/panel to remain mounted after Sidebar replacement.

Update Work's capability selector to consume the catalog. It starts from enabled defaults when a new Work draft is empty, persists per-draft overrides in the Work draft, filters out unavailable entries at send time, and shows removed IDs as `能力已不可用` instead of silently substituting another capability.

- [ ] **Step 4: Verify the end-to-end capability flow**

Run: `pnpm --dir packages/ai-workbench test && npm test`

Expected: both suites PASS.

In DSH Web verify: `高级管理` opens Settings directly on `技能`; returning to the Work page keeps the capability filters; changing a global default affects the next empty Work draft; changing one task's selection does not change the global default; uninstalling one Skill marks it unavailable before send.

- [ ] **Step 5: Commit the capability-library checkpoint**

```bash
git add packages/ai-workbench
git commit -m "feat: connect capabilities to Work tasks"
```
