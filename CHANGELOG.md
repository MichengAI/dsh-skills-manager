# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below.

## 0.1.45 - 2026-09-09

- Stop scanning resources inside ordinary skill bundles and skip `node_modules`, while retaining nested discovery beside a root skill. Hide overlapping project Agent roots so they cannot bypass user disable policies.
- Read-only user and project Agent sources now discover nested skills and follow external directory symlinks and Windows junctions by default, including linked roots. Discovery has cycle, depth, and entry limits.
- Keep list, detail, provider, and local enable/disable policies consistent across differently named aliases. Writable DSH roots and import/delete safeguards remain unchanged.

## 0.1.44 - 2026-09-09

- Unified settings headings, descriptions, and action layouts; maintenance controls no longer squeeze titles or versions. The layout adapts to native DSH settings without Codex UI.

## 0.1.43 - 2026-09-08

- Fixed Settings opening with the Codex Skill list expanded by default. All Skill sources now start collapsed while matching search results still expand automatically.

## 0.1.42 - 2026-09-07

- Fixed the release-contract check so valid package version updates no longer block verification and npm publishing.

## 0.1.41 - 2026-09-07

- Added independent in-product update checks with automatic updates when a verified DSH update service is available and a profile-specific manual fallback otherwise.
- Removed the update-button dependency on `react-dom/client` so the client can load on Hosts that do not register that module id.
