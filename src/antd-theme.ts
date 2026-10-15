import type { ThemeConfig } from "antd/es/config-provider/context.js";

/** 仅为本插件生成独立变量命名空间；不改变宿主或其他插件的 Ant 主题。 */
export const antdThemeConfig: ThemeConfig = {
  cssVar: { key: "dssm-theme", prefix: "dssm-ant" },
  token: {
    borderRadius: 12, borderRadiusSM: 8, borderRadiusXS: 4, borderRadiusLG: 16,
    controlHeight: 36, controlHeightSM: 28, controlHeightLG: 40, lineWidth: 0.5,
  },
  components: {
    Input: { controlHeight: 32 },
    Select: { controlHeight: 32 },
    Button: { defaultShadow: "none", primaryShadow: "none", dangerShadow: "none" },
    Collapse: { headerBg: "transparent", contentBg: "transparent", borderlessContentBg: "transparent" },
    Modal: { headerBg: "transparent", footerBg: "transparent" },
  },
};

// 色板算法需要具体颜色。这里在算法执行后以 CSS 变量桥接，保留 color-mix、透明度和主题实时更新。
const variables: Record<string, string> = {
  "font-family": "var(--dsw-font-family, system-ui)",
  "border-radius-xs": "var(--dsw-radius-xs, 4px)",
  "border-radius-sm": "var(--dsw-radius-sm, 8px)",
  "border-radius": "var(--dsw-radius-md, 12px)",
  "border-radius-lg": "var(--dsw-radius-lg, 16px)",
  "color-text": "var(--dsw-alias-label-primary)",
  "color-text-heading": "var(--dsw-alias-label-primary)",
  "color-text-secondary": "var(--dsw-alias-label-secondary)",
  "color-text-description": "var(--dsw-alias-label-tertiary)",
  "color-text-tertiary": "var(--dsw-alias-label-tertiary)",
  "color-text-quaternary": "var(--dsw-alias-label-tertiary)",
  "color-text-placeholder": "var(--dsw-alias-label-tertiary)",
  "color-text-disabled": "var(--dsw-alias-label-tertiary)",
  "color-text-light-solid": "var(--dsw-alias-label-primary-foreground)",
  "color-icon": "var(--dsw-alias-label-secondary)",
  "color-icon-hover": "var(--dsw-alias-label-primary)",
  "color-primary": "var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))",
  "color-primary-hover": "var(--dsw-alias-button-primary-hover, var(--dsw-alias-interactive-bg-active))",
  "color-primary-active": "var(--dsw-alias-button-primary-hover, var(--dsw-alias-interactive-bg-active))",
  "color-primary-bg": "var(--dsw-alias-state-business-tertiary)",
  "color-primary-bg-hover": "var(--dsw-alias-state-business-tertiary)",
  "color-primary-border": "var(--dsw-alias-link)",
  "color-primary-border-hover": "var(--dsw-alias-link)",
  "color-primary-text": "var(--dsw-alias-link)",
  "color-primary-text-hover": "var(--dsw-alias-link)",
  "color-primary-text-active": "var(--dsw-alias-link)",
  "color-link": "var(--dsw-alias-link)",
  "color-link-hover": "var(--dsw-alias-link)",
  "color-link-active": "var(--dsw-alias-link)",
  "color-error": "var(--dsw-alias-state-error-primary)",
  "color-error-hover": "var(--dsw-alias-state-error-primary)",
  "color-error-active": "var(--dsw-alias-state-error-primary)",
  "color-success": "var(--dsw-alias-state-success-primary)",
  "color-warning": "var(--dsw-alias-state-warn-primary)",
  "color-info": "var(--dsw-alias-link)",
  "color-border": "var(--dsw-alias-border-l2)",
  "color-border-secondary": "var(--dsw-alias-border-l1)",
  "color-border-disabled": "var(--dsw-alias-border-l1)",
  "color-split": "var(--dsw-alias-border-l1)",
  "color-bg-container": "var(--dsw-alias-bg-layer-1)",
  "select-selector-bg": "var(--dsw-alias-bg-layer-1)",
  "select-active-outline-color": "var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary))",
  "control-outline": "var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary))",
  "control-outline-width": "var(--dsw-focus-ring-width, 1px)",
  "color-bg-elevated": "var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3))",
  "color-bg-container-disabled": "var(--dsw-alias-interactive-bg-hover)",
  "color-bg-mask": "var(--dsw-alias-bg-mask-1)",
  "color-fill": "var(--dsw-alias-interactive-bg-active)",
  "color-fill-secondary": "var(--dsw-alias-interactive-bg-hover)",
  "color-fill-tertiary": "var(--dsw-alias-interactive-bg-hover)",
  "color-fill-quaternary": "var(--dsw-alias-interactive-bg-hover)",
  "color-fill-alter": "var(--dsw-alias-interactive-bg-hover)",
  "color-bg-text-hover": "var(--dsw-alias-interactive-bg-hover)",
  "color-bg-text-active": "var(--dsw-alias-interactive-bg-active)",
  "control-item-bg-hover": "var(--dsw-alias-interactive-bg-hover)",
  "control-item-bg-active": "var(--dsw-alias-state-business-tertiary)",
  "control-item-bg-active-hover": "var(--dsw-alias-state-business-tertiary)",
  "box-shadow": "var(--dsw-elevation-panel, none)",
  "box-shadow-secondary": "var(--dsw-elevation-panel, none)",
};

