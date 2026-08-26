# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below.

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

## 0.1.21 — 2026-08-17

- Applied the same symlink and depth checks during import dry runs.
- Aligned dry-run cleanup, deletion handling, and HEAD behavior.

Release tag: [`v0.1.21`](https://github.com/MichengAI/dsh-skills-manager/tree/v0.1.21).
