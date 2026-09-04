# DSH AI Workbench Delivery Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved “正方 AI 工作台” as an independently installable DSH Web plugin without breaking the existing skills-manager package.

**Architecture:** Keep the repository root package intact and add `packages/ai-workbench` as a second package. The new plugin owns the branded shell, Work/Chat routing, metadata, capabilities, and automations while reusing DSH Conversation, Details, Settings, Session, Agent, approval, and storage services behind compatibility adapters.

**Tech Stack:** Node.js 20+, ESM JavaScript, React 18 through the DSH client module loader, Cordis/DSH plugin services, DSH Storage JSON KV, Node test runner, esbuild, pnpm.

**Approved source:** [DSH AI Workbench detailed design](../specs/2026-09-04-dsh-ai-workbench-design.md). If an implementation detail conflicts with that specification, stop the affected task and reconcile the documents before coding.

---

## Scope decomposition

The approved specification spans independent subsystems. Execute these plans in order; each plan ends in a runnable, testable checkpoint:

1. [Compatibility and package foundation](./2026-09-04-dsh-ai-workbench-01-foundation.md)
2. [Branded shell, routing, modes, and session metadata](./2026-09-04-dsh-ai-workbench-02-shell-and-modes.md)
3. [Work and Chat home experiences](./2026-09-04-dsh-ai-workbench-03-work-and-chat.md)
4. [Unified capability library](./2026-09-04-dsh-ai-workbench-04-capability-library.md)
5. [Persistent automation engine and UI](./2026-09-04-dsh-ai-workbench-05-automations.md)
6. [Migration, visual QA, packaging, and rollback](./2026-09-04-dsh-ai-workbench-06-release-quality.md)

## Locked file structure

```text
dsh-skills-manager/
├── package.json                         # existing package; add only repo-wide helper scripts
├── pnpm-workspace.yaml                  # root + packages/*
├── src/                                 # existing skills manager; no workbench code
├── test/                                # existing skills manager tests; remain green
├── packages/
│   └── ai-workbench/
│       ├── package.json
│       ├── cordis.patch.yml
│       ├── scripts/build.mjs
│       ├── src/index.js                 # host plugin composition only
│       ├── src/client.js                # browser module-loader entry only
│       ├── src/shared/                  # pure validation and scheduling modules
│       ├── src/host/                    # storage, APIs, scheduler, migration, adapters
│       ├── src/client/                  # shell, stores, pages, components, API client
│       ├── presets/zf-chat/             # read-only chat Agent composition
│       ├── assets/                      # supplied brand and scene assets
│       └── test/                        # Node unit/contract/integration tests
└── docs/superpowers/
```

## Cross-plan rules

- Keep root `npm test`, `npm run verify`, and root package contents backward-compatible.
- Run root regression tests after every plan: `npm test`.
- Run workbench tests after every plan: `pnpm --dir packages/ai-workbench test`.
- Do not widen DSH peer ranges until the compatibility probe passes against that version.
- All new host mutation routes require same-origin/loopback validation, JSON content type, and `x-dsh-workbench-action: 1`.
- Keep business logic in pure modules; browser components and HTTP handlers only adapt it.
- Every UI state must have loading, empty, success, and failure coverage.
- Commit after each numbered task using the message specified by that task.
- Stop after Foundation Task 4 if the Root/Sidebar compatibility smoke test cannot render official Conversation and Details under the custom Root.

## Release gate

Run exactly these checks before declaring the roadmap complete:

```bash
npm test
pnpm --dir packages/ai-workbench test
pnpm --dir packages/ai-workbench run verify
git diff --check
```

Expected: every command exits `0`; both plugin packages build from maintained `src` files; workbench package dry-run contains its host, client, presets, and supplied image assets; the Git diff has no whitespace errors.