/** 同一命名空间自动覆盖 body portal；仅覆盖变量，不把弹层搬到会裁剪内容的祖先。 */
export const antdThemeCss = `
.dssm-theme.dssm-theme.dssm-theme{${Object.entries(variables).map(([name, value]) => `--dssm-ant-${name}:${value}`).join(";")}}
.dssm-theme.ant-btn{--dssm-ant-button-default-bg:transparent;--dssm-ant-button-default-hover-bg:var(--dsw-alias-interactive-bg-hover);--dssm-ant-button-default-active-bg:var(--dsw-alias-interactive-bg-active);--dssm-ant-button-default-hover-color:var(--dsw-alias-link);--dssm-ant-button-default-hover-border-color:var(--dsw-alias-link);--dssm-ant-button-default-active-color:var(--dsw-alias-link);--dssm-ant-button-default-active-border-color:var(--dsw-alias-link)}
.dssm-theme.ant-modal{--dssm-ant-border-radius-lg:var(--dsw-radius-panel,28px)}
.dssm-theme .ant-modal-container{position:relative;isolation:isolate;border:0;border-radius:var(--dsw-radius-panel,28px);background:transparent;box-shadow:var(--dsw-elevation-panel,none)}
.dssm-theme .ant-modal-container::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3));backdrop-filter:var(--dsw-menu-backdrop-filter,none);pointer-events:none}
.dssm-theme.dssm-theme.dssm-theme.ant-select,
.dssm-theme.dssm-theme.dssm-theme.ant-select:hover,
.dssm-theme.dssm-theme.dssm-theme.ant-select.ant-select-focused,
.dssm-theme.dssm-theme.dssm-theme.ant-select.ant-select-open{--dssm-ant-select-background-color:var(--dsw-alias-bg-layer-1);--ant-select-background-color:var(--dsw-alias-bg-layer-1);background-color:var(--dsw-alias-bg-layer-1)!important}
.dssm-theme.dssm-theme.dssm-theme.ant-select:not(.ant-select-disabled):hover{border-color:var(--dsw-alias-border-l3,#555)!important}
.dssm-theme.dssm-theme.dssm-theme.ant-select:not(.ant-select-disabled).ant-select-focused,
.dssm-theme.dssm-theme.dssm-theme.ant-select:not(.ant-select-disabled).ant-select-open{border-color:var(--dsw-alias-brand-primary)!important;outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary))!important;outline-offset:0!important}
.dssm-theme.ant-select-dropdown,.dssm-theme.ant-dropdown{isolation:isolate}
.dssm-theme.ant-select-dropdown,.dssm-theme.ant-dropdown .ant-dropdown-menu{border:0;border-radius:var(--dsw-radius-lg,16px);background:transparent;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent,var(--dsw-elevation-panel,none))}
.dssm-theme.ant-select-dropdown::before,.dssm-theme.ant-dropdown::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-menu-surface-fill,var(--dsw-specific-menu));backdrop-filter:var(--dsw-menu-backdrop-filter,none);pointer-events:none}
.dssm-theme.ant-dropdown .ant-dropdown-menu-item,.dssm-theme.ant-select-dropdown .ant-select-item{border-radius:var(--dsw-radius-md,12px)}
.dssm-theme.ant-select-dropdown{--dssm-ant-select-option-selected-bg:var(--dsw-alias-state-business-tertiary);--dssm-ant-select-option-selected-color:var(--dsw-alias-label-primary);--dssm-ant-select-option-active-bg:var(--dsw-alias-interactive-bg-hover)}
.dssm-theme.ant-segmented{--dssm-ant-segmented-track-bg:var(--dsw-alias-interactive-bg-hover);--dssm-ant-segmented-item-selected-bg:var(--dsw-alias-bg-layer-1);--dssm-ant-segmented-item-selected-color:var(--dsw-alias-label-primary);--dssm-ant-segmented-item-color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-md,12px);padding:4px}
.dssm-theme.ant-segmented .ant-segmented-item,.dssm-theme.ant-segmented .ant-segmented-thumb{border-radius:var(--dsw-radius-sm,8px)}
`;
