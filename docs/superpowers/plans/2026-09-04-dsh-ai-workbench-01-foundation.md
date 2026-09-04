# DSH AI Workbench Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the independent workbench package and prove that the selected DSH Root/Sidebar integration works before product feature development begins.

**Architecture:** Add a separate package with generated `lib` output and thin host/client entries. Put all DSH-version-sensitive operations behind explicit compatibility checks so an unsupported host keeps the official DSH shell instead of rendering a broken replacement.

**Tech Stack:** pnpm workspace, Node.js ESM, esbuild, React 18, DSH client runtime/slots/layout, Cordis, Node test runner.

---

### Task 1: Add the second package without changing the existing release artifact

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `packages/ai-workbench/package.json`
- Create: `packages/ai-workbench/cordis.patch.yml`
- Create: `packages/ai-workbench/scripts/build.mjs`
- Create: `packages/ai-workbench/src/index.js`
- Create: `packages/ai-workbench/src/client.js`
- Create: `packages/ai-workbench/test/package-contract.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing package-contract test**

```js
// packages/ai-workbench/test/package-contract.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("workbench publishes independent host and client entries", async () => {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(pkg.name, "@michengai/dsh-ai-workbench");
  assert.equal(pkg.exports["."], "./lib/index.js");
  assert.equal(pkg.exports["./client"], "./lib/client.js");
  assert.deepEqual(pkg.files, ["lib", "assets", "presets", "cordis.patch.yml", "README.md"]);
  assert.equal(pkg.dsh.client.platform, "web");
  assert.ok(pkg.dsh.client.inject.includes("@deepseek-ai/dsh-client-runtime"));
});

test("repository keeps both packages", async () => {
  const workspace = await readFile(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8");
  assert.match(workspace, /packages:\n  - '\.'\n  - 'packages\/\*'/);
  const rootPkg = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  assert.equal(rootPkg.name, "@michengai/dsh-skills-manager");
  assert.equal(rootPkg.scripts["workbench:test"], "pnpm --dir packages/ai-workbench test");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test packages/ai-workbench/test/package-contract.test.mjs`

Expected: FAIL because the package and workspace manifest do not exist.

- [ ] **Step 3: Add the workspace and package manifests**

```yaml
# pnpm-workspace.yaml
packages:
  - '.'
  - 'packages/*'
```

```json
{
  "name": "@michengai/dsh-ai-workbench",
  "version": "0.1.0",
  "description": "Branded Work and Chat workspace for DSH Web.",
  "license": "Apache-2.0",
  "type": "module",
  "packageManager": "pnpm@11.22.0",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": ["lib", "assets", "presets", "cordis.patch.yml", "README.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-primitives",
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-locale"
      ],
      "platform": "web"
    }
  },
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "npm run build && node --test test/*.test.mjs",
    "pack:check": "npm pack --dry-run --json",
    "verify": "npm test && npm run pack:check"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": ">=4.0.1 <5.0.0",
    "@deepseek-ai/dsh-client-locale": "0.1.2-rc.1",
    "@deepseek-ai/dsh-client-runtime": "0.1.2-rc.1",
    "@deepseek-ai/dsh-client-ui-layout": "0.1.2-rc.1",
    "@deepseek-ai/dsh-client-ui-primitives": "0.1.2-rc.1",
    "@deepseek-ai/dsh-host-apiproxy": "0.1.2-rc.1",
    "@deepseek-ai/dsh-host-webserver": "0.1.2-rc.1",
    "@deepseek-ai/dsh-session": "0.1.2-rc.1",
    "@deepseek-ai/dsh-session-query": "0.1.2-rc.1",
    "@deepseek-ai/dsh-storage": "0.1.2-rc.1",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "esbuild": "0.25.0"
  },
  "engines": { "node": ">=20" }
}
```

Add these scripts to the existing root `package.json` without changing its current scripts:

```json
"workbench:build": "pnpm --dir packages/ai-workbench run build",
"workbench:test": "pnpm --dir packages/ai-workbench test",
"verify:all": "npm run verify && npm run workbench:test"
```

```yaml
# packages/ai-workbench/cordis.patch.yml
- insert:
    - id: ai-workbench
      name: '@michengai/dsh-ai-workbench'
