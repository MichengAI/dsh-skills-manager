<p align="center">
  <img src="assets/branding/dsh-banner-en.webp" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **Manage local and project skills, install from GitHub, preview updates and restore backups**

  [简体中文](README.zh-CN.md) · [Changelog](CHANGELOG.md) · [Apache-2.0](LICENSE)

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm downloads](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![DSH supported through 0.1.7-rc.1](https://img.shields.io/badge/DSH-up%20to%200.1.7--rc.1-2563eb.svg)](#installation)
</div>

> DSH Skills Manager is a community-maintained DeepSeek Harness (DSH) plugin, not an official DeepSeek AI product.

This README describes **1.1.3**. See the [changelog](CHANGELOG.md) and [release notes](https://github.com/MichengAI/dsh-skills-manager/releases/latest).

## Features


Bring skills from your computer and projects into DSH without switching between Agent folders.

- **Manage in one place**: browse collapsible source groups, search, read, and toggle skills.
- **Global and project skills**: the project tab follows the current session, with project copies taking priority over global copies.
- **Reuse existing skills**: supports Codex, Claude Code, Copilot, and other agents without modifying their source files when toggled.
- **Create and import**: create a skill or import ZIP archives, folders, and `SKILL.md` files into global DSH.
- **Skill repositories**: discover public GitHub skills, install without overwriting local files, review updates and restore backups.
- **Recover deleted skills**: DSH skills go to Trash first, so accidental deletions can be restored.

- **Source tracking and updates**: distinguish local and repository skills, preview file changes, protect local edits, and confirm backup, update or rollback.

## Screenshots

Skill management:

![Full skill management view](assets/screenshots/skills-manager-v2-preview.webp)

Skill repositories:

![Browse and install repository skills](assets/screenshots/skill-repositories.webp)

*Screenshots show the pre-release 0.1.54 local build used to prepare 1.0.0. The final version adds refresh animation and progress feedback. Screenshots show only the feature panels, with real filenames and project directories cropped out of the background, and use lossless WebP.*

## Installation

Requires a working DeepSeek Harness installation. The commands below use the `web` profile; replace it with yours if needed.

Supported plugin installation sources are the npm registry and a locally built `.tgz` package. Direct Git/GitHub dependency installation (such as `github:MichengAI/dsh-skills-manager`) is not supported. For source development, install development dependencies and build the project before loading it into DSH.

### Ask an agent to install it

Send this to an agent that can use your local terminal:

```text
Install the latest @michengai/dsh-skills-manager into my DSH web profile using the official npm registry. Confirm installation and explain how to reload DSH.
```

### Install manually

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
```

Restart DSH, refresh the page, and open **Settings → Skills**. To update, select **Check for updates** or run the installation command again.

- Plugin `1.1.4` is tested with DeepSeek Harness `0.1.0-rc.8`, `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.7-rc.1`, `0.1.7-rc.2`.

## Usage

| What you want to do | How |
| --- | --- |
| Find a skill | Choose Global or Project, expand a source group, or use search and filters. |
| Read its contents | Select **View details** for the skill body and source information. |
| Enable or disable | Toggle the skill switch. This affects DSH without editing source files. |
| Add a skill | Select **Create skill** or **Import into global DSH**. |
| Install from a repository | Open **Repositories → Add repository**, enter a public GitHub URL, scan and install individual skills. |
| Update repository skills | Select **Refresh & check updates**, then **Review update** to inspect changes and confirm backup and update. |
| Roll back an update | Select **Restore previous version** for a skill with a backup, preview and confirm. |
| Recover a deletion | Open **Trash** and restore. For project skills, return to a session in the original project first. |

- **Current project only**: Git repositories use the nearest Git root. Other folders use the current session working directory; no `git init` required.
- **Independent copies**: disabling a project copy allows another enabled copy to take over, and the panel identifies the active source. Disable all copies to turn the skill off completely.
- **File management**: only DSH skills can move to Trash. Other Agent skills can be viewed and toggled. Creation and import always save to global DSH.

### Repository boundaries

- The header **Check for updates** updates the plugin itself. Repository **Refresh & check updates** checks skill contents without installing or replacing them; it shows animation, counts and the current repository.
- Repository installation targets global DSH only. Public GitHub repositories are supported; private credentials and automatic updates are not. Removing a subscription keeps installed skills.
- Archives are limited to 32 MiB, including when filtering by subdirectory. Failed scans preserve the previous catalog; corrupt caches require refresh.
- Local edits require explicit confirmation before replacement. Historical backups are not automatically cleaned and consume additional disk space.

## Supported Agent directories

`~` means your home directory; `<project>` is the current session project root. These are default paths; configured DSH directory variables take precedence.

| Source | Global directory | Project directory |
| --- | --- | --- |
| DSH | `~/.dsh/skills` | `<project>/.dsh/skills` |
| Shared Agent | `~/.agents/skills` | `<project>/.agents/skills` |
| CC Switch | `~/.cc-switch/skills` | — |
| Codex | `~/.codex/skills` | `<project>/.codex/skills` |
| Claude Code | `~/.claude/skills` | `<project>/.claude/skills` |
| Gemini | `~/.gemini/skills` | `<project>/.gemini/skills` |
| OpenCode | `~/.config/opencode/skills` | `<project>/.opencode/skills` |
| Cursor | `~/.cursor/skills` | `<project>/.cursor/skills` |
| Copilot | `~/.copilot/skills` | `<project>/.github/skills` |
| Windsurf | `~/.codeium/windsurf/skills`<br>`~/.windsurf/skills` | `<project>/.windsurf/skills` |
| Trae | `~/.trae/skills` | `<project>/.trae/skills` |
| Trae CN | `~/.trae-cn/skills` | `<project>/.trae-cn/skills` |
| OpenClaw / Clawdbot | `~/.openclaw/skills`<br>`~/.clawdbot/skills` | — |
| Roo | `~/.roo/skills` | `<project>/.roo/skills` |
| CodeBuddy | `~/.codebuddy/skills` | `<project>/.codebuddy/skills` |
| Project Skills | — | `<project>/skills` |

The generic `<project>/skills` directory is labeled **Project Skills** and also supports OpenClaw workspace skills. Missing external source directories are not shown.

## DSH product ecosystem

For a desktop workbench, download [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop/releases). Existing [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) installations can add plugins as needed by following each project's README. Below are 11 first-party plugins; consult the corresponding desktop release notes and bundled catalog for what that version includes.

| Plugin | What you can do |
| --- | --- |
| [Codex UI](https://github.com/MichengAI/dsh-codex-ui) | Organize projects and conversations, search tasks, and navigate chat turns |
| [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) | Choose and summon specialists for your task |
| [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) | Manage local and project skills; install, update and roll back repository skills |
| [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) | Search, restore, or clean up archived conversations |
| [IM Connect](https://github.com/MichengAI/dsh-im-connect) | Send tasks and receive replies through messaging platforms |
| [Automation](https://github.com/MichengAI/dsh-automation) | Schedule tasks and review each run |
| [BTW](https://github.com/MichengAI/dsh-btw) | Ask side questions without interrupting the main task |
| [Simplify](https://github.com/MichengAI/dsh-simplify) | Use `/simplify` to improve code within your Git changes |
| [PUA](https://github.com/MichengAI/dsh-pua) | Guide the Agent to try new approaches after failures, investigate causes, and verify results before completion |
| [Code Review](https://github.com/MichengAI/dsh-code-review) | Use `/review` to request an independent Agent code review and receive the report in the current conversation |
| [Codex Pet](https://github.com/MichengAI/dsh-codex-pet) | View conversation notifications and respond to tool approvals and questions through a desktop pet |

## Feedback and contributions

[Open an issue](https://github.com/MichengAI/dsh-skills-manager/issues) for bugs or suggestions. Include your DSH and plugin versions, reproduction steps, and a full screenshot for UI issues.

Source code lives in `src` and uses strict TypeScript while retaining the existing plugin architecture. Run `npm run typecheck` for type checks, `npm run build` to generate runtime files, and `npm run verify` for the full regression and package checks. `lib` is not tracked in Git; packing automatically checks types and builds the JavaScript files required by the npm package. CI runs full verification on Node.js 22.19.0 and 24, and code changes also trigger the supported-host compatibility matrix. Contributions are welcome.

To test a source checkout, install dependencies using the pinned pnpm version, run `npm run verify`, then run `npm pack`. Install the resulting `.tgz` with `dsh plugin --profile web add <package.tgz>`, restart DSH and refresh the page. Do not use `--ignore-scripts` when packing: it skips the build hook.

## License

[Apache License 2.0](LICENSE)
