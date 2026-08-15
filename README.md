<p align="center">
  <img src="assets/icon.png" alt="DSH Skills Manager" width="96">
</p>

<h1 align="center">DSH Skills Manager</h1>

<p align="center">
  <strong>An npm-installable DeepSeek Harness Web plugin for managing local skills safely.</strong>
</p>

<p align="center">
  <a href="https://github.com/MichengAI/dsh-skills-manager/issues">Report an issue</a>
  · <a href="https://www.npmjs.com/package/@michengai/dsh-skills-manager">View on npm</a>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache License 2.0"></a>
  <a href="https://www.npmjs.com/package/@michengai/dsh-skills-manager"><img src="https://img.shields.io/npm/v/%40michengai/dsh-skills-manager?label=npm" alt="npm package"></a>
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
- **Safer imports** — importing from the DSH skills directory itself, its parent, or a child path is rejected; symbolic links are also rejected.
- **Predictable dialogs** — Escape closes only the active upload or confirmation dialog, leaving the Settings page open.

## Directory permissions

| Directory | View | Enable/Disable | Upload/Replace | Delete |
| --- | --- | --- | --- | --- |
| `$DSH_HOME\skills` | Yes | Yes | Yes | Yes |
| `$DSH_AGENTS_HOME\skills` | Yes | No | No | No |

The shared Agent directory is intentionally read-only in both the interface and the server API.

## Safety behavior

- Enable, disable, and delete only accept one ordinary skill-name path segment; directory traversal names are rejected.
- Replacements are first copied to a temporary sibling path. Existing files are kept until that copy succeeds.
- Mutation endpoints require JSON and the DSH client request marker, so a cross-site browser request cannot trigger a local file operation.

## Quick start

You need a working DeepSeek Harness Web installation. Do not run `npm install` in an arbitrary directory: install the plugin into the DSH Web profile instead.

1. Run:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager
```

2. Restart DSH or reload the active Web profile.
3. Open **Settings → Skills**. No source checkout is required.

If a package mirror has not synchronized the latest version yet, append `--registry=https://registry.npmjs.org/` to the install command.

## Use the Skills panel

| Goal | What to do | Scope |
| --- | --- | --- |
| Check a skill | Open **Settings → Skills** to see its name, form, description, and invocation status. | DSH and shared Agent skills |
| Enable or disable | Choose **Enable** or **Disable**. This changes model invocation and the `/` manual command without rewriting other `SKILL.md` metadata. | DSH skills only |
| Upload a plugin | Choose **Upload Plugin**, then select the plugin directory's `SKILL.md`. DSH copies the complete directory, including scripts and resources. | DSH skills only |
| Select a directory instead | If the selected file has no usable path, choose **Choose Plugin Directory** and select the directory that contains `SKILL.md`. | DSH skills only |
| Replace or delete | Confirm a same-name replacement; use **Delete** for a DSH-local skill you no longer need. | DSH skills only |
| Inspect shared skills | Review shared Agent skills without changing their metadata. | Read-only |

Press **Escape** to close only the frontmost upload or confirmation dialog; the Settings page remains open.

## Development and verification

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
node test\core-test.mjs
```

## Project documentation

Project status, usage boundaries, architecture, and iteration records start at the [documentation entry point](https://github.com/MichengAI/dsh-skills-manager/blob/master/docs/00-%E4%BA%A4%E6%8E%A5%E5%85%A5%E5%8F%A3/00-%E9%98%85%E8%AF%BB%E5%AF%BC%E8%88%AA.md). The Chinese operational guide is available at `docs\02-产品与业务\01-使用说明.md` in the repository.

## Maintainer release

The package is published as [`@michengai/dsh-skills-manager`](https://www.npmjs.com/package/@michengai/dsh-skills-manager). To release a new version:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm version patch
npm publish
```

`prepublishOnly` runs the core test suite before publication. The package always publishes to the official npm registry; use `npm run pack:check` to inspect the tarball first.

## License

Licensed under the [Apache License 2.0](LICENSE).
