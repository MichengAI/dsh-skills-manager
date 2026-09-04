# DSH AI Workbench Work and Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both home screens functional: Work creates an authorized DSH task with workspace and capability choices, while Chat creates a separate web-only question session with no local-computer tools.

**Architecture:** Session creation and the first prompt go through a host-side gateway that chooses the Agent preset from the requested mode. The browser cannot assign a mode to an arbitrary session. Work uses the verified `standard` preset and `workspace-write`; Chat uses a plugin-owned `zf-chat-workbench-v1` preset containing only persona and web search. Home drafts remain local metadata; after a successful send, the app opens the official DSH Conversation.

**Tech Stack:** DSH ApiProxy/AgentPresets/PermissionPresets, React 18, Web Speech API, browser File API, Node test runner.

---

### Task 1: Install and verify the restricted Chat Agent preset

**Files:**
- Create: `packages/ai-workbench/presets/zf-chat/agent.cordis.yml`
- Create: `packages/ai-workbench/presets/zf-chat/preset.yml`
- Create: `packages/ai-workbench/src/host/chat-preset.js`
- Create: `packages/ai-workbench/test/chat-preset.test.mjs`
- Modify: `packages/ai-workbench/src/shared/compatibility.js`
- Modify: `packages/ai-workbench/src/index.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`
- Modify: `packages/ai-workbench/package.json`

- [ ] **Step 1: Write failing preset-policy tests**

```js
// packages/ai-workbench/test/chat-preset.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertChatComposition, ensureChatPreset } from "../lib/host/chat-preset.js";

test("bundled Chat composition contains web but no Work tools", async () => {
  const text = await readFile(new URL("../presets/zf-chat/agent.cordis.yml", import.meta.url), "utf8");
  assert.doesNotThrow(() => assertChatComposition(text));
  assert.match(text, /@deepseek-ai\/dsh-tool-web/);
  assert.doesNotMatch(text, /shell|terminal|filesystem|str-replace|skill|subagent|browser/);
});

test("an existing preset with different content is refused", async () => {
  const roster = {
    list: async () => [{ id: "zf-chat-workbench-v1" }],
    read: async () => "- id: shell\n  name: '@deepseek-ai/dsh-tool-bash-persistent'\n",
  };
  await assert.rejects(() => ensureChatPreset(roster, { bundledText: "- id: tool-web\n  name: '@deepseek-ai/dsh-tool-web'\n" }), /preset-content-conflict/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/chat-preset.test.mjs`

Expected: FAIL because the preset and installer do not exist.

- [ ] **Step 3: Add the minimal preset and fail-closed installer**

```yaml
# packages/ai-workbench/presets/zf-chat/agent.cordis.yml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      你是正方 AI 工作台的校园问答助手。请直接、准确地回答问题；不确定时明确说明。
      你只能进行对话和联网搜索，不得声称已操作本机文件、系统、工作空间、技能或业务系统。
    complete: true
    includeRuntimeContext: false

- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: false
    searchTimeoutMs: 60000
```

```yaml
# packages/ai-workbench/presets/zf-chat/preset.yml
name: 正方校园问答
description: 仅提供模型问答和联网搜索，不包含本机、文件、Skill 或业务系统执行能力。
order: 50
```

