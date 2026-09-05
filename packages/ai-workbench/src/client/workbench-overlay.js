import { createSidebar } from "./sidebar.js";
import { createWorkbenchShell } from "./shell.js";

const EMPTY_STATE = {
  mode: "work",
  route: { name: "home", mode: "work" },
  drafts: { work: {}, chat: {} },
  history: { work: [], chat: [] },
  dialog: null,
};

export function createWorkbenchOverlay(React, options = {}) {
  const h = React.createElement;
  const Sidebar = createSidebar(React);
  const WorkbenchShell = createWorkbenchShell(React, { chatConfig: options.chatConfig });

  function WorkbenchOverlayBody({ onClose }) {
    const workbench = options.context ? React.useContext(options.context) : null;
    const state = workbench?.state || EMPTY_STATE;
    const renderEmptySlot = () => null;
    return h("section", { className: "daw-workbench-overlay", role: "dialog", "aria-modal": "true", "aria-label": "正方 AI 工作台" }, [
      h("div", { className: "daw-workbench-overlay-bar", key: "bar" }, [h("strong", { key: "title" }, "正方 AI 工作台"), h("button", { type: "button", className: "daw-tool-button", onClick: onClose, key: "close" }, "返回 DSH")]),
      h("div", { className: "daw-workbench-overlay-frame", key: "frame" }, [
        h("aside", { className: "daw-sidebar", key: "sidebar" }, h(Sidebar, {
          state,
          settings: workbench?.settings,
          dispatch: workbench?.dispatch,
          sessions: workbench?.sessions,
          renderSlot: renderEmptySlot,
          collapsed: false,
          toggleSidebar: renderEmptySlot,
        })),
        h("main", { className: "daw-center", key: "center" }, h(WorkbenchShell, {
          state,
          renderSlot: renderEmptySlot,
          useSessions: null,
          workbench,
        })),
      ]),
    ]);
  }

  return function WorkbenchOverlay() {
    const [open, setOpen] = React.useState(false);
    if (!open) return h("button", { type: "button", className: "daw-workbench-launcher", "aria-label": "打开正方 AI 工作台", onClick: () => setOpen(true) }, "打开正方 AI 工作台");
    return h(options.provider, { onConversation: () => setOpen(false) }, h(WorkbenchOverlayBody, { onClose: () => setOpen(false) }));
  };
}
