# 正方 AI 工作台：原生对话、命令与技能实施开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首页发送和历史访问均留在工作台；首页及会话输入框均支持真实 DSH 命令、技能引用；Chat 继续保持问答权限边界。

**Architecture:** 工作台负责稳定的左栏、首页和导航状态，DSH 负责右侧原生对话、会话输入、工具执行、审批与详情。用小型适配层衔接原生服务，不复制消息引擎，不采用 iframe，不同时挂载两套活动输入框。

**Tech Stack:** 现有 JavaScript ESM、React 18、DSH 插件/槽位机制、Node test runner、esbuild；沿用现有样式和品牌资产。DSH 接口以执行时实际安装版本核验结果为准。

## 1. 范围、基线与交付规则

- 依据：[已完成的设计文档](../specs/2026-09-06-workbench-native-conversation-design.md)。本计划细化其 N01–N15，不代表此前全部整改任务已验收。
- 用户确认：两个模式、首页及会话输入均需支持；Chat 继续限制执行能力。Chat 的技能入口可以展示无可用技能状态，不为满足“可点”而放开执行权限。
- 本轮仅编制计划，所有开发复选框初始未完成。
- 工作目录：`/Users/yekechao/Documents/deepseekh/dsh-skills-manager/.worktrees/workbench-remediation`，当前分支 `fix/workbench-remediation`。执行前重新检查状态；不覆盖已有改动，不自动合并。
- 以下文件路径除特别说明外均相对该工作目录；`P` 表示 `packages/ai-workbench`。新增文件是计划中的内部模块，不是声称存在的宿主 API。
- 不开发工作空间页面、数据看板、成果空间、智能体广场、AI 工具集；已有占位提示保留。工作任务的 workspaceId 绑定仍需正确。
- 不变更品牌方向，不重画首页，不增加新后台、登录系统或云部署。
- 每个任务按“写失败测试/复现 → 最小修改 → 定向验证 → 回归 → 记录证据 → 独立提交”执行。需要宿主证据的任务，模拟测试通过不算完成。
- 只修改 `src/` 等源文件，构建产物由脚本生成。测试数据使用独立测试会话，不删除真实历史或重写用户权限配置。

### 当前执行进度（2026-09-07）

- 已落地 NC02 的 prepared/active 会话路由、原生 sessionId 绑定和 stale prepared 覆盖规则；新会话不会复用重启后失活的空会话。
- 已落地 NC03–NC05 的固定工作台左栏、原生 ConversationRoot、Work/Chat 新建会话和首页草稿转移；Work/Chat 两条真实 smoke 均可编辑。
- 已落地 NC06 的原生命令/技能入口复用；命令菜单来自 DSH 动态目录，`/` 技能候选来自当前 session。
- NC07 仍未完成：尚未用真实 Chat session 直接调用 `Session.command(line)` 验证服务端拒绝 Work 权限命令，不能宣称 Chat 安全闭环完成。
- NC08 目前仅完成真实技能候选接入 smoke；结构化引用的完整选择、取消、恢复和发送轨迹仍需继续实现。
- NC12 已执行部分真实 smoke，完整 N01–N15 矩阵仍未全部登记；本计划继续保持未完成状态。

### 已核验的代码问题

| 位置 | 当前情况 | 本计划处理 |
|---|---|---|
| `P/src/client.js` | 注册在 `shell.overlay`，导航会触发关闭回调 | 接入唯一根布局，分离导航与覆盖层开关 |
| `P/src/client/workbench-overlay.js` | 空槽位渲染、未接入原生会话 hook | 退出主要承载路径，仅保留明确的兼容入口 |
| `P/src/client/root.js` | 存在未启用原型；Shell 参数传 `config` | 核验槽位协议后启用，校正 `chatConfig` 传递 |
| `P/src/host/session-gateway.js` | 创建后直接 prompt；能力作为提示文本追加 | 拆分准备与发送职责，接入真实结构化引用 |
| `P/src/host/chat-preset.js` | 有问答预设与组成检查 | 补查原生命令入口是否可改变预设或权限 |

## 2. 阶段、依赖与放行条件

