# 更新日志

[English](CHANGELOG.md)

以下记录最近发布的五个版本。

## 未发布

## 0.1.33 — 2026-09-02

- 新增默认开启的只读 `CC Switch` 来源，固定读取 `~\.cc-switch\skills`，支持来源级与逐 Skill 本地启停；旧状态文件自动补齐新来源，不会因缺少新键失败关闭。
- 用户级只读来源支持指向已知只读 Skills 根直接子目录的顶层技能链接；Provider 在加载时复验真实目标，并按真实路径去重 CC Switch 分发到 Codex、Claude 等目录的副本。
- 可写 DSH、项目来源、技能根链接、隐藏或非法目标以及任意根外目标继续拒绝，导入符号链接边界不变。

发布包：[`@michengai/dsh-skills-manager@0.1.33`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.33)。

## 0.1.32 — 2026-08-31

- 将用户 DSH、公共 Agent、Codex、Claude、Gemini、OpenCode、项目 DSH 与项目 Agent 的逐 Skill 启停全部统一为 manager 本地三态策略；启停不再改写任何来源 Skill 文件。
- 新增对来源原本停用或调用字段非法 Skill 的显式启用覆盖，通过用户 DSH rank 399、项目 rank 99/199 策略候选执行；旧版状态文件可无损迁移已有停用项。
- 将容易误解的“已加载/已发现”界面与 API 统计统一为“已启用/已停用”调用策略语义，不再暗示 Skill 正文已经进入某个 Session。
- 扩展 i18n 契约测试，覆盖所有客户端字面量 key、宿主错误/警告/诊断代码、占位符一致性及中英文旧加载术语清理。

## 0.1.31 — 2026-08-30

- 新增活动 Session 工作区的项目 Skill 发现，覆盖项目根 `.dsh/skills` 与 `.agents/skills`，使用稳定的 workspace 专属身份并遵循官方优先级。
- 项目文件继续由 DSH 作用域 filesystem provider 管理，不重复注册 provider，也不复用用户级全局启停状态。
- 项目条目标记为“已发现”而不是“已加载”，展示 workspace 专属优先级/路径证据和手动刷新入口，并在宿主无法读取活动工作区时给出警告。
- 补充最近 Git 根、Session 工作区去重、单项目同名优先级、跨项目同名隔离、实时修改/删除、过期来源身份以及项目 Skill 根外链接目录等回归测试。
- 新增活动项目 `.dsh/skills` 的设置页创建与可恢复回收站删除，复用全局 Skill 的完整目录回滚/发布流程，同时保持项目 `.agents/skills` 只读。
- 回收站现在记录并展示原用户级或项目级来源；项目条目仅在当前活动 Session 可重新解析出同一不透明根身份时恢复。
- 新增项目 `.dsh/skills` 启停控件：只改写 Skill 自身调用策略字段，Session 作用域目录加载仍由 DSH 官方 provider 负责。
- 修复项目与 `$DSH_HOME` 位于不同磁盘时，移入回收站和恢复因 `EXDEV` 失败的问题，新增受保护的“复制后原子隐藏”降级流程。
- 主来源列表不再显示空项目根，但“创建技能”仍可选择它们；同时移除不受支持的项目来源总开关，不影响逐 Skill 启停。
- 修复可写项目发现会回落到无 Git 的 Session cwd、进而可能与用户级技能根重合的问题；项目来源现在必须找到真实 `.git` 祖先，与任一用户技能根重叠时直接隐藏并拒绝写入。
- 列表和详情不再跟随技能根本身的链接，包括项目 `.dsh`/`.agents` 容器及 Windows reparse point，同时保留既有的 bundle 子链接边界检查。

发布包：[`@michengai/dsh-skills-manager@0.1.31`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.31)。

## 0.1.30 — 2026-08-28

- 修复 DSH Web 已通过 `--trusted-host` 信任的反向代理域名或局域网 IP，仍被 Skills Manager 自身 loopback-only Host 校验拒绝的问题。
- 复用 `webRuntime.trustedHosts`，按 DSH 的 authority 语义支持无端口任意端口匹配和带端口精确匹配，同时继续拒绝未知 Host、非规范 authority、异源 Origin 与显式 cross-site 请求。
- 补充真实 DSH 隔离启动验证以及域名、LAN IP、端口、Origin、跨站请求和写接口标记的回归测试。

发布包：[`@michengai/dsh-skills-manager@0.1.30`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.30)。

## 0.1.29 — 2026-08-28

- 恢复 DSH 系列 README 的标准头部导航：更新日志入口位于语言切换与 Apache-2.0 许可证链接之间。

发布包：[`@michengai/dsh-skills-manager@0.1.29`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.29)。

## 0.1.28 — 2026-08-28

- 将 README 中的更新日志入口前移到页面顶部，打开项目即可看到发布历史。

发布包：[`@michengai/dsh-skills-manager@0.1.28`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.28)。

## 0.1.27 — 2026-08-27

- 将浏览器上传限制提高到 ZIP 32 MiB、单文件 32 MiB、解压后总量 64 MiB 和 1000 个条目，并同步把 Base64 JSON 请求体上限提高到 88 MiB。
- 上传反馈改为显示在导入弹窗内部，不再被当前弹窗遮挡；重新打开或关闭弹窗时会清理过期的选择和提示。
- 使用反馈者提供的跨平台 fnOS `trim-cli` Skill 压缩包完成隔离环境全链路导入验证。

发布包：[`@michengai/dsh-skills-manager@0.1.27`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.27)。
