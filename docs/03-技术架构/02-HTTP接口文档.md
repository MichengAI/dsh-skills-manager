# HTTP 接口文档

更新时间：2026-08-27（Asia/Shanghai）

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
- 移到回收站的回滚失败返回 `error.trash.rollbackFailed`；未恢复内容保留在 `params.path` 指向的 stage，服务端不会再清理唯一副本。
- 已存在但不可读或结构非法的 `state.json` 触发 `warning.state.invalid`，所有外部来源按停用处理；启停写入返回 `error.state.invalid`，避免覆盖原策略。
- 导入成功但旧备份未删除时，`imported[].warnings[]` 带 `warning.backupUncleaned`；前端按当前语言展示。
- 系统异常（如 ENOENT）不携带 `code`，保留原始 `error` 文本。

## 接口列表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/state` | 获取 DSH、公共 Agent、Codex、Claude、Gemini、OpenCode 与回收站状态快照。 |
| HEAD | `/state` | 返回与 GET 相同的状态码及响应头，不发送实体。 |
| POST | `/enable` | 启用指定技能。 |
| POST | `/disable` | 停用指定技能。 |
| POST | `/source-enable` | 启用一个外部技能来源。 |
| POST | `/source-disable` | 停用一个外部技能来源。 |
| POST | `/delete` | 把 DSH 技能移到管理器回收站。 |
| POST | `/trash-restore` | 从回收站恢复技能。 |
| POST | `/trash-delete` | 永久删除回收站条目。 |
| POST | `/detail` | 读取技能正文、frontmatter 与诊断。 |
| POST | `/create` | 在 DSH 技能目录创建技能。 |
| POST | `/browse` | 为前台目录选择器列出一个本机目录层级。 |
| POST | `/import` | 预检或导入本机插件路径。 |

`/enable` 与 `/disable` 请求体为 `{ "name": "foo-bar", "root": "dsh" }`。DSH 技能通过原子改写 invocation policy 启停；外部根技能只写管理器 `state.json`，不修改来源文件。损坏状态下拒绝外部启停写入。

`/source-enable` 与 `/source-disable` 请求体为 `{ "root": "agents" }`；只接受可切换的外部来源。

`/delete` 请求体为 `{ "name": "foo-bar", "root": "dsh" }`；只接受 DSH 根目录。失败回滚不完整时保留 stage 并返回 `error.trash.rollbackFailed`。

`/trash-restore` 与 `/trash-delete` 请求体为 `{ "id": "回收站条目ID" }`。恢复遇到同名技能时拒绝覆盖；永久删除不可恢复。

`/detail` 请求体为 `{ "name": "foo-bar", "root": "dsh" }`，返回正文、frontmatter、诊断与来源只读状态。

`/create` 请求体为 `{ "name": "foo-bar", "description": "简介", "body": "正文" }`；只在 DSH 根创建 bundle 形态技能。

`/browse` 请求体为 `{ "path": "C:\\path\\to\\folder" }`；省略 `path` 时从宿主用户主目录开始。返回当前绝对路径、面包屑和真实子目录列表；Dirent 过滤后再次使用 `lstat` 拒绝符号链接或 junction，最多返回 500 项。它是只读 POST，但仍要求 JSON 与 `x-dsh-skills-manager: 1`，用于避免调用会弹出 Node 宿主窗口的 `workspaces.pickDirectory()`。

`/import` 请求体为 `{ "source": "C:\\path\\to\\SKILL.md", "conflict": "skip", "dryRun": false }`。当 `source` 为 `SKILL.md` 时，服务端导入其父目录；`conflict` 仅支持 `skip`（默认）与 `overwrite`；`dryRun: true` 只返回冲突预检结果。`source` 可以是用户选定的任意本机技能路径，不限制在 `$DSH_HOME` 内；服务端拒绝符号链接、过深目录，以及与目标技能目录重叠的来源。
