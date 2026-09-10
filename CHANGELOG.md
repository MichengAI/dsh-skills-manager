# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below.

## 0.1.48 - 2026-09-11

- Add support for DeepSeek Harness `0.1.5-rc.2` while retaining support for the four previously supported versions; skill discovery, enable/disable policies, and management workflows remain unchanged.

## 0.1.47 - 2026-09-10

- Centralize supported Host versions and validate package metadata, required peers, and README consistency; retain the exact four tested RC versions and development dependencies.
- Harden real-Host regression tooling with complete argument parsing, single-version browser serving, tool discovery, process shutdown, sandbox cleanup, and retained evidence; add a manually triggered four-version Windows CI matrix.
- Align CI peer installation settings with the lockfile and correct README Node.js badges and requirements; plugin runtime behavior is unchanged.

## 0.1.46 - 2026-09-10

- Upgrade official development dependencies to `0.1.5-rc.1` and explicitly support Host versions `0.1.0-rc.8`, `0.1.1-rc.2`, `0.1.2-rc.1`, and `0.1.5-rc.1`; remove the retired `dsh-client-runtime` peer and client loading metadata to avoid pulling in the legacy runtime.
- Add real-Host compatibility tests across all four versions for Agent-scoped skill reads, enable/disable policy refresh, and source-file preservation; retain existing skill management and source policies.

## 0.1.45 - 2026-09-09

- Stop scanning resources inside ordinary skill bundles and skip `node_modules`, while retaining nested discovery beside a root skill. Hide overlapping project Agent roots so they cannot bypass user disable policies.
- Read-only user and project Agent sources now discover nested skills and follow external directory symlinks and Windows junctions by default, including linked roots. Discovery has cycle, depth, and entry limits.
- Keep list, detail, provider, and local enable/disable policies consistent across differently named aliases. Writable DSH roots and import/delete safeguards remain unchanged.

## 0.1.44 - 2026-09-09

- Unified settings headings, descriptions, and action layouts; maintenance controls no longer squeeze titles or versions. The layout adapts to native DSH settings without Codex UI.