| 阶段 | 任务 | 交付结果 | 放行条件 |
|---|---|---|---|
| A 兼容验证 | NC00–NC01 | 接口证据、最小原生接入验证 | 根布局、输入引用、服务端权限均有可行路径 |
| B 会话闭环 | NC02–NC05 | 数据契约、固定左栏、导航、首条消息 | Work/Chat 发消息和访问历史无需离开工作台 |
| C 命令与技能 | NC06–NC09 | 两处菜单、真实执行、Chat 拒绝边界 | 菜单不是静态假数据；拒绝策略不能绕过 |
| D 稳定性与体验 | NC10–NC11 | 审批、恢复、详情、键盘和布局 | 出错不丢输入、不重复发送、不遮挡操作 |
| E 验收发布 | NC12–NC13 | N01–N15 证据、包检查、回滚演练 | 全部必测项通过，阻塞项为零 |

主依赖：NC00 → NC01 → NC02 → NC03 → NC04 → NC05 → NC06 → NC07 → NC08 → NC09 → NC10 → NC11 → NC12 → NC13。

NC07 权限策略的纯函数与测试可在 NC02 后准备；NC08 目录和引用转换可在 NC01 后准备。但原生接入点未确认前不得先写假桥接；共享 `client.js`、store 和 gateway 的变更串行集成。完成阶段 A 后才评估工作量与排期，避免对未知宿主扩展能力给出虚假工期。

## 3. 实施任务

### NC00｜冻结基线与建立证据目录

**修改/新增：** `docs/superpowers/evidence/native-conversation/baseline.md`、`host-contracts.md`、`acceptance.md`；不修改业务代码。依赖：无。

- [x] 记录当前分支、HEAD、工作区状态、DSH/Node/包版本、启动方式和已有配置位置；不得输出密钥。
- [x] 执行 `npm --prefix packages/ai-workbench test` 和 `npm --prefix packages/ai-workbench run pack:check`，分别保存退出码及摘要；已有失败单独登记，不掩盖。
- [x] 在真实 DSH 中记录当前首页与工作台入口的页面结构证据；仅查看已有内容，未发送消息或上传文件。
- [x] 确认隔离分支与回滚基点；如需新分支，在当前已确认 HEAD 上建立，不切回其他基线丢失修复。

**验收：** 基线可复现；历史测试数量不作为本次通过证据。提交建议：`docs: record native conversation baseline`。

### NC01｜验证原生扩展契约（强制技术门）

**检查/修改：** `P/src/client/root.js`、`P/src/shared/compatibility.js`、`P/test/root-contract.test.mjs`、`P/test/compatibility.test.mjs`；证据写入 `host-contracts.md`。依赖：NC00。

- [x] 检查已安装 DSH 的 root、sidebar、conversation、details、shell.overlay 注册方式与所有权；列出真实服务名、入口签名、作用域、销毁方式和源码位置。
- [x] 验证组件获得的子槽位 `renderSlot`，不假设上下文上的根槽位 API 能渲染子槽位；确认 `layout.attachPanels` 等方法的实际可用性。
- [x] 确认原生输入服务的公开访问方式、命令目录、技能目录、reference 序列化、附件写入、发送回执及会话准备条件。源码存在内部函数不等于插件可调用。
- [x] 核验所有命令执行路径与权限变更路径，确定服务端可拦截点；必须覆盖原生 UI/粘贴命令/直接执行入口。
- [x] 编写最小契约测试：缺失服务可识别、重复槽位被避免、加载卸载不残留、两个模式能加载原生会话。
- [x] 在隔离配置中验证最小插件注入原型，不更换正式入口；记录可行/不可行及证据。
- [ ] 在真实 Chat session 上验证直接调用命令入口时服务端仍拒绝 Work 权限命令；未通过前不得发布 Chat 命令能力。

**决策：** 优先根布局接入。若只能沿用原生根布局并定制左栏，必须证明相同用户行为可实现并更新设计；若输入服务或服务端策略无法接入，列出所需宿主扩展，停止依赖任务并向用户说明，不能用模拟菜单或隐藏按钮替代。

**验收：** 三项能力均明确可实现：单根原生页面、两处原生输入能力、Chat 服务端约束。提交建议：`test: verify native host integration contracts`。

