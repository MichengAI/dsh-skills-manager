# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below.

## Unreleased

- Added read-only project Skill discovery for active Session workspaces, covering project-root `.dsh/skills` and `.agents/skills` with stable workspace-specific identities and official rank order.
- Kept project files under DSH's scoped filesystem provider instead of registering a duplicate provider or reusing user-global toggle state.
- Labeled project entries as discovered rather than loaded, exposed workspace-specific rank/path evidence and a manual Refresh action, and warned when an active workspace is not readable from the host.
- Added regression coverage for nearest-git-root resolution, duplicate Session workspaces, same-name priority within one project, same-name isolation across projects, live modification/removal, stale source identities, and linked bundles outside the project skill root.
- Added Settings creation and recoverable Trash deletion for active project `.dsh/skills`, reusing the global whole-bundle rollback/publish flow while keeping project `.agents/skills` read-only.
- Trash now records the original user or project source, displays it in Settings, and restores project entries only after resolving the same opaque root from a currently active Session workspace.
- Added enable/disable controls for project `.dsh/skills`; they update the Skill's invocation-policy fields while leaving Session-scoped catalog ownership with DSH's official provider.
- Fixed project Trash and restore failing with `EXDEV` when the project and `$DSH_HOME` are on different volumes by using a guarded copy-then-hide fallback.

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

## 0.1.26 — 2026-08-27

- Fixed browser folder imports that exceeded the former 16 MiB Base64 JSON request ceiling while still fitting within the documented 25 MiB decoded-content limit.
- Added client-side checks for the existing 10 MiB ZIP, 5 MiB per-file, 25 MiB total, and 500-entry upload limits so oversized selections fail with a specific message before being read.
- Replaced the large-string Base64 validation regex with stack-safe validation to prevent multi-MiB files from exhausting the JavaScript call stack.

Published package: [`@michengai/dsh-skills-manager@0.1.26`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.26).
