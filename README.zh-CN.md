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
  [![DSH 支持至 0.2.1-rc.3](https://img.shields.io/badge/DSH-%E6%94%AF%E6%8C%81%E8%87%B3%200.2.1--rc.3-2563eb.svg)](#安装)
</div>

> DSH Skills Manager 是社区维护的 DeepSeek Harness（DSH）插件，并非 DeepSeek AI 官方产品。

本文描述 **1.2.16**。已发布变更见[更新日志](CHANGELOG.zh-CN.md)。

## 功能概览

把散落在本机和项目中的技能集中到 DSH，无需在多个 Agent 目录间来回查找。

- **多视图集中管理**：提供「全局技能」、「项目技能」、「发现」与「回收站」四大工作区视图，支持搜索、状态筛选与来源折叠。
- **广泛的生态兼容**：覆盖 DSH、公共 Agent、Codex、Claude Code、Copilot、Cursor、Google Antigravity、Windsurf、Qoder、Trae 等 20+ 工具与 CLI 环境，统一管理且不侵入第三方文件。
- **分类整理与拖拽归类**：支持在各来源内创建分类文件夹、拖拽技能卡片归类排序、批量添加技能，并支持分类级一键启停。分类元数据独立保存，不改动物理文件。
- **公共市场与仓库订阅**：内置「发现」中心，一站式浏览 ClawHub 热门榜单与 skills.sh 技能市场，支持公开 GitHub 仓库订阅、增量更新检测与版本备份回退。
- **创建与自由导入**：新建技能，或导入 ZIP、文件夹与 `SKILL.md`，可精准写入用户全局目录或指定工作区项目目录。
- **宽屏阅读与正文复制**：760px 宽屏自适应详情弹窗，等宽字体代码高亮排版，支持垂直自由拉伸与一键复制 Markdown 正文。
- **回收站与防误删保障**：DSH 技能删除后优先移入回收站，支持完整保留安装身份与更新历史的安全恢复。

## 界面预览

全局技能：

![全局技能管理界面](assets/screenshots/skills-manager-v2-preview.webp)

项目技能：

![项目技能管理界面](assets/screenshots/project-skills.webp)

技能仓库与发现：

![技能仓库浏览与安装](assets/screenshots/skill-repositories.webp)

*截图展示核心功能面板，包含全局技能、项目技能与技能发现仓库。采用无损 WebP 格式。*

## 安装

需要已安装并能正常运行 DeepSeek Harness。以下命令使用 `web` profile，请按实际环境替换。

插件安装支持 npm registry、本地构建的 `.tgz` 包和 GitHub。GitHub 与 npm 都包含可直接运行的 `lib`。改动源码后，提交前请先运行构建。

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

- `1.2.16` 已验证兼容 DeepSeek Harness `0.2.0-rc.1`、`0.2.0-rc.2`、`0.2.1-rc.1`、`0.2.1-rc.2`、`0.2.1-rc.3`。
- 不再支持 `0.2.0` 之前的宿主。仍在使用 `0.1.x` 的，请安装插件 `1.1.23`，不要装 `@latest`。
- **反向代理部署**：支持将 DSH 部署在带路径前缀的反向代理后面（如 `/app/dsh/`），插件 API 统一自动按页面基址（`document.baseURI`）相对解析。

## 插件配置与可选开关

插件遵循 DSH 官方扩展配置规范，配置项位于：
> **主界面侧边栏「插件」→ 点击 `Skills Manager` 详情页**（对应宿主 `plugins.bundle.config` 槽位）。

此处提供两个原生扁平行开关：

### 1. 侧边栏入口 (`sidebarEntry`)
- **默认状态**：关闭（`false`）
- **功能说明**：在宿主左侧主导航栏的「插件」下方增加常驻的 **「技能」** 图标入口。
- **生效效果**：
  - 开启后，在侧边栏点击即可直达技能管理中心，并在主工作区以 **960px 居中版心**（对齐官方插件管理与市场规范）展开完整大面板，彻底告别在设置弹窗狭窄视口内滚动的局限；
  - 关闭后安全注销侧栏槽位；
  - 无论是否开启侧栏入口，DSH 原有的「设置 → 技能」入口始终保留，两处界面数据与状态 100% 实时同步。

### 2. 在线更新 (`onlineUpdate` / `updater`)
- **默认状态**：开启（`true`）
- **功能说明**：控制是否允许在线检查并安装技能管理器的新版本。
- **生效效果**：
  - **界面联动**：关闭开关后，技能管理面板顶部的「检查更新」按钮将即时隐藏，无需刷新页面；开启后自动恢复展示；
  - **接口安全拦截**：关闭后，服务端的更新路由对任何版本检查和安装请求均返回 `HTTP 403` 禁用状态，彻底杜绝在插件内安装未审核版本；
  - **宿主/平台级锁定**：面向精选插件索引（如 VibeDev）或企业安全合规环境，支持直接在 Cordis 配置文件（bundle patch）中声明，无需进入界面手动配置：
    ```yaml
    updater: false # 或 onlineUpdate: false
    ```
    配置生效后，更新器在启动时即被完全禁用，且更新入口默认保持隐藏。

## 使用指南

| 核心操作 | 操作方式 |
| --- | --- |
| **检索技能** | 切换「全局技能」或「项目技能」页签，按来源分组折叠/展开，或使用顶部搜索框与状态筛选器。 |
| **阅读技能** | 点击技能行右侧「查看详情」，在 760px 宽屏弹窗中阅读 `SKILL.md` 正文及诊断信息，支持一键「复制正文」。 |
| **控制启停** | 点击技能行右侧开关，切换其在 DSH 中的调用状态；仅影响 DSH 智能体执行，绝不改动第三方源文件。 |
| **分类与拖拽** | 在来源内点击「新建分类」，拖拽左侧把手（`⋮⋮`）直接跨分类移动或同组排序；支持分类一键批量启停与多选添加。 |
| **创建与导入** | 点击顶栏「创建技能」或「导入技能」，并排选择写入目标（用户目录或已登记工作区项目目录），系统自动核对安全路径。 |
| **发现与安装** | 切换到「发现」页签，浏览 ClawHub 热榜或搜索 skills.sh 目录，或点击「添加仓库」订阅公开 GitHub 仓库。 |
| **仓库技能更新** | 点击「刷新」，再点击「查看更新」预览文件 Diff 差异，确认后自动创建本地备份并完成更新。 |
| **版本回退** | 对存在备份的技能点击「恢复上一版」，预览差异并确认恢复。 |
| **回收与防误删** | 删除的 DSH 技能自动进入「回收站」，可随时完整恢复或永久删除。 |

### 技能管理四大板块

1. **全局技能（Global Skills）**
   - 集中展示当前电脑上所有 Agent 目录下的全局技能（跨项目通用）。
   - 支持按来源启停、按分类组织；当不同来源存在同名技能时，自动遵循优先级遮盖并给出来源提示。
2. **项目技能（Project Skills）**
   - 顶部下拉选择当前 DSH 已登记的工作区目录，下方展示该项目所属的 Agent 技能。
   - 仅扫描并管理所选工作区；项目级同名技能优于全局副本生效。
3. **发现（Discover）**
   - **公共市场**：集成 ClawHub 热门下载榜与 skills.sh 全球技能库，输入关键字即可检索全球开源技能，一键完成多副本安装；
   - **GitHub 仓库订阅**：输入 GitHub 仓库地址，整仓扫描技能清单，支持增量版本比对、本地修改保护与更新备份。
4. **回收站（Trash）**
   - 存放从 DSH 或公共 Agent 来源中删除的技能副本，保留原始安装位置与关联信息。
   - 误删技能可一键恢复回原目录，彻底杜绝意外丢失。

### 技能命名与 Frontmatter 规范

DeepSeek Harness 宿主加载机制对技能标识符遵循规范命名约束：
- **名称格式**：宿主严格要求技能名称必须为 ASCII 小写字母、数字与连字符构成的 kebab-case 格式（如 `my-custom-skill`）；
- **中文技能目录自救**：您的技能文件夹名称可以继续使用直观的中文名称（如 `文案排版/`），只需在其 `SKILL.md` 的 YAML frontmatter 中显式声明合法的英文 `name` 即可被宿主正常加载和调用：
  ```markdown
  ---
  name: copy-formatting-helper
  description: 微信公众号与多平台文案排版辅助工具
  ---

  # 技能正文内容...
  ```
- **界面智能诊断**：若本地存在缺少英文 `name` 的纯中文技能，管理器会在界面明确给出「宿主不支持此技能名称格式，无法启用」的诊断指引，并允许停用清理历史脏记录。

### 仓库与安装边界

- 顶栏「检查更新」用于更新技能管理器插件自身；仓库区「刷新」仅检查技能仓库内容更新，不自动覆盖本地。
- 仓库安装可以写入用户目录下的 DSH skills 或公共 Agent（`~/.agents/skills`，可用 `DSH_AGENTS_HOME` 覆盖），也可以写入已登记工作区的 `<项目根>/.dsh/skills`。选择器显示实际配置路径，并禁用不安全路径；缺少的目录仅在确认安装后创建。不能安装到 Codex、Claude 等其他 Agent 目录。
- 归档上限 32 MiB，指定子目录也需下载整库。
- 更新前检测本地修改，覆盖必须明确确认；历史备份不自动清理，可随时恢复上一版。

## 支持的 Agent 目录

`~` 表示用户主目录，`<project>` 表示已登记工作区的项目根。表中为默认路径；设置了对应环境变量时，以配置为准。环境变量覆盖对应 Agent 的主根目录，插件会在其目录下扫描 `skills` 文件夹（即 `<环境变量值>/skills`）。

| 来源 | 全局目录 | 环境变量 | 项目目录 |
| --- | --- | --- | --- |
| <img src="assets/brands/dsh.png" width="16" height="16" alt="DSH" valign="middle"> DSH | `~/.dsh/skills` | `DSH_HOME` | `<project>/.dsh/skills` |
| <img src="assets/brands/agents.svg" width="16" height="16" alt="Shared Agent" valign="middle"> 公共 Agent | `~/.agents/skills` | `DSH_AGENTS_HOME` | `<project>/.agents/skills` |
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
| <img src="assets/brands/gemini.svg" width="16" height="16" alt="Google Antigravity" valign="middle"> Google Antigravity | `~/.gemini/config/skills` | `DSH_ANTIGRAVITY_HOME` | `<project>/.agents/skills` |

不扫描普通项目根目录的 `<project>/skills`，避免把仓库的发布资源当作 Agent 技能。OpenClaw / Clawdbot 仅保留上表中的用户级来源。Qoder CN CLI 的项目技能在 `<project>/.qoder/skills`，显示为 Qoder。Qoder CN IDE 使用 Lingma 目录。不存在的外部来源目录不会显示。

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

源码位于 `src`，使用严格 TypeScript，保留现有插件架构。开发时执行 `npm run typecheck` 检查类型，`npm run build` 生成运行产物，`npm run verify` 执行完整回归与打包验证。GitHub 与 npm 都包含可直接运行的 `lib`。改动源码后，提交前请先运行构建。打包前仍会自动检查类型并构建，npm 安装包仍包含所需 JavaScript 产物。CI 在 Node.js 22.19.0 和 24 上执行完整验证，代码改动也会自动触发受支持宿主兼容矩阵。欢迎提交改进。

从源码制作测试包时，使用项目固定版本的 pnpm 安装依赖，执行 `npm run verify`，再执行 `npm pack`。用 `dsh plugin --profile web add <package.tgz>` 安装生成的 `.tgz`，重启 DSH 并刷新页面。打包时不要使用 `--ignore-scripts`，否则会跳过构建钩子。

## 许可证

[Apache License 2.0](LICENSE)
