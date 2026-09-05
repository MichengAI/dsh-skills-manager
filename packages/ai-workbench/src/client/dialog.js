export function createDialog(React) {
  const h = React.createElement;
  return function Dialog({ dialog, onClose }) {
    const closeButton = React.useRef(null);
    const previousFocus = React.useRef(null);

    React.useEffect(() => {
      previousFocus.current = document.activeElement;
      closeButton.current?.focus();
      return () => {
        const target = previousFocus.current;
        if (target && typeof target.focus === "function") target.focus();
      };
    }, []);

    if (!dialog) return null;
    const titleId = "daw-dialog-title";
    return h("div", { className: "daw-dialog-backdrop", onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
      h("section", {
        className: "daw-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
        onKeyDown: (event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } },
      },
      h("div", { className: "daw-dialog-header" },
        h("h2", { id: titleId }, dialog.title),
        h("button", { ref: closeButton, type: "button", className: "daw-dialog-close", onClick: onClose, "aria-label": "关闭" }, "×")),
      h("p", { className: "daw-dialog-message" }, dialog.message)),
    );
  };
}
