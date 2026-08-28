# 更新日志

[English](CHANGELOG.md)

以下记录最近发布的五个版本。

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

## 0.1.26 — 2026-08-27

- 修复浏览器上传文件夹时，原始内容仍在 25 MiB 总量限制内，却因 Base64 JSON 超过旧 16 MiB 请求体上限而失败的问题。
- 在浏览器读取内容前检查既有的 ZIP 10 MiB、单文件 5 MiB、总量 25 MiB 和 500 个条目限制，超限时直接显示具体原因。
- 将大字符串 Base64 正则校验改为栈安全校验，避免数 MiB 文件耗尽 JavaScript 调用栈。

发布包：[`@michengai/dsh-skills-manager@0.1.26`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.26)。
