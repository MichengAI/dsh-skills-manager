<p align="center">
  <img src="assets/branding/dsh-banner-zh-CN.webp" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **统一管理本机与项目技能，从 GitHub 安装、预览更新并备份回退**

  [English](README.md) · [更新日志](CHANGELOG.zh-CN.md) · [Apache-2.0](LICENSE)

  [![许可证：Apache-2.0](https://img.shields.io/badge/许可证-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm 下载量](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![DSH 支持至 0.1.7-rc.1](https://img.shields.io/badge/DSH-%E6%94%AF%E6%8C%81%E8%87%B3%200.1.7--rc.1-2563eb.svg)](#安装)
</div>

> DSH Skills Manager 是社区维护的 DeepSeek Harness（DSH）插件，并非 DeepSeek AI 官方产品。

本文对应 **1.1.2**。完整变更见[更新日志](CHANGELOG.zh-CN.md)与[最新发行说明](https://github.com/MichengAI/dsh-skills-manager/releases/latest)。

## 功能概览

把散落在本机和项目中的技能集中到 DSH，无需在多个 Agent 目录间来回查找。

- **统一管理**：按来源分组，搜索技能、查看正文，一键启用或停用。
- **区分全局与项目**：项目页跟随当前会话，同名技能优先使用项目副本。
- **复用已有技能**：支持 Codex、Claude Code、Copilot 等常见 Agent，启停不会修改它们的源文件。
- **创建与导入**：新建技能，或导入 ZIP、技能文件夹和 `SKILL.md`，统一保存到全局 DSH。
- **回收与恢复**：删除 DSH 技能后先进入回收站，误删可找回。
- **技能仓库**：添加公开 GitHub 仓库，按来源折叠浏览、搜索、查看详情并逐项安装；同名不覆盖，刷新不自动更新本地。


- **来源追踪与更新**：区分本机和仓库安装，预览文件差异，保护本地修改，确认后备份更新并可恢复上一版。

## 界面预览

技能管理：

![技能管理完整界面](assets/screenshots/skills-manager-v2-preview.webp)

技能仓库：

![技能仓库浏览与安装](assets/screenshots/skill-repositories.webp)

*截图来自 1.0.0 发布前的 0.1.54 本地测试版，展示全局技能和技能仓库；最终版补充了刷新动画及进度提示。截图仅保留功能面板，已裁去背景中的真实文件名与项目目录，采用无损 WebP。*

## 安装

需要已安装并能正常运行 DeepSeek Harness。以下命令使用 `web` profile，请按实际环境替换。

插件安装支持 npm registry 和本地构建的 `.tgz` 包，不支持直接以 Git/GitHub 依赖安装（例如 `github:MichengAI/dsh-skills-manager`）。从源码开发时，请先安装开发依赖并构建，再加载到 DSH。

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

- `1.1.1` 已验证兼容 DeepSeek Harness `0.1.0-rc.8`、`0.1.1-rc.2`、`0.1.2-rc.1`、`0.1.5-rc.1`、`0.1.5-rc.2`、`0.1.7-rc.1`。

## 使用说明

| 你想做什么 | 如何操作 |
| --- | --- |
| 查找技能 | 选择全局或项目页签，展开来源分组，或使用搜索和筛选。 |
| 查看内容 | 点击「查看详情」，阅读技能正文及来源信息。 |
| 控制启停 | 切换技能开关；只影响 DSH，不改动源文件。 |
| 添加技能 | 点击「创建技能」或「导入到全局 DSH」。 |
| 从仓库安装 | 打开「技能仓库 → 添加仓库」，填写公开 GitHub 地址，扫描后逐项安装。 |
| 更新仓库技能 | 点击「刷新并检查更新」，再「查看更新」预览文件差异，确认备份后更新。 |
| 恢复更新前版本 | 对有备份的技能点击「恢复上一版」，预览并确认。 |
| 找回误删 | 打开「回收站」恢复；项目技能需回到原项目会话后恢复。 |

- **项目只看当前会话**：Git 仓库使用最近的 Git 根目录；普通文件夹使用当前会话的工作目录，无需 `git init`。
- **同名技能独立启停**：停用项目副本后，其他已启用副本仍可接管，页面会提示实际来源。要完全关闭该技能，需停用全部副本。
- **文件管理范围**：只有 DSH 来源的技能可以移入回收站；其他 Agent 的技能可查看和启停。创建与导入始终保存到全局 DSH。

### 仓库使用边界

- 标题区「检查更新」更新插件自身；仓库区「刷新并检查更新」检查技能内容，不自动安装或替换。刷新时显示当前仓库、数量和动画。
- 仓库安装仅写入全局 DSH；仅支持公开 GitHub，不提供私有凭证或自动更新。移除订阅保留已安装技能。
- 归档上限 32 MiB，指定子目录也需下载整库。扫描失败保留上次目录；缓存损坏时重新刷新。
- 更新前检测本地修改，覆盖必须明确确认；历史备份不自动清理，磁盘用量会增加。

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

想使用桌面工作台，可下载 [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop/releases)；已有 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 环境，可按各项目 README 按需安装。以下列出 11 个自研插件；桌面端实际随附范围以对应版本的发行说明和内置清单为准。

| 插件 | 你可以用它做什么 |
| --- | --- |
| [Codex UI](https://github.com/MichengAI/dsh-codex-ui) | 整理项目与会话、搜索任务、跳转对话轮次 |
| [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) | 按任务选择并召唤专业角色 |
| [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) | 管理本机与项目技能，从仓库安装、更新和回退 |
| [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) | 搜索、恢复或清理已归档会话 |
| [IM Connect](https://github.com/MichengAI/dsh-im-connect) | 从消息平台下任务、收回复 |
| [Automation](https://github.com/MichengAI/dsh-automation) | 按计划执行任务，查看每次运行的结果 |
| [BTW](https://github.com/MichengAI/dsh-btw) | 在当前上下文中临时旁问，不打断主任务 |
| [Simplify](https://github.com/MichengAI/dsh-simplify) | 用 `/simplify` 整理 Git 改动范围内的代码 |
| [PUA](https://github.com/MichengAI/dsh-pua) | 引导 Agent 在失败时换方法、查原因，并在完成前验证结果 |
| [Code Review](https://github.com/MichengAI/dsh-code-review) | 用 `/review` 发起独立 Agent 代码审查，在当前会话接收报告 |
| [Codex Pet](https://github.com/MichengAI/dsh-codex-pet) | 通过桌面宠物查看会话提醒、处理工具审批和问题回答 |

## 反馈与贡献

遇到问题或有建议，欢迎[提交 Issue](https://github.com/MichengAI/dsh-skills-manager/issues)。请附上 DSH 与插件版本、复现步骤；界面问题可附完整截图。

源码位于 `src`，使用严格 TypeScript，保留现有插件架构。开发时执行 `npm run typecheck` 检查类型，`npm run build` 生成运行产物，`npm run verify` 执行完整回归与打包验证。`lib` 不纳入 Git 提交；打包前会自动检查类型并构建，npm 安装包仍包含所需 JavaScript 产物。CI 在 Node.js 22.19.0 和 24 上执行完整验证，代码改动也会自动触发受支持宿主兼容矩阵。欢迎提交改进。

从源码制作测试包时，使用项目固定版本的 pnpm 安装依赖，执行 `npm run verify`，再执行 `npm pack`。用 `dsh plugin --profile web add <package.tgz>` 安装生成的 `.tgz`，重启 DSH 并刷新页面。打包时不要使用 `--ignore-scripts`，否则会跳过构建钩子。

## 许可证

[Apache License 2.0](LICENSE)
