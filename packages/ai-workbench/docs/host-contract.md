# DSH 0.1.1-rc.2 宿主接入契约

## 已验证的运行时契约

- 客户端插件必须在 `inject` 中显式声明所读取的服务。
- 工作台使用 `slots`、`sessions` 与 `workspaces`；其中 `workspaces` 是 DSH 的 `WorkspaceRuntime`。
- `WorkspaceRuntime` 通过 `getSnapshot()` 返回工作空间状态，并通过 `subscribe(listener)` 通知变化。
- 会话打开由 `sessions.open(sessionId)` 完成。
- 官方设置插件拥有 `sidebar.settings`；工作台不得注册或重新声明该 slot。
- `shell.overlay` 是当前 DSH 版本可安全叠加的扩展点，工作台以该入口加载。

## 适配规则

1. 只访问已显式注入的宿主服务，禁止通过 `ctx` 猜测未注入字段。
2. Work 页面把 `workspaces.getSnapshot()` 作为工作空间列表的唯一真实来源；不可用时展示明确的空状态。
3. 订阅工作空间更新时必须在卸载时取消订阅。
4. “添加工作空间”必须复用 DSH 官方工作空间流程，不能假设存在 `pickDirectory()` API。
5. 设置入口由官方侧栏提供；工作台内的“高级管理”仅作受控引导。

## 验证方式

- 单元测试断言 `workspaces` 被注入、传给 Provider，并能读取 Runtime 快照。
- 在真实 DSH 0.1.1-rc.2 运行时加载插件，确认 Diagnostics 无兼容性失败、工作空间选择列表可见且更新。
