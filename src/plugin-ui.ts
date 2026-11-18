import React from "react";
import { Input as HostInput } from "@deepseek-ai/dsh-client-ui-primitives";

type Create = typeof React.createElement;

/** 宿主没有多行输入。令牌对齐单行 Input，不桥接成 Ant TextArea。 */
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { autoSize?: { minRows?: number; maxRows?: number } }) {
  const { autoSize, className, rows, ...rest } = props;
  return React.createElement("textarea", {
    ...rest,
    className: ["dssm-textarea", className].filter(Boolean).join(" "),
    rows: autoSize?.minRows || rows || 4,
  });
}

type InputProps = React.ComponentProps<typeof HostInput> & { allowClear?: boolean };

/** 宿主 Input 没有清除按钮；allowClear 由本插件补上，图标和配色沿用宿主令牌。 */
export const inputCss = `.dssm-input-clearable{position:relative;display:inline-flex;align-items:center;min-width:0}.dssm-input-clearable>.dssm-input-clearable-field{flex:1 1 auto;min-width:0}.dssm-input-clearable.has-value>.dssm-input-clearable-field{padding-right:30px}.dssm-input-clear{position:absolute;top:50%;right:6px;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transform:translateY(-50%)}.dssm-input-clear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.dssm-input-clear:focus-visible{outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:1px}`;

/**
 * 单行用宿主 Input，多行挂本插件的 TextArea。
 * allowClear：有内容时在右侧显示 ×，点击或按 Esc 清空并回到输入框；清空走原生 input 事件，调用方的 onChange 照常收到空值。
 * 只认受控 value；不用 hook，测试替身里的 React 也能直接渲染。
 */
export function createInput(clearLabel: () => string) {
  function ClearableInput(props: InputProps) {
    const { allowClear, ...rest } = props;
    if (!allowClear) return React.createElement(HostInput, rest);
    const { className, onKeyDown } = rest;
    const canClear = rest.value != null && String(rest.value) !== "" && !rest.disabled && !rest.readOnly;
    function clear(input: HTMLInputElement | null | undefined) {
      if (!input) return;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
    const label = clearLabel();
    return React.createElement("span", { className: ["dssm-input-clearable", canClear ? "has-value" : "", className].filter(Boolean).join(" ") },
      React.createElement(HostInput, {
        ...rest,
        className: "dssm-input-clearable-field",
        onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.key !== "Escape" || !canClear || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          clear(event.currentTarget);
        },
      }),
      canClear ? React.createElement("button", {
        type: "button",
        className: "dssm-input-clear",
        "aria-label": label,
        title: label,
        onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => clear(event.currentTarget.parentElement?.querySelector("input")),
      }, React.createElement("svg", { viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true },
        React.createElement("path", { d: "M4 4l8 8M12 4l-8 8", strokeLinecap: "round" }))) : null);
  }
  return Object.assign(ClearableInput, { TextArea });
}

/** 来源和仓库折叠箭头。方向由 aria-expanded 决定，不靠动画结束才算展开。 */
export function foldChevron(h: Create, open: boolean) {
  return h("svg", {
    className: "dssm-fold-chevron" + (open ? " is-open" : ""),
    viewBox: "0 0 16 16",
    width: 12,
    height: 12,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    "aria-hidden": true,
  }, h("path", { d: "M4 6l4 4 4-4", strokeLinecap: "round", strokeLinejoin: "round" }));
}
