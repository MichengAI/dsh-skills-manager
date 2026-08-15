<p align="center">
  <img src="assets/icon.png" alt="DSH Skills Manager" width="96">
</p>

<h1 align="center">DSH Skills Manager</h1>

<p align="center">
  <strong>管理本地 DeepSeek Harness 技能，并为公共 Agent 技能提供清晰、安全的查看边界。</strong>
</p>

<p align="center">
  <a href="https://github.com/MichengAI/dsh-skills-manager/issues">反馈问题</a>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache License 2.0"></a>
  <img src="https://img.shields.io/badge/DSH-Web%20Plugin-10b981" alt="DSH Web Plugin">
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=nodedotjs&logoColor=white" alt="Node.js 20 或更高版本">
</p>

<p align="center">
  <img src="assets/screenshots/skills-manager.png" alt="从技能设置面板打开的系统原生文件选择器" width="960">
</p>

> 截图展示技能面板的整体布局。当前版本中的公共 Agent 技能为只读，不会显示操作按钮。

> DSH Skills Manager 是社区维护的插件，并非 DeepSeek AI 官方产品。

## 核心能力

- **双目录分组**：在一个设置面板中查看本地 `$DSH_HOME\skills` 与公共 `$DSH_AGENTS_HOME\skills`。
- **本地技能管理**：仅对 DSH 本地技能提供启用、停用、上传、覆盖和删除。
- **公共技能安全查看**：公共 Agent 技能可见但严格只读，绝不会改写其全局元数据。
- **系统原生选择**：通过操作系统文件选择器选择插件的 `SKILL.md`；客户端无法提供所选文件路径时，可显式选择插件目录。
- **覆盖保护**：导入同名技能一定要求确认；flat 与 bundle 两种形态同名时同样如此。
- **弹窗行为可预期**：按 ESC 只关闭当前上传框或确认框，不会关闭设置页面。

## 目录权限

| 目录 | 查看 | 启用/停用 | 上传/覆盖 | 删除 |
| --- | --- | --- | --- | --- |
| `$DSH_HOME\skills` | 支持 | 支持 | 支持 | 支持 |
| `$DSH_AGENTS_HOME\skills` | 支持 | 不支持 | 不支持 | 不支持 |

公共 Agent 目录在界面和服务端均为只读，用于避免误改共享的全局技能元数据。

## 安装

环境要求：Node.js 20 或更高版本，以及可正常运行的 DeepSeek Harness Web 环境。

在插件仓库的上级目录执行：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
git clone https://github.com/MichengAI/dsh-skills-manager.git dsh-skills-manager
Set-Location .\dsh-skills-manager
dsh plugin --profile web add .
```

重启 DSH 后，打开「设置 → 技能」。若仍显示旧页面，请在安装插件后重新加载当前 Web profile。

## 使用说明

1. 打开「设置 → 技能」。面板会区分「DSH 技能」和「公共 Agent 技能」，并展示每个技能的名称、形态、说明和调用状态。
2. 仅在「DSH 技能」分组中使用「启用」或「停用」。它会同步控制模型调用和 `/` 手动命令，且不会改写 `SKILL.md` 的其他元数据。
3. 点击右上角「上传插件」，选择插件目录中的 `SKILL.md`；整个插件目录会复制到 `$DSH_HOME\skills`。
4. 若客户端无法提供所选文件路径，在弹窗中点击「选择插件文件夹」，并选择包含 `SKILL.md` 的目录。
5. 遇到同名技能时，根据提示确认是否覆盖；仅在「DSH 技能」分组中使用「删除」移除不再需要的插件。
6. 「公共 Agent 技能」仅供智能查看，不提供启停、上传、覆盖或删除，以保护共享的全局技能元数据。

## 开发与验证

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
node test\core-test.mjs
```

## 项目文档

项目状态、使用边界、技术架构和迭代记录从[文档交接入口](docs/00-交接入口/00-阅读导航.md)开始；详细操作说明见 `docs\02-产品与业务\01-使用说明.md`。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。