### NC02｜状态契约与准备会话生命周期

**修改：** `P/src/shared/contracts.js`、`P/src/client/store.js`、`P/src/client/api.js`、`P/src/host/session-gateway.js`、`http.js`、`repository.js`；对应 `client-store`、`session-gateway`、`repository`、`migration` 测试。依赖：NC01。

- [ ] 先补测试：同一草稿重复准备返回同一会话；Work/Chat 准备状态隔离；旧元数据不含 lifecycle 时仍可读取。
- [ ] 定义导航 mode/route/sessionId、首页草稿 revision、structured references、prepared/active 生命周期和操作状态。不要存储宿主内部对象或完整二进制到导航状态。
- [ ] 将创建会话与提交消息拆开；准备过程绑定正确预设和 workspaceId，不触发模型调用。
- [ ] 服务端保存草稿准备操作关联，处理重试、并发、返回会话 ID 与请求 ID 不同等情况。浏览器按钮禁用不是幂等保障。
- [ ] prepared 会话从工作台普通历史过滤；有真实消息或有效命令记录后转 active；不自动删除宿主会话。
- [ ] 旧字段兼容读取，新字段增量添加；异常保留已创建 sessionId，禁止失败后无条件新建。

**验收：** 准备不扣模型调用；重试不产生多会话；新旧数据可读。提交建议：`feat: add prepared session lifecycle`。

### NC03｜固定左栏与原生根布局

**修改：** `P/src/client.js`、`client/root.js`、`client/shell.js`、`client/sidebar.js`、`client/workbench-overlay.js`、`client/styles.js`；测试 `client-loader`、`root-contract`、`shell`、`workbench-overlay`。依赖：NC02。

- [ ] 先写加载测试：只能有一个主根节点；不重复声明 `sidebar.settings`；原生 conversation/details/overlay 仍可渲染。
- [ ] 将 provider 生命周期固定在根节点，接入真实会话 hook；修正 `chatConfig` 参数，去除“进入对话即关闭工作台”的主要路径。
- [ ] 左栏稳定挂载，右侧切换首页/会话/错误页；搜索词、滚动位置和模式状态不因右侧内容变化而清空。
- [ ] 让设置、详情和审批由真实槽位渲染，不以空渲染函数替代；核对 z-index 与事件遮挡。
- [ ] 提供明确的主动“切换到 DSH”入口；兼容开关默认策略在 NC13 验证后确定，不能报错时悄悄跳走。

**验收：** 真实宿主无 loader error，无双侧栏/双输入框；设置可打开。提交建议：`feat: mount workbench native conversation shell`。

### NC04｜统一导航、历史与刷新恢复

**新增：** `P/src/client/session-navigation.js`、`P/test/session-navigation.test.mjs`。
**修改：** `client/store.js`、`sidebar.js`、`shell.js`、`automation-detail.js` 及相关测试。依赖：NC03。

- [ ] 将首页成功发送、历史项、自动化“查看对话”统一到一个导航适配器。
- [ ] 用 operationId/递增请求序号保证 A→B→C 快速点击后仅 C 生效；忽略过期加载结果。
- [ ] 修正首页清空宿主当前会话 effect 的触发条件，避免其取消刚发生的导航。
- [ ] 刷新时先核验保存的 sessionId 和 mode，再恢复会话；不执行发送和重新创建。
- [ ] 删除/不可访问会话只在右侧显示错误与返回首页入口，左栏保留；后台任务不因导航停止。
- [ ] 首页按模式保存草稿，会话草稿按 sessionId 隔离；历史高亮以已确认导航结果为准。

**验收：** N03/N04/N13；无串会话和刷新重复发送。提交建议：`feat: unify workbench session navigation`。

### NC05｜首页到原生输入的单次发送链路

**新增：** `P/src/client/home-composer-bridge.js`、`P/test/home-composer-bridge.test.mjs`。
**修改：** `client/work-home.js`、`chat-home.js`、`store.js`、`api.js`、`image-input.js`、`host/session-gateway.js`；测试 `work-home`、`client-ui`、`image-input`。依赖：NC04。

