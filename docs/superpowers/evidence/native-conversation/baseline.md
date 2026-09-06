# 原生对话接入基线

记录日期：2026-09-06
工作目录：`/Users/yekechao/Documents/deepseekh/dsh-skills-manager/.worktrees/workbench-remediation`
分支：`fix/workbench-remediation`
基线提交：`368cb36 docs: design native workbench conversations and commands`

## 环境

- Node：`v20.20.2`
- npm：`10.8.2`
- DSH CLI：`@deepseek-ai/dsh 0.1.1-rc.2`
- 工作台包：`@michengai/dsh-ai-workbench 0.1.0`
- 当前 DSH Web：`http://127.0.0.1:3080/`

## Git 状态

基线开始时工作区无未提交改动；当前工作发生在已存在的隔离 worktree `fix/workbench-remediation`，没有新建嵌套 worktree。

## 自动化基线

| 命令 | 结果 | 备注 |
|---|---|---|
| `npm --prefix packages/ai-workbench test` | 通过 | 233/233，通过时间约 3.7 秒 |
| `npm --prefix packages/ai-workbench run pack:check` | 首次阻断 | 本机 `~/.npm/_cacache` 存在 root-owned 文件，npm 返回 EPERM；未修改权限 |
| `npm_config_cache=/private/tmp/dsh-ai-workbench-npm-cache npm --prefix packages/ai-workbench run pack:check` | 通过 | 73 个打包文件，包 integrity 已由 npm 输出；使用隔离临时缓存 |
| `git diff --check` | 通过 | 基线无空白错误 |

## NC01 隔离宿主验证

- 已将当前 worktree 构建产物安装到已确认的 DSH Web profile；未删除其他插件。
- 使用 Node 24 启动临时 `http://127.0.0.1:3090` 实例并打开工作台。
- 工作台成功加载，严格兼容探针所需的 `root`、`layout.attachPanels`、`inputTriggers.registerSource`、`commandUi.register` 上下文未报缺失。
- 临时实例控制台没有 error/warn；验证结束后已关闭浏览器标签页和临时进程。
- 此证据只证明宿主注入和加载条件可用；尚未注册工作台 root，也尚未验证 Chat 直接命令入口的服务端拒绝策略。

## 真实页面复现

在当前 DSH Web 打开“打开正方 AI 工作台”后，AX 树显示：

- 原生 DSH 页面仍保留在底层，包括原生左栏、设置和原生输入区；
- 正方工作台作为 `container 正方 AI 工作台` 叠加出现，并提供“返回 DSH”；
- 工作台自己的左栏和首页显示，但历史列表为“暂无历史”；
- 当前工作台是覆盖层路径，不是 DSH `root` 的唯一拥有者，因此无法直接承载原生 `conversation` 槽位；
- 现有工作台代码的 `client.js` 只注入 `shell.overlay`，`workbench-overlay.js` 用空槽位渲染器，`client/shell.js` 在首页 effect 中清理宿主当前会话。

这次观察只验证页面结构，没有发送消息、上传文件、修改设置或改变真实会话内容。

## 当前阻塞

NC01 的宿主接口核验仍需在代码改动前完成。尤其是 root 槽位的唯一拥有关系、session-maybe 的 hook 传递、输入服务和 Chat 服务端命令拦截点，必须以当前安装版本的实际接口为准。
