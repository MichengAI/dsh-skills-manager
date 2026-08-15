# dsh-skills-manager

English | [中文](README.zh-CN.md)

A DeepSeek Harness (DSH) Web plugin for managing local DSH skills and safely viewing or toggling shared Agent skills from **Settings → Skills**.

## Features

- Lists skill name, description, type, and invocation status from `$DSH_HOME\skills` and `$DSH_AGENTS_HOME\skills`.
- Enables or disables skills in either directory by updating `disable-model-invocation` in `SKILL.md`.
- Uploads only to `$DSH_HOME\skills`: select a plugin `SKILL.md` with the native system picker; when no file path is available, select the plugin directory instead.
- Requires an explicit confirmation before replacing a skill with the same name, including bundle and flat skills with the same normalized name.
- Deletes only skills inside `$DSH_HOME\skills`, with confirmation.
- Handles Escape from the topmost confirmation or upload dialog without closing the Settings page.

## Directory Permissions

| Directory | View | Enable/Disable | Upload/Replace | Delete |
|---|---|---|---|---|
| `$DSH_HOME\skills` | Yes | Yes | Yes | Yes |
| `$DSH_AGENTS_HOME\skills` | Yes | Yes | No | No |

The shared Agent directory is intentionally read-only for upload and deletion. Both the UI and server enforce this boundary.

## Requirements

- Node.js 20 or later.
- A working DeepSeek Harness Web installation.

## Installation

Run the following from the parent directory of this plugin:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
git clone <repository-url> dsh-skills-manager
Set-Location .\dsh-skills-manager
dsh plugin --profile web add .
```

Restart DSH and open **Settings → Skills**. If the old page is still visible, make sure the active Web profile has reloaded this plugin.

## Usage

1. Open **Settings → Skills** to view DSH and shared Agent skill groups.
2. Use **Enable** or **Disable** on a skill to change its invocation status.
3. Click **Upload Plugin**, then select the `SKILL.md` in a plugin directory. The entire directory is copied to the DSH skills directory.
4. Confirm before replacing a skill with the same name.
5. Use **Delete** only in the DSH skill group.

## Development and Verification

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
node test\core-test.mjs
```

## License

Licensed under the [Apache License 2.0](LICENSE).