- [ ] 先写失败测试：双击只发一次；创建成功发送失败可复用；旧回执不清空新草稿；附件与引用完整转移。
- [ ] 基于 NC01 已证实的接口，将首页输入接入原生输入服务或受支持的适配器，等待 session/input ready 后转移文本、附件及 references。
- [ ] 对同一条首页消息只选一个发送所有者：原生发送；停用同消息的旧 `start → prompt` 路径。
- [ ] 明确发送回执与“模型回复完成”的区别；只有接受成功且 draftRevision 未变化时清理对应草稿。
- [ ] 遇到回执丢失，先查询可确认的提交状态；不能确认时展示“状态待确认”，不自动再次提交。若宿主有幂等键则使用经核验的机制。
- [ ] Work 保留工作区/模型/审批配置；Chat 使用限制预设。附件类型沿用当前真实支持范围，不把非图片硬转为 image。

**验收：** N01/N02/N10；右侧原生流式消息可续问，网络失败输入不丢。提交建议：`feat: bridge home drafts to native composer`。

### NC06｜两处动态命令菜单

**新增：** `P/src/client/command-adapter.js`、`P/test/command-adapter.test.mjs`。
**修改：** `client/home-composer-bridge.js`、`work-home.js`、`chat-home.js`；原生会话扩展接点按 NC01 定位。依赖：NC05。

- [ ] 测试动态增删命令、无目录/错误、中文输入法、Esc、方向键和 Enter 的选择行为。
- [ ] 首页与会话复用原生目录和执行协议；命令按钮与 `/` 指向同一菜单，不硬编码截图列表。
- [ ] 按命令元数据区分无需会话、需准备会话、需历史记录；只有有意选择需会话命令时才准备。
- [ ] `compact/export` 在无历史首页禁用并解释原因；`model` 按宿主支持执行；未知命令明确报错，不作为普通提示词偷偷发送。
- [ ] 当前命令执行完成/失败用原生结果反馈；菜单变化按会话/模式重新计算，不复用越权缓存。

**验收：** N05/N06；两处菜单及真实操作一致。提交建议：`feat: integrate native command menus`。

### NC07｜Chat 命令与执行权限闭环

**新增：** `P/src/shared/mode-command-policy.js`、`P/test/mode-command-policy.test.mjs`。
**修改：** `P/src/host/chat-preset.js`、`P/src/host/mode-service.js`、`P/src/index.js`；服务端拦截位置以 NC01 证据为准。依赖：NC06，策略测试可提前。

- [ ] 建立经分类的命令允许表；未知/新增命令默认拒绝。model/compact/export 仅放行经验证的安全变体；反馈上传需显式确认。
- [ ] UI 可用性和服务端准入使用一致策略，但服务端独立验证会话真实 mode、命令 ID、参数和工具能力，不能信任前端 mode。
- [ ] 拒绝权限切换、执行型 plan/goal、系统/文件写入/电脑控制/执行技能等路径；保持已确认的问答和受控联网能力。
- [ ] 实测粘贴命令、直接调用原生命令入口、切换到 DSH 后访问同一 Chat 会话均不能升级权限。
- [ ] 检查会话创建、恢复和设置变更时限制是否持续生效；不因菜单隐藏就认定安全。

**验收：** N08；违规操作在真实执行前被拒绝，并有可理解原因。没有可用服务端钩子时本任务阻塞，不能发布完整功能。提交建议：`fix: enforce chat command and tool restrictions`。

### NC08｜真实技能目录与结构化引用

**新增：** `P/src/client/capability-reference-adapter.js`、`P/test/capability-reference-adapter.test.mjs`。
**修改：** `client/capability-source.js`、`capability-library.js`、`home-composer-bridge.js`、`host/capability-resolver.js`、`capability-service.js`、`session-gateway.js`；相关 capability 测试。依赖：NC07。