```js
// packages/ai-workbench/src/host/chat-preset.js
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export const CHAT_PRESET_ID = "zf-chat-workbench-v1";
const FORBIDDEN = /shell|terminal|filesystem|str-replace|skill|subagent|browser/i;

function normalized(text) {
  return String(text).replace(/\r\n/g, "\n").trimEnd() + "\n";
}

export function assertChatComposition(text) {
  const value = normalized(text);
  if (!value.includes("@deepseek-ai/dsh-persona") || !value.includes("@deepseek-ai/dsh-tool-web") || FORBIDDEN.test(value)) {
    throw new Error("unsafe-chat-composition");
  }
  return value;
}

async function atomicWrite(path, text) {
  const temporary = join(dirname(path), `.agent.cordis.${randomUUID()}.tmp`);
  await writeFile(temporary, text, { mode: 0o600 });
  try { await rename(temporary, path); } catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
}

export async function ensureChatPreset(agentPresets, options = {}) {
  const bundledText = assertChatComposition(options.bundledText || await readFile(new URL("../../presets/zf-chat/agent.cordis.yml", import.meta.url), "utf8"));
  const bundledMetadata = options.bundledMetadata || await readFile(new URL("../../presets/zf-chat/preset.yml", import.meta.url), "utf8");
  const existing = (await agentPresets.list()).find((entry) => entry.id === CHAT_PRESET_ID);
  if (existing) {
    const installed = assertChatComposition(await agentPresets.read(CHAT_PRESET_ID));
    if (normalized(installed) !== normalized(bundledText)) throw new Error("preset-content-conflict");
    return { id: CHAT_PRESET_ID, installed: false };
  }
  await agentPresets.copy("standard", CHAT_PRESET_ID, "正方校园问答");
  try {
    const copied = await agentPresets.resolve(CHAT_PRESET_ID);
    await atomicWrite(copied.path, bundledText);
    await atomicWrite(join(dirname(copied.path), "preset.yml"), bundledMetadata);
    const verified = assertChatComposition(await agentPresets.read(CHAT_PRESET_ID));
    if (normalized(verified) !== normalized(bundledText)) throw new Error("preset-verification-failed");
    return { id: CHAT_PRESET_ID, installed: true };
  } catch (error) {
    await agentPresets.remove(CHAT_PRESET_ID).catch(() => undefined);
    throw error;
  }
}
```

Add `agentPresets` and `permissionPresets` to host compatibility probes and injected services. During plugin startup call `ensureChatPreset(ctx.agentPresets)` before exposing the Chat route. If installation or verification fails, keep Work available, set diagnostics `features.chat = { available: false, reason }`, and make Chat session creation return `503 chat-preset-unavailable`.

Add exact-version peer dependencies for `@deepseek-ai/dsh-agent-presets` and `@deepseek-ai/dsh-permission-presets`; use the same DSH version proven in foundation Task 4. Do not add them as bundled runtime dependencies.

- [ ] **Step 4: Run tests and inspect the installed preset**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS; the forbidden-tool test passes.

Start DSH Web once, then inspect the resolved `zf-chat-workbench-v1` preset through `ctx.agentPresets.read` in the diagnostics probe.

Expected: the installed text is byte-normalized equal to the bundled composition and the roster reports no `broken` reason.

- [ ] **Step 5: Commit the Chat security boundary**

```bash
git add packages/ai-workbench
git commit -m "feat: add restricted Chat agent preset"
```

### Task 2: Create sessions and submit first prompts through a trusted gateway

**Files:**
- Create: `packages/ai-workbench/src/host/session-gateway.js`
- Create: `packages/ai-workbench/test/session-gateway.test.mjs`
- Modify: `packages/ai-workbench/src/host/repository.js`
- Modify: `packages/ai-workbench/src/host/http.js`
- Modify: `packages/ai-workbench/src/shared/contracts.js`
- Modify: `packages/ai-workbench/src/client/api.js`
- Modify: `packages/ai-workbench/scripts/build.mjs`

- [ ] **Step 1: Write failing gateway tests**

```js
// packages/ai-workbench/test/session-gateway.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createSessionGateway } from "../lib/host/session-gateway.js";

function ok(value) { return { rpcId: "r", result: { ok: true, value } }; }

test("Chat always uses the restricted preset and ignores Work-only fields", async () => {
  const calls = [];
  const gateway = createSessionGateway({
    apiProxy: { sessions: {
      create: async (request) => (calls.push(["create", request.payload]), ok({ sessionId: request.payload.sessionId, agentPreset: request.payload.agentPreset })),
      prompt: async (request) => (calls.push(["prompt", request.payload]), ok({ accepted: true })),
    } },
    repository: { putSessionMeta: async (...args) => calls.push(["meta", ...args]), deleteSessionMeta: async () => {} },
    permissionPresets: { set: async (...args) => calls.push(["permission", ...args]) },
    sessions: { get: (id) => ({ id }) },
    id: () => "session-1",
    rpcId: () => "rpc-1",
  });
  await gateway.start({ mode: "chat", text: "你好", workspaceId: "forbidden", capabilityIds: ["shell"], attachments: [] });
  assert.deepEqual(calls.find(([kind]) => kind === "create")[1], { sessionId: "session-1", agentPreset: "zf-chat-workbench-v1" });
  assert.equal(calls.some(([kind]) => kind === "permission"), false);
});

test("Work uses standard, workspace-write, and records selected capabilities", async () => {
  const calls = [];
  const gateway = createSessionGateway({
    apiProxy: { sessions: {
      create: async (request) => ok({ sessionId: request.payload.sessionId, agentPreset: request.payload.agentPreset }),
      prompt: async () => ok({ accepted: true }),
    } },
    repository: { putSessionMeta: async (...args) => calls.push(args), deleteSessionMeta: async () => {} },
    permissionPresets: { set: async (...args) => calls.push(args) },
    sessions: { get: (id) => ({ id }) },
    id: () => "session-2", rpcId: () => "rpc-2",
  });
  await gateway.start({ mode: "work", text: "整理材料", workspaceId: "w1", capabilityIds: ["skill:docs"], attachments: [] });
  assert.ok(calls.some((call) => call.includes("workspace-write")));
  assert.ok(calls.some((call) => call[1]?.capabilityIds?.includes("skill:docs")));
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/session-gateway.test.mjs`

