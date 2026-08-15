# dsh-skills-manager

[English](README.en.md) | 中文

用于 DeepSeek Harness（DSH）的 Web 插件，在「设置 → 技能」中管理 DSH 本地技能，并安全地查看和启停公共 Agent 技能。

## 功能

- 展示 `$DSH_HOME\skills` 和 `$DSH_AGENTS_HOME\skills` 中的技能名称、说明、形态及启用状态。
- 启用或停用任一目录中的技能：仅更新 `SKILL.md` 的 `disable-model-invocation`。
- 仅向 `$DSH_HOME\skills` 上传插件：优先使用系统原生文件选择器选择 `SKILL.md`；无法取得文件路径时，可选择包含该文件的插件目录。
- 上传同名插件时，明确确认后才覆盖。
- 仅删除 `$DSH_HOME\skills` 中的插件，且删除前需要确认。
- 支持使用 ESC 从内到外关闭确认框或上传框，不会关闭设置页。

## 目录权限

| 目录 | 查看 | 启用/停用 | 上传/覆盖 | 删除 |
|---|---|---|---|---|
| `$DSH_HOME\skills` | 支持 | 支持 | 支持 | 支持 |
| `$DSH_AGENTS_HOME\skills` | 支持 | 支持 | 不支持 | 不支持 |

公共 Agent 目录是共享目录。客户端不会提供上传或删除入口，服务端也会拒绝相应请求。

## 环境要求

- Node.js 20 或更高版本。
- 已安装可运行的 DeepSeek Harness Web 环境。

## 安装

在插件仓库的上级目录执行：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
git clone <仓库地址> dsh-skills-manager
Set-Location .\dsh-skills-manager
dsh plugin --profile web add .
```

重启 DSH 后，打开「设置 → 技能」。若页面仍显示旧界面，请确认运行中的 Web profile 已重新加载此插件。

## 使用说明

1. 在「设置 → 技能」查看 DSH 技能与公共 Agent 技能分组。
2. 使用每个条目的「启用」或「停用」按钮切换可用状态。
3. 点击右上角「上传插件」，选择插件目录中的 `SKILL.md`；插件目录会完整复制至 DSH 技能根目录。
4. 上传同名插件时，根据提示确认是否覆盖。
5. 仅在 DSH 技能分组中使用「删除」移除不再需要的插件。

更完整的使用边界见 `docs\02-产品与业务\01-使用说明.md`，部署与验证见 `docs\05-工程交付\01-安装验证与发布.md`。

## 开发与验证

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
node test\core-test.mjs
```

## 项目结构

- `lib\core.js`：技能扫描、启停、导入与删除。
- `lib\index.js`：本机 HTTP 接口与权限边界。
- `lib\client.js`：设置页界面、原生选择器与弹窗交互。
- `test\core-test.mjs`：核心行为与客户端静态约束测试。
- `docs\00-交接入口\00-阅读导航.md`：开发交接入口。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。
