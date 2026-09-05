const MODES = new Set(["work", "chat"]);

export function createDraftSaveScheduler(saveDraft, options = {}) {
  const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || globalThis.clearTimeout;
  const delay = options.delay ?? 500;
  const onError = options.onError || ((error) => console.error("[dsh-ai-workbench] draft save failed", error));
  const hydratedModes = new Set();
  const pendingTimers = new Map();

  function cancel(mode) {
    const timer = pendingTimers.get(mode);
    if (timer !== undefined) {
      clearTimeoutFn(timer);
      pendingTimers.delete(mode);
    }
  }

  return {
    hydrate(mode) {
      if (!validMode(mode)) return;
      hydratedModes.add(mode);
      cancel(mode);
    },
    schedule(mode, draft) {
      if (!validMode(mode) || !hydratedModes.has(mode)) return false;
      cancel(mode);
      const snapshot = structuredClone(draft);
      const timer = setTimeoutFn(() => {
        pendingTimers.delete(mode);
        Promise.resolve()
          .then(() => saveDraft(mode, snapshot))
          .catch(onError);
      }, delay);
      pendingTimers.set(mode, timer);
      return true;
    },
    dispose() {
      for (const mode of pendingTimers.keys()) cancel(mode);
      hydratedModes.clear();
    },
  };
}

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
    draftDirty: { work: false, chat: false },
  };
}

export function reduceWorkbench(state, action) {
  switch (action.type) {
    case "mode/change":
      if (!validMode(action.mode)) return state;
      return { ...state, mode: action.mode, route: { name: "home", mode: action.mode }, dialog: null };
    case "draft/change":
      if (!validMode(action.mode)) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [action.mode]: { ...state.drafts[action.mode], text: action.text } },
        draftDirty: { ...state.draftDirty, [action.mode]: true },
      };
    case "draft/replace":
      if (!validMode(action.mode)) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [action.mode]: structuredClone(action.draft) },
        draftDirty: { ...state.draftDirty, [action.mode]: true },
      };
    case "bootstrap/start":
      if (action.mode !== undefined && !validMode(action.mode)) return state;
      return { ...state, loading: true, error: null };
    case "bootstrap/success":
      if (!validMode(action.mode)) return state;
      return {
        ...state,
        loading: false,
        drafts: { ...state.drafts, [action.mode]: structuredClone(action.data.draft) },
        history: { ...state.history, [action.mode]: structuredClone(action.data.history) },
        draftDirty: { ...state.draftDirty, [action.mode]: false },
      };
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
