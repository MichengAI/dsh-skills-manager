# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below.

## 0.1.29 — 2026-08-28

- Restored the standard DSH README header navigation: the Changelog link now sits between the language switch and the Apache-2.0 license link.

Published package: [`@michengai/dsh-skills-manager@0.1.29`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.29).

## 0.1.28 — 2026-08-28

- Moved the release-history entry point to the top of the README so package updates are immediately discoverable.

Published package: [`@michengai/dsh-skills-manager@0.1.28`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.28).

## 0.1.27 — 2026-08-27

- Expanded browser upload limits to 32 MiB for ZIP archives and individual files, 64 MiB decoded total, and 1,000 entries, with a matching 88 MiB Base64 JSON request ceiling.
- Kept upload feedback visible inside the import dialog instead of rendering errors behind the active modal, and cleared stale selections and messages when reopening or closing it.
- Verified the reporter-provided cross-platform fnOS `trim-cli` Skill archive through the complete isolated import path.

Published package: [`@michengai/dsh-skills-manager@0.1.27`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.27).

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
