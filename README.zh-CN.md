<p align="center">
  <img src="assets/icon.png" alt="DSH Skills Manager" width="96">
</p>

<h1 align="center">DSH Skills Manager</h1>

<p align="center">
  <strong>通过 npm 安装的 DeepSeek Harness Web 插件，用于安全管理本地技能。</strong>
</p>

<p align="center">
  <a href="https://github.com/MichengAI/dsh-skills-manager/issues">反馈问题</a>
  · <a href="https://www.npmjs.com/package/@michengai/dsh-skills-manager">在 npm 查看</a>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache License 2.0"></a>
  <a href="https://www.npmjs.com/package/@michengai/dsh-skills-manager"><img src="https://img.shields.io/npm/v/%40michengai/dsh-skills-manager?label=npm" alt="npm 包"></a>
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
- **更安全的导入**：拒绝从 DSH 技能目录自身、其父目录或子目录导入，也拒绝符号链接。
- **弹窗行为可预期**：按 ESC 只关闭当前上传框或确认框，不会关闭设置页面。

## 目录权限

| 目录 | 查看 | 启用/停用 | 上传/覆盖 | 删除 |
| --- | --- | --- | --- | --- |
| `$DSH_HOME\skills` | 支持 | 支持 | 支持 | 支持 |
| `$DSH_AGENTS_HOME\skills` | 支持 | 不支持 | 不支持 | 不支持 |

公共 Agent 目录在界面和服务端均为只读，用于避免误改共享的全局技能元数据。

## 安全行为

- 启用、停用和删除只接受单个普通技能名称，目录穿越名称会被拒绝。
- 覆盖前会先复制到同目录临时路径；复制成功前不会触碰现有技能。
- 写入接口要求 JSON 与 DSH 客户端请求标记，跨站浏览器请求无法触发本地文件操作。

## 快速开始

环境要求：可正常运行的 DeepSeek Harness Web 环境。不要在任意目录执行 `npm install`；应将插件安装到 DSH Web profile。

1. 执行：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager
```

2. 重启 DSH 或重新加载当前 Web profile。
3. 打开「设置 → 技能」。无需下载源码。

若软件源镜像尚未同步最新版本，可在安装命令末尾添加 `--registry=https://registry.npmjs.org/`。

## 使用技能面板

| 目标 | 操作 | 范围 |
| --- | --- | --- |
| 查看技能 | 打开「设置 → 技能」，查看名称、形态、说明和调用状态。 | DSH 与公共 Agent 技能 |
| 启用或停用 | 点击「启用」或「停用」。它会同步控制模型调用和 `/` 手动命令，不会改写 `SKILL.md` 的其他元数据。 | 仅 DSH 技能 |
| 上传插件 | 点击「上传插件」，选择插件目录内的 `SKILL.md`。DSH 会复制完整目录，包括脚本和资源。 | 仅 DSH 技能 |
| 改选插件目录 | 若所选文件没有可用路径，点击「选择插件文件夹」，并选择包含 `SKILL.md` 的目录。 | 仅 DSH 技能 |
| 覆盖或删除 | 同名时按提示确认覆盖；使用「删除」移除不再需要的 DSH 本地技能。 | 仅 DSH 技能 |
| 查看公共技能 | 查看公共 Agent 技能，不修改其元数据。 | 只读 |

按 ESC 只关闭最上层上传框或确认框，设置页保持打开。

## 开发与验证

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
node test\core-test.mjs
```

## 项目文档

项目状态、使用边界、技术架构和迭代记录从[文档交接入口](https://github.com/MichengAI/dsh-skills-manager/blob/master/docs/00-%E4%BA%A4%E6%8E%A5%E5%85%A5%E5%8F%A3/00-%E9%98%85%E8%AF%BB%E5%AF%BC%E8%88%AA.md)开始；详细操作说明见仓库中的 `docs\02-产品与业务\01-使用说明.md`。

## 维护者发布

本包已发布为 [`@michengai/dsh-skills-manager`](https://www.npmjs.com/package/@michengai/dsh-skills-manager)。发布新版本时执行：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm version patch
npm publish
```

发布前会由 `prepublishOnly` 自动运行核心测试。包始终发布到官方 npm registry；可先执行 `npm run pack:check` 检查 tarball 内容。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。
