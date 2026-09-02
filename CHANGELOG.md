# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below.

## Unreleased

## 0.1.34 — 2026-09-02

- Made direct Skill entries the canonical owner when the same real bundle is also exposed through Agent distribution links. The canonical provider candidate inherits the strongest distribution rank, so disabling CC Switch cannot fall back to a linked public-Agent copy.
- Required discovered real bundle and document paths for both user and project Provider candidates, revalidated both paths at load time, and aligned policy toggles with real-document reads.
- Scanned user roots concurrently and reused one resolved set of trusted read-only roots per scan without caching external filesystem state across requests.
- Preserved a per-Skill disable while its current distribution entry changes ownership to a canonical source. A canonical source's explicit policy still takes precedence over inherited distribution-link policies.
- Made detail visibility reproduce the same user-root deduplication as state snapshots from the requested entry's physical owner, avoiding unrelated Skill document reads; entry resolution, detail reads, and Provider reads fail closed when files disappear during a filesystem race.

Published package: [`@michengai/dsh-skills-manager@0.1.34`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.34).

## 0.1.33 — 2026-09-02

- Added an enabled-by-default, read-only `CC Switch` source at `~\.cc-switch\skills` with source-wide and per-Skill local policy toggles. Legacy state files gain the new source without failing closed.
- Allowed top-level linked Skill bundles in user-level read-only sources only when they target a direct child of another known read-only Skills root. Provider loading revalidates the real target and deduplicates CC Switch deployments by real path.
- Kept writable DSH roots, project sources, linked roots, hidden or invalid targets, arbitrary external targets, and import symlinks rejected.

Published package: [`@michengai/dsh-skills-manager@0.1.33`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.33).

## 0.1.32 — 2026-08-31

- Unified every per-Skill enable/disable action—user DSH, shared Agents, Codex, Claude, Gemini, OpenCode, project DSH, and project Agents—under manager-local tri-state policy; toggles never rewrite a source Skill file.
- Added explicit enable overrides for source-disabled or invalid invocation fields, enforced by user DSH rank 399 and project rank 99/199 policy candidates; legacy state files migrate without losing existing disabled entries.
- Replaced ambiguous **Loaded/Discovered** UI and API counters with **Enabled/Disabled** invocation-policy terminology; this no longer implies that a Skill body has already been fetched into a Session.
- Expanded i18n contract tests to cover every literal client key, every host error/warning/diagnostic code, placeholder parity, and removal of legacy loading terminology in both languages.

## 0.1.31 — 2026-08-30

- Added project Skill discovery for active Session workspaces, covering project-root `.dsh/skills` and `.agents/skills` with stable workspace-specific identities and official rank order.
- Kept project files under DSH's scoped filesystem provider instead of registering a duplicate provider or reusing user-global toggle state.
- Labeled project entries as discovered rather than loaded, exposed workspace-specific rank/path evidence and a manual Refresh action, and warned when an active workspace is not readable from the host.
- Added regression coverage for nearest-git-root resolution, duplicate Session workspaces, same-name priority within one project, same-name isolation across projects, live modification/removal, stale source identities, and linked bundles outside the project skill root.
- Added Settings creation and recoverable Trash deletion for active project `.dsh/skills`, reusing the global whole-bundle rollback/publish flow while keeping project `.agents/skills` read-only.
- Trash now records the original user or project source, displays it in Settings, and restores project entries only after resolving the same opaque root from a currently active Session workspace.
- Added enable/disable controls for project `.dsh/skills`; they update the Skill's invocation-policy fields while leaving Session-scoped catalog ownership with DSH's official provider.
- Fixed project Trash and restore failing with `EXDEV` when the project and `$DSH_HOME` are on different volumes by using a guarded copy-then-hide fallback.
- Hid empty project roots from the main source list while preserving them as Create Skill destinations, and removed the unsupported project source-wide toggle without affecting per-Skill enable/disable.
- Fixed writable project discovery falling back to a non-Git Session cwd and potentially aliasing user-level Skill roots; project sources now require a real `.git` ancestor and are hidden and rejected when they overlap any user Skill root.
- Stopped list and detail scans from following linked Skill roots, including project `.dsh`/`.agents` containers and Windows reparse points, while retaining the existing linked-bundle containment guard.

Published package: [`@michengai/dsh-skills-manager@0.1.31`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.31).

## 0.1.30 — 2026-08-28

- Fixed reverse-proxy domains and LAN IPs already trusted by DSH Web through `--trusted-host` still being rejected by Skills Manager's own loopback-only Host fence.
- Reused `webRuntime.trustedHosts` with DSH-compatible authority semantics: port-less entries match any port, explicit ports match exactly, and unknown Hosts, non-canonical authorities, foreign Origins, and explicit cross-site requests remain blocked.
- Added isolated real-DSH startup verification and regression coverage for domains, LAN IPs, ports, Origins, cross-site requests, and mutation markers.

Published package: [`@michengai/dsh-skills-manager@0.1.30`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.30).

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
