<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

  # DSH Skills Manager

  **Safely manage local skills and inspect shared Agent skills in DeepSeek Harness**

  [简体中文](README.zh-CN.md) · [Apache-2.0](LICENSE)

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Node.js 20 or later](https://img.shields.io/badge/Node.js-20%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
</div>

> DSH Skills Manager is a community-maintained DeepSeek Harness (DSH) plugin, not an official DeepSeek AI product.

## Features

- Filter by category or search, then inspect DSH-local and shared Agent skills in **Settings → Skills**.
- Enable, disable, upload, replace, and delete DSH-local skills.
- Keep shared Agent skills strictly read-only and never change their global metadata.
- Import a plugin directory containing `SKILL.md` through the native file picker and confirm every name collision.
- Paste one sentence into DSH, Codex, or WorkBuddy and let that agent install the plugin locally.

## Screenshots

Filter by category or search in **Settings → Skills**. DSH-local skills can be enabled, disabled, or deleted; shared Agent skills stay read-only:

![Skills Manager settings page](assets/screenshots/skills-manager-en.png)

Shared Agent skills stay visible when the DSH-local group is empty:

![Shared Agent skills remain visible](assets/screenshots/skills-public.png)

The compact upload dialog accepts a plugin `SKILL.md`, a plugin directory, or drag-and-drop:

![Upload plugin dialog](assets/screenshots/upload-plugin.png)

Enabling a DSH-local skill restores its `/` command in the chat composer:

![Chat slash command after enabling a local skill](assets/screenshots/slash-command.png)

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

To pin a release, replace `@latest` with a version such as `@0.1.23`.

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
| Search or filter | Use **Category** and **Search** to narrow by directory, name, kind, or description. | DSH and shared Agent skills |
| Inspect a skill | Review its name, form, description, and invocation state. | DSH and shared Agent skills |
| Enable or disable | Select **Enable** or **Disable**; this controls model invocation and the `/` command. | DSH-local skills only |
| Upload a plugin | Select **Upload**, then choose the plugin directory’s `SKILL.md`. Its scripts and resources are copied too. | DSH-local skills only |
| Choose the directory | If the selected file has no usable path, choose the directory containing `SKILL.md`. | DSH-local skills only |
| Replace or delete | Confirm a name collision, or select **Delete** for an unneeded local skill. | DSH-local skills only |
| Inspect shared skills | Review shared Agent skills without changing their metadata. | Read-only |

![Delete plugin confirmation](assets/screenshots/delete-plugin.png)

> Deleting a DSH-local skill requires confirmation and cannot be undone.

Escape closes only the frontmost upload or confirmation dialog and leaves Settings open.

## Permissions and safety limits

| Directory | View | Enable or disable | Upload or replace | Delete |
| --- | --- | --- | --- | --- |
| `$DSH_HOME\skills` | Yes | Yes | Yes | Yes |
| `$DSH_AGENTS_HOME\skills` | Yes | No | No | No |

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