Expected: FAIL because `session-gateway.js` does not exist.

- [ ] **Step 3: Implement the trusted session gateway**

```js
// packages/ai-workbench/src/host/session-gateway.js
import { randomUUID } from "node:crypto";
import { CHAT_PRESET_ID } from "./chat-preset.js";
import { parseDraft } from "../shared/contracts.js";

function unwrap(response) {
  if (!response?.result?.ok) {
    const error = response?.result?.error || { code: "internal", message: "DSH request failed" };
    throw Object.assign(new Error(error.message), { code: error.code, details: error.details });
  }
  return response.result.value;
}

function selectedCapabilityBlock(input) {
  if (input.mode !== "work" || input.capabilityIds.length === 0) return "";
  return `\n\n本次任务已选择的能力：${input.capabilityIds.join("、")}。仅在完成任务需要时使用这些能力，所有权限审批仍以宿主策略为准。`;
}

function chatWebBlock(mode, webSearch) {
  if (mode !== "chat") return "";
  if (webSearch === true) return "\n\n本次回答允许在确有必要时使用联网搜索，并注明信息时效。";
  return "\n\n本次回答不要使用联网搜索；仅根据当前对话和用户附件作答。";
}

function deepEffort(catalog, provider, modelId) {
  const group = catalog.groups.find((item) => item.id === provider);
  const model = group?.models.find((item) => item.id === modelId);
  const efforts = model?.reasoning?.efforts || [];
  return efforts.find((item) => /^(deep|high|xhigh|max|ultra)$/i.test(item.id))?.id || efforts.at(-1)?.id || null;
}

function containsModel(catalog, provider, model) {
  return catalog.groups.some((group) => group.id === provider && group.models.some((item) => item.id === model));
}

export function createSessionGateway(dependencies) {
  const makeId = dependencies.id || randomUUID;
  const makeRpcId = dependencies.rpcId || randomUUID;
  return {
    async start(raw) {
      const mode = raw?.mode;
      const input = parseDraft(raw, mode);
      if (!input.text.trim()) throw Object.assign(new Error("prompt is empty"), { code: "empty-prompt", statusCode: 400 });
      const sessionId = makeId();
      const agentPreset = mode === "chat" ? CHAT_PRESET_ID : "standard";
      const createdAt = new Date().toISOString();
      const meta = {
        mode,
        origin: "user",
        createdAt,
        capabilityIds: mode === "work" ? input.capabilityIds : [],
        execution: mode === "work" ? input.execution : null,
      };
      await dependencies.repository.putSessionMeta(sessionId, meta);
      let published = false;
      try {
        if (mode === "work" && input.execution?.modelPolicy === "manual") {
          const directory = unwrap(await dependencies.apiProxy.llm.models({ rpcId: makeRpcId(), payload: {} }));
          if (!containsModel(directory, input.execution.provider, input.execution.model)) throw Object.assign(new Error("selected model is unavailable"), { code: "model-unavailable", statusCode: 409 });
        }
        const target = mode === "work" && input.workspaceId ? { workspaceId: input.workspaceId } : {};
        const created = unwrap(await dependencies.apiProxy.sessions.create({ rpcId: makeRpcId(), payload: { sessionId, agentPreset, ...target } }));
        published = true;
        if (mode === "work") {
          const session = dependencies.sessions.get(created.sessionId);
          if (!session) throw Object.assign(new Error("created session is not live"), { code: "session-not-live" });
          dependencies.permissionPresets.set(session, "workspace-write");
        }
        let reasoning = { requested: false, applied: false, reason: null };
        const wantsDeep = raw.deepThinking === true || input.execution?.intensity === "deep";
        const manualModel = mode === "work" && input.execution?.modelPolicy === "manual";
        if (wantsDeep) {
          reasoning = { requested: true, applied: false, reason: "unsupported" };
          const modelsResponse = await dependencies.apiProxy.sessions.models({ rpcId: makeRpcId(), payload: { sessionId: created.sessionId } });
          if (modelsResponse?.result?.ok) {
            const directory = modelsResponse.result.value;
            const target = manualModel ? { provider: input.execution.provider, model: input.execution.model } : directory.current;
            const effort = deepEffort(directory, target.provider, target.model);
            if (effort) {
              const selection = await dependencies.apiProxy.sessions.selectModel({ rpcId: makeRpcId(), payload: { sessionId: created.sessionId, provider: target.provider, model: target.model, reasoningEffort: effort } });
              reasoning = selection?.result?.ok ? { requested: true, applied: true, reason: null } : { requested: true, applied: false, reason: selection?.result?.error?.code || "selection-failed" };
            } else if (manualModel) {
              unwrap(await dependencies.apiProxy.sessions.selectModel({ rpcId: makeRpcId(), payload: { sessionId: created.sessionId, provider: target.provider, model: target.model } }));
            }
          } else if (manualModel) {
            unwrap(await dependencies.apiProxy.sessions.selectModel({ rpcId: makeRpcId(), payload: { sessionId: created.sessionId, provider: input.execution.provider, model: input.execution.model } }));
          }
        } else if (manualModel) {
          unwrap(await dependencies.apiProxy.sessions.selectModel({ rpcId: makeRpcId(), payload: { sessionId: created.sessionId, provider: input.execution.provider, model: input.execution.model } }));
        }
        const content = [
          { type: "text", text: input.text.trim() + selectedCapabilityBlock(input) + chatWebBlock(mode, raw.webSearch) },
          ...input.attachments.map((image) => ({ type: "image", mediaType: image.mediaType, data: image.data, ...(image.name ? { name: image.name } : {}) })),
        ];
        unwrap(await dependencies.apiProxy.sessions.prompt({ rpcId: makeRpcId(), payload: { sessionId: created.sessionId, mode: "queue", content, clientTimeZone: raw.clientTimeZone } }));
        return { sessionId: created.sessionId, mode, agentPreset, reasoning };
      } catch (error) {
        if (published) await dependencies.repository.putSessionMeta(sessionId, { ...meta, setupStatus: "failed", setupErrorCode: error.code || "internal" });
        else await dependencies.repository.deleteSessionMeta(sessionId);
        if (published) error.sessionId = sessionId;
        throw error;
      }
    },
  };
}
```

