/**
 * 技能管理器在 DSH 设置侧边导航栏中的专属图标。
 *
 * 图标矢量路径与 dsh-codex-ui (observeSettingsNavIcons) 保持一致：
 * 技能清单卡片轮廓 + 代码横线 + 右下角 AI 闪烁星芒 (Sparkle)。
 *
 * 渲染方式使用独立的 CSS mask span，而不是改写宿主 svg 的内容：
 * 第三方皮肤（如 orca-link / dsh-deep-whale）会按 svg 内部形状识别图标，
 * 给 svg 打标记后用 CSS 隐藏其子节点。直接替换 svg.innerHTML 会与皮肤的
 * 内容级识别机制互相覆盖，并残留皮肤标记，最终导致图标整体不可见 (#49)。
 * mask span 不参与皮肤对 svg 子节点的识别与隐藏，宿主 svg 只负责被隐藏。
 */

export const NAV_ICON_MARKER = "data-dssm-nav-icon";
export const NAV_ROW_SELECTOR = '[role="dialog"] nav button';

/** 100% 对齐 dsh-codex-ui 官方的技能专属矢量路径（viewBox: 0 0 16 16） */
export const SKILL_PATHS = '<path fill=\"currentColor\" d=\"M12.5113 15.4067C12.4395 15.6249 12.1308 15.6249 12.059 15.4067L11.643 14.1416C11.454 13.567 11.0033 13.1164 10.4288 12.9274L9.16369 12.5113C8.94544 12.4395 8.94544 12.1308 9.16369 12.059L10.4288 11.643C11.0033 11.454 11.454 11.0033 11.643 10.4288L12.059 9.16369C12.1308 8.94544 12.4395 8.94544 12.5113 9.16369L12.9274 10.4288C13.1164 11.0033 13.567 11.454 14.1416 11.643L15.4067 12.059C15.6249 12.1308 15.6249 12.4395 15.4067 12.5113L14.1416 12.9274C13.567 13.1164 13.1164 13.567 12.9274 14.1416L12.5113 15.4067Z\"/><path fill=\"currentColor\" d=\"M9.02246 0.546878C9.9822 0.546878 10.7564 0.545403 11.374 0.612307C12.0042 0.680586 12.5515 0.826244 13.0273 1.17188C13.3052 1.37376 13.5501 1.61868 13.752 1.89649C14.0975 2.37225 14.2432 2.91984 14.3115 3.54981C14.3784 4.16727 14.377 4.94206 14.377 5.90137V8.51367C13.9611 8.29533 13.5071 8.13985 13.0273 8.06055V5.90137C13.0273 4.9121 13.0259 4.22322 12.9688 3.69532C12.9129 3.18044 12.8098 2.89782 12.6592 2.69043C12.5406 2.52724 12.3966 2.38326 12.2334 2.26465C12.026 2.11404 11.7437 2.0109 11.2285 1.95508C10.7005 1.89789 10.0122 1.89649 9.02246 1.89649H6.55371C5.56395 1.89649 4.87569 1.89787 4.34766 1.95508C3.83242 2.01092 3.55022 2.11398 3.34278 2.26465C3.17953 2.38329 3.03564 2.52719 2.91699 2.69043C2.76642 2.89782 2.66325 3.18042 2.60742 3.69532C2.55027 4.22322 2.54883 4.9121 2.54883 5.90137V10.0986C2.54883 11.0878 2.55031 11.7768 2.60742 12.3047C2.66326 12.8196 2.76642 13.1032 2.91699 13.3105C3.03558 13.4736 3.17966 13.6178 3.34278 13.7363C3.5502 13.8869 3.83265 13.9901 4.34766 14.0459C4.87568 14.1031 5.56398 14.1035 6.55371 14.1035H8.08399C8.27443 14.6025 8.55077 15.0585 8.89551 15.4541H6.55371C5.59402 15.4541 4.81976 15.4546 4.20215 15.3877C3.57204 15.3194 3.02468 15.1738 2.54883 14.8281C2.27111 14.6263 2.02606 14.3813 1.82422 14.1035C1.47883 13.6278 1.33293 13.08 1.26465 12.4502C1.19783 11.8327 1.19922 11.0579 1.19922 10.0986V5.90137C1.19922 4.94206 1.1978 4.16727 1.26465 3.54981C1.33293 2.91984 1.47883 2.37225 1.82422 1.89649C2.02606 1.61868 2.27111 1.37376 2.54883 1.17188C3.02468 0.826244 3.57204 0.680586 4.20215 0.612307C4.81976 0.545403 5.59402 0.546878 6.55371 0.546878H9.02246Z\"/>';

