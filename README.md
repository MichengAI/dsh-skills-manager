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
  [![Node.js 20 or later](https://img.shields.io/badge/Node.js-20%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
</div>

> DSH Skills Manager is a community-maintained DeepSeek Harness (DSH) plugin, not an official DeepSeek AI product.


## Features

- Discover and load user-level skills from `.agents`, CC Switch, Codex, Claude, Gemini, and OpenCode into DSH.
- Discover project-level `.dsh/skills` and `.agents/skills` from active Session workspaces, grouped by project; every valid Skill can be enabled or disabled through non-mutating local policy.
- Persist every per-Skill toggle under `$DSH_HOME/skills-manager/state.json` without rewriting any source Skill file.
- Inspect Markdown bodies, frontmatter, invocation state, duplicate shadowing, and format diagnostics in a source-first UI.
- Create a user- or project-level DSH skill from Settings; conversational creation remains user-level and requires approval.
- Move user- and project-level DSH skills to recoverable Trash, then restore them to the original source or permanently delete them.
- Import `.zip` archives, skill folders, or a single `SKILL.md` safely into `$DSH_HOME/skills`.

## Screenshots

Browse by source or search in **Settings → Skills**. External Agent sources are made available through manager policy while their files stay read-only:

![Skills Manager source-first settings page](assets/screenshots/skills-manager-v2-preview.png)

Open any skill to inspect its source path, diagnostics, Markdown body, and parsed frontmatter:

![Skill details and diagnostics](assets/screenshots/skill-detail.png)

Moving a DSH-local skill to Trash requires confirmation and remains recoverable until it is permanently deleted:

![Move a skill to Trash confirmation](assets/screenshots/delete-plugin.png)

## DSH product ecosystem

This product can be installed independently or used through the desktop app or Web suite. They share the same DSH core but serve different ways of working:

| Product | Relationship to this product |
| --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | The host runtime that provides models, sessions, tools, and the plugin system |
| [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop) | A ready-to-install desktop product with this product and the other five feature products built in |
| Six feature products | [Codex UI](https://github.com/MichengAI/dsh-codex-ui) · [IM Connect](https://github.com/MichengAI/dsh-im-connect) · [Automation](https://github.com/MichengAI/dsh-automation) · [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) · [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) · [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) |

## Prerequisites

- A working DeepSeek Harness Web installation with `dsh` available in PowerShell.
- Examples use the `web` profile; replace it with the target profile.
- Source installation and development require Node.js 20+. npm installation does not require running `npm install` in an arbitrary directory.

## Installation

`dsh plugin add` forwards to `pnpm add` in the profile directory. Without a version and official registry, a local mirror or minimum-release-age policy can leave you on an older build.

### Ask another agent to install it

This plugin runs inside DeepSeek Harness Web. Copy one of the sentences below into DSH, Codex, or WorkBuddy and let that agent install it into your local `web` profile.

From npm:

```text
Install the latest DSH plugin @michengai/dsh-skills-manager into my local web profile using the official npm registry: dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/. Then run dsh --profile web --dump-config, confirm skills-manager is mounted, and remind me to restart DSH Web and hard-refresh the browser.
```

From source:

```text
Install the DSH plugin from source at https://github.com/MichengAI/dsh-skills-manager: clone it, run npm install and npm test, then run dsh plugin --profile web add . from that directory. Do not copy lib by itself. Then run dsh --profile web --dump-config, confirm skills-manager is mounted, and remind me to restart DSH Web and hard-refresh the browser.
```

| Product | How to use it |
| --- | --- |
| DSH | Send one of the sentences above to the current session. |
| Codex | Send one of the sentences above to Codex and let it install locally. |
| WorkBuddy | Send one of the sentences above to WorkBuddy; for a source install you can also paste `https://github.com/MichengAI/dsh-skills-manager`. |

Codex and WorkBuddy only install the plugin. After that, open DSH Web and use **Settings → Skills**.

You can also run the same npm command yourself:

```powershell
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
```

If `dsh` is not on PATH, replace the leading `dsh` with `npx --yes @deepseek-ai/dsh`.

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

## Usage

Open **Settings → Skills**, then use the panel as follows:

| Goal | Action | Scope |
| --- | --- | --- |
| Search or filter | Narrow by source, name, or description. | All sources |
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
| `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills`, `~/.config/opencode/skills` | Yes | Manager state only | No | No |
| `<project>/.dsh/skills` | Yes, for active Session workspaces | Manager state only | Create in Settings | Moves to Trash and restores to the original project |
| `<project>/.agents/skills` | Yes, for active Session workspaces | Manager state only | No | No |

- Enable, disable, and delete accept only one ordinary skill-name path segment.
- Project roots are derived only from active Session `cwd` values; client requests carry an opaque source key and cannot nominate an arbitrary workspace path.
- Project sources follow DSH's nearest-`.git` root convention and rank order (`project-dsh` 100 before `project-agents` 200). The manager re-scans for each state/detail request. Explicit project policy is enforced by workspace-scoped rank 99/199 overlays; user DSH policy uses rank 399. With no override, DSH's official provider remains the owner. Toggle writes are limited to manager state; project file writes occur only for explicit create/Trash/restore actions under `.dsh/skills`.
- Trash falls back to copy-then-hide when a project and `$DSH_HOME` are on different volumes; restore uses the same guarded cross-volume path in reverse.
- Project Trash entries retain their original opaque source identity. Restore is allowed only while that original project is still represented by an active Session workspace; the client cannot nominate a replacement path.
- Project writes reject linked `.dsh` or `.dsh/skills` directories so a repository cannot redirect creation, deletion, or restore outside its own project root.
- User-level read-only sources accept top-level linked Skill bundles only when the real target is an ordinary direct child of another known read-only Skills root. The same real Skill is displayed and loaded once according to source rank; writable DSH roots, project roots, linked roots, and arbitrary external targets remain rejected.
- Rows and summaries say **Enabled/Disabled**, not **Loaded**: these labels describe invocation policy, while full Skill bodies are loaded on demand by DSH. Use Refresh after IDE, Git, or shell changes; the official provider remains responsible for project catalog watching and invalidation.
- Empty project roots stay out of the main source list to reduce noise, but remain selectable in Create Skill so the first project Skill can still be created. Project DSH supports per-Skill toggles only, not a source-wide switch.
- Replacements copy to a temporary sibling path first and keep the original until that succeeds.
- Every endpoint, including GET `/state`, accepts only a loopback `Host` or a canonical `host[:port]` that the DSH Web runtime already trusts through its LAN bind and `--trusted-host`; unknown hosts still receive 403.
- Browser requests must also carry a same-origin `Origin` when present and must not be marked cross-site; write endpoints continue to require JSON and the DSH client request marker.
- Import accepts the local path selected by the user. The Host trust fence prevents DNS rebinding but is not authentication; reverse-proxy and LAN deployments still need authentication, a VPN, or network access controls.

## Secondary development

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

## Documentation and license

Project status, usage boundaries, architecture, and iteration records begin at the [documentation entry point](docs/00-交接入口/00-阅读导航.md). The detailed operational guide is `docs\02-产品与业务\01-使用说明.md`.

Licensed under [Apache License 2.0](LICENSE).
