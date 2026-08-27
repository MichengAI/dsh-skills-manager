# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below.

## 0.1.26 — 2026-08-27

- Fixed browser folder imports that exceeded the former 16 MiB Base64 JSON request ceiling while still fitting within the documented 25 MiB decoded-content limit.
- Added client-side checks for the existing 10 MiB ZIP, 5 MiB per-file, 25 MiB total, and 500-entry upload limits so oversized selections fail with a specific message before being read.
- Replaced the large-string Base64 validation regex with stack-safe validation to prevent multi-MiB files from exhausting the JavaScript call stack.

Published package: [`@michengai/dsh-skills-manager@0.1.26`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.26).

## 0.1.25 — 2026-08-27

- Added provider-backed loading for public Agents, Codex, Claude, Gemini, and OpenCode while keeping external source files read-only and persisting toggles in manager state.
- Added Markdown details, diagnostics, conversational creation, recoverable Trash, and second-stage permanent deletion.
- Replaced chained importing with one upload dialog for `.zip`, skill folders, and a single `SKILL.md`, with path, size, count, and archive safety limits.
- Fixed corrupted-state overwrite, trash rollback data loss, Windows `EPERM` publication failures, and the missing Repair-and-enable payload field.

Published package: [`@michengai/dsh-skills-manager@0.1.25`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.25).

## 0.1.24 — 2026-08-23

- Added bilingual changelogs covering the five most recent releases.
- Linked the release history from both README editions and included it in the npm package.

Published package: [`@michengai/dsh-skills-manager@0.1.24`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.24).

## 0.1.23 — 2026-08-17

- Stopped silently dropping a chained import after a clean dry run.

Release tag: [`v0.1.23`](https://github.com/MichengAI/dsh-skills-manager/tree/v0.1.23).

## 0.1.22 — 2026-08-17

- Preserved symlink-rejection errors while collecting batch import candidates.

Release tag: [`v0.1.22`](https://github.com/MichengAI/dsh-skills-manager/tree/v0.1.22).
