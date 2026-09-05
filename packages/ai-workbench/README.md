# `@michengai/dsh-ai-workbench`

为 DSH Web 提供 Work 与 Chat 工作台的 host 端插件和浏览器端 loader。它负责注册工作台 API、检查 DSH host/client 合约，并提供可注入的根布局与基础样式。

## Verify

在本目录执行：

```bash
pnpm test
pnpm run verify
```

## 安装本地插件

从仓库根目录执行：

```bash
dsh plugin --profile web add /absolute/path/to/packages/ai-workbench
```
