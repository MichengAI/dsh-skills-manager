const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

function focusableElements(container) {
  return Array.from(container.querySelectorAll?.(FOCUSABLE_SELECTOR) || [])
    .filter((element) => typeof element.focus === "function" && !element.disabled);
}

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
        onKeyDown: (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;

          const elements = focusableElements(event.currentTarget);
          if (elements.length === 0) {
            event.preventDefault();
            closeButton.current?.focus();
            return;
          }

          const currentIndex = elements.indexOf(document.activeElement);
          const lastIndex = elements.length - 1;
          const nextIndex = event.shiftKey
            ? currentIndex <= 0 ? lastIndex : currentIndex - 1
            : currentIndex < 0 || currentIndex === lastIndex ? 0 : currentIndex + 1;
          const isBoundary = event.shiftKey ? currentIndex <= 0 : currentIndex < 0 || currentIndex === lastIndex;
          if (isBoundary) {
            event.preventDefault();
            elements[nextIndex].focus();
          }
        },
      },
      h("div", { className: "daw-dialog-header" },
        h("h2", { id: titleId }, dialog.title),
        h("button", { ref: closeButton, type: "button", className: "daw-dialog-close", onClick: onClose, "aria-label": "关闭" }, "×")),
      h("p", { className: "daw-dialog-message" }, dialog.message)),
    );
  };
}
