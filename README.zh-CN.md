<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **在 DeepSeek Harness 中统一加载并安全管理本机 Agent Skills**

  [English](README.md) · [更新日志](CHANGELOG.zh-CN.md) · [Apache-2.0](LICENSE)

  [![许可证：Apache-2.0](https://img.shields.io/badge/许可证-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm 下载量](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Node.js ^22.19.0 || >=24.0.0](https://img.shields.io/badge/Node.js-22.19%2B%20%7C%20%3E%3D24-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
</div>

> DSH Skills Manager 是社区维护的 DeepSeek Harness（DSH）插件，并非 DeepSeek AI 官方产品。

## 功能概览

把散落在本机和项目中的技能集中到 DSH，无需在多个 Agent 目录间来回查找。

- **统一管理**：按来源分组，搜索技能、查看正文，一键启用或停用。
- **区分全局与项目**：项目页跟随当前会话，同名技能优先使用项目副本。
- **复用已有技能**：支持 Codex、Claude Code、Copilot 等常见 Agent，启停不会修改它们的源文件。
- **创建与导入**：新建技能，或导入 ZIP、技能文件夹和 `SKILL.md`，统一保存到全局 DSH。
- **回收与恢复**：删除 DSH 技能后先进入回收站，误删可找回。

## 界面预览

技能管理：

![技能管理完整界面](assets/screenshots/skills-manager-v2-preview.png)

查看技能内容：

![技能详情](assets/screenshots/skill-detail.png)

移入回收站前确认：

![移到回收站确认框](assets/screenshots/delete-plugin.png)

*以上为历史版本的完整界面截图，当前版本增加了全局、项目和回收站页签。*

## 安装

需要已安装并能正常运行 DeepSeek Harness。以下命令使用 `web` profile，请按实际环境替换。

### 让 Agent 帮你安装

把这段话发给能够操作本机终端的 Agent：

```text
请把 @michengai/dsh-skills-manager 最新版安装到我的 DSH web profile，使用官方 npm 源，安装后确认生效并告诉我如何重新加载。
```

### 手动安装

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
```

安装后重启 DSH 并刷新页面，打开「设置 → 技能」即可使用。更新时可点击「检查更新」，或重新执行安装命令。

- `0.1.50` 已验证兼容 DeepSeek Harness `0.1.0-rc.8`、`0.1.1-rc.2`、`0.1.2-rc.1`、`0.1.5-rc.1`、`0.1.5-rc.2`。

## 使用说明

| 你想做什么 | 如何操作 |
| --- | --- |
| 查找技能 | 选择全局或项目页签，展开来源分组，或使用搜索和筛选。 |
| 查看内容 | 点击「查看详情」，阅读技能正文及来源信息。 |
| 控制启停 | 切换技能开关；只影响 DSH，不改动源文件。 |
| 添加技能 | 点击「创建技能」或「导入到全局 DSH」。 |
| 找回误删 | 打开「回收站」恢复；项目技能需回到原项目会话后恢复。 |

- **项目只看当前会话**：Git 仓库使用最近的 Git 根目录；普通文件夹使用当前会话的工作目录，无需 `git init`。
- **同名技能独立启停**：停用项目副本后，其他已启用副本仍可接管，页面会提示实际来源。要完全关闭该技能，需停用全部副本。
- **文件管理范围**：只有 DSH 来源的技能可以移入回收站；其他 Agent 的技能可查看和启停。创建与导入始终保存到全局 DSH。

## 支持的 Agent 目录

`~` 表示用户主目录，`<project>` 表示当前会话的项目根。表中为默认路径；设置了对应 DSH 目录变量时，以配置为准。

| 来源 | 全局目录 | 项目目录 |
| --- | --- | --- |
| DSH | `~/.dsh/skills` | `<project>/.dsh/skills` |
| 公共 Agent | `~/.agents/skills` | `<project>/.agents/skills` |
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
| 项目 Skills | — | `<project>/skills` |

通用的 `<project>/skills` 显示为「项目 Skills」，也可读取 OpenClaw workspace 技能。不存在的外部来源目录不会显示。

## DSH 产品生态

想直接使用完整工作台，可下载 [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop/releases)；已有 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 环境，可按需独立安装以下 8 个自研插件。桌面端已随附这些插件。

| 插件 | 你可以用它做什么 |
| --- | --- |
| [Codex UI](https://github.com/MichengAI/dsh-codex-ui) | 整理项目与会话、搜索任务、跳转对话轮次 |
| [IM Connect](https://github.com/MichengAI/dsh-im-connect) | 从微信、飞书、钉钉等消息平台下任务、收回复 |
| [Automation](https://github.com/MichengAI/dsh-automation) | 按计划执行任务，查看每次运行的结果 |
| [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) | 统一查找、启停、创建和导入本机技能 |
| [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) | 搜索、恢复或清理已归档会话 |
| [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) | 按任务选择并召唤专业角色 |
| [BTW](https://github.com/MichengAI/dsh-btw) | 在当前上下文中临时旁问，不打断主任务 |
| [Simplify](https://github.com/MichengAI/dsh-simplify) | 用 /simplify 整理 Git 改动范围内的代码 |

## 反馈与贡献

遇到问题或有建议，欢迎[提交 Issue](https://github.com/MichengAI/dsh-skills-manager/issues)。请附上 DSH 与插件版本、复现步骤；界面问题可附完整截图。

源码位于 `src`，欢迎提交改进。

## 许可证

[Apache License 2.0](LICENSE)
