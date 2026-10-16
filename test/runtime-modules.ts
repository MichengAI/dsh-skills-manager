import React from "react";

export function Button(props: any) {
  const { variant, size, loading, danger, className, style, ...rest } = props;
  const isSm = size === "sm" || size === "small";
  const isPrimary = variant === "primary";
  const cls = [
    className,
    variant ? `btn-${variant}` : "",
    size ? `btn-${size}` : "",
    danger ? "is-danger" : "",
  ].filter(Boolean).join(" ");
  const combinedStyle = {
    borderRadius: isSm ? "var(--dsw-radius-sm, 8px)" : "var(--dsw-radius-md, 12px)",
    height: isSm ? "28px" : "36px",
    background: isPrimary ? "var(--dsw-alias-button-primary-fill)" : undefined,
    color: isPrimary ? "var(--dsw-alias-label-primary-foreground)" : undefined,
    ...style,
  };
  return React.createElement("button", { ...rest, className: cls || undefined, style: combinedStyle, type: props.type || "button" }, props.children);
}

export function Menu(props: any) {
  return React.createElement("div", { className: "dsh-primitives-menu" },
    props.anchor,
    props.open ? React.createElement("div", { role: "listbox" },
      props.items?.map((item: any) =>
        React.createElement("div", {
          key: item.id,
          role: "option",
          "aria-selected": props.selectedId === item.id,
          onClick: () => props.onSelect?.(item.id),
        }, item.label)
      )
    ) : null
  );
}

export function Input(props: any) {
  const { icon, className, ...rest } = props;
  return React.createElement("span", { className: ["dsh-input-wrapper", className].filter(Boolean).join(" ") },
    icon ? React.createElement("span", { className: "dsh-input-icon" }, icon) : null,
    React.createElement("input", { ...rest, className: "dsh-input-native" })
  );
}

export function Modal(props: any) {
  if (!props.open) return null;
  return React.createElement("div", { role: "dialog", "aria-modal": "true", className: ["dsh-modal", props.className].filter(Boolean).join(" ") },
    props.title ? React.createElement("div", { className: "dsh-modal-header" }, props.title) : null,
    React.createElement("div", { className: ["dsh-modal-body", props.contentClassName].filter(Boolean).join(" ") }, props.children),
    props.footer ? React.createElement("div", { className: "dsh-modal-footer" }, props.footer) : null
  );
}
