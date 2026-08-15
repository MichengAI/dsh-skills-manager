# HTTP 接口文档

更新时间：2026-08-15 17:26（Asia/Shanghai）

## 通用约定

- 前缀：`/api/dsh-skills-manager`
- 仅本机同源面板调用。
- 响应：成功为 `{ "ok": true, "data": {} }`；失败为 `{ "ok": false, "error": "原因" }`。
- `POST` 使用 `application/json`。

## 接口列表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/state` | 获取 DSH 与公共 Agent 技能状态快照。 |
| POST | `/enable` | 启用指定插件。 |
| POST | `/disable` | 停用指定插件。 |
| POST | `/delete` | 删除指定插件。 |
| POST | `/import` | 预检或导入本机插件路径。 |

`/enable` 与 `/disable` 请求体为 `{ "name": "foo-bar", "root": "dsh" }`；仅接受 `dsh`，缺省为 `dsh`，公共 Agent 根目录请求会被拒绝。

`/delete` 请求体为 `{ "name": "foo-bar" }`；只删除 DSH 根目录，服务端拒绝公共 Agent 目录删除。

`/import` 请求体为 `{ "source": "C:\\path\\to\\SKILL.md", "conflict": "skip", "dryRun": false }`。当 `source` 为 `SKILL.md` 时，服务端导入其父目录；`conflict` 仅支持 `skip`（默认）与 `overwrite`；`dryRun: true` 只返回冲突预检结果。
