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

/** 单行用宿主 Input，多行挂本插件的 TextArea。 */
export const Input = Object.assign(HostInput, { TextArea });

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
