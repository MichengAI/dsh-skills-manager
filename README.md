<p align="center">
  <img src="assets/icon.png" alt="DSH Skills Manager" width="96">
</p>

<h1 align="center">DSH Skills Manager</h1>

<p align="center">
  <strong>Manage local DeepSeek Harness skills with a clear boundary for shared Agent skills.</strong>
</p>

<p align="center">
  <a href="https://github.com/MichengAI/dsh-skills-manager/issues">Report an issue</a>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache License 2.0"></a>
  <img src="https://img.shields.io/badge/DSH-Web%20Plugin-10b981" alt="DSH Web Plugin">
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=nodedotjs&logoColor=white" alt="Node.js 20 or later">
</p>

<p align="center">
  <img src="assets/screenshots/skills-manager.png" alt="Native file picker opened from the Skills settings panel" width="960">
</p>

> The screenshot shows the Skills panel layout. In the current plugin, shared Agent skills are read-only and do not expose action buttons.

> DSH Skills Manager is a community-maintained plugin. It is not an official DeepSeek AI product.

## What it provides

- **Two skill groups** — view local `$DSH_HOME\skills` and shared `$DSH_AGENTS_HOME\skills` in one Settings panel.
- **Local lifecycle controls** — enable, disable, upload, replace, and delete only DSH-local skills.
- **Safe shared-skill view** — public Agent skills are visible but strictly read-only; their global metadata is never changed.
- **Native file selection** — select a plugin `SKILL.md` from the operating system file picker, or explicitly choose its directory when the client cannot expose the selected file path.
- **Protected replacement** — a same-name import always requires confirmation, including a flat skill and a bundled skill with the same normalized name.
- **Predictable dialogs** — Escape closes only the active upload or confirmation dialog, leaving the Settings page open.

## Directory permissions

| Directory | View | Enable/Disable | Upload/Replace | Delete |
| --- | --- | --- | --- | --- |
| `$DSH_HOME\skills` | Yes | Yes | Yes | Yes |
| `$DSH_AGENTS_HOME\skills` | Yes | No | No | No |

The shared Agent directory is intentionally read-only in both the interface and the server API.

## Install

Requirements: Node.js 20 or later and a working DeepSeek Harness Web installation.

Run the following from the parent directory of this plugin:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
git clone https://github.com/MichengAI/dsh-skills-manager.git dsh-skills-manager
Set-Location .\dsh-skills-manager
dsh plugin --profile web add .
```

Restart DSH, then open **Settings → Skills**. If the old page remains visible, reload the active Web profile after installing the plugin.

## How to use it

1. Open **Settings → Skills**. The panel separates **DSH Skills** from **Shared Agent Skills** and shows each skill's name, form, description, and current invocation status.
2. In **DSH Skills**, choose **Enable** or **Disable** to control both model invocation and the `/` manual command. Other `SKILL.md` metadata remains untouched.
3. Choose **Upload Plugin** in the upper-right corner. Select the plugin directory's `SKILL.md`; the complete plugin directory is copied to `$DSH_HOME\skills`.
4. When the browser does not provide the selected file path, use **Choose Plugin Directory** in the dialog and select the directory that contains `SKILL.md`.
5. Confirm any replacement of a same-name skill. Use **Delete** only for DSH-local skills you no longer need.
6. Treat **Shared Agent Skills** as an inspection list: their controls are deliberately unavailable so the shared global skill metadata stays unchanged.

## Development and verification

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
node test\core-test.mjs
```

## Project documentation

Project status, usage boundaries, architecture, and iteration records start at the [documentation entry point](docs/00-交接入口/00-阅读导航.md). The Chinese operational guide is available at `docs\02-产品与业务\01-使用说明.md`.

## License

Licensed under the [Apache License 2.0](LICENSE).
