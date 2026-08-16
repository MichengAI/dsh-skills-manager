# HTTP 接口文档

更新时间：2026-08-17 02:52（Asia/Shanghai）

## 通用约定

- 前缀：`/api/dsh-skills-manager`
- 仅本机 loopback 面板调用。全部接口先校验 `Host` 为 `localhost` / `127.0.0.1` / `[::1]`。
- 本接口信任 loopback 来源；不要把宿主 `webServer` 绑到非本机地址。Host 校验只防浏览器（含 DNS rebinding），不能代替网络隔离。
- 响应：成功为 `{ "ok": true, "data": {} }`；失败为 `{ "ok": false, "error": "原因", "code": "错误码", "params": { "参数": "值" } }`。业务与协议错误均携带 `code`；`params` 为词典占位符参数；导入失败时带 `failed` 明细数组。
- `POST` 使用 `application/json`。

## 错误码约定

- 业务码 `error.*`：由 core 产生（如 `error.skill.notFound`、`error.import.overlap`），client 按当前语言词典翻译；`error` 字段保留中文原文，供非浏览器调用方兜底。
- 协议码 `error.proto.*`：HTTP 层校验失败——非法 Host 403（`error.proto.forbiddenHost`）、缺少请求标记 403（`error.proto.forbidden`）、content-type 415、方法不允许 405、未知操作 404、请求体过大 413、非法 JSON 400。
- 覆盖导入回滚失败返回 `error.import.rollbackFailed`，`params.path` 为备份路径，`params.error` 为原始原因。
- 导入成功但旧备份未删除时，`imported[].warnings[]` 带 `warning.backupUncleaned`；前端按当前语言展示。
- 系统异常（如 ENOENT）不携带 `code`，保留原始 `error` 文本。

## 接口列表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/state` | 获取 DSH 与公共 Agent 技能状态快照。校验 loopback Host，不要求请求标记或 JSON。 |
| POST | `/enable` | 启用指定插件。 |
| POST | `/disable` | 停用指定插件。 |
| POST | `/delete` | 删除指定插件。 |
| POST | `/import` | 预检或导入本机插件路径。 |

`/enable` 与 `/disable` 请求体为 `{ "name": "foo-bar", "root": "dsh" }`；仅接受 `dsh`，缺省为 `dsh`，公共 Agent 根目录请求会被拒绝。

`/delete` 请求体为 `{ "name": "foo-bar" }`；只删除 DSH 根目录，服务端拒绝公共 Agent 目录删除。

`/import` 请求体为 `{ "source": "C:\\path\\to\\SKILL.md", "conflict": "skip", "dryRun": false }`。当 `source` 为 `SKILL.md` 时，服务端导入其父目录；`conflict` 仅支持 `skip`（默认）与 `overwrite`；`dryRun: true` 只返回冲突预检结果。`source` 可以是用户选定的任意本机技能路径，不限制在 `$DSH_HOME` 内；服务端拒绝符号链接、过深目录，以及与目标技能目录重叠的来源。
