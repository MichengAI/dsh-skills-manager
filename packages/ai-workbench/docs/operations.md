# DSH AI Workbench 运维说明

## 诊断

先确认 DSH Web 使用本机回环地址启动，再执行：

```bash
DSH_WEB_URL=http://localhost:3000 pnpm run smoke:profile
```

该命令只读取 `/api/dsh-ai-workbench/diagnostics`，不会创建会话或修改工作台数据。

## 自动化任务

- `已开启`：调度器会在下次运行时间到达时创建一次运行记录。
- `已暂停`：保留配置，但不再创建新运行。
- `已完成`：一次性任务已经结束。
- `已停用`：连续失败后由系统停止，需用户编辑或重新开启。
- Work 任务如果需要批准，运行会停在 `waiting_approval`，批准动作仍由 DSH 官方会话完成。

系统休眠或 DSH Web 重启后，恢复逻辑最多补跑一次最新的错过周期；不会把错过的所有周期集中执行。若宿主停止，任务不会在后台运行，恢复后按同一规则重新计算。

## Chat 预设冲突

Chat 使用固定的 `zf-chat-workbench-v1` 预设。若 DSH 中已有同名但内容不同的预设，工作台会失败关闭 Chat 初始化，避免覆盖用户配置；应先处理预设冲突，再重启 DSH Web。

## 通知与数据

通知优先使用系统通知能力，失败时仍会写入工作台通知记录。工作台元数据保存在独立的 `dsh_ai_workbench` JSON KV 单元，不改写 DSH 原始会话目录。升级或回滚前应备份该 KV 单元；删除插件前先暂停自动化任务。

## 回滚

禁用或移除 `@michengai/dsh-ai-workbench` 后重启 DSH Web，官方 Root/Sidebar 会恢复，原始会话保持不变。重新安装插件后，工作台元数据可继续使用；如果元数据损坏，应恢复 KV 备份后再启动。
