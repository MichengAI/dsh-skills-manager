# 原生对话接入验收记录

状态：部分完成；真实 Work/Chat 原生输入与命令/技能 smoke 已通过，N01–N15 矩阵尚未全部执行，Chat 直接命令的服务端拒绝仍是发布阻塞项。

| 编号 | 状态 | 版本/时间 | 操作与实际结果 | 证据 |
|---|---|---|---|---|
| N01 | 未测 |  |  |  |
| N02 | 未测 |  |  |  |
| N03 | 部分通过 | 2026-09-07 / 0.1.1-rc.2 | 干净宿主加载工作台；Work/Chat 左栏固定，点击历史后右侧进入 DSH 原生对话 | `host-contracts.md` 本轮浏览器记录；仍需补布局视口矩阵 |
| N04 | 通过 smoke | 2026-09-07 / 0.1.1-rc.2 | Work 新建任务、Chat 新建对话分别创建原生会话并展示可编辑输入；未发送消息 | `host-contracts.md` 本轮浏览器记录 |
| N05 | 通过 smoke | 2026-09-07 / 0.1.1-rc.2 | Work/Chat 输入 `/` 均出现 DSH 动态命令/技能候选；命令菜单可打开 | `host-contracts.md` 本轮浏览器记录 |
| N06 | 通过 smoke | 2026-09-07 / 0.1.1-rc.2 | Chat 原生命令菜单出现 `export`、`permission`、`model`；Work 出现 `compact`、`export`、`permission`、`plan`、`model` | `host-contracts.md` 本轮浏览器记录 |
| N07 | 未测 |  |  |  |
| N08 | 未测 |  |  |  |
| N09 | 未测 |  |  |  |
| N10 | 未测 |  |  |  |
| N11 | 未测 |  |  |  |
| N12 | 未测 |  |  |  |
| N13 | 未测 |  |  |  |
| N14 | 未测 |  |  |  |
| N15 | 未测 |  |  |  |

本文件中的“未测”不能在最终发布时作为通过项。

## 已执行的真实 smoke

| 场景 | 实际结果 | 证据 |
|---|---|---|
| Work 新建任务 → 原生输入 | 通过；工作区绑定为 `output`，输入可编辑，命令按钮可用 | `host-contracts.md` 本轮验证记录；隔离实例浏览器状态 |
| Chat 新建对话 → 原生输入 | 通过；输入可编辑，命令按钮可用，未发送消息 | `host-contracts.md` 本轮验证记录 |
| Chat 输入 `/` → 技能候选 | 通过；出现真实 `aihot` 候选 | `host-contracts.md` 本轮验证记录 |
| 原生命令菜单 | 通过 smoke；Work/Chat 均由 DSH 动态目录提供 | `host-contracts.md` 本轮验证记录 |
| stale prepared session 恢复 | 通过；新传入的原生 sessionId 覆盖旧 draftKey 记录 | `session-gateway.test.mjs`、`shell.test.mjs` |
