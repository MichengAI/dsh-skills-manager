# 更新日志

[English](CHANGELOG.md)

以下记录最近发布的五个版本。

## 0.1.25 — 2026-08-27

- 新增公共 Agent、Codex、Claude、Gemini 与 OpenCode 技能源加载；启停策略仅写入管理器状态，不修改外部源文件。
- 新增正文详情、格式诊断、对话创建、可恢复回收站及二次永久删除。
- 导入改为单弹窗流程，统一支持 `.zip`、技能文件夹和单个 `SKILL.md`，并补充路径、大小、数量与归档安全边界。
- 修复损坏状态文件覆盖、回收站回滚丢失、Windows `EPERM` 发布失败和「修复并启用」字段缺失等问题。

发布包：[`@michengai/dsh-skills-manager@0.1.25`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.25)。

## 0.1.24 — 2026-08-23

- 新增中英文更新日志，展示最近五个发布版本。
- 在中英文 README 中加入更新日志入口，并将日志纳入 npm 包。

发布包：[`@michengai/dsh-skills-manager@0.1.24`](https://www.npmjs.com/package/@michengai/dsh-skills-manager/v/0.1.24)。

## 0.1.23 — 2026-08-17

- 修复 dry-run 成功后链式导入被静默丢弃的问题。

发布标签：[`v0.1.23`](https://github.com/MichengAI/dsh-skills-manager/tree/v0.1.23)。

## 0.1.22 — 2026-08-17

- 批量收集导入候选项时不再吞掉符号链接拒绝错误。

发布标签：[`v0.1.22`](https://github.com/MichengAI/dsh-skills-manager/tree/v0.1.22)。

## 0.1.21 — 2026-08-17

- 导入 dry-run 阶段执行与正式导入一致的符号链接和目录深度检查。
- 统一 dry-run 清理、删除处理和 HEAD 请求行为。

发布标签：[`v0.1.21`](https://github.com/MichengAI/dsh-skills-manager/tree/v0.1.21)。
