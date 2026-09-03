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
  [![Node.js 20 or later](https://img.shields.io/badge/Node.js-20%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
</div>

> DSH Skills Manager 是社区维护的 DeepSeek Harness（DSH）插件，并非 DeepSeek AI 官方产品。


## 功能概览

- 自动发现并把 `.agents`、CC Switch、Codex、Claude、Gemini 和 OpenCode 的用户级技能真正加载进 DSH。
- 从活动 Session 工作区发现项目级 `.dsh/skills` 与 `.agents/skills` 并按项目分组；所有有效 Skill 都可通过不改源文件的本地策略启停。
- 所有逐 Skill 启停都只写入 `$DSH_HOME\skills-manager\state.json`，绝不改写任何来源 Skill 文件。
- 按来源折叠、搜索和筛选，并查看技能正文、frontmatter、调用状态、重名遮蔽与格式诊断。
- 在设置页创建用户级或项目级 DSH Skill；对话创建仍为用户级，并在写入前请求确认。
- 用户级和项目级 DSH Skill 删除后先进入回收站，可恢复到原来源或二次永久删除。
- 支持把 `.zip`、包含 `SKILL.md` 的技能文件夹或单个 `SKILL.md` 安全导入 `$DSH_HOME\skills`。

## 界面预览

在「设置 → 技能」中按来源管理 DSH 与其他本机 Agent 的技能；外部技能通过 manager provider 加载，源文件保持只读：

![按来源管理技能的设置页面](assets/screenshots/skills-manager-v2-preview.png)

打开任意技能可查看来源路径、诊断结果、Markdown 正文与解析后的 frontmatter：

![技能正文与诊断详情](assets/screenshots/skill-detail.png)

DSH 本地技能移入回收站前需要确认；永久删除前仍可恢复：

![移到回收站确认框](assets/screenshots/delete-plugin.png)

## DSH 产品生态

本产品既可以独立安装，也可以随桌面端或 Web 套件一起使用。它们共享同一个 DSH 核心，但面向不同的使用方式：

| 产品 | 与本产品的关系 |
| --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 本产品的运行宿主，提供模型、会话、工具和插件系统 |
| [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop) | 下载安装即用的桌面产品，已内置本产品和其他 5 个功能产品 |
| 6 个功能产品 | [Codex UI](https://github.com/MichengAI/dsh-codex-ui) · [IM Connect](https://github.com/MichengAI/dsh-im-connect) · [Automation](https://github.com/MichengAI/dsh-automation) · [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) · [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) · [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) |

## 前置条件

- 已可正常运行 DeepSeek Harness Web，且可在 PowerShell 中使用 `dsh`。
- 以下示例使用 `web` profile；请替换为实际目标 profile。
- 从源码安装或二次开发需要 Node.js 20+；仅从 npm 安装无需在任意目录执行 `npm install`。

## 安装

`dsh plugin add` 会转发到 profile 目录里的 `pnpm add`。不写版本、不指定官方源时，本机镜像和最短发布间隔可能让你停在旧版。

### 交给其他 Agent 一句话安装

本插件运行在 DeepSeek Harness Web 里。把下面其中一句复制到 DSH、Codex 或 WorkBuddy，让它代你安装到本机 `web` profile。

从 npm 安装：

```text
请把 DSH 插件 @michengai/dsh-skills-manager 最新版装进本机 web profile，使用官方 npm 源执行：dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/。装完执行 dsh --profile web --dump-config，确认已挂载 skills-manager，并提醒我重启 DSH Web 后硬刷新浏览器。
```

从源码安装：

```text
请从 https://github.com/MichengAI/dsh-skills-manager 安装 DSH 插件：克隆仓库，执行 npm install 和 npm test，再在该目录执行 dsh plugin --profile web add .。不要只复制 lib。然后执行 dsh --profile web --dump-config，确认已挂载 skills-manager，并提醒我重启 DSH Web 后硬刷新浏览器。
```

| 产品 | 怎么用 |
| --- | --- |
| DSH | 把上面其中一句发给当前会话。 |
| Codex | 把上面其中一句发给 Codex，让它在本机执行安装。 |
| WorkBuddy | 把上面其中一句发给 WorkBuddy；源码安装也可同时粘贴仓库地址 `https://github.com/MichengAI/dsh-skills-manager`。 |

Codex 和 WorkBuddy 只负责代装；装好后仍要打开 DSH Web 使用「设置 → 技能」。

也可以自己执行同一条 npm 命令：

```powershell
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
```

未把 `dsh` 装进 PATH 时，把开头的 `dsh` 换成 `npx --yes @deepseek-ai/dsh`。

### 从官方 npm 安装最新版

在任意 PowerShell 目录执行：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
dsh --profile web --dump-config
```

需要钉死某一版时，把 `@latest` 换成具体版本，例如 `@0.1.25`。

配置输出中应包含 `skills-manager`。安装后重启 DSH Web 并在浏览器硬刷新。不要手工复制客户端文件，`dsh plugin add` 会同时应用 `cordis.patch.yml`。

### 从源码安装

适用于调试或使用未发布改动。克隆后的本地路径就是插件安装路径：

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

完成后重启 DSH Web 并硬刷新浏览器。`dsh plugin ... add .` 会读取当前目录的包信息和 `cordis.patch.yml`；不要改为直接复制 `lib` 目录。

## 使用

打开「设置 → 技能」，再按下表操作：

| 目标 | 操作 | 范围 |
| --- | --- | --- |
| 搜索或筛选 | 按来源、名称或简介收窄列表。 | 全部来源 |
| 查看详情与诊断 | 查看正文、frontmatter、源文件路径、格式问题和重名遮蔽。 | 全部来源 |
| 启用或停用 | 只更新 manager 本地调用策略，不修改来源 Skill 文件。 | 全部用户级来源与活动项目来源中的有效 Skill |
| 创建或导入 | 在设置页创建时选择用户 DSH 或活动项目 DSH；导入仍为用户级。 | `$DSH_HOME\skills`，创建可选活动 `<project>/.dsh/skills` |
| 从对话创建 | 让 Agent 调用 `create_skill`；写入前由 DSH 审批界面确认。 | `$DSH_HOME\skills` |
| 删除与恢复 | 删除先进入回收站；可恢复到原来源或永久二次删除。 | 用户级与活动项目级 DSH Skill |

> 任何来源的启停都不会修改 Skill 文件；只有用户级或项目级 DSH Skill 可以移入回收站。

按 ESC 只关闭最上层上传框或确认框，设置页会保持打开。

## 权限与安全边界

| 目录 | 查看/加载 | 启用或停用 | 创建/导入 | 删除 |
| --- | --- | --- | --- | --- |
| `$DSH_HOME\skills` | 支持 | 仅写 manager 状态 | 支持 | 进入回收站 |
| `$DSH_AGENTS_HOME\skills` | 支持 | 仅写 manager 状态 | 不支持 | 不支持 |
| `~\.cc-switch\skills` | 支持，默认开启 | 仅写 manager 状态 | 不支持 | 不支持 |
| `~/.codex/skills`、`~/.claude/skills`、`~/.gemini/skills`、`~/.config/opencode/skills` | 支持 | 仅写 manager 状态 | 不支持 | 不支持 |
| `<project>/.dsh/skills` | 支持活动 Session 工作区 | 仅写 manager 状态 | 设置页支持创建 | 进入回收站并恢复到原项目 |
| `<project>/.agents/skills` | 支持活动 Session 工作区 | 仅写 manager 状态 | 不支持 | 不支持 |

- 启用、停用和删除只接受单个普通技能名称，目录穿越名称会被拒绝。
- 项目根只从活动 Session 的 `cwd` 推导；客户端只提交不透明来源 key，不能指定任意工作区路径。
- 项目来源遵循 DSH 最近 `.git` 项目根和固定优先级（`project-dsh` 100、`project-agents` 200）。管理器每次读取状态或详情时重新扫描；显式项目策略通过 workspace 作用域 rank 99/199 覆盖候选执行，用户 DSH 策略使用 rank 399；没有覆盖时仍由 DSH 官方 provider 负责。启停只写 manager 状态，项目文件写入仅发生在用户明确执行 `.dsh/skills` 创建、回收或恢复时。
- 当项目与 `$DSH_HOME` 位于不同磁盘时，回收站会降级为“复制后在源盘原子隐藏”；恢复使用反向的同一安全流程。
- 项目回收站条目保存原始不透明来源身份。仅当原项目仍由活动 Session 工作区提供时才允许恢复；客户端不能指定替代路径。
- 项目写入会拒绝链接形式的 `.dsh` 或 `.dsh/skills` 目录，避免仓库把创建、删除或恢复重定向到项目根之外。
- 用户级只读来源允许顶层技能目录链接，但真实目标必须是另一个已知只读 Skills 根的普通直接子目录；同一真实技能按来源优先级只展示和加载一次。可写 DSH、项目来源、技能根链接和任意外部目标仍被拒绝。
- 列表和摘要统一使用“已启用/已停用”，不再使用“已加载”：这里描述的是调用策略，完整 Skill 正文仍由 DSH 按需加载。IDE、Git 或 shell 改动后可点击“刷新”；项目 catalog 的 watcher 与 invalidation 仍由官方 provider 负责。
- 没有 Skill 的项目根不会出现在主来源列表中，但仍保留在“创建技能”的目标选择中，确保可以创建第一个项目 Skill。项目 DSH 只提供逐 Skill 启停，不提供整个项目来源总开关。
- 覆盖前先复制到同目录临时路径；复制成功前不会改动现有技能。
- 全部接口（含 GET `/state`）只接受 loopback `Host`，或 DSH Web runtime 已通过 LAN 绑定和 `--trusted-host` 明确信任的 `host[:port]`；未知 Host 继续返回 403。
- 浏览器请求还必须满足同源 `Origin` 且不能标记为 cross-site；写入接口继续要求 JSON 与 DSH 客户端请求标记。
- 导入接受用户选定的本机路径。Host 信任栅栏用于防 DNS rebinding，不是身份认证；通过反向代理或局域网提供服务时，仍应配置认证、VPN 或网络访问控制。

## 二次开发

运行源码维护在 `src`，`lib` 是由 `npm run build` 生成并随 npm 包发布的产物。请修改 `src`，不要直接修改 `lib`：

- [src\core.js](src/core.js)：文件操作、权限和导入边界核心。
- [src\index.js](src/index.js)：Host 服务与本地技能文件操作入口。
- [src\client.js](src/client.js)：设置页、上传和确认交互。
- [scripts\build.mjs](scripts/build.mjs)：生成 Host 与浏览器端 `lib` 产物。
- `test\core-test.mjs`：文件操作、权限和导入边界测试。
- `test\locale-test.mjs`：界面词条测试。

修改后运行测试、检查发布内容并以本地目录安装验证：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
npm run verify
dsh plugin --profile web add .
```

修改文件写入逻辑时必须保留路径校验、临时目录复制和公共技能只读限制。

## 验证

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
npm run verify
```

`prepublishOnly` 会在发布前自动执行完整 `verify` 门禁：构建、测试、发布包检查和生成产物同步检查。

## 项目文档与许可证

项目状态、使用边界、技术架构和迭代记录从[文档交接入口](docs/00-交接入口/00-阅读导航.md)开始。详细操作说明见 `docs\02-产品与业务\01-使用说明.md`。

本项目采用 [Apache License 2.0](LICENSE)。
