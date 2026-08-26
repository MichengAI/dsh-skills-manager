# I033 Design QA — 单次技能上传

日期：2026-08-27

## 对照输入

- 千问参考：`C:\Users\YUJIYU\AppData\Local\Temp\codex-clipboard-b09ce913-b08a-4b65-bb27-8ac33e28196f.png`
- 豆包参考：`C:\Users\YUJIYU\AppData\Local\Temp\codex-clipboard-73fd5318-2e65-4d9a-b72f-011af2078e03.png`
- 用户颜色反馈：`C:\Users\YUJIYU\AppData\Local\Temp\codex-clipboard-f035c534-7e0d-42d0-8cd9-011503e618eb.png`
- DSH 实装截图：`docs/07-迭代归档/2026/I033-单次技能上传重构/assets/upload-dialog-qa.png`
- 同屏对比：`docs/07-迭代归档/2026/I033-单次技能上传重构/assets/design-comparison.png`

## 验证环境

- 本地 DSH Web：`http://127.0.0.1:3080/`
- 路径：设置 → 技能 → 导入
- 状态：未选择；另对单个 `SKILL.md` 的已选择、安装成功状态完成交互验证。

## 对照结论

| 检查项 | 结果 |
|---|---|
| 单弹窗完成上传选择，不串联第二个选择器 | 通过 |
| 上传区明确支持 ZIP、文件夹、SKILL.md | 通过 |
| 文件要求与主操作层级清晰 | 通过 |
| 选择后显示类型、名称、数量、大小和移除动作 | 通过 |
| 禁用/进行中/成功反馈状态成立 | 通过 |
| 沿用 DSH 深色背景、边框、圆角、按钮和焦点样式 | 通过 |
| 文件/文件夹选择使用中性标签色，不再误用成功绿色 | 通过 |
| 弹窗居中、无遮挡、无裁切 | 通过 |
| 未使用临时图标、emoji、手绘 SVG 或伪造品牌资产 | 通过 |

## 缺陷分级

- P0：0
- P1：0
- P2：0
- P3：0

## 交互验证

- 原生文件选择一次完成，未出现 Node 窗口或第二个自定义选择器。
- 选择测试 `SKILL.md` 后显示 `MD / SKILL.md / 1 个文件 / 88 B`，安装按钮启用。
- 点击安装后显示“导入完成：dssm-upload-qa”，技能总数与 DSH 分组即时刷新；测试条目随后已清理。
- ESC、取消和关闭按钮均只关闭当前导入弹窗，设置页保持打开。
- 选择文件夹/选择文件的实机计算色为 `rgb(207, 211, 214)`，与 DSH 次级标签一致；hover 提升为主标签色。

final result: passed