Add `deleteSessionMeta(sessionId)` to the repository. Add these trusted routes:

```text
POST /api/dsh-ai-workbench/sessions
GET  /api/dsh-ai-workbench/models
```

The session route validates a 1 MiB maximum body, calls `sessionGateway.start`, and returns `201 { sessionId, mode, agentPreset, reasoning }`. The model route returns the sanitized `apiProxy.llm.models` groups and failures without credentials or settings. The browser never receives an API that can label an already-created standard session as Chat. Add `startSession(input)` and `listModels()` to `client/api.js`. Extend host compatibility probes for `apiProxy.sessions.models`, `apiProxy.sessions.selectModel`, `apiProxy.llm.models`, and `sessions.get`. If DSH publishes a session but model selection fails, retain Work metadata with `setupStatus: failed` and return `409 { error: { code, message, sessionId } }`; the client opens that blank official Conversation and shows the model error instead of resubmitting. Do not hide the orphan as a migrated session.

- [ ] **Step 4: Run gateway and tamper tests**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS, including a route test proving `{ mode: "chat", workspaceId, capabilityIds }` still creates `zf-chat-workbench-v1` with no workspace and no Work permission call.

- [ ] **Step 5: Commit trusted session creation**

```bash
git add packages/ai-workbench
git commit -m "feat: enforce Work Chat session policies"
```

### Task 3: Implement Work templates, automatic selection, and composer