/** mask 只取 alpha 通道，因此把 currentColor 固定为黑色即可 */
const SKILL_ICON_MASK = `url(\"data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\">${SKILL_PATHS.replace(/fill=\"currentColor\"/g, 'fill=\"black\"')}</svg>`,
)}\")`;

const NAV_ICON_STYLE_ID = "dssm-settings-nav-icon-style";
const NAV_ICON_CSS = [
  `[${NAV_ICON_MARKER}] > svg { display: none !important; }`,
  `[${NAV_ICON_MARKER}]::before {`,
  `  content: '';`,
  `  flex: none;`,
  `  width: 16px;`,
  `  height: 16px;`,
  `  background-color: currentColor;`,
  `  -webkit-mask: ${SKILL_ICON_MASK} center / contain no-repeat;`,
  `  mask: ${SKILL_ICON_MASK} center / contain no-repeat;`,
  `  -webkit-mask-repeat: no-repeat;`,
  `  mask-repeat: no-repeat;`,
  `  -webkit-mask-position: center;`,
  `  mask-position: center;`,
  `  -webkit-mask-size: 16px 16px;`,
  `  mask-size: 16px 16px;`,
  `}`,
].join("\n");

export function isOwnNavRow(rowText: string | null | undefined, wantedLabel: string | null | undefined): boolean {
  const wanted = String(wantedLabel ?? "").trim();
  if (wanted.length === 0) return false;
  const current = String(rowText ?? "").trim();
  return current === wanted;
}

/** 注入导航图标的样式；重复安装时复用同一个 style 元素 */
function ensureNavIconStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(NAV_ICON_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = NAV_ICON_STYLE_ID;
  style.textContent = NAV_ICON_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * 100% 对齐 dshmarket：用纯属性标记控制 ::before 伪元素渲染图标。
 * 不修改任何 DOM 节点，避免移动端列表项排版下与文字重叠冲突。
 */
export function applySettingsNavIcon(button: Element, wantedLabel: () => string): boolean {
  const isOwn = isOwnNavRow(button.textContent, wantedLabel());
  if (isOwn) {
    if (button.getAttribute(NAV_ICON_MARKER) === "") return false;
    button.setAttribute(NAV_ICON_MARKER, "");
    return true;
  }
  if (button.hasAttribute(NAV_ICON_MARKER)) {
    button.removeAttribute(NAV_ICON_MARKER);
    return true;
  }
  return false;
}

/** 移除本插件添加的标记，宿主 svg 恢复显示 */
export function restoreSettingsNavIcon(button: Element): boolean {
  if (!button.hasAttribute(NAV_ICON_MARKER)) return false;
  button.removeAttribute(NAV_ICON_MARKER);
  return true;
}

export interface NavIconContext {
  effect(callback: () => unknown, label?: string): void;
}

export function installSettingsNavIcon(ctx: NavIconContext, resolveLabel: () => string): void {
  if (typeof document === "undefined") return;
  ensureNavIconStyle();

  ctx.effect(() => {
    let disposed = false;
    let scheduled = false;

    const sync = () => {
      scheduled = false;
      if (disposed) return;
      for (const row of document.querySelectorAll(NAV_ROW_SELECTOR)) {
        applySettingsNavIcon(row, resolveLabel);
      }
    };

    const schedule = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      queueMicrotask(sync);
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      disposed = true;
      observer.disconnect();
      for (const row of document.querySelectorAll(`[${NAV_ICON_MARKER}]`)) {
        restoreSettingsNavIcon(row);
      }
    };
  }, "skills-manager: settings nav icon");
}
