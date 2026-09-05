# DSH AI Workbench 开发说明

## 目录边界

- `src/host/`：DSH host 服务、HTTP 路由、持久化、调度器与运行器。
- `src/client/`：浏览器端 Root、Sidebar、Work/Chat 页面、能力库与自动化页面。
- `src/shared/`：host/client 共用的契约、能力清单与时间表算法。
- `assets/`：品牌 Logo、AI 球和 Work/Chat 配置资产。

## 常用命令

```bash
pnpm run build
pnpm run test:unit
pnpm run verify
pnpm run pack:check
```

构建只发布本包的 `lib/`，不会触碰仓库根目录的 `lib/`。提交前不要把生成的 `lib/`、临时构建目录或依赖目录加入 Git。

## 扩展规则

新增能力时先更新 `assets/capabilities.json` 和运行时校验清单，再补充能力归一化、来源失败降级和偏好持久化测试。新增调度类型时先扩展 `src/shared/schedule.js` 与 `automation-contracts.js`，明确无效日期、时区、重启补跑和幂等键行为，然后再接入页面表单。Work/Chat 的权限边界必须继续由 host 端强校验，不能只依赖浏览器字段。