```

```js
// packages/ai-workbench/src/index.js
const name = "ai-workbench";
const inject = ["webServer", "webRuntime"];

function apply() {
  return undefined;
}

export { apply, inject, name };
```

```js
// packages/ai-workbench/src/client.js
window.__ModuleLoader__.load({
  id: "@michengai/dsh-ai-workbench",
  factory: () => ({ name: "ai-workbench-client", inject: [], apply() {} }),
});
```

```js
// packages/ai-workbench/scripts/build.mjs
import { mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm(new URL("../lib", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../lib", import.meta.url), { recursive: true });
await build({
  entryPoints: ["src/index.js"],
  outdir: "lib",
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
});
await build({
  entryPoints: ["src/client.js"],
  outfile: "lib/client.js",
  bundle: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
});
console.log("[dsh-ai-workbench] built host and client entries");
```

- [ ] **Step 4: Install workspace dependencies and run the test**

Run: `pnpm install`

Expected: `pnpm-lock.yaml` gains the `packages/ai-workbench` importer and exits `0`.

Run: `node --test packages/ai-workbench/test/package-contract.test.mjs`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the package boundary**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml packages/ai-workbench
git commit -m "build: scaffold independent AI workbench plugin"
```

### Task 2: Add deterministic compatibility probes

**Files:**
- Create: `packages/ai-workbench/src/shared/compatibility.js`
- Create: `packages/ai-workbench/test/compatibility.test.mjs`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing probe tests**

```js
// packages/ai-workbench/test/compatibility.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { probeClientContracts, probeHostContracts } from "../lib/shared/compatibility.js";

test("client probe accepts the required DSH slot and layout faces", () => {
  const result = probeClientContracts({
    slots: {
      spec: (name) => ({ root: {}, sidebar: {}, conversation: {}, details: {}, "shell.overlay": {} })[name],
      register() {},
    },
    layout: { toggleSidebar() {}, openDetails() {}, closeDetails() {}, attachPanels() {} },
    sessions: { open() {}, binding() {}, subscribe() {} },
  });
  assert.deepEqual(result, { ok: true, failures: [] });
});

test("client probe reports missing contracts without throwing", () => {
  const result = probeClientContracts({ slots: { spec: () => undefined } });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("slot:conversation"));
  assert.ok(result.failures.includes("layout:attachPanels"));
});

test("host probe requires the gateway, query, storage, and timer faces", () => {
  const result = probeHostContracts({
    apiProxy: { sessions: { create() {}, prompt() {} } },
    sessionQuery: { listSessions() {} },
    storage: { backend: { get() {} } },
    setTimeout() {},
  });
  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `pnpm --dir packages/ai-workbench test`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/shared/compatibility.js`.

- [ ] **Step 3: Implement the pure probes**

```js
// packages/ai-workbench/src/shared/compatibility.js
function hasFunction(value, key) {
  return value != null && typeof value[key] === "function";
}

export function probeClientContracts(ctx) {
  const failures = [];
  for (const slot of ["root", "sidebar", "conversation", "details", "shell.overlay"]) {
    if (!hasFunction(ctx.slots, "spec") || ctx.slots.spec(slot) == null) failures.push(`slot:${slot}`);
  }
  if (!hasFunction(ctx.slots, "register")) failures.push("slots:register");
  for (const method of ["toggleSidebar", "openDetails", "closeDetails", "attachPanels"]) {
    if (!hasFunction(ctx.layout, method)) failures.push(`layout:${method}`);
  }
  for (const method of ["open", "binding", "subscribe"]) {
    if (!hasFunction(ctx.sessions, method)) failures.push(`sessions:${method}`);
  }
  return { ok: failures.length === 0, failures };
}

export function probeHostContracts(ctx) {
  const failures = [];
  if (!hasFunction(ctx.apiProxy?.sessions, "create")) failures.push("apiProxy.sessions:create");
  if (!hasFunction(ctx.apiProxy?.sessions, "prompt")) failures.push("apiProxy.sessions:prompt");
  if (!hasFunction(ctx.sessionQuery, "listSessions")) failures.push("sessionQuery:listSessions");
  if (!hasFunction(ctx.storage?.backend, "get")) failures.push("storage.backend:get");
  if (!hasFunction(ctx, "setTimeout")) failures.push("timer:setTimeout");
  return { ok: failures.length === 0, failures };
}
```

Extend the host build entry list so every `src/shared/*.js` file is emitted:

```js
entryPoints: ["src/index.js", "src/shared/compatibility.js"],
```

- [ ] **Step 4: Run the focused and package tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS, including 3 compatibility tests.

- [ ] **Step 5: Commit the probes**

```bash
git add packages/ai-workbench
git commit -m "test: pin DSH workbench compatibility contracts"
```

### Task 3: Register a fail-safe host diagnostics endpoint

**Files:**
- Create: `packages/ai-workbench/src/host/http.js`
- Create: `packages/ai-workbench/src/host/diagnostics.js`
- Create: `packages/ai-workbench/test/http.test.mjs`
- Modify: `packages/ai-workbench/src/index.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing route and trust-fence tests**

```js
// packages/ai-workbench/test/http.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { validateOrigin, routeRequest } from "../lib/host/http.js";

test("origin fence accepts loopback and rejects cross-site", () => {
  assert.equal(validateOrigin({ headers: { host: "localhost:3080" } }), null);
  assert.equal(validateOrigin({ headers: { host: "evil.example", "sec-fetch-site": "cross-site" } }).statusCode, 403);
});

test("diagnostics route returns the probe snapshot", async () => {
  const result = await routeRequest(
    { method: "GET", url: "/api/dsh-ai-workbench/diagnostics", headers: { host: "127.0.0.1:3080" } },
    { diagnostics: () => ({ compatible: false, failures: ["slot:root"] }) },
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.compatible, false);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/http.test.mjs`

Expected: FAIL because `lib/host/http.js` does not exist.

- [ ] **Step 3: Implement pure routing and host registration**

```js
// packages/ai-workbench/src/host/http.js
export function validateOrigin(req) {
  const host = String(req.headers?.host || "").toLowerCase();
  const loopback = host === "localhost" || host.startsWith("localhost:") || host === "[::1]" || host.startsWith("[::1]:") || /^127(?:\.\d{1,3}){3}(?::\d+)?$/.test(host);
  if (!loopback || req.headers?.["sec-fetch-site"] === "cross-site") {
    return { statusCode: 403, body: { ok: false, code: "forbidden-origin", error: "forbidden origin" } };
  }
  return null;
}

export async function routeRequest(req, services) {
  const denied = validateOrigin(req);
  if (denied) return denied;
  const path = new URL(req.url, "http://localhost").pathname.replace(/\/+$/, "");
  if (req.method === "GET" && path === "/api/dsh-ai-workbench/diagnostics") {
    return { statusCode: 200, body: { ok: true, data: services.diagnostics() } };
  }
  return { statusCode: 404, body: { ok: false, code: "not-found", error: "not found" } };
}

export function sendJson(res, result) {
  const body = JSON.stringify(result.body);
  res.writeHead(result.statusCode, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}
```

```js
// packages/ai-workbench/src/host/diagnostics.js
export function createDiagnostics(hostProbe) {
  const startedAt = new Date().toISOString();
  return () => ({ compatible: hostProbe.ok, failures: [...hostProbe.failures], startedAt });
}
```

Replace `src/index.js` with:

```js
import { probeHostContracts } from "./shared/compatibility.js";
import { createDiagnostics } from "./host/diagnostics.js";
import { routeRequest, sendJson } from "./host/http.js";

const name = "ai-workbench";
const inject = ["webServer", "webRuntime", "apiProxy", "sessionQuery", "storage"];

function apply(ctx) {
  const diagnostics = createDiagnostics(probeHostContracts(ctx));
  return ctx.webServer.register({
    kind: "prefix",
    path: "/api/dsh-ai-workbench",
    handler: async (req, res) => sendJson(res, await routeRequest(req, { diagnostics })),
  });
}

export { apply, inject, name };
```

Add `src/host/http.js` and `src/host/diagnostics.js` to the host build entry points.

- [ ] **Step 4: Run the HTTP tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS with origin and diagnostics coverage.

- [ ] **Step 5: Commit the fail-safe host seam**

```bash
git add packages/ai-workbench
git commit -m "feat: add workbench compatibility diagnostics"
```

### Task 4: Prove custom Root can host official DSH child slots

**Files:**
- Create: `packages/ai-workbench/src/client/root.js`
- Create: `packages/ai-workbench/src/client/styles.js`
- Create: `packages/ai-workbench/test/root-contract.test.mjs`
- Modify: `packages/ai-workbench/src/client.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write the failing Root registration contract test**

```js
// packages/ai-workbench/test/root-contract.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { ROOT_CHILDREN, createRootRegistration } from "../lib/client/root.js";

test("custom Root redeclares every official child seat", () => {
  assert.deepEqual(ROOT_CHILDREN, {
    sidebar: { kind: "single", scope: "root" },
    conversation: { kind: "single", scope: "session-maybe" },
    details: { kind: "single", scope: "session" },
    "shell.overlay": { kind: "list", scope: "root" },
  });
});

test("layout adapter refuses a host without attachPanels", () => {
  const registration = createRootRegistration({ layout: {} }, () => ({}));
  assert.throws(() => registration.inject({}), /attachPanels/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/root-contract.test.mjs`

Expected: FAIL because `lib/client/root.js` does not exist.

- [ ] **Step 3: Implement the minimum custom frame and registration**

```js
// packages/ai-workbench/src/client/root.js
export const ROOT_CHILDREN = {
  sidebar: { kind: "single", scope: "root" },
  conversation: { kind: "single", scope: "session-maybe" },
  details: { kind: "single", scope: "session" },
  "shell.overlay": { kind: "list", scope: "root" },
};

function createLayoutStore(defineStore) {
  return defineStore({
    init: () => ({ sidebar: 280, details: 0, narrow: false, narrowExpanded: false }),
    actions: {
      setSidebar(draft, value) { draft.sidebar = Math.max(264, Math.min(420, value)); },
      setDetails(draft, value) { draft.details = Math.max(300, Math.min(520, value)); },
      toggleSidebar(draft) { if (draft.narrow) draft.narrowExpanded = !draft.narrowExpanded; else draft.sidebar = draft.sidebar === 0 ? 280 : 0; },
      setNarrow(draft, value) { draft.narrow = value; draft.narrowExpanded = false; },
      openDetails(draft) { if (draft.details === 0) draft.details = 360; },
      closeDetails(draft) { draft.details = 0; },
    },
  });
}

export function createRootRegistration(ctx, defineStore) {
  return {
    name: "root",
    children: ROOT_CHILDREN,
    store: () => createLayoutStore(defineStore),
    inject(actions) {
      if (typeof ctx.layout?.attachPanels !== "function") throw new Error("DSH layout.attachPanels is unavailable");
      ctx.layout.attachPanels(actions);
      return {};
    },
  };
}

export function createRootComponent(React) {
  const h = React.createElement;
  return function WorkbenchFrame({ useStore, actions, renderSlot }) {
    const panels = useStore((value) => value);
    const collapsed = panels.narrow ? !panels.narrowExpanded : panels.sidebar === 0;
    const sidebar = collapsed ? 56 : panels.sidebar;
    return h("div", { className: "daw-frame", style: { gridTemplateColumns: `${sidebar}px minmax(0,1fr) ${panels.details}px` } },
      h("aside", { className: "daw-sidebar" }, renderSlot("sidebar", { collapsed, width: sidebar, toggleSidebar: actions.toggleSidebar })),
      h("main", { className: "daw-center" }, renderSlot("conversation", {})),
      h("aside", { className: "daw-details" }, renderSlot("details", {})),
      h("div", { className: "daw-overlay" }, renderSlot("shell.overlay", {})),
    );
  };
}
```

```js
// packages/ai-workbench/src/client/styles.js
export function installStyles(css) {
  const id = "dsh-ai-workbench-styles";
  if (document.getElementById(id)) return () => {};
  const node = document.createElement("style");
  node.id = id;
  node.textContent = css;
  document.head.append(node);
  return () => node.remove();
}

export const foundationCss = `.daw-frame{height:100%;display:grid;grid-template-rows:100%;overflow:hidden;background:#fff;color:#171a22}.daw-sidebar{min-width:0;overflow:hidden;border-right:1px solid #e5e8ef;background:#fafbfe}.daw-center{min-width:0;display:flex;overflow:hidden}.daw-details{min-width:0;overflow:hidden;border-left:1px solid #e5e8ef}.daw-overlay{position:absolute;inset:0;z-index:20;pointer-events:none}.daw-overlay>*{pointer-events:auto}`;
```

Replace `src/client.js` with:

```js
// packages/ai-workbench/src/client.js
import { probeClientContracts } from "./shared/compatibility.js";
import { createRootComponent, createRootRegistration } from "./client/root.js";
import { foundationCss, installStyles } from "./client/styles.js";

window.__ModuleLoader__.load({
  id: "@michengai/dsh-ai-workbench",
  factory: (require) => {
    const React = require("react");
    const runtime = require("@deepseek-ai/dsh-client-runtime/client");
    const name = "ai-workbench-client";
    const inject = ["slots", "layout", "sessions"];
    function apply(ctx) {
      const probe = probeClientContracts(ctx);
      if (!probe.ok) {
        console.error("[dsh-ai-workbench] client compatibility failed", probe.failures);
        return undefined;
      }
      ctx.effect(() => installStyles(foundationCss));
      const registration = createRootRegistration(ctx, runtime.defineStore);
      ctx.effect(() => ctx.slots.register(registration, createRootComponent(React)));
      return undefined;
    }
    return { apply, inject, name };
  },
});
```

Change the browser build to `bundle: true`; the ESM imports above are bundled, while React and DSH remain runtime `require(...)` calls inside the loader factory. Also emit `src/client/root.js` and `src/client/styles.js` as non-bundled ESM test outputs under `lib/client/`.

- [ ] **Step 4: Run automated and manual compatibility smoke tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: all workbench tests PASS.

Run: `PATH=/opt/homebrew/opt/node/bin:$PATH dsh plugin --profile web add ./packages/ai-workbench`

Expected: plugin add reports success.

Run: `PATH=/opt/homebrew/opt/node/bin:$PATH dsh web`

Expected: DSH Web starts; the browser shows the custom three-column frame; an existing session renders through official Conversation; selecting a tool result can open official Details; Settings still opens. `/api/dsh-ai-workbench/diagnostics` reports `compatible: true`.

If any expected behavior fails, stop the roadmap and save the exact package versions, diagnostics response, slot snapshot, and browser error before revising the architecture.

- [ ] **Step 5: Commit the proven integration**

```bash
git add packages/ai-workbench
git commit -m "feat: prove custom workbench root integration"
```

### Task 5: Lock the tested dependency range and package verification

**Files:**
- Create: `packages/ai-workbench/README.md`
- Create: `packages/ai-workbench/test/generated-output.test.mjs`
- Modify: `packages/ai-workbench/package.json`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write the failing generated-output test**

```js
// packages/ai-workbench/test/generated-output.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

test("build emits host, browser, and compatibility modules", async () => {
  for (const path of ["../lib/index.js", "../lib/client.js", "../lib/shared/compatibility.js", "../lib/host/http.js"]) {
    await access(new URL(path, import.meta.url));
  }
  const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(client, /@michengai\/dsh-ai-workbench/);
  assert.doesNotMatch(client, /sourceMappingURL/);
});

test("a failed build keeps the last published lib intact", async () => {
  const before = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, DSH_AI_WORKBENCH_TEST_FAIL_BEFORE_PUBLISH: "1" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(new URL("../lib/client.js", import.meta.url), "utf8"), before);
});
```

- [ ] **Step 2: Run the test and verify it fails on the current build layout**

Run: `pnpm --dir packages/ai-workbench test`

Expected: FAIL because the initial build script does not honor the forced pre-publish failure and therefore exits `0`.

- [ ] **Step 3: Make the build atomic and document the tested DSH range**

Replace the workbench build with this atomic build. It discovers maintained modules, emits host/shared and client test modules with their source-relative paths, bundles only the browser loader entry, and swaps `lib` only after every build succeeds.

```js
// packages/ai-workbench/scripts/build.mjs
import { access, readdir, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = join(packageRoot, "lib");
const stagingDirectory = join(packageRoot, `.ai-workbench-build-${randomUUID()}`);
const backupDirectory = join(packageRoot, `.ai-workbench-build-backup-${randomUUID()}`);
let previousOutputMoved = false;
let published = false;

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function modulesUnder(directory) {
  const absolute = join(packageRoot, directory);
  if (!(await exists(absolute))) return [];
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const relative = join(directory, entry.name);
    return entry.isDirectory() ? modulesUnder(relative) : entry.isFile() && entry.name.endsWith(".js") ? [relative] : [];
  }));
  return nested.flat();
}

try {
  const hostEntries = ["src/index.js", ...(await modulesUnder("src/host")), ...(await modulesUnder("src/shared"))];
  const clientEntries = await modulesUnder("src/client");
  await build({ entryPoints: hostEntries, outdir: stagingDirectory, outbase: "src", bundle: false, format: "esm", platform: "node", target: "node20" });
  if (clientEntries.length) await build({ entryPoints: clientEntries, outdir: stagingDirectory, outbase: "src", bundle: false, format: "esm", platform: "browser", target: "es2022" });
  await build({ entryPoints: [join(packageRoot, "src/client.js")], outfile: join(stagingDirectory, "client.js"), bundle: true, format: "iife", platform: "browser", target: "es2022" });
  if (process.env.DSH_AI_WORKBENCH_TEST_FAIL_BEFORE_PUBLISH === "1") throw new Error("test failure before publish");
  if (await exists(outputDirectory)) { await rename(outputDirectory, backupDirectory); previousOutputMoved = true; }
  try { await rename(stagingDirectory, outputDirectory); published = true; } catch (error) { if (previousOutputMoved) await rename(backupDirectory, outputDirectory); throw error; }
  if (previousOutputMoved) await rm(backupDirectory, { recursive: true, force: true });
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
  if (published && previousOutputMoved && (await exists(backupDirectory))) await rm(backupDirectory, { recursive: true, force: true });
}

console.log("[dsh-ai-workbench] built host and client entries");
```

Set every workbench DSH peer dependency to the exact version proven in Task 4. After a second version passes the same smoke suite, replace exact pins with the narrowest semver interval containing only tested versions.

Add `README.md` with these commands:

```markdown
# @michengai/dsh-ai-workbench

Local Work/Chat shell for DSH Web.

## Verify

pnpm test
pnpm run verify

## Install into a Web profile

dsh plugin --profile web add /absolute/path/to/packages/ai-workbench
```

- [ ] **Step 4: Run package and root regressions**

Run: `pnpm --dir packages/ai-workbench run verify`

Expected: tests pass and `npm pack --dry-run --json` lists `lib/index.js`, `lib/client.js`, `cordis.patch.yml`, and `README.md`.

Run: `npm test`

Expected: existing skills-manager tests remain green.

- [ ] **Step 5: Commit the foundation checkpoint**

```bash
git add packages/ai-workbench package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "build: lock verified DSH workbench foundation"
```
