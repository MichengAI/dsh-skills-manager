import { probeClientContracts } from "./shared/compatibility.js";
import { workbenchApi } from "./client/api.js";
import { createRootComponent, createRootRegistration } from "./client/root.js";
import { createDraftSaveScheduler, initialState, reduceWorkbench } from "./client/store.js";
import { SIDEBAR_CHILDREN, createSidebar } from "./client/sidebar.js";
import { foundationCss, installStyles } from "./client/styles.js";

window.__ModuleLoader__.load({
  id: "@michengai/dsh-ai-workbench",
  factory: (require) => {
    const React = require("react");
    const runtime = require("@deepseek-ai/dsh-client-runtime/client");
    const WorkbenchContext = typeof React.createContext === "function" ? React.createContext(null) : { Provider: ({ children }) => children };
    const name = "ai-workbench-client";
    const inject = ["slots", "layout", "sessions"];

    function WorkbenchProvider({ ctx, children }) {
      const [state, dispatch] = React.useReducer(reduceWorkbench, undefined, initialState);
      const [settings, setSettings] = React.useState(null);
      const draftScheduler = React.useRef(null);
      const observedDrafts = React.useRef(state.drafts);

      if (!draftScheduler.current) {
        draftScheduler.current = createDraftSaveScheduler(workbenchApi.saveDraft, {
          setTimeoutFn: (callback, delay) => window.setTimeout(callback, delay),
          clearTimeoutFn: (timer) => window.clearTimeout(timer),
        });
      }

      React.useEffect(() => {
        let active = true;
        dispatch({ type: "bootstrap/start" });
        workbenchApi.bootstrap(state.mode).then((data) => {
          if (!active) return;
          draftScheduler.current.hydrate(state.mode);
          setSettings(data.settings);
          dispatch({ type: "bootstrap/success", mode: state.mode, data });
        }).catch((error) => {
          if (active) dispatch({ type: "bootstrap/error", error });
        });
        return () => { active = false; };
      }, [state.mode]);

      React.useEffect(() => {
        for (const mode of ["work", "chat"]) {
          if (state.drafts[mode] === observedDrafts.current[mode]) continue;
          observedDrafts.current[mode] = state.drafts[mode];
          if (state.draftDirty[mode]) draftScheduler.current.schedule(mode, state.drafts[mode]);
        }
      }, [state.drafts, state.draftDirty]);

      React.useEffect(() => () => draftScheduler.current?.dispose(), []);

      return h(WorkbenchContext.Provider, {
        value: {
          state,
          dispatch,
          settings,
          sessions: ctx.sessions,
          ctx,
          imageLimits: ctx.imageLimits,
          capabilities: ctx.capabilities,
          workspaceFeed: ctx.workspaceFeed,
        },
      }, children);
    }

    const h = React.createElement;
    function apply(ctx) {
      const probe = probeClientContracts(ctx);
      if (!probe.ok) {
        console.error("[dsh-ai-workbench] client compatibility failed", JSON.stringify(probe.failures));
        return undefined;
      }
      ctx.effect(() => installStyles(foundationCss));
      const registration = createRootRegistration(ctx, runtime.defineStore);
      const Sidebar = createSidebar(React);
      ctx.effect(() => {
        // The official Sidebar already declares these child slots. Reuse that
        // declaration while shadowing only the Sidebar renderer itself.
        const disposeSidebar = ctx.slots.register({ name: "sidebar", priority: 1, children: SIDEBAR_CHILDREN }, Sidebar);
        const disposeRoot = ctx.slots.register(registration, createRootComponent(React, { context: WorkbenchContext, provider: (props) => h(WorkbenchProvider, { ctx, ...props }) }));
        return () => { disposeRoot?.(); disposeSidebar?.(); };
      });
      return undefined;
    }
    return { apply, inject, name };
  },
});
