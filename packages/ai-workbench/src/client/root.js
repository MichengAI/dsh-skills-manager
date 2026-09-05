import { createDialog } from "./dialog.js";
import { createSidebar } from "./sidebar.js";
import { createWorkbenchShell } from "./shell.js";

export const ROOT_CHILDREN = {
  sidebar: { kind: "single", scope: "root" },
  conversation: { kind: "single", scope: "session-maybe" },
  details: { kind: "single", scope: "session" },
  "shell.overlay": { kind: "list", scope: "root" },
};

function createLayoutStore(defineStore) {
  return defineStore({
    init: () => ({ sidebar: 280, details: 0, narrow: false, narrowExpanded: false }),
    actions: {
      setSidebar(draft, value) {
        draft.sidebar = Math.max(264, Math.min(420, value));
      },
      setDetails(draft, value) {
        draft.details = Math.max(300, Math.min(520, value));
      },
      toggleSidebar(draft) {
        if (draft.narrow) {
          draft.narrowExpanded = !draft.narrowExpanded;
        } else {
          draft.sidebar = draft.sidebar === 0 ? 280 : 0;
        }
      },
      setNarrow(draft, value) {
        draft.narrow = value;
        draft.narrowExpanded = false;
      },
      openDetails(draft) {
        if (draft.details === 0) draft.details = 360;
      },
      closeDetails(draft) {
        draft.details = 0;
      },
    },
  });
}

export function createRootRegistration(ctx, defineStore) {
  return {
    name: "root",
    priority: 1,
    children: ROOT_CHILDREN,
    store: () => createLayoutStore(defineStore),
    inject(actions) {
      if (typeof ctx.layout?.attachPanels !== "function") throw new Error("DSH layout.attachPanels is unavailable");
      ctx.layout.attachPanels(actions);
      return {};
    },
  };
}

export function createRootComponent(React, options = {}) {
  const h = React.createElement;
  const Sidebar = createSidebar(React);
  const WorkbenchShell = createWorkbenchShell(React, { config: options.chatConfig });
  const Dialog = createDialog(React);

  function WorkbenchFrame({ useStore, useSessions, actions, renderSlot }) {
    const panels = useStore((value) => value);
    const workbench = options.context ? React.useContext(options.context) : null;
    const state = workbench?.state || { mode: "work", route: { name: "home", mode: "work" }, drafts: { work: {}, chat: {} }, history: { work: [], chat: [] }, dialog: null };
    const collapsed = panels.narrow ? !panels.narrowExpanded : panels.sidebar === 0;
    const sidebar = collapsed ? 56 : panels.sidebar;
    return h("div", { className: "daw-frame", style: { gridTemplateColumns: `${sidebar}px minmax(0,1fr) ${panels.details}px` } },
      h("aside", { className: "daw-sidebar", "data-expanded": collapsed ? "false" : "true" },
        renderSlot("sidebar", {
          collapsed,
          width: sidebar,
          toggleSidebar: actions.toggleSidebar,
          state,
          settings: workbench?.settings,
          dispatch: workbench?.dispatch,
          sessions: workbench?.sessions,
        })),
      h("main", { className: "daw-center" }, h(WorkbenchShell, {
        state,
        renderSlot,
        useSessions,
        workbench,
      })),
      h("aside", { className: "daw-details" }, renderSlot("details", {})),
      h("div", { className: "daw-overlay" },
        renderSlot("shell.overlay", {}),
        state.dialog ? h(Dialog, { dialog: state.dialog, onClose: () => workbench?.dispatch?.({ type: "dialog/close" }) }) : null,
      ),
    );
  }

  if (typeof options.provider !== "function") return WorkbenchFrame;
  return function WorkbenchRoot(props) {
    return h(options.provider, null, h(WorkbenchFrame, props));
  };
}
