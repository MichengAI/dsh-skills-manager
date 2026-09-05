# Work / Chat 视觉检查清单

## 证据范围

- 设计基线：`docs/superpowers/specs/2026-09-04-dsh-ai-workbench-design.md` 与 Plan03 Task5。
- 真实源资产：`packages/ai-workbench/assets/ai-orb.png`、品牌图形、导航/操作/场景切图；本次不新增或重采样资产。
- 真实浏览器截图：待在设计稿视口运行应用后补充到临时目录（不得提交 Git）。若 sandbox 无法启动真实浏览器，保留本清单的静态检查证据和阻塞原因，不伪造截图。

## 截图记录

| 页面 / 视口 | 截图证据 | 结果 | 备注 |
| --- | --- | --- | --- |
| Work / 设计稿视口 | 未生成 | BLOCKED | 需要可启动的真实浏览器与已运行的 DSH Web 宿主；不能用静态 HTML 冒充截图。 |
| Chat / 设计稿视口 | 未生成 | BLOCKED | 同上。 |
| Work / 1023 px | 未生成 | BLOCKED | 同上。 |
| Chat / 1023 px | 未生成 | BLOCKED | 同上。 |

## 静态检查

| 检查项 | 结果 | 静态证据 |
| --- | --- | --- |
| 品牌尺寸与间距 | PASS | `styles.js` 的 `.daw-brand`、`.daw-brand-mark`；品牌文字为 HTML 文本，图形来自真实资产。 |
| AI 球尺寸 | PASS | Work / Chat 使用 `/assets/ai-orb.png`，首页 CSS 统一为 `104px`。 |
| 标题基线 | PASS | Work/Chat hero 使用居中布局、统一 `h1` 字号与 `letter-spacing`。 |
| 输入区尺寸 | PASS | Work/Chat composer 使用 `max-width`、`min-height: 112px` 与一致圆角/边框。 |
| Sidebar 节奏 | PASS | Sidebar 使用统一 `44px` 导航行高、`24px` 分组间距和历史列表节奏。 |
| 选中态 | PASS | 模式、导航、Chat toggle/tab 均使用 `aria-selected`/`aria-current`/`.is-active` 视觉态。 |
| 卡片列数 | PASS | Chat 宽屏三列，900px 以下两列，720px 以下单列。 |
| Modal 状态 | PASS | 现有 Dialog 使用遮罩、焦点恢复与键盘循环；Work policy chip 复用该 Dialog。 |
| Focus 状态 | PASS | 原生控件保持可聚焦；Dialog 有键盘焦点管理。真实截图仍需确认可见焦点环。 |
| 已填草稿 | PENDING（UI fixer） | Work/Chat textarea 的语音接入与只追加、不自动提交行为留给后续 UI fixer；本轮仅完成适配器。 |
| 附件状态 | PASS | 两个首页均渲染附件摘要、移除按钮与错误提示。 |
| 展开自动选择 | PASS | Work 自动选择面板按按钮 `aria-expanded` 展开，展示强度、模型、能力。 |
| 1023 px 响应式 | PASS（静态） | `@media(max-width:1023px)` 折叠 Sidebar；真实截图仍需确认无横向滚动与控件裁切。 |
| 语音不支持降级 | PASS（适配器测试）/ PENDING（UI fixer） | 无 `SpeechRecognition`/`webkitSpeechRecognition` 时适配器为 `supported:false`；首页按钮隐藏需由后续 UI fixer 接入并验收。 |

## 阻塞与后续

本清单不包含伪造的浏览器截图。若当前 sandbox 无法启动真实浏览器，发布前需要在可用的 DSH Web 宿主中补拍四个状态并回填截图路径、视口和 PASS/FAIL 结论。
