# DSH AI Workbench Release Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the complete redesign against the approved specification, supplied visual references, security boundaries, upgrade/rollback behavior, and independent package contract.

**Architecture:** Keep release evidence beside the workbench package: automated contract/integration tests for data and policy, a repeatable real-profile smoke script for DSH-specific behavior, same-viewport visual comparisons for Work/Chat, and an operator runbook for install, upgrade, recovery, and rollback.

**Tech Stack:** Node test runner, DSH Web test profile, in-app browser screenshots, image comparison tooling already available in the workspace, pnpm/npm package verification, Git.

---

### Task 1: Add a specification-traceable integration suite

**Files:**
- Create: `packages/ai-workbench/test/spec-matrix.md`
- Create: `packages/ai-workbench/test/integration/work-chat.integration.test.mjs`
- Create: `packages/ai-workbench/test/integration/automation.integration.test.mjs`
- Create: `packages/ai-workbench/test/helpers/workbench-harness.mjs`
- Modify: `packages/ai-workbench/package.json`

- [ ] **Step 1: Create the acceptance matrix before adding tests**

`spec-matrix.md` must map every item in specification sections 19 and 24 to one of: an automated test name, a named real-profile smoke check, or a named visual comparison. No row may say `manual` without an exact procedure and expected result.

Required rows include: mode isolation, separate drafts, separate histories, old-session virtual migration, Work preset/permission, Chat tool whitelist, unavailable placeholders, capability defaults, automation schedule forms, idempotency, overlap skip, approval wait, catch-up, browser-closed behavior, host-stopped behavior, notification, original session preservation, and plugin rollback.

- [ ] **Step 2: Write an integration harness around real service boundaries**

```js
// packages/ai-workbench/test/helpers/workbench-harness.mjs
export function createHarness(overrides = {}) {
  const calls = [];
  const records = { session_modes: {}, drafts: {}, settings: {}, capability_preferences: {}, automations: {}, automation_runs: {}, home_content: {}, notifications: {} };
  const unit = {
    async loadAll() { return { tables: structuredClone(records), global: null }; },
    async putRecord(table, key, value) { records[table][key] = structuredClone(value); calls.push(["put", table, key]); },
    async deleteRecord(table, key) { delete records[table][key]; calls.push(["delete", table, key]); },
    async close() { calls.push(["close"]); },
  };
  const apiProxy = overrides.apiProxy || { sessions: {
    async create(request) { calls.push(["create", request.payload]); return { rpcId: request.rpcId, result: { ok: true, value: { sessionId: request.payload.sessionId, agentPreset: request.payload.agentPreset } } }; },
    async prompt(request) { calls.push(["prompt", request.payload]); return { rpcId: request.rpcId, result: { ok: true, value: { accepted: true } } }; },
  } };
  return { calls, records, unit, apiProxy, now: overrides.now || (() => Date.now()) };
}
```

Use this harness in the two integration suites. Test full service compositions rather than private functions: open repository → build services → route a request → inspect persisted records and DSH calls → close repository.

- [ ] **Step 3: Add exact end-to-end assertions**

`work-chat.integration.test.mjs` must assert:

```text
Work request -> standard preset + selected workspace + workspace-write + Work metadata
Chat request with forged workspace/capabilities -> zf-chat-workbench-v1 + no workspace + no permission mutation
mode bootstrap -> only matching history + matching draft
unclassified sessions -> virtual Work/migration + no metadata write
```

`automation.integration.test.mjs` must assert:

```text
two equal timer ticks -> one durable run and one DSH session
two distinct Work occurrences -> two distinct DSH sessions
approval/asked -> waiting_approval and no automatic decision
active previous run -> later occurrence skipped with previous_run_active
restart -> one latest recurring catch-up
```

Add package scripts:

```json
"test:unit": "npm run build && node --test test/*.test.mjs",
"test:integration": "npm run build && node --test test/integration/*.test.mjs",
"test": "npm run test:unit && npm run test:integration"
```

- [ ] **Step 4: Run the matrix-linked tests**

Run: `TZ=Asia/Shanghai pnpm --dir packages/ai-workbench test`

Expected: every unit and integration test PASS; no test uses real sleeps or writes outside its temporary fixture.

- [ ] **Step 5: Commit integration coverage**

```bash
git add packages/ai-workbench
git commit -m "test: cover workbench acceptance flows"
```

### Task 2: Run adversarial permission and data-integrity verification

**Files:**
- Create: `packages/ai-workbench/test/security-checklist.md`
- Create: `packages/ai-workbench/test/http-security.test.mjs`
- Modify: `packages/ai-workbench/src/host/http.js`
- Modify: `packages/ai-workbench/src/host/session-gateway.js`