**Files:**
- Create: `packages/ai-workbench/src/shared/work-templates.js`
- Create: `packages/ai-workbench/src/shared/auto-select.js`
- Create: `packages/ai-workbench/src/client/work-home.js`
- Create: `packages/ai-workbench/src/client/image-input.js`
- Create: `packages/ai-workbench/test/auto-select.test.mjs`
- Modify: `packages/ai-workbench/src/client/shell.js`
- Modify: `packages/ai-workbench/src/client/styles.js`

- [ ] **Step 1: Write failing recommendation tests**

```js
// packages/ai-workbench/test/auto-select.test.mjs
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
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/auto-select.test.mjs`

Expected: FAIL because the selection modules do not exist.

- [ ] **Step 3: Add deterministic templates and selection rules**

`work-templates.js` must export the six approved recommendation rows from design image 1 as records with `{ id, title, promptTemplate, recommendedCapabilityIds, sortOrder, enabled, action: "prefill" }`. Use stable IDs `teaching-weekly`, `student-risk`, `research-summary`, `employment-analysis`, `meeting-minutes`, and `workload-report`.

```js
// packages/ai-workbench/src/shared/work-templates.js
export const WORK_TEMPLATES = [
  { id: "teaching-weekly", title: "汇总课表与考勤，分析教学情况并生成周报", promptTemplate: "汇总本周课表与考勤数据，分析教学运行情况并生成周报。", recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"], sortOrder: 1, enabled: true, action: "prefill" },
  { id: "student-risk", title: "关联成绩与出勤，识别风险并生成帮扶清单", promptTemplate: "关联学生成绩与出勤数据，识别风险学生并生成帮扶清单。", recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"], sortOrder: 2, enabled: true, action: "prefill" },
  { id: "research-summary", title: "核对科研与人事数据，汇总成果并生成简报", promptTemplate: "核对科研与人事数据，汇总科研成果并生成简报。", recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"], sortOrder: 3, enabled: true, action: "prefill" },
  { id: "employment-analysis", title: "关联学籍与就业数据，分析去向并生成报告", promptTemplate: "关联学籍与就业数据，分析毕业生去向并生成报告。", recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"], sortOrder: 4, enabled: true, action: "prefill" },
  { id: "meeting-minutes", title: "汇总通知与会议记录，提取待办并起草纪要", promptTemplate: "汇总相关通知与会议记录，提取待办事项并起草会议纪要。", recommendedCapabilityIds: ["skill:dsh:documents"], sortOrder: 5, enabled: true, action: "prefill" },
  { id: "workload-report", title: "核对排课与考勤，关联人事并生成工作量报表", promptTemplate: "核对排课与考勤数据，关联人事信息并生成工作量报表。", recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"], sortOrder: 6, enabled: true, action: "prefill" },
].filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
```

```js
// packages/ai-workbench/src/shared/auto-select.js
const RULES = [
  { pattern: /表格|数据|统计|汇总|核对|报表/, ids: ["skill:dsh:spreadsheets"], intensity: "deep", label: "数据处理" },
  { pattern: /文档|周报|简报|纪要|报告/, ids: ["skill:dsh:documents"], intensity: "standard", label: "文档生成" },
  { pattern: /网页|最新|联网|搜索/, ids: ["tool:web"], intensity: "standard", label: "联网查询" },
  { pattern: /系统|审批|教务|人事|科研/, prefix: "business:", intensity: "deep", label: "业务系统" },
];

export function recommendExecution(text, enabledIds = []) {
  const matches = RULES.filter((rule) => rule.pattern.test(text));
  const suggested = [...new Set(matches.flatMap((rule) => rule.prefix ? enabledIds.filter((id) => id.startsWith(rule.prefix)) : rule.ids))].filter((id) => enabledIds.length === 0 || enabledIds.includes(id));
  const capabilityIds = suggested.length ? suggested : enabledIds.slice(0, 4);
  return {
    modelPolicy: "auto",
    intensity: matches.some((rule) => rule.intensity === "deep") ? "deep" : "standard",
    capabilityIds,
    reason: matches.length ? `命中${matches.map((rule) => rule.label).join("与")}规则` : "使用已启用的默认能力",
  };
}
```

`createWorkHome(React)` must render: orb asset and `今天，想完成什么工作？`; textarea; plus/image attachment button; a `需要时请求批准` policy chip that opens a short explanation dialog; speech button; submit button; collapsed automatic-selection summary with model, capabilities and intensity overrides; a DSH workspace picker adapter; capability picker; and six template rows. Selecting a template replaces the current Work draft and calls `recommendExecution` but never calls `startSession`. Sending calls `workbenchApi.startSession`, clears only the Work draft after `201`, and then calls `ctx.sessions.open(sessionId)`.

