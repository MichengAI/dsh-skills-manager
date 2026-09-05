const MODES = new Set(["work", "chat"]);

function validMode(mode) {
  return MODES.has(mode);
}

export function initialState() {
  return {
    mode: "work",
    route: { name: "home", mode: "work" },
    drafts: { work: { text: "", attachments: [], capabilityIds: [] }, chat: { text: "", attachments: [] } },
    history: { work: [], chat: [] },
    loading: false,
    error: null,
    sidebarCollapsed: false,
    dialog: null,
  };
}

export function reduceWorkbench(state, action) {
  switch (action.type) {
    case "mode/change":
      if (!validMode(action.mode)) return state;
      return { ...state, mode: action.mode, route: { name: "home", mode: action.mode }, dialog: null };
    case "draft/change":
      if (!validMode(action.mode)) return state;
      return { ...state, drafts: { ...state.drafts, [action.mode]: { ...state.drafts[action.mode], text: action.text } } };
    case "draft/replace":
      if (!validMode(action.mode)) return state;
      return { ...state, drafts: { ...state.drafts, [action.mode]: structuredClone(action.draft) } };
    case "bootstrap/start":
      if (action.mode !== undefined && !validMode(action.mode)) return state;
      return { ...state, loading: true, error: null };
    case "bootstrap/success":
      if (!validMode(action.mode)) return state;
      return { ...state, loading: false, drafts: { ...state.drafts, [action.mode]: structuredClone(action.data.draft) }, history: { ...state.history, [action.mode]: structuredClone(action.data.history) } };
    case "bootstrap/error":
      if (action.mode !== undefined && !validMode(action.mode)) return state;
      return { ...state, loading: false, error: action.error };
    case "navigate":
      if (action.route?.mode !== undefined && !validMode(action.route.mode)) return state;
      return { ...state, route: action.route, dialog: null };
    case "dialog/open":
      return { ...state, dialog: action.dialog };
    case "dialog/close":
      return { ...state, dialog: null };
    case "sidebar/toggle":
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    default:
      return state;
  }
}
