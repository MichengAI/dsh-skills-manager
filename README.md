<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

  # DSH Skills Manager

  **Load and safely manage skills from DSH and common local Agents**

  [简体中文](README.zh-CN.md) · [Apache-2.0](LICENSE)

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm downloads](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Node.js 20 or later](https://img.shields.io/badge/Node.js-20%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
</div>

> DSH Skills Manager is a community-maintained DeepSeek Harness (DSH) plugin, not an official DeepSeek AI product.

## Features

- Discover and load user-level skills from `.agents`, Codex, Claude, Gemini, and OpenCode into DSH.
- Persist external source and skill toggles under `$DSH_HOME/skills-manager/state.json` without rewriting shared source files.
- Inspect Markdown bodies, frontmatter, load state, duplicate shadowing, and format diagnostics in a source-first UI.
- Create a local DSH skill from Settings or conversation; conversational writes require user approval.
- Move DSH-local skills to recoverable Trash, then restore or permanently delete them.
- Import `.zip` archives, skill folders, or a single `SKILL.md` safely into `$DSH_HOME/skills`.

## Screenshots

Browse by source or search in **Settings → Skills**. External Agent sources are loaded through a manager-owned provider while their files stay read-only:

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
| [DSH Codex Suite](https://github.com/MichengAI/dsh-codex-ui/tree/main/packages/dsh-codex-suite) | A one-click suite for existing DSH Web environments that installs this product and the other five feature products |
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
| Enable or disable | DSH skills update their own invocation policy; external skills update manager-local state only. | All sources |
| Create or import | Create in Settings, or import `.zip`, a folder containing `SKILL.md`, or one `SKILL.md`. | `$DSH_HOME/skills` |
| Create from conversation | Let an Agent call `create_skill`; DSH asks for approval before writing. | `$DSH_HOME/skills` |
| Delete and recover | Move to Trash, restore, or permanently delete in a second step. | DSH-local skills |

> Toggling a shared source never changes its files; only DSH-local skills can move to Trash.

Escape closes only the frontmost upload or confirmation dialog and leaves Settings open.

## Permissions and safety limits

| Directory | View/load | Enable or disable | Create/import | Delete |
| --- | --- | --- | --- | --- |
| `$DSH_HOME\skills` | Yes | Updates local invocation policy | Yes | Moves to Trash |
| `$DSH_AGENTS_HOME\skills` | Yes | Manager state only | No | No |
| `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills`, `~/.config/opencode/skills` | Yes | Manager state only | No | No |

- Enable, disable, and delete accept only one ordinary skill-name path segment.
- Replacements copy to a temporary sibling path first and keep the original until that succeeds.
- All endpoints, including GET `/state`, accept only loopback `Host` values (`localhost`, `127.0.0.1`, `[::1]`).
- Write endpoints also require JSON and the DSH client request marker, so cross-site browser requests cannot trigger local file operations.
- Import accepts the local path the user selected. The HTTP API trusts loopback callers only; do not expose the host web server beyond this machine.

## Secondary development

This repository has no `src` directory. `lib` is directly maintained runtime source, which is its current layout rather than the recommended layout for new plugins. New plugins should prefer `src` built to `lib`.

- [lib\index.js](lib/index.js): host service and local skill file operations.
- [lib\client.js](lib/client.js): Settings page, upload, and confirmation interactions.
- `test\core-test.mjs`: file-operation, permission, and import boundary tests.
- `test\locale-test.mjs`: UI locale tests.

After changing the runtime source, test, inspect package contents, and install from the local directory:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
npm run pack:check
dsh plugin --profile web add .
```

Preserve path validation, temporary-copy replacement, and shared-skill read-only behavior when changing file-mutation code.

## Validation

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
npm run pack:check
```

`prepublishOnly` runs the core tests before publishing.

## Documentation and license

Project status, usage boundaries, architecture, and iteration records begin at the [documentation entry point](docs/00-交接入口/00-阅读导航.md). The detailed operational guide is `docs\02-产品与业务\01-使用说明.md`.

Licensed under [Apache License 2.0](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the five most recent releases.
