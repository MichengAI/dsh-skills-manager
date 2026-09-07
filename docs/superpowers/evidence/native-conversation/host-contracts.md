# DSH 原生接入契约证据

记录日期：2026-09-06
安装版本：`@deepseek-ai/dsh 0.1.1-rc.2`

本文件记录 NC01 已从安装包源码/类型声明核验到的事实。它不是 DSH SDK 的替代文档；工作台只使用后续仍通过运行时探针验证的接口。

## 根布局与槽位

证据文件：

`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/slots.d.ts`

- `slots.renderSlot(key, owner)` 的 ctx 级渲染入口只接受 `root`；其他槽位由组件 props 传入的 `renderSlot` 渲染。
- `root` 是唯一单槽位，官方布局占用它，并在该 root entry 中声明 `sidebar`、`conversation`、`details`、`shell.overlay`。
- 官方文档明确说明：注册新的 `root` 会替换整个中心框架及其子槽位；全局浮层应使用 `shell.overlay` 列表槽位。

证据文件：

`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js`，约 406–435 行

- 官方 `ui-layout` 注册 `name: "root"`，声明四个子槽位，并通过 `layout.attachPanels(actions)` 提供布局动作。
- `conversation` 是 `kind: "single"`、`scope: "session-maybe"`；官方 ConversationRoot 拥有无会话首页和有会话对话两种状态。
- `details` 是 `kind: "single"`、`scope: "session"`；`shell.overlay` 是 root 级列表槽位。

影响：工作台要保留左栏并接入原生对话，必须验证“替换 root 为工作台 RootFrame”或“复用官方 root 并定制 sidebar”其中一种方案。单独叠加 overlay 无法满足目标。

## 原生会话能力

证据文件：

`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/contract/session.d.ts`

已确认的 session outward face 包含：

- `prompt(content, mode, signal)`：发送带文本/图片内容的消息，返回接受结果；
- `command(line)`：对当前 session 执行完整斜杠命令，返回命令是否匹配；
- `open()`、`loadOlder()`、`cancel()`、`rename()`；
- `subscribe()`、`getSnapshot()`：读取原生会话投影。

证据文件：

`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/session.d.ts`

- `Session.command(line)` 是直接调用远端命令执行的真实会话能力；不能在 Chat 仅靠 UI 隐藏菜单来限制它。
- `Session.prompt` 的输入内容是宿主定义的 `PromptContentPart[]`，不能把工作台内部草稿对象直接传入。

## 原生输入、命令与技能

证据文件：

`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/input/facade.d.ts`

已确认 `SessionInputShell` 提供：

- `setDraft()`、`submit()`、`addImages()`、`commitSend()`；
- `track()`、`arbitrate(key, composing)`；
- `insertReference()`、`beginCommand()`、`consumeToken()`；
- `lexicon`、`notices`、`bindMirror()`。

证据文件：

`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/types/client/contract.d.ts`

- `ctx.inputTriggers.registerSource(source)` 注册 `InputTriggerSource`；
- `source` 以 `/` 或 `@`、候选查询、`onPick`、可选 codec/lexicon 构成；
- 选择结果通过 `ReferenceInsert`/`CommandClaim` 进入输入机，而不是工作台自行拼接纯文本。

证据文件：

`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/types/client/contract.d.ts`

- `ctx.commandUi` 是动态 host command 目录与每会话 popup 控制器；它把 host command 和客户端贡献合并。
- `CommandUiRuntime` 使用 `remote.commands.list(sessionId)` 动态读取命令，执行通过 `remote.commands.execute(sessionId, line, images)`。
- 业务包可以注册 `commandUi.register` 或 `decorate`，但不能伪造 host command 目录。

证据文件：

`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-skill/lib/client.js`，约 292–318 行

- 原生技能以 `/` 触发源注册，候选来自当前 session 的技能目录；选择后插入 `/${candidate.name} `。
- 该插入行为本身不执行技能；实际执行仍由命令/技能宿主链路处理。

## 本轮真实宿主验证（2026-09-07）

在隔离 DSH Web 实例（`@deepseek-ai/dsh 0.1.1-rc.2`、Node 24 runtime）中重新构建并加载当前 worktree，未发送消息、未上传文件。

- 工作台自定义左栏与 DSH 官方右侧 ConversationRoot 同时正常加载；页面没有插件加载错误。
- Work 点击“新建任务”后，创建的原生会话快照显示 `displayTitle: output`、`cwd: /Users/yekechao/Documents/deepseekh/output`，输入框 `readonly` 为空、命令按钮可用。
- Chat 点击“新建对话”后，输入框可编辑、命令按钮可用；输入 `/` 出现真实技能候选 `aihot`，不是工作台静态列表。
- Chat 命令菜单由 DSH 原生目录提供，实测出现 `export`、`permission`、`model`；Work 菜单此前实测出现 `compact`、`export`、`permission`、`plan`、`model`。
- 点击 Work 历史项 `AI热点动态查询概述` 后，右侧展示完整原生消息流、Skill/工具轨迹、详情入口和可继续输入框；点击 Chat 历史项 `聊天验证成功提示` 后，右侧展示 Chat 预设消息流和可继续输入框，左栏保持不变。
- 最终干净实例控制台日志为空；本轮没有发送新的模型消息或上传文件，历史项仅用于读取已有会话。
- 发现并修复两类会话问题：`sessions.create()`/`connectWorkspace()` 返回的结构化结果解析，以及同一 `draftKey` 下旧 prepared 会话覆盖新原生 sessionId；新增会话现在优先创建新的 workspace session，避免复用重启后失活的空会话。
- 单元/集成测试最终为 257/257 通过；构建产物与包检查由测试矩阵覆盖。

## 尚未通过运行时验证的契约

- 当前插件上下文是否能安全获得 `commandUi`、`inputTriggers`、conversation input facade 以及对应 session scope；
- 工作台首页无 session 时如何获得符合宿主生命周期的“准备会话”，以及准备是否会产生可见历史；
- Chat 命令/技能拒绝应挂在 `remote.commands.execute`、host command registry、agent preset 还是更低层的 agent 权限入口；
- 以当前插件加载顺序注册 root 时，如何避免官方 root 和工作台 root 同时存活。
- Chat 直接调用 `Session.command(line)` 时，服务端是否会拒绝所有 Work 权限命令；原生命令菜单被过滤不等于服务端安全闭环。

## 已完成的最小运行时验证

在隔离 profile 的实例中加载当前 worktree 后，工作台成功出现，严格兼容探针没有报告 `slot:root`、`layout:attachPanels`、`inputTriggers:registerSource` 或 `commandUi:register` 缺失，控制台没有插件加载 error。该验证没有改变正式入口，也没有发送消息。

尚未完成的两项不应被这次加载结果掩盖：

1. 需要实际替换/组装 root 后，验证官方 root 不与工作台 root 双重存活；
2. 需要在真实 Chat session 上验证直接调用命令入口时服务端仍拒绝 Work 权限命令；这仍是发布前阻塞项。

这些项目必须由 NC01 的最小运行时原型或后续宿主扩展确认，未确认前不实现猜测性的调用。
