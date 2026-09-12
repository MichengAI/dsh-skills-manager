# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below.

## 0.1.50 - 2026-09-12

- Fix project skills being skipped in non-Git workspaces. When no `.git` ancestor exists, use the current session cwd as the project root so skills can be viewed and toggled without running `git init`.

## 0.1.49 - 2026-09-12

- Add Copilot support for global `~/.copilot/skills` and project `.github/skills`, and expand project sources for common agents. The project tab follows only the current session; direct project-management API calls must include its ID in `x-dsh-skills-session`.
- Prioritize project copies over global copies and toggle each source independently. Another enabled copy can take over when one is disabled, with the active source identified in the UI; invocation is blocked only when all copies are disabled.
- Give Global, Project, and Trash separate tabs, group skills into collapsible sources, hide long descriptions, and remove redundant information. Creation and import always save to global DSH; generic project `skills/` directories use a neutral source label.
- Fix update buttons and dialogs not following language changes, and align Trash date formatting and import-warning separators with the UI language.

## 0.1.48 - 2026-09-11

- Add support for DeepSeek Harness `0.1.5-rc.2` while retaining support for the four previously supported versions; skill discovery, enable/disable policies, and management workflows remain unchanged.

## 0.1.47 - 2026-09-10

- Centralize supported Host versions and validate package metadata, required peers, and README consistency; retain the exact four tested RC versions and development dependencies.
- Harden real-Host regression tooling with complete argument parsing, single-version browser serving, tool discovery, process shutdown, sandbox cleanup, and retained evidence; add a manually triggered four-version Windows CI matrix.
- Align CI peer installation settings with the lockfile and correct README Node.js badges and requirements; plugin runtime behavior is unchanged.

## 0.1.46 - 2026-09-10

- Upgrade official development dependencies to `0.1.5-rc.1` and explicitly support Host versions `0.1.0-rc.8`, `0.1.1-rc.2`, `0.1.2-rc.1`, and `0.1.5-rc.1`; remove the retired `dsh-client-runtime` peer and client loading metadata to avoid pulling in the legacy runtime.
- Add real-Host compatibility tests across all four versions for Agent-scoped skill reads, enable/disable policy refresh, and source-file preservation; retain existing skill management and source policies.