- [ ] **Step 1: Add hostile-request tests**

Add cases for: cross-site Host/Origin, missing action header, wrong content type, malformed JSON, body over 1 MiB, path traversal in route IDs, unknown mode, Chat with Work fields, Chat preset content conflict, duplicate mode classification, malformed capability ID, automation workspace as a relative path, unsafe service-navigation URL, and notification text containing quotes/backslashes/newlines.

- [ ] **Step 2: Run the hostile suite and record failures**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/http-security.test.mjs`

Expected: any unguarded case FAILS before hardening; save the failing test names in the commit body, not as comments in source.

- [ ] **Step 3: Harden only the failing boundaries**

The final HTTP handler must apply checks in this order:

```text
1. loopback Host and non-cross-site fetch
2. known method and normalized pathname
3. action header for mutations
4. application/json for body-bearing requests
5. 1 MiB streaming body limit
6. JSON parse
7. route-specific schema validation
8. service call
9. structured error mapping without stack traces
```

Use a strict session/automation ID pattern `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`. Strip control characters from notification display text. Never echo file contents, raw prompts, absolute paths, environment values, or DSH error stacks in diagnostics or 5xx responses.

- [ ] **Step 4: Verify Chat and Work in the real DSH profile**

Create one Chat session and inspect its header/tool catalog. Expected: `zf-chat-workbench-v1`, persona + web only. Attempt prompt injection asking it to run a local command. Expected: it cannot call a local tool and truthfully explains the limitation.

Create one Work session in a temporary workspace. Attempt an in-workspace write and an out-of-workspace write. Expected: the first follows `workspace-write`; the second invokes official DSH approval. Delete the temporary workspace only after recording the result.

- [ ] **Step 5: Commit the security gate**

```bash
git add packages/ai-workbench
git commit -m "test: harden workbench trust boundaries"
```

### Task 3: Perform same-source visual comparison and accessibility QA

**Files:**
- Create: `packages/ai-workbench/test/visual-baseline.md`
- Create: `packages/ai-workbench/test/accessibility-checklist.md`
- Modify: `packages/ai-workbench/src/client/styles.js`
- Modify: `packages/ai-workbench/src/client/sidebar.js`
- Modify: `packages/ai-workbench/src/client/work-home.js`
- Modify: `packages/ai-workbench/src/client/chat-home.js`
- Modify: `packages/ai-workbench/src/client/capability-library.js`
- Modify: `packages/ai-workbench/src/client/automation-list.js`
- Modify: `packages/ai-workbench/src/client/automation-editor.js`
- Modify: `packages/ai-workbench/src/client/automation-detail.js`

- [ ] **Step 1: Prepare fixed visual states and dimensions**

Use the supplied references:

```text
/var/folders/wt/jd1m4xw544b5j8511mnfv_0h0000gn/T/codex-clipboard-554397fd-c920-40af-a64e-950106892f07.png
/var/folders/wt/jd1m4xw544b5j8511mnfv_0h0000gn/T/codex-clipboard-1eea582a-3c5d-4668-bebc-b1b4e5c30cb1.png
```

Capture built Work and Chat pages at exactly 1584×992. Also capture Work/Chat with populated draft, attachment, focus, expanded automatic selection, dialog, loading, source failure, empty search, automation editor, waiting approval, and 1023×900 responsive states.

- [ ] **Step 2: Compare references and built screenshots together**

For each home page, create one side-by-side comparison image containing the reference and built capture at identical scale. Inspect the combined image, not separate tabs. Record measured deltas for Sidebar width, outer margins, headline baseline, orb bounds, composer width/height, card columns, border radius, text weight, icon scale, and vertical rhythm.

Expected: the brand is the supplied blue mark plus live text; the supplied orb and scene assets are not stretched; layout hierarchy matches the design; all visible controls remain functional.

- [ ] **Step 3: Fix visible mismatches and repeat comparison**

Change only existing CSS tokens/components. Do not replace supplied assets with CSS drawings, emoji, inline SVG, or invented imagery. Repeat capture and combined comparison until every blocking mismatch in `visual-baseline.md` is marked pass with the final screenshot filename.

- [ ] **Step 4: Run keyboard, focus, and reduced-motion checks**

Verify: logical Tab order; visible focus rings; Work/Chat switch with keyboard; navigation and history access; dialog focus trap/Escape/restore; labelled icon buttons; toggle state announcements; error `role="alert"`; status updates; 200% browser zoom; `prefers-reduced-motion`; and color contrast for primary, muted, disabled, and selected states.

Expected: no keyboard trap outside an open dialog, no clipped content at 200%, and no mode conveyed by color alone.

- [ ] **Step 5: Commit the visual/accessibility gate**

```bash
git add packages/ai-workbench
git commit -m "test: verify workbench visual and accessibility quality"
```

### Task 4: Verify clean install, upgrade, disable, and rollback

**Files:**
- Create: `packages/ai-workbench/scripts/profile-smoke.mjs`
- Create: `packages/ai-workbench/test/profile-smoke.md`
- Modify: `packages/ai-workbench/package.json`
- Modify: `packages/ai-workbench/README.md`

- [ ] **Step 1: Add a read-only profile smoke script**

```js
// packages/ai-workbench/scripts/profile-smoke.mjs
const base = process.env.DSH_WEB_URL;
if (!base || !/^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/.test(base)) {
  throw new Error("DSH_WEB_URL must be a loopback origin");
}
const response = await fetch(`${base}/api/dsh-ai-workbench/diagnostics`);
const payload = await response.json();
if (!response.ok || payload.ok !== true || payload.data.compatible !== true) {
  throw new Error(`workbench diagnostics failed: ${JSON.stringify(payload)}`);
}
console.log(JSON.stringify({ compatible: true, features: payload.data.features }, null, 2));
```

Add `"smoke:profile": "node scripts/profile-smoke.mjs"` to the package scripts. The script is diagnostics-only and must not create sessions or mutate data.

- [ ] **Step 2: Verify a clean profile installation**

Pack the workbench to a temporary directory, install that tarball into a clean DSH Web profile, start DSH Web with Node 25, run `smoke:profile`, and execute the named smoke checks in `profile-smoke.md`.

Expected: no dependency on a repository checkout, source files, or absolute development paths; Work remains available if Skills Manager is missing; Chat is available only after its exact preset verifies.

- [ ] **Step 3: Verify in-place upgrade with retained data**

On the clean profile create one Work draft, one Chat draft, one explicit Chat session, one enabled capability preference, and one paused automation. Install the new tarball version over the previous version and restart.

Expected: all records survive; original DSH session files are unchanged; no schedule executes merely because of package upgrade; imported-history classification remains virtual.

- [ ] **Step 4: Verify disable/remove rollback**

Disable the workbench plugin and restart. Expected: official DSH Root/Sidebar return and original sessions remain usable. Remove the plugin package and restart. Expected: the same. Reinstall it. Expected: isolated KV metadata and automation records return without rewriting DSH sessions.

- [ ] **Step 5: Commit packaging and rollback proof**

```bash
git add packages/ai-workbench
git commit -m "test: prove workbench install and rollback"
```

### Task 5: Finalize operator and developer handoff

**Files:**
- Create: `packages/ai-workbench/CHANGELOG.md`
- Create: `packages/ai-workbench/docs/operations.md`
- Create: `packages/ai-workbench/docs/development.md`
- Modify: `packages/ai-workbench/README.md`
- Modify: `docs/superpowers/specs/2026-09-04-dsh-ai-workbench-design.md`

- [ ] **Step 1: Document the delivered package**

README must cover product scope, Work/Chat difference, requirements, install/start/verify commands, known constraints, and rollback. `operations.md` must cover diagnostics, Chat preset conflict, storage location discovery, automation statuses, approval recovery, host stopped/sleep behavior, notification fallback, backup, and safe plugin removal. `development.md` must explain package boundaries, build outputs, test commands, DSH compatibility probe, and how to add a capability or schedule type without weakening policy.

- [ ] **Step 2: Reconcile documentation with implementation**

Update the specification's implementation-verification section with the exact DSH versions proven, final package version, final preset ID, actual route list, storage unit version, and links to the acceptance evidence. Change no approved product decision unless the user has separately approved that change.

- [ ] **Step 3: Run the exact release gate**

```bash
npm test
pnpm --dir packages/ai-workbench test
pnpm --dir packages/ai-workbench run verify
git diff --check
git status --short
```

Expected: first four commands exit `0`; `git status --short` lists only intentional release-document changes before the final commit.

- [ ] **Step 4: Inspect the packed artifact**

Run: `pnpm --dir packages/ai-workbench pack:check`

Expected: package contains `lib/index.js`, `lib/client.js`, all required `lib/host` and `lib/shared` modules, `presets/zf-chat`, brand/orb/navigation/scene assets, `cordis.patch.yml`, README, CHANGELOG, and no source screenshots, temporary comparisons, test fixtures, logs, secrets, absolute machine paths, or `node_modules`.

- [ ] **Step 5: Commit the release checkpoint**

```bash
git add packages/ai-workbench docs/superpowers/specs/2026-09-04-dsh-ai-workbench-design.md
git commit -m "docs: complete AI workbench release handoff"
```
