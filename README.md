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

Bring skills from your computer and projects into DSH without switching between Agent folders.

- **Manage in one place**: browse collapsible source groups, search, read, and toggle skills.
- **Global and project skills**: the project tab follows the current session, with project copies taking priority over global copies.
- **Reuse existing skills**: supports Codex, Claude Code, Copilot, and other agents without modifying their source files when toggled.
- **Create and import**: create a skill or import ZIP archives, folders, and `SKILL.md` files into global DSH.
- **Recover deleted skills**: DSH skills go to Trash first, so accidental deletions can be restored.

## Screenshots

Skill management:

![Full skill management view](assets/screenshots/skills-manager-v2-preview.png)

Read a skill:

![Skill details](assets/screenshots/skill-detail.png)

Confirm before moving to Trash:

![Move to Trash confirmation](assets/screenshots/delete-plugin.png)

*These full screenshots show an earlier version. The current version adds Global, Project, and Trash tabs.*

## Installation

Requires a working DeepSeek Harness installation. The commands below use the `web` profile; replace it with yours if needed.

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

- Plugin `0.1.50` is tested with DeepSeek Harness `0.1.0-rc.8`, `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`.

## Usage

| What you want to do | How |
| --- | --- |
| Find a skill | Choose Global or Project, expand a source group, or use search and filters. |
| Read its contents | Select **View details** for the skill body and source information. |
| Enable or disable | Toggle the skill switch. This affects DSH without editing source files. |
| Add a skill | Select **Create skill** or **Import into global DSH**. |
| Recover a deletion | Open **Trash** and restore. For project skills, return to a session in the original project first. |

- **Current project only**: Git repositories use the nearest Git root. Other folders use the current session working directory; no `git init` required.
- **Independent copies**: disabling a project copy allows another enabled copy to take over, and the panel identifies the active source. Disable all copies to turn the skill off completely.
- **File management**: only DSH skills can move to Trash. Other Agent skills can be viewed and toggled. Creation and import always save to global DSH.

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

## Feedback and contributions

[Open an issue](https://github.com/MichengAI/dsh-skills-manager/issues) for bugs or suggestions. Include your DSH and plugin versions, reproduction steps, and a full screenshot for UI issues.

Source code lives in `src`. Contributions are welcome.

## License

[Apache License 2.0](LICENSE)