- [ ] 核对实际技能注册表，映射稳定 ID、来源、名称、描述和启用/健康状态；同名不同来源明确区分。
- [ ] 首页和会话都调用原生选择/序列化机制，使用经核实的触发方式，不自行假设 `@` 或 `$`。
- [ ] 选中技能写入真实 reference，不只是追加名称；取消选择后 reference 必须同步移除。
- [ ] 修复“显示已选但 resolver 未选/执行仍使用旧选择”等状态不一致，分别测试单选、多选、取消、切换模式和恢复草稿。
- [ ] 发送前重新校验技能可用性；已禁用/删除/引用失效时阻止发送并允许移除引用后继续，不能静默替换同名技能。
- [ ] Chat 仅列出真正允许的能力；没有可用技能时显示原因与显式切换 Work 入口，不自动转移输入和附件。

**验收：** N07/N12；选择本身不执行，发送后可见真实调用轨迹和结果。提交建议：`feat: preserve native skill references`。

### NC09｜联合场景与模式切换

**新增：** `P/test/native-composer-flow.test.mjs`；修改上述适配器的必要集成点。依赖：NC08。

- [ ] 验证首页“选模型 → 选技能 → 加附件 → 发送”与会话续问使用同一会话配置和引用集合。
- [ ] 验证 Work/Chat 草稿互不覆盖；切到另一模式不会把 Work 执行技能传入 Chat。
- [ ] 验证空首页只打开菜单不创建大量会话；多次失败重试仍复用 prepared 会话。
- [ ] 验证历史会话恢复命令上下文正确，不继承另一会话的模型/技能/审批状态。

**验收：** 联合流程完整，无测试替身掩盖的宿主调用缺失。提交建议：`test: cover native composer integration flows`。

### NC10｜审批、详情和错误恢复

**修改：** `client/root.js`、`shell.js`、`dialog.js`、`session-navigation.js`、`home-composer-bridge.js`、`styles.js`；新增 `P/test/native-error-recovery.test.mjs`。依赖：NC09。

- [ ] 模拟离线、服务超时、目录失败、会话不可用、部分流式响应后断线；错误分类显示，保留可重试内容。
- [ ] 工具详情、审批和设置复用原生流程；设计受控测试操作，确认批准前没有副作用、拒绝后没有继续执行。
- [ ] 返回首页/切换会话只改变展示，不停止后台任务；显式停止按钮按原生语义停止当前任务。
- [ ] 取消过期加载、清理订阅与监听；反复进出页面不累积事件、不重复弹窗。
- [ ] 原生服务不可用时显示准确错误和重试入口，不以空白页或假成功隐藏问题。

**验收：** N09/N10/N11；错误恢复后仍能发送与继续对话。提交建议：`fix: stabilize native conversation recovery and approvals`。

### NC11｜布局、键盘与焦点验收修整

**修改：** `client/styles.js`、`root.js`、`sidebar.js`、`dialog.js` 及菜单适配器；沿用品牌资产。依赖：NC10。

- [ ] 对比同尺寸设计参考与实际截图，检查左栏、主区留白、输入框、详情区域；不借此改造已确认首页。
- [ ] 检查 1280、1440、1920 宽度和小于 1024 的折叠侧栏/详情抽屉，不遮挡输入和发送按钮。
- [ ] 验证 Tab 顺序、菜单方向键、Esc 关闭、弹窗焦点锁定与返回；输入法选词 Enter 不触发发送。
- [ ] 会话切换时焦点合理恢复，流式消息不强夺焦点；用户向上阅读时不强制滚到底部。
- [ ] 菜单、审批、详情、设置同时出现时层级明确；禁用态有原因，图标按钮有可访问名称。

**验收：** N05/N11/N14；附视口、操作状态与截图对照说明。提交建议：`fix: polish native workbench layout and focus`。

### NC12｜逐项真实验收

**修改：** `docs/superpowers/evidence/native-conversation/acceptance.md`，仅必要回归测试。依赖：NC11。

- [ ] 执行下方 N01–N15 矩阵；每项登记时间、版本、操作、预期、实际、证据路径和通过/失败/阻塞。
- [ ] 对两个输入位置分别执行命令和技能流程；不得只验首页或只看菜单弹出。
- [ ] 每个缺陷回到归属 NC 任务修复后重新跑关联项；保留失败证据与重测结果。
- [ ] 执行包完整测试及构建；记录真实宿主控制台/网络失败和修复结果，不只报告测试总数。

