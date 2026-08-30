# HTTP 接口文档

更新时间：2026-08-30（Asia/Shanghai）

## 通用约定

- 前缀：`/api/dsh-skills-manager`
- 全部接口先校验请求 authority：允许 loopback（`localhost`、`[::1]`、IPv4 `127/8`），以及 DSH Web runtime 从 LAN 绑定和 `--trusted-host` 得出的规范 `host[:port]`。
- 不带端口的受信条目匹配同主机任意端口，带端口的条目只精确匹配该 authority；未知、非规范或异源 Host、显式 cross-site 请求均返回 403。
- Host 信任栅栏用于防浏览器 DNS rebinding，不能代替身份认证、反向代理访问控制或网络隔离。
- 响应：成功为 `{ "ok": true, "data": {} }`；失败为 `{ "ok": false, "error": "原因", "code": "错误码", "params": { "参数": "值" } }`。业务与协议错误均携带 `code`；`params` 为词典占位符参数；导入失败时带 `failed` 明细数组。
- `POST` 使用 `application/json`。

## 错误码约定

- 业务码 `error.*`：由 core 产生（如 `error.skill.notFound`、`error.import.overlap`），client 按当前语言词典翻译；`error` 字段保留中文原文，供非浏览器调用方兜底。
- 协议码 `error.proto.*`：HTTP 层校验失败——非法 Host 403（`error.proto.forbiddenHost`）、缺少请求标记 403（`error.proto.forbidden`）、content-type 415、方法不允许 405、未知操作 404、请求体过大 413、非法 JSON 400。
- 覆盖导入回滚失败返回 `error.import.rollbackFailed`，`params.path` 为备份路径，`params.error` 为原始原因。
- 移到回收站的回滚失败返回 `error.trash.rollbackFailed`；未恢复内容保留在 `params.path` 指向的 stage，服务端不会再清理唯一副本。
- Windows 若在最终 stage 改名阶段持续返回 `EPERM` / `EACCES` / `EBUSY`，服务端会保留 stage 作为回滚源，复制完整条目后最后写入 `metadata.json`；调用方仍收到普通成功结果。
- 已存在但不可读或结构非法的 `state.json` 触发 `warning.state.invalid`，所有外部来源按停用处理；启停写入返回 `error.state.invalid`，避免覆盖原策略。
- 导入成功但旧备份未删除时，`imported[].warnings[]` 带 `warning.backupUncleaned`；前端按当前语言展示。
- 系统异常（如 ENOENT）不携带 `code`，保留原始 `error` 文本。

## 接口列表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/state` | 获取活动 Session 项目 DSH/Agent、用户 DSH、公共 Agent、Codex、Claude、Gemini、OpenCode 与回收站状态快照；技能项包含 `hasFrontmatter`、`invocationPolicyValid` 与 `loadable` 诊断字段。 |
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
| POST | `/upload` | 上传 ZIP、技能文件夹内容或单个 SKILL.md，并安全暂存后导入。 |
| POST | `/browse` | 兼容旧客户端：为目录选择器列出一个本机目录层级。 |
| POST | `/import` | 兼容旧客户端：预检或导入本机插件路径。 |

`/enable` 与 `/disable` 请求体为 `{ "name": "foo-bar", "root": "dsh" }`。用户 DSH 技能通过原子改写 invocation policy 启停；外部用户根技能只写管理器 `state.json`，不修改来源文件。动态项目来源不可启停，返回 `error.root.readonly`。损坏状态下拒绝外部启停写入。

`/source-enable` 与 `/source-disable` 请求体为 `{ "root": "agents" }`；只接受可切换的外部来源。

`/delete` 请求体为 `{ "name": "foo-bar", "root": "dsh" }`；只接受 DSH 根目录。失败回滚不完整时保留 stage 并返回 `error.trash.rollbackFailed`。

`/trash-restore` 与 `/trash-delete` 请求体为 `{ "id": "回收站条目ID" }`。恢复遇到同名技能时拒绝覆盖；永久删除不可恢复。

`/detail` 请求体为 `{ "name": "foo-bar", "root": "dsh" }`，返回正文、frontmatter、诊断与来源只读状态。项目来源使用 `/state` 返回的 `project-dsh:<id>` 或 `project-agents:<id>` 不透明 key；服务端会根据当前活动 Session 重新解析，不能由请求指定 cwd。

`/create` 请求体为 `{ "name": "foo-bar", "description": "简介", "body": "正文" }`；只在 DSH 根创建 bundle 形态技能。

`/upload` 请求体有两种形态：普通文件/文件夹使用 `{ "name": "来源名称", "entries": [{ "path": "相对路径", "data": "Base64" }] }`；ZIP 使用 `{ "name": "demo.zip", "zip": "Base64" }`。Base64 JSON 请求体最多 88 MiB，ZIP 压缩数据最多 32 MiB，单文件最多 32 MiB，解压/上传总量最多 64 MiB、最多 1000 个条目、路径深度最多 64 层。服务端拒绝绝对路径、`..`、Windows 设备名、重复路径和非法 Base64；所有归档条目只写成普通文件，不创建符号链接。暂存目录位于 `$DSH_HOME/skills-manager/uploads`，成功或失败后都会清理，再由既有原子导入流程复制到 `$DSH_HOME/skills`。

`/browse` 请求体为 `{ "path": "C:\\path\\to\\folder" }`；省略 `path` 时从宿主用户主目录开始。该接口仅为旧客户端兼容保留，新界面不再调用。

`/import` 请求体为 `{ "source": "C:\\path\\to\\SKILL.md", "conflict": "skip", "dryRun": false }`。该接口仅为旧客户端兼容保留；新界面使用 `/upload`，不向浏览器暴露或传递本机绝对路径。