The workspace selector reads the root slot's standard `useWorkspaces` feed and displays `WorkspaceView.id`, title, and path from `state.items`. `添加工作空间` calls `ctx.workspaces.pickDirectory()`, then `ctx.workspaces.create({ path })`, and stores the returned ID in the Work draft. Cancellation leaves the draft unchanged. It must not call `ctx.workspaces.connectWorkspace`, because the trusted host gateway owns creation with the selected `workspaceId` and required Agent preset. The model override loads `listModels()`, groups options by provider, and stores the exact provider/model pair; `自动` removes that pair and uses DSH's current default.

Copy the original navigation, composer, and scene assets into `packages/ai-workbench/assets/` without resampling:

```bash
cp /Users/yekechao/Downloads/AI工作台完整前端切片/03_icon_新建任务.png packages/ai-workbench/assets/nav-new-work.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/04_icon_工作空间.png packages/ai-workbench/assets/nav-workspace.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/05_icon_能力库.png packages/ai-workbench/assets/nav-capabilities.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/06_icon_数据看板.png packages/ai-workbench/assets/nav-dashboard.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/07_icon_自动化任务.png packages/ai-workbench/assets/nav-automations.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/08_icon_成果空间.png packages/ai-workbench/assets/nav-results.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/09_icon_添加附件.png packages/ai-workbench/assets/action-attachment.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/10_icon_语音输入.png packages/ai-workbench/assets/action-speech.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/11_icon_发送按钮.png packages/ai-workbench/assets/action-send.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/12_scene_课程考勤.png packages/ai-workbench/assets/scene-teaching.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/13_scene_风险识别.png packages/ai-workbench/assets/scene-risk.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/14_scene_科研数据.png packages/ai-workbench/assets/scene-research.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/15_scene_就业分析.png packages/ai-workbench/assets/scene-employment.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/16_scene_会议纪要.png packages/ai-workbench/assets/scene-meeting.png
cp /Users/yekechao/Downloads/AI工作台完整前端切片/17_scene_工作量分析.png packages/ai-workbench/assets/scene-workload.png
```

`image-input.js` must accept only media types advertised by DSH `imageLimits`, enforce host-provided count/per-image/total byte limits before base64 conversion, strip the `data:*;base64,` prefix, and return `{ type: "image", mediaType, data, name }`. Unsupported files show an inline error and are never submitted.

- [ ] **Step 4: Verify Work flows**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS for all selection rules and input-limit tests.

In DSH Web verify: choosing a recommendation only prefills; choosing a workspace survives mode changes; expanding automatic selection allows overrides and “恢复自动选择”; sending opens official Conversation; the resulting header reports `standard`; a write outside the workspace still requests DSH approval.

- [ ] **Step 5: Commit the Work home**

```bash
git add packages/ai-workbench
git commit -m "feat: implement Work task composer"
```

### Task 4: Implement the Chat home and configuration-driven shortcuts

**Files:**
- Create: `packages/ai-workbench/assets/chat-home.json`
- Create: `packages/ai-workbench/src/shared/chat-config.js`
- Create: `packages/ai-workbench/src/client/chat-home.js`
- Create: `packages/ai-workbench/test/chat-config.test.mjs`
- Modify: `packages/ai-workbench/src/client/shell.js`
- Modify: `packages/ai-workbench/src/client/styles.js`

- [ ] **Step 1: Write failing configuration tests**

```js
// packages/ai-workbench/test/chat-config.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { rotateBatch, validateChatConfig } from "../lib/shared/chat-config.js";

test("shortcuts prefill and service navigation uses safe links", () => {
  const result = validateChatConfig({
    guesses: [{ id: "q1", label: "一周安排", prompt: "查询我的一周安排" }],
    popular: [{ id: "p1", label: "理发预约", prompt: "如何进行理发预约？" }],
    navigation: [{ id: "n1", title: "融合门户", category: "服务导航", icon: "portal", sortOrder: 1, enabled: true, url: "https://portal.example.edu" }],
  });
  assert.equal(result.guesses[0].action, "prefill");
  assert.equal(result.navigation[0].action, "open-link");
  assert.deepEqual(rotateBatch([1, 2, 3, 4, 5], 3, 1), [4, 5, 1]);
});

test("unsafe navigation protocols are rejected", () => {
  assert.throws(() => validateChatConfig({ guesses: [], popular: [], navigation: [{ id: "x", title: "x", category: "服务导航", icon: "portal", sortOrder: 1, enabled: true, url: "javascript:alert(1)" }] }), /unsafe-url/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/chat-config.test.mjs`