**验收：** 所有必需行为有真实证据；任何“未测”“依赖缺失”不得标通过。提交建议：`test: verify native workbench acceptance matrix`。

### NC13｜打包、配置开关与回滚

**修改：** `P/src/shared/compatibility.js`、必要入口开关、`P/README.md`、`P/test/build-regression.test.mjs`、`generated-output.test.mjs`、`package-contract.test.mjs`；新增证据 `release-rollback.md`。依赖：NC12。

- [ ] 开关只决定布局入口，不改变 Chat 的安全预设；未知宿主版本进入明确兼容提示，不尝试危险注册。
- [ ] 核对打包包含新模块与资产，入口依赖声明与实际版本一致；运行 verify 和 dry-run 包检查。
- [ ] 在隔离配置验证启用新布局、关闭回旧入口、再次启用；三次均能加载同一历史和草稿，无重复注册。
- [ ] 记录基线/候选提交、包校验值、配置备份和恢复步骤；不使用破坏性 Git 回退，不删除新生成的用户数据。
- [ ] 只有 NC12 全通过才建议切换正式配置；未完成的宿主依赖明确写为发布阻塞。

**验收：** N15；回滚不仅能打开首页，还要能读取历史、续问、保留草稿。提交建议：`chore: package native workbench with rollback checks`。

## 4. 内部适配契约与测试约束

以下是拟定的工作台内部接口，不是 DSH SDK。NC01 确定真实绑定后再实现：

```js
// 示例契约；返回值和调用最终映射到已核验的宿主服务。
prepareDraftSession({ mode, draftKey, workspaceId }) // -> { sessionId, lifecycle }
openSession({ sessionId, operationId })              // -> 当前导航结果
transferDraft({ sessionId, revision, text, attachments, references })
submitDraft({ sessionId, operationId, revision })    // -> accepted / rejected / unknown
getCommandAvailability({ sessionId, mode, command }) // -> enabled + reason
resolveReferences({ sessionId, references })         // -> valid / stale / forbidden
```

约束：`accepted` 不能在请求发出时提前返回；`unknown` 不得自动重发；draftRevision 只控制清草稿，不能代替服务端幂等；reference 保存宿主可序列化标识，不保存内部运行对象。

测试必须包含以下断言，而不只检查字符串存在：

```js
// 作为新测试的行为模板；fixture 名称由任务实现，不是现有 API。
// 1. 同草稿连续 submit 两次：底层发送次数 === 1。
// 2. rev1 等待回执时编辑为 rev2：rev1 accepted 后 rev2 文本仍在。
// 3. open(A) 比 open(B) 更晚返回：最终 sessionId === B。
// 4. Chat 从直接执行入口发 permission：执行次数 === 0，返回 forbidden。
// 5. 选中技能后禁用：提交被阻止，文本和附件保持原样。
```

定向测试（新增文件由对应任务创建后才运行；在工作目录执行）：

```sh
npm --prefix packages/ai-workbench run build
node --test packages/ai-workbench/test/session-navigation.test.mjs
node --test packages/ai-workbench/test/home-composer-bridge.test.mjs
node --test packages/ai-workbench/test/mode-command-policy.test.mjs
node --test packages/ai-workbench/test/capability-reference-adapter.test.mjs
npm --prefix packages/ai-workbench test
npm --prefix packages/ai-workbench run pack:check
git diff --check
```

预期：各命令退出码 0；测试无失败；打包清单包含新模块；diff 无空白错误。当前 npm test 会先构建，因此不能把未构建源码的测试结果当最终回归。DSH 启动命令及 Node 路径由 NC00 记录，不能因包声明 Node >=20 就假设当前宿主能在 Node20 启动。

## 5. N01–N15 验收与证据矩阵

所有真实测试使用明确标识的测试会话；需要副作用的审批测试仅操作批准的临时测试文件，不操作业务系统。

