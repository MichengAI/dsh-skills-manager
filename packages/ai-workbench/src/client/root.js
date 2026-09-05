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
    children: ROOT_CHILDREN,
    store: () => createLayoutStore(defineStore),
    inject(actions) {
      if (typeof ctx.layout?.attachPanels !== "function") throw new Error("DSH layout.attachPanels is unavailable");
      ctx.layout.attachPanels(actions);
      return {};
    },
  };
}

export function createRootComponent(React) {
  const h = React.createElement;
  return function WorkbenchFrame({ useStore, actions, renderSlot }) {
    const panels = useStore((value) => value);
    const collapsed = panels.narrow ? !panels.narrowExpanded : panels.sidebar === 0;
    const sidebar = collapsed ? 56 : panels.sidebar;
    return h("div", { className: "daw-frame", style: { gridTemplateColumns: `${sidebar}px minmax(0,1fr) ${panels.details}px` } },
      h("aside", { className: "daw-sidebar" }, renderSlot("sidebar", { collapsed, width: sidebar, toggleSidebar: actions.toggleSidebar })),
      h("main", { className: "daw-center" }, renderSlot("conversation", {})),
      h("aside", { className: "daw-details" }, renderSlot("details", {})),
      h("div", { className: "daw-overlay" }, renderSlot("shell.overlay", {})),
    );
  };
}