Expected: FAIL because `chat-config.js` does not exist.

- [ ] **Step 3: Add the configuration and Chat page**

Create `assets/chat-home.json` exactly as follows. Keep navigation URLs empty until the deployment supplies real destinations; empty URLs render disabled with `暂未配置`, not invented links.

```json
{
  "guesses": [
    { "id": "haircut", "label": "理发预约", "prompt": "学校理发服务如何预约？", "sortOrder": 1, "enabled": true },
    { "id": "week-plan", "label": "一周安排", "prompt": "帮我梳理本周的校园日程安排。", "sortOrder": 2, "enabled": true },
    { "id": "face-photo", "label": "人脸照片怎么换", "prompt": "校园人脸识别照片如何更换？", "sortOrder": 3, "enabled": true },
    { "id": "staff-phone", "label": "教职工电话", "prompt": "如何查询校内教职工联系电话？", "sortOrder": 4, "enabled": true },
    { "id": "campus-password", "label": "智慧校园密码怎么改", "prompt": "智慧校园账号密码如何修改？", "sortOrder": 5, "enabled": true }
  ],
  "popular": [
    { "id": "popular-haircut", "label": "理发预约", "prompt": "学校理发服务如何预约？", "sortOrder": 1, "enabled": true },
    { "id": "teacher-student", "label": "师生通", "prompt": "师生通服务如何使用？", "sortOrder": 2, "enabled": true },
    { "id": "project-apply", "label": "项目申报", "prompt": "校内项目申报需要经过哪些步骤？", "sortOrder": 3, "enabled": true },
    { "id": "class-adjust", "label": "调停课申请", "prompt": "调课或停课申请如何办理？", "sortOrder": 4, "enabled": true },
    { "id": "seal-apply", "label": "用印申请", "prompt": "校内用印申请如何办理？", "sortOrder": 5, "enabled": true },
    { "id": "popular-week", "label": "一周安排", "prompt": "帮我梳理本周的校园日程安排。", "sortOrder": 6, "enabled": true }
  ],
  "navigation": [
    { "id": "portal", "title": "融合门户", "category": "服务导航", "url": "", "icon": "portal", "sortOrder": 1, "enabled": true },
    { "id": "mail", "title": "校园邮箱", "category": "服务导航", "url": "", "icon": "mail", "sortOrder": 2, "enabled": true }
  ]
}
```

```js
// packages/ai-workbench/src/shared/chat-config.js
function rows(value, kind) {
  if (!Array.isArray(value)) throw new Error(`invalid-${kind}`);
  return value.map((item) => {
    if (!item?.id || (kind === "navigation" ? !item.title : !item.label)) throw new Error(`invalid-${kind}-item`);
    if (kind === "navigation") {
      if (!["服务导航", "文档资料"].includes(item.category) || !item.icon || !Number.isFinite(item.sortOrder) || typeof item.enabled !== "boolean") throw new Error("invalid-navigation-item");
      if (!item.enabled) return { ...item, action: "disabled" };
      if (item.url === "") return { ...item, action: "disabled" };
      const url = new URL(item.url);
      if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("unsafe-url");
      return { ...item, action: "open-link" };
    }
    if (!item.prompt) throw new Error(`invalid-${kind}-prompt`);
    return { ...item, action: "prefill" };
  });
}

export function validateChatConfig(value) {
  return {
    guesses: rows(value.guesses, "guesses").filter((item) => item.enabled !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    popular: rows(value.popular, "popular").filter((item) => item.enabled !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    navigation: rows(value.navigation, "navigation").sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function rotateBatch(items, size, page) {
  if (items.length <= size) return items.slice();
  const start = (page * size) % items.length;
  return Array.from({ length: Math.min(size, items.length) }, (_, index) => items[(start + index) % items.length]);
}
```

