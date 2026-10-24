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
  [![DSH supported through 0.2.1-rc.3](https://img.shields.io/badge/DSH-up%20to%200.2.1--rc.3-2563eb.svg)](#installation)
</div>

> DSH Skills Manager is a community-maintained DeepSeek Harness (DSH) plugin, not an official DeepSeek AI product.

This README describes **1.2.14**. Released changes are in the [changelog](CHANGELOG.md).

## Features

Bring skills from your computer and projects into DSH without switching between Agent folders.

- **Unified multi-view management**: Browse Global Skills, Project Skills, Discover, and Trash in unified tabs with instant search, status filtering, and collapsible source groups.
- **Broad ecosystem support**: Full coverage for 19+ tools and CLI environments including DSH, Shared Agent, Codex, Claude Code, Copilot, Cursor, Windsurf, Qoder, and Trae without touching third-party files.
- **Categorization and drag & drop**: Create category folders inside sources, drag skill rows (`⋮⋮`) to organize and order them, batch assign skills, and toggle entire categories with a single switch. Category metadata is saved without moving files.
- **Public markets & repositories**: Integrated Discover hub to explore trending skills from ClawHub and skills.sh, or subscribe to public GitHub repositories with incremental diff inspection and backups.
- **Create and flexible import**: Create skills or import ZIP archives, folders, and `SKILL.md` files directly into your global user root or a registered workspace.
- **Wide reading experience**: 760px responsive detail modal with monospace syntax styling, vertical resizing, and a one-click "Copy body" action.
- **Trash & safe rollback**: Soft delete protects skills from accidental loss, allowing complete restoration with provenance and update history preserved.

## Screenshots

Global skills:

![Global skills management view](assets/screenshots/skills-manager-v2-preview.webp)

Project skills:

![Project skills management view](assets/screenshots/project-skills.webp)

Skill repositories & discover:

![Browse and install repository skills](assets/screenshots/skill-repositories.webp)

*Screenshots show core feature views for global skills, project skills, and skill discovery. Lossless WebP.*

## Installation

Requires a working DeepSeek Harness installation. The commands below use the `web` profile; replace it with yours if needed.

Supported plugin installation sources are the npm registry, a locally built `.tgz` package, and GitHub. GitHub and npm both include a ready-to-run `lib`. After changing source, run the build before committing.

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

- Plugin `1.2.14` is tested with DeepSeek Harness `0.2.0-rc.1`, `0.2.0-rc.2`, `0.2.1-rc.1`, `0.2.1-rc.2`, `0.2.1-rc.3`.
- Hosts before `0.2.0` are no longer supported. If you still use a `0.1.x` host, install plugin `1.1.23` instead of `@latest`.
- **Reverse proxy deployment**: Supports hosting DSH behind prefix-stripping reverse proxies (e.g. `/app/dsh/`). API and update endpoints resolve against the page base URI (`document.baseURI`).

## Plugin Configuration & Toggles

The plugin follows standard DSH bundle configuration conventions. Options are located at:
> **Sidebar → Plugins → Click `Skills Manager`** (the host's `plugins.bundle.config` slot).

Two native switches are available:

### 1. Sidebar Entry (`sidebarEntry`)
- **Default**: Disabled (`false`)
- **Description**: Displays a persistent **Skills** navigation icon directly under **Plugins** in the host's left primary sidebar.
- **Effect**:
  - When enabled, clicking the sidebar icon opens the Skills Manager directly in the primary workspace with a **960px centered container** (matching host plugin manager conventions). This eliminates vertical scrolling constraints in narrow settings dialogs;
  - When disabled, unregisters the sidebar entry cleanly;
  - The standard **Settings → Skills** view remains active either way, and state is synchronized live across both entry points.

### 2. Online Updates (`onlineUpdate` / `updater`)
- **Default**: Enabled (`true`)
- **Description**: Controls whether the plugin checks for and installs updates from npm.
- **Effect**:
  - **Dynamic UI Sync**: Disabling the toggle hides the **Check for updates** button in the header immediately without requiring a full page reload;
  - **Endpoint Guard**: When disabled, the update API route returns `HTTP 403` for all check and install requests, preventing unreviewed updates;
  - **Host / Platform Lock**: For curated plugin indexes (such as VibeDev) or restricted enterprise environments, this can be locked directly via Cordis configuration (bundle patch) without needing UI interaction:
    ```yaml
    updater: false # or onlineUpdate: false
    ```
    Once configured, the built-in updater is disabled at startup and the update action stays hidden.

## Usage Guide

| Action | How to do it |
| --- | --- |
| **Find skills** | Switch between Global Skills and Project Skills tabs, expand/collapse source groups, or use the search bar and status filters. |
| **Inspect content** | Click **View details** on any skill row to read `SKILL.md` content and diagnostics in a 760px wide resizable dialog, with one-click **Copy body**. |
| **Toggle invocation** | Toggle the switch on the right side of a skill row to enable or disable it for DSH without editing third-party files. |
| **Organize categories** | Click **New category** within a source, then drag the grab handle (`⋮⋮`) to reorder or move skills across categories. Toggling a category turns all its member skills on or off. |
| **Create & import** | Click **Create skill** or **Import skill** in the header. Select destination scope (User directory or a registered workspace project) and path. |
| **Discover & install** | Open the **Discover** tab to browse trending ClawHub skills or search the skills.sh catalog, or click **Add repository** to subscribe to a public GitHub repo. |
| **Update repository skills** | Click **Refresh**, inspect file diffs with **Review update**, and confirm to update with an automated backup. |
| **Roll back updates** | Click **Restore previous version** on skills with backup history, preview changes, and confirm rollback. |
| **Recover deletions** | Open **Trash** to restore accidentally deleted DSH skills with their original locations preserved. |

### Four Main Tabs

1. **Global Skills**
   - Manage cross-project skills stored across all detected agent home directories on your machine.
   - Categorize and toggle skills by source; same-name precedence automatically highlights shadowed copies.
2. **Project Skills**
   - Select any registered workspace from the dropdown to manage its project-level skills (`<project>/.dsh/skills`, etc.).
   - Scans and searches only the selected workspace; project copies take precedence over global counterparts.
3. **Discover**
   - **Public Catalogs**: Direct integration with ClawHub and skills.sh to find and install popular community skills;
   - **GitHub Repositories**: Subscribe to public repositories, scan skill lists, preview diffs, and install copies with local edit protections.
4. **Trash**
   - Soft-delete buffer for DSH and Shared Agent skills, preserving provenance and install destinations.
   - Deleted skills can be restored anytime with a single click.

### Skill Naming & Frontmatter Requirements

The DeepSeek Harness loader enforces strict identifier policies:
- **Format constraint**: Host loaders require skill names to strictly match lowercase ASCII alphanumeric characters and hyphens (kebab-case, e.g. `my-tool`).
- **Non-ASCII & Chinese skill folders**: Your skill directory name can remain in Chinese (e.g. `文案排版/`), provided you specify a valid English `name` in `SKILL.md` frontmatter:
  ```markdown
  ---
  name: copy-formatting-helper
  description: Helper for multi-platform article formatting
  ---

  # Skill instructions...
  ```
- **Diagnostics**: Skills lacking an English name are flagged with clear in-app diagnostics explaining that the host loader cannot invoke them, with options to safely disable or clean up records.

### Repository & Installation Boundaries

- The header **Check for updates** updates the plugin itself; repository **Refresh** checks subscribed skill contents without replacing local files.
- Repository installation can target user DSH skills, Shared Agent (`~/.agents/skills`, overridable via `DSH_AGENTS_HOME`), or `<project>/.dsh/skills` for registered workspaces. Unsafe paths and external agent roots (Codex, Claude) are locked against writes.
- 32 MiB archive limit; downloading subdirectories still fetches the full archive.
- Local edits are detected and require explicit confirmation before overwriting; backup history is preserved for rollback.

## Supported Agent directories

`~` means your home directory; `<project>` is the project root of a registered workspace. These are default paths; configured environment variables take precedence. An environment variable overrides the agent's main home root directory, and the plugin scans the `skills` folder under it (i.e., `<ENV_PATH>/skills`).

| Source | Global directory | Environment variable | Project directory |
| --- | --- | --- | --- |
| <img src="assets/brands/dsh.png" width="16" height="16" alt="DSH" valign="middle"> DSH | `~/.dsh/skills` | `DSH_HOME` | `<project>/.dsh/skills` |
| <img src="assets/brands/agents.svg" width="16" height="16" alt="Shared Agent" valign="middle"> Shared Agent | `~/.agents/skills` | `DSH_AGENTS_HOME` | `<project>/.agents/skills` |
| <img src="assets/brands/cc-switch.png" width="16" height="16" alt="CC Switch" valign="middle"> CC Switch | `~/.cc-switch/skills` | — | — |
| <img src="assets/brands/codex.svg" width="16" height="16" alt="Codex" valign="middle"> Codex | `~/.codex/skills` | `DSH_CODEX_HOME` | `<project>/.codex/skills` |
| <img src="assets/brands/claude.svg" width="16" height="16" alt="Claude Code" valign="middle"> Claude Code | `~/.claude/skills` | `DSH_CLAUDE_HOME` | `<project>/.claude/skills` |
| <img src="assets/brands/gemini.svg" width="16" height="16" alt="Gemini" valign="middle"> Gemini | `~/.gemini/skills` | `DSH_GEMINI_HOME` | `<project>/.gemini/skills` |
| <img src="assets/brands/opencode.svg" width="16" height="16" alt="OpenCode" valign="middle"> OpenCode | `~/.config/opencode/skills` | `DSH_OPENCODE_HOME` | `<project>/.opencode/skills` |
| <img src="assets/brands/cursor.svg" width="16" height="16" alt="Cursor" valign="middle"> Cursor | `~/.cursor/skills` | `DSH_CURSOR_HOME` | `<project>/.cursor/skills` |
| <img src="assets/brands/copilot.svg" width="16" height="16" alt="Copilot" valign="middle"> Copilot | `~/.copilot/skills` | `DSH_COPILOT_HOME` | `<project>/.github/skills` |
| <img src="assets/brands/windsurf.svg" width="16" height="16" alt="Windsurf" valign="middle"> Windsurf | `~/.codeium/windsurf/skills`<br>`~/.windsurf/skills` | `DSH_WINDSURF_HOME`<br>`DSH_WINDSURF_USER_HOME` | `<project>/.windsurf/skills` |
| <img src="assets/brands/trae.svg" width="16" height="16" alt="Trae" valign="middle"> Trae | `~/.trae/skills` | `DSH_TRAE_HOME` | `<project>/.trae/skills` |
| <img src="assets/brands/trae.svg" width="16" height="16" alt="Trae CN" valign="middle"> Trae CN | `~/.trae-cn/skills` | `DSH_TRAE_CN_HOME` | `<project>/.trae-cn/skills` |
| <img src="assets/brands/openclaw.svg" width="16" height="16" alt="OpenClaw" valign="middle"> OpenClaw / Clawdbot | `~/.openclaw/skills`<br>`~/.clawdbot/skills` | `DSH_OPENCLAW_HOME`<br>`DSH_CLAWDBOT_HOME` | — |
| <img src="assets/brands/roo.svg" width="16" height="16" alt="Roo" valign="middle"> Roo | `~/.roo/skills` | `DSH_ROO_HOME` | `<project>/.roo/skills` |
| <img src="assets/brands/codebuddy.svg" width="16" height="16" alt="CodeBuddy" valign="middle"> CodeBuddy | `~/.codebuddy/skills` | `DSH_CODEBUDDY_HOME` | `<project>/.codebuddy/skills` |
| <img src="assets/brands/workbuddy.png" width="16" height="16" alt="WorkBuddy" valign="middle"> WorkBuddy | `~/.workbuddy/skills` | `DSH_WORKBUDDY_HOME` | `<project>/.workbuddy/skills` |
| <img src="assets/brands/qoder.svg" width="16" height="16" alt="Qoder" valign="middle"> Qoder | `~/.qoder/skills` | `DSH_QODER_HOME` | `<project>/.qoder/skills` |
| <img src="assets/brands/qoder.svg" width="16" height="16" alt="Qoder CN CLI" valign="middle"> Qoder CN CLI | `~/.qoder-cn/skills` | `DSH_QODER_CN_HOME` | — |
| <img src="assets/brands/qoder.svg" width="16" height="16" alt="Qoder CN" valign="middle"> Qoder CN | `~/.lingma/skills` | `DSH_LINGMA_HOME` | `<project>/.lingma/skills` |

Ordinary project-root `<project>/skills` directories are not scanned, so repository release resources are not exposed as Agent skills. OpenClaw / Clawdbot support is limited to the user-level sources above. Qoder CN CLI project skills use `<project>/.qoder/skills` and appear as Qoder. Qoder CN IDE uses the Lingma directories. Missing external source directories are not shown.

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

Source code lives in `src` and uses strict TypeScript while retaining the existing plugin architecture. Run `npm run typecheck` for type checks, `npm run build` to generate runtime files, and `npm run verify` for the full regression and package checks. GitHub and npm both include a ready-to-run `lib`. After changing source, run the build before committing. Packing still checks types and builds the JavaScript files required by the npm package. CI runs full verification on Node.js 22.19.0 and 24, and code changes also trigger the supported-host compatibility matrix. Contributions are welcome.

To test a source checkout, install dependencies using the pinned pnpm version, run `npm run verify`, then run `npm pack`. Install the resulting `.tgz` with `dsh plugin --profile web add <package.tgz>`, restart DSH and refresh the page. Do not use `--ignore-scripts` when packing: it skips the build hook.

## License

[Apache License 2.0](LICENSE)
