import React from "react";

export function Button(props: any) {
  const { variant, size, loading, danger, className, style, ...rest } = props;
  const isSm = size === "sm" || size === "small";
  const isPrimary = variant === "primary";
  const cls = [
    className,
    isPrimary ? "ant-btn-primary" : "",
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