`createChatHome(React)` must render: orb and `有什么校园问题想问我？`; textarea; image attachment button; `深度思考` toggle; `联网搜索` toggle; speech button; send button; keyboard help `Enter 发送，Ctrl+Enter 换行`; and three cards for guesses, popular services, and navigation. The third card has `服务导航` and `文档资料` tabs driven by `category`; an empty tab shows `暂无配置，请联系管理员`. Guess/popular click only replaces the Chat draft text. Each `换一批` increments a local page counter and uses `rotateBatch`; it produces no HTTP request and does not duplicate items when the configuration is smaller than one batch. Navigation uses `window.open(url, "_blank", "noopener,noreferrer")`; disabled links announce `暂未配置`.

Sending calls the same host session endpoint with `{ mode: "chat", text, attachments, deepThinking, webSearch, clientTimeZone }`. `deepThinking` maps only to an available DSH reasoning effort after the session model catalog confirms it; when the response says it was not applied, the UI shows `当前模型不支持所选深度思考级别`. `webSearch: false` is appended as an instruction not to invoke the only optional tool. Neither toggle can add Work tools.

- [ ] **Step 4: Verify Chat isolation and interaction**

Run: `pnpm --dir packages/ai-workbench test`

Expected: PASS for configuration, unsafe URL, keyboard, and Chat payload tests.

In DSH Web verify: shortcuts prefill without sending; navigation opens only configured HTTPS destinations; Chat creates a session whose header reports `zf-chat-workbench-v1`; tool catalog contains web search but no shell, editor, filesystem, Skills, subagents, or business-system tool; Chat history excludes all Work sessions.

- [ ] **Step 5: Commit the Chat home**

```bash
git add packages/ai-workbench
git commit -m "feat: implement isolated Chat experience"
```

### Task 5: Add voice transcription and visual parity checks

**Files:**
- Create: `packages/ai-workbench/src/client/speech-input.js`
- Create: `packages/ai-workbench/test/speech-input.test.mjs`
- Create: `packages/ai-workbench/test/visual-checklist.md`
- Modify: `packages/ai-workbench/src/client/work-home.js`
- Modify: `packages/ai-workbench/src/client/chat-home.js`
- Modify: `packages/ai-workbench/src/client/styles.js`

- [ ] **Step 1: Write failing speech adapter tests**

Test that the adapter chooses `SpeechRecognition` then `webkitSpeechRecognition`, sets `lang = "zh-CN"`, appends only final transcripts to the active mode draft, maps permission errors to `未获得麦克风权限`, and returns `{ supported: false }` without rendering a broken button when neither constructor exists.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir packages/ai-workbench run build && node --test packages/ai-workbench/test/speech-input.test.mjs`

Expected: FAIL because `speech-input.js` does not exist.

- [ ] **Step 3: Implement the speech adapter**

```js
// packages/ai-workbench/src/client/speech-input.js
export function createSpeechInput(browser = window) {
  const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
  if (!Recognition) return { supported: false, start() {}, stop() {} };
  let recognition = null;
  return {
    supported: true,
    start({ onText, onState, onError }) {
      recognition = new Recognition();
      recognition.lang = "zh-CN";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onstart = () => onState("listening");
      recognition.onend = () => onState("idle");
      recognition.onerror = (event) => onError(event.error === "not-allowed" ? "未获得麦克风权限" : "语音识别失败，请重试");
      recognition.onresult = (event) => {
        let finalText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) if (event.results[index].isFinal) finalText += event.results[index][0].transcript;
        if (finalText) onText(finalText);
      };
      recognition.start();
    },
    stop() { recognition?.stop(); },
  };
}
```

Wire one adapter per mounted home page and stop recognition during unmount/mode switch. Voice is speech-to-text only and never auto-sends.

- [ ] **Step 4: Capture and compare all visual states**

Run the app at the design viewport and capture Work and Chat home screenshots. Add the screenshots to a temporary review directory outside Git. Fill `test/visual-checklist.md` with pass/fail results for: brand size and spacing, orb scale, headline baseline, input dimensions, Sidebar rhythm, selected states, card columns, modal state, focus state, populated draft, attachment state, expanded automatic selection, and 1023 px responsive behavior.

Expected: no horizontal scroll, no clipped controls, no rasterized brand text, and no blocking difference from the supplied design images in hierarchy or spacing.

- [ ] **Step 5: Run the complete phase regression and commit**

Run: `pnpm --dir packages/ai-workbench test && npm test`

Expected: all tests PASS.

```bash
git add packages/ai-workbench
git commit -m "test: verify Work Chat interaction and visuals"
```