| 编号 | 对应任务 | 必须实际执行的操作 | 通过标准与证据 |
|---|---|---|---|
| N01 | NC03/05 | Work 首页发送，再续问 | 左栏持续存在、原生流式回复；页面截图+sessionId+发送计数 |
| N02 | NC05/07 | Chat 首页发送及续问 | 留在工作台、问答预设有效；截图+会话预设/工具边界证据 |
| N03 | NC04 | 快速点击三条历史，延迟第一个响应 | 最后点击生效且高亮正确，无消息串入；录屏或逐步截图+导航测试 |
| N04 | NC04 | 对话中刷新，含无效 sessionId | 有效会话恢复、无效会话可返回；会话/发送数量不增加 |
| N05 | NC06/11 | 两个输入框用 `/`、按钮和键盘，测试中文选词 | 动态菜单、上下键/Enter/Esc 正常；IME 不误发送 |
| N06 | NC06/07 | 换模型；有历史时 compact/export；无历史时测试 | 实际配置/导出结果正确；首页禁用原因明确；导出不额外上传 |
| N07 | NC08/09 | 两个输入框分别选可用技能并发送匹配请求 | 正确来源 reference、真实调用轨迹和结果；仅选中未执行 |
| N08 | NC07 | Chat 粘贴禁用命令、调用执行入口、在原生页重试 | UI 与宿主拒绝，执行次数为零；拒绝响应和审计记录 |
| N09 | NC10 | Work 发起受控需审批操作，分别拒绝和批准 | 批准前无副作用、拒绝后不执行、批准后正确执行；审批截图和测试文件状态 |
| N10 | NC02/05/10 | 双击、掉线、回执丢失、失败后编辑重试 | 不重复会话/消息；文本、附件、引用保留；发送计数及恢复截图 |
| N11 | NC03/10/11 | 打开详情、设置、模型菜单与审批 | 内容真实可操作，不遮挡、焦点能返回；截图和键盘操作记录 |
| N12 | NC08 | 草稿中技能被禁用/删除后发送 | 明确告知失效，允许移除后重试，不偷偷替换；错误和恢复证据 |
| N13 | NC04 | 自动化运行记录点击查看对话 | 同一工作台右侧打开正确会话，左栏不消失 |
| N14 | NC11 | 多视口、折叠侧栏、主动切换 DSH | 无水平溢出和按钮遮挡；主动切换可用且没有自动跳出 |
| N15 | NC13 | 新布局→旧入口→新布局 | 历史/草稿均可读、可续问、无 loader 冲突；配置和结果记录 |

## 6. 风险、止损与完成定义

1. **DSH 输入服务仅内部可用：** NC01 先验证；需要新增宿主接口时单列依赖及版本，不通过复制原生实现绕过。
2. **原生命令可修改 Chat 权限：** NC07 属发布阻塞；拒绝策略必须落在真实执行边界。
3. **创建/发送双链路：** NC02/05 限定唯一发送所有者；已发布会话失败后复用，回执未知不得盲重发。
4. **槽位声明冲突复发：** NC01/03/13 验证加载、热重载、卸载和回滚；不重新声明原生子槽位。
5. **选择技能仅视觉生效：** NC08 验证 reference 和真实执行轨迹，不能用提示词追加名称替代。
6. **数据不可回退：** 只增量元数据、旧字段兼容，不自动删除 prepared 会话；正式切换前做隔离回滚演练。

完成定义：NC00–NC13 已执行且有记录，N01–N15 全通过，完整包测试/构建/打包通过，真实宿主不存在打开失败或主要链路阻塞；剩余非阻塞问题必须明确披露。不能以“代码已写”“菜单可见”“单测全绿”替代产品验收。

## 7. 可直接用于后续开发的提示词

> 在当前隔离工作区执行本实施计划，首先阅读对应设计文档并完成 NC00–NC01。保留已有改动，先复现或写失败测试，再实现。不要凭空发明 DSH API：根布局、原生输入引用和 Chat 服务端拦截必须提供实际接口证据。通过兼容检查后按 NC02–NC13 串行集成；只修改本次范围。每个任务记录修改、测试、实际宿主证据和剩余阻塞。首页与历史访问不得自动离开工作台，两处输入均需真实命令/技能支持，Chat 不得升级执行权限。回执未知不自动重发，不以模拟测试替代 N01–N15 的真实验收。遇到需要新宿主能力或改变已确认交互的情况，说明证据并询问用户；其余按计划推进。未达到完成定义不得宣称全部完成。
