<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **Load and safely manage skills from DSH and common local Agents**

  [简体中文](README.zh-CN.md) · [Changelog](CHANGELOG.md) · [Apache-2.0](LICENSE)

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm downloads](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Node.js ^22.19.0 || >=24.0.0](https://img.shields.io/badge/Node.js-22.19%2B%20%7C%20%3E%3D24-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
</div>

> DSH Skills Manager is a community-maintained DeepSeek Harness (DSH) plugin, not an official DeepSeek AI product.

## Features

Bring skills from your computer and projects into one DSH management page. Find skills, read their contents, control availability, and create or import your own.

- **Reuse existing skills**: discover user skills from `.agents`, CC Switch, Codex, Claude, Gemini, OpenCode, Cursor, Copilot, Windsurf, Trae, OpenClaw, Roo, and CodeBuddy.
- **Organize by project**: use the Global / Project tabs to browse DSH, `.agents`, `.github` (Copilot), and other Agent directories in active projects, then filter by source or status.
- **Toggle availability**: enabling or disabling a skill changes its availability in DSH without editing source files.
- **Read before using**: inspect the body, source information, format diagnostics, and duplicate-name notices.
- **Add your own skills**: create user or project skills in Settings, or import ZIP archives, skill folders, and `SKILL.md` files.
- **Recover deleted skills**: DSH skills go to Trash first and can be restored to their original location.

## Screenshots

Browse global or project skills in **Settings → Skills**. External Agent sources are made available through manager policy while their files stay read-only:

![Skills Manager source-first settings page](assets/screenshots/skills-manager-v2-preview.png)

Open any skill to inspect its source path, diagnostics, Markdown body, and parsed frontmatter:

![Skill details and diagnostics](assets/screenshots/skill-detail.png)

Moving a DSH-local skill to Trash requires confirmation and remains recoverable until it is permanently deleted:

![Move a skill to Trash confirmation](assets/screenshots/delete-plugin.png)

## DSH product ecosystem

For a ready-to-use workbench, download [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop/releases). If you already use [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), install any of these eight plugins individually. The desktop app includes all eight.

| Plugin | What you can do |
| --- | --- |
| [Codex UI](https://github.com/MichengAI/dsh-codex-ui) | Organize projects and conversations, search tasks, and navigate chat turns |
| [IM Connect](https://github.com/MichengAI/dsh-im-connect) | Send tasks and receive replies through your usual messenger |
| [Automation](https://github.com/MichengAI/dsh-automation) | Schedule tasks and review each run |
| [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) | Find, enable, create, and import local skills |
| [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) | Search, restore, or clean up archived conversations |
| [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) | Choose and summon specialists for your task |
| [BTW](https://github.com/MichengAI/dsh-btw) | Ask side questions without interrupting the main task |
| [Simplify](https://github.com/MichengAI/dsh-simplify) | Use /simplify to improve code within your Git changes |

## Prerequisites

- A working DeepSeek Harness Web installation with `dsh` available in PowerShell.
- Examples use the `web` profile; replace it with the target profile.
- Plugin `0.1.48` is tested with DeepSeek Harness `0.1.0-rc.8`, `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`. Development dependencies remain pinned to `0.1.5-rc.2`; other Host versions are not implicitly supported.
- Source installation and development require Node.js `^22.19.0 || >=24.0.0`. npm installation does not require running `npm install` in an arbitrary directory.

## Installation

The installation commands below use the official npm registry.

### Ask an agent to install it (recommended)

Send the prompt below to any agent that can run terminal commands on your computer. Replace `web` with your actual profile. Once installed, use the plugin in DSH.

```text
Install the DSH plugin @michengai/dsh-skills-manager into my local web profile by running: dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/. Then run dsh --profile web --dump-config, confirm the configuration includes skills-manager, and explain how to reload DSH and start using the plugin.
```

### Install the latest package from the official npm registry

Run this from any PowerShell directory:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
dsh --profile web --dump-config
```

To pin a release, replace `@latest` with a version such as `@0.1.25`.

The configuration output should contain `skills-manager`. Restart DSH Web and hard-refresh the browser. Do not copy client files manually: `dsh plugin add` also applies `cordis.patch.yml`.

## Updates

The settings title shows the installed version and a **Check for updates** button. When a newer release is available, **Update automatically** runs only when the DSH CLI or Desktop update service is available; otherwise, the dialog provides a profile-specific manual command to copy and run.

## Usage

Open **Settings → Skills**, then use the panel as follows:

| Goal | Action | Scope |
| --- | --- | --- |
| Search or filter | Choose the global or project scope first, then narrow by source, invocation status, name, or description. | Current scope |
| Inspect details | Review body, frontmatter, path, format diagnostics, and duplicate shadowing. | All sources |
| Enable or disable | Update manager-local invocation policy without modifying the source Skill file. | All valid Skills in user and active-project sources |
| Create or import | Choose a user or active project DSH destination when creating in Settings; imports remain user-level. | `$DSH_HOME/skills`, active `<project>/.dsh/skills` for creation |
| Create from conversation | Let an Agent call `create_skill`; DSH asks for approval before writing. | `$DSH_HOME/skills` |
| Delete and recover | Move to Trash, restore to the original source, or permanently delete in a second step. | User and active-project DSH skills |

> Toggling never changes a source Skill file; only user or project DSH skills can move to Trash.

Escape closes only the frontmost upload or confirmation dialog and leaves Settings open.

## Permissions and safety limits

| Directory | View/load | Enable or disable | Create/import | Delete |
| --- | --- | --- | --- | --- |
| `$DSH_HOME\skills` | Yes | Manager state only | Yes | Moves to Trash |
| `$DSH_AGENTS_HOME\skills` | Yes | Manager state only | No | No |
| `~\.cc-switch\skills` | Yes, enabled by default | Manager state only | No | No |
| `%USERPROFILE%\.cursor\skills` (or `$DSH_CURSOR_HOME\skills`) | Yes | Manager state only | No | No |
| `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`, `~/.copilot/skills`, `~/.codeium/windsurf/skills`, `~/.windsurf/skills`, `~/.trae/skills`, `~/.trae-cn/skills`, `~/.openclaw/skills`, `~/.clawdbot/skills`, `~/.roo/skills`, `~/.codebuddy/skills` | Yes | Manager state only | No | No |
| `<project>/.dsh/skills` | Yes, for active Session workspaces | Manager state only | Create in Settings | Moves to Trash and restores to the original project |
| `<project>/.agents/skills`, `<project>/.github/skills`, `<project>/.codex/skills`, `<project>/.claude/skills`, `<project>/.gemini/skills`, `<project>/.opencode/skills`, `<project>/.cursor/skills`, `<project>/.windsurf/skills`, `<project>/.trae/skills`, `<project>/.trae-cn/skills`, `<project>/skills`, `<project>/.roo/skills`, `<project>/.codebuddy/skills` | Yes, for active Session workspaces | Manager state only | No | No |

- Enable, disable, and delete accept only one ordinary skill-name path segment.
- Project roots are derived only from active Session `cwd` values; client requests carry an opaque source key and cannot nominate an arbitrary workspace path.
- Project sources follow DSH's nearest-`.git` root convention and rank order (`project-dsh` 100, `project-agents` 200, then other read-only project sources 500–600, below user DSH 399/400). The manager re-scans for each state/detail request. Explicit project policy is enforced by workspace-scoped rank overlays; user DSH policy uses rank 399. With no override, DSH's official provider remains the owner. Toggle writes are limited to manager state; project file writes occur only for explicit create/Trash/restore actions under `.dsh/skills`.
- Trash falls back to copy-then-hide when a project and `$DSH_HOME` are on different volumes; restore uses the same guarded cross-volume path in reverse.
- Project Trash entries retain their original opaque source identity. Restore is allowed only while that original project is still represented by an active Session workspace; the client cannot nominate a replacement path.
- Project writes reject linked `.dsh` or `.dsh/skills` directories so a repository cannot redirect creation, deletion, or restore outside its own project root.
- User-level read-only and project Agent sources recursively discover `SKILL.md` by default. Skill directories, roots, and parent directories may link to external locations through symlinks or Windows junctions without an opt-in or allowlist. Real-path deduplication and manager-local toggles preserve read-only sources. Skill-file symlinks are ignored, cycles terminate, and scans have depth and size limits. Writable DSH roots, imports, and deletion retain their existing boundaries.
- Directories containing `SKILL.md` are bundle leaves; their resources and `node_modules` are not traversed. A root-level `SKILL.md` can still coexist with nested skills. Project Agent roots that overlap user skill roots by real path are hidden to preserve user disable policies.
- Rows and summaries say **Enabled/Disabled**, not **Loaded**: these labels describe invocation policy, while full Skill bodies are loaded on demand by DSH. Use Refresh after IDE, Git, or shell changes; the official provider remains responsible for project catalog watching and invalidation.
- Missing read-only project sources stay out of the list; an empty project DSH root remains a Create Skill destination so the first project skill can still be created. Project DSH supports per-Skill toggles only, not a source-wide switch.
- Replacements copy to a temporary sibling path first and keep the original until that succeeds.
- Every endpoint, including GET `/state`, accepts only a loopback `Host` or a canonical `host[:port]` that the DSH Web runtime already trusts through its LAN bind and `--trusted-host`; unknown hosts still receive 403.
- Browser requests must also carry a same-origin `Origin` when present and must not be marked cross-site; write endpoints continue to require JSON and the DSH client request marker.
- Import accepts the local path selected by the user. The Host trust fence prevents DNS rebinding but is not authentication; reverse-proxy and LAN deployments still need authentication, a VPN, or network access controls.

## Secondary development

### Install from source

Use this for debugging or unpublished changes. The cloned directory becomes the plugin source path:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location D:\Repository\deepseek-harness-plugin
git clone https://github.com/MichengAI/dsh-skills-manager.git
Set-Location .\dsh-skills-manager
npm install
npm test
dsh plugin --profile web add .
dsh --profile web --dump-config
```

Restart DSH Web and hard-refresh the browser. `dsh plugin ... add .` reads the package metadata and `cordis.patch.yml`; do not install by copying `lib` directly.

Runtime source is maintained under `src`; `lib` is generated by `npm run build` and published with the npm package. Change `src`, never `lib` directly.

- [src\core.js](src/core.js): file-operation, permission, and import boundary core.
- [src\index.js](src/index.js): host service and local skill file operations.
- [src\client.js](src/client.js): Settings page, upload, and confirmation interactions.
- [scripts\build.mjs](scripts/build.mjs): produces Host and browser `lib` artifacts.
- `test\core-test.mjs`: file-operation, permission, and import boundary tests.
- `test\locale-test.mjs`: UI locale tests.

After changing the runtime source, test, inspect package contents, and install from the local directory:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
npm run verify
dsh plugin --profile web add .
```

Preserve path validation, temporary-copy replacement, and shared-skill read-only behavior when changing file-mutation code.

## Validation

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
npm run verify
```

`prepublishOnly` runs the complete `verify` gate before publishing: build, tests, package inspection, and generated-artifact synchronization.

## License

Licensed under [Apache License 2.0](LICENSE).

## Host compatibility regression

`scripts/hosts.mjs` defines supported hosts; contract tests check package peer and development dependencies against it. Tests cover matching official component versions, not mixed versions or unlisted alpha/RC releases.

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
pnpm run test:compat
pnpm run test:compat 0.1.5-rc.2 --keep
```

Without arguments, all hosts run sequentially. `--keep` retains the sandbox; `--serve` keeps the Host available for manual browser checks. Successful runs clean up by default; failures retain diagnostics. Compact evidence always goes to `.compat-results/`. npm and the project's pnpm must be available on PATH. The manual GitHub Actions compatibility workflow runs a Windows matrix and uploads evidence. It covers real Host APIs and Agent skill policies, not complete UI or external-model end-to-end testing.

To change supported hosts, edit `scripts/hosts.mjs`, run `node scripts/sync-hosts.mjs --write`, update the lockfile, and run the compatibility matrix. `verify` rejects metadata and README drift.
