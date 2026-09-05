# `@michengai/dsh-ai-workbench`

为 DSH Web 提供 Work 与 Chat 工作台的 host 端插件和浏览器端 loader。它包含：模式隔离、Work/Chat 首页、能力库、自动化任务、通知与独立的工作台元数据存储。

## 运行范围

- Work：按工作空间和能力选择发起日常办公任务，遵循 DSH 的工作区权限与批准流程。
- Chat：使用固定的 `zf-chat-workbench-v1` 受限预设，仅用于问答和联网搜索，不继承 Work 字段。
- 工作空间、数据看板、成果空间、Chat 智能体广场和 AI 工具集：当前点击后提示“功能暂未开发”。

## Verify

在本目录执行：

```bash
pnpm test
pnpm run verify
DSH_WEB_URL=http://localhost:3000 pnpm run smoke:profile
```

## 安装本地插件

从仓库根目录执行：

```bash
dsh plugin --profile web add /absolute/path/to/packages/ai-workbench
```

## Roll back the shell

Disable or remove `@michengai/dsh-ai-workbench` from the Web profile and restart DSH Web. The official DSH shell returns immediately. Original session directories are unchanged; workbench metadata remains isolated in the `dsh_ai_workbench` JSON KV unit.

更多安装、诊断、自动化恢复和开发边界见 [`docs/operations.md`](docs/operations.md) 与 [`docs/development.md`](docs/development.md)。
