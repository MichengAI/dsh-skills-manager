import type * as React from "react";
import type { SourceSelectProps } from "./client-types.js";
import { Button, Dropdown, Select } from "./antd-ui.js";
import { handleSourceMenuEscape } from "./source-select-model.js";

/** 筛选用 Ant Design Select，操作菜单用 Dropdown。宽度跟选项走，不铺满整行。打开时在 window 捕获阶段吃掉 Escape，避免关掉宿主设置页。 */
export function createSourceSelect(react: typeof React) {
  const h = react.createElement;
  return function SourceSelect(props: SourceSelectProps) {
    const openState = react.useState(false);
    const open = openState[0];
    const setOpen = openState[1];
    react.useEffect(function () {
      if (!open || typeof window === "undefined") return undefined;
      function onKey(event: KeyboardEvent) {
        handleSourceMenuEscape(event, function () { setOpen(false); });
      }
      window.addEventListener("keydown", onKey, true);
      return function () { window.removeEventListener("keydown", onKey, true); };
    }, [open]);
    function onOpenChange(next: boolean) { setOpen(next); }
    if (props.action) {
      return h(Dropdown, {
        trigger: ["click"],
        open: open,
        onOpenChange: onOpenChange,
        menu: {
          items: props.options.map((option) => ({ key: option.value, label: option.label, disabled: option.disabled, danger: option.danger })),
          onClick: (info: { key: string }) => props.onChange(String(info.key)),
        },
      }, h(Button, { disabled: props.disabled, size: props.icon ? "small" : undefined, className: props.icon ? "dssm-row-icon" : undefined, style: props.icon ? { width: 22, minWidth: 22, height: 22, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6 } : undefined, "aria-label": props.label, title: props.label, icon: props.icon }, props.icon ? null : props.label));
    }
    return h(Select, {
      className: "dssm-antd-select",
      "aria-label": props.label,
      disabled: props.disabled,
      open: open,
      onOpenChange: onOpenChange,
      value: props.value ?? "",
      popupMatchSelectWidth: false,
      options: props.options.map((option) => ({ value: option.value, label: option.label, disabled: option.disabled })),
      onChange: (value: unknown) => props.onChange(String(value)),
    });
  };
}
