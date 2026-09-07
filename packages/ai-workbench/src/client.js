import { probeClientContracts } from "./shared/compatibility.js";
import CHAT_HOME_CONFIG from "../assets/chat-home.json" with { type: "json" };
import { workbenchApi } from "./client/api.js";
import { loadCapabilitySources } from "./client/capability-source.js";
import { createDraftSaveScheduler, createWorkbenchStateStore } from "./client/store.js";
import { createSpeechInput } from "./client/speech-input.js";
import { createSidebar, createSidebarRegistration } from "./client/sidebar.js";
import { automationCss, automationEnhancementCss, foundationCss, installStyles, overlayCss } from "./client/styles.js";
import { createWorkbenchOverlay } from "./client/workbench-overlay.js";

window.__ModuleLoader__.load({
  id: "@michengai/dsh-ai-workbench",
  factory: (require) => {
    const React = require("react");
    const runtime = require("@deepseek-ai/dsh-client-runtime/client");
    const WorkbenchContext = typeof React.createContext === "function" ? React.createContext(null) : { Provider: ({ children }) => children };
    const name = "ai-workbench-client";
    const inject = ["slots", "sessions", "workspaces", "layout", "inputTriggers", "commandUi", "conversation", "connection"];
    const stateStore = createWorkbenchStateStore();
    const Sidebar = createSidebar(React);

    function WorkbenchProvider({ ctx, children, onConversation }) {
      const [revision, setRevision] = React.useState(0);
      const state = stateStore.getState();
      const [settings, setSettings] = React.useState(null);
      const [capabilitySnapshot, setCapabilitySnapshot] = React.useState(null);
      const draftScheduler = React.useRef(null);
      const observedDrafts = React.useRef(state.drafts);
      const speech = React.useRef(null);
      const dispatch = (action) => {
        stateStore.dispatch(action);
        if (action?.type === "navigate" && action.route?.name === "conversation") onConversation?.();
      };

      React.useEffect(() => stateStore.subscribe(() => setRevision((value) => value + 1)), []);
      void revision;

      if (!speech.current) speech.current = createSpeechInput(window);

      if (!draftScheduler.current) {
        draftScheduler.current = createDraftSaveScheduler(workbenchApi.saveDraft, {
          setTimeoutFn: (callback, delay) => window.setTimeout(callback, delay),
          clearTimeoutFn: (timer) => window.clearTimeout(timer),
        });
      }

      const getService = (key, fallback) => fallback || ctx?.get?.(key);

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
        let active = true;
        loadCapabilitySources().then((snapshot) => {
          if (active) setCapabilitySnapshot(snapshot);
        }).catch(() => {
          if (active) setCapabilitySnapshot({ items: [] });
        });
        return () => { active = false; };
      }, []);

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
          ctx,
          api: workbenchApi,
          state,
          dispatch,
          settings,
          capabilities: capabilitySnapshot?.items || [],
          sessions: getService("sessions", ctx.sessions),
          workspaces: getService("workspaces", ctx.workspaces),
          layout: getService("layout", ctx.layout),
          inputTriggers: getService("inputTriggers", ctx.inputTriggers),
          commandUi: getService("commandUi", ctx.commandUi),
          speech: speech.current,
        },
      }, children);
    }

    const h = React.createElement;
    function apply(ctx) {
      const probe = probeClientContracts(ctx, { nativeConversation: true });
      if (!probe.ok) {
        console.error("[dsh-ai-workbench] client compatibility failed", JSON.stringify(probe.failures));
        return undefined;
      }
      ctx.effect(() => installStyles(`${foundationCss}${automationCss}${automationEnhancementCss}${overlayCss}`));
      const Overlay = createWorkbenchOverlay(React, {
        context: WorkbenchContext,
        chatConfig: CHAT_HOME_CONFIG,
        provider: (props) => h(WorkbenchProvider, { ctx, ...props }),
      });
      function NativeSidebar(props) {
        function NativeSidebarBody() {
          const workbench = React.useContext(WorkbenchContext);
          return h(Sidebar, {
            ...props,
            state: workbench?.state,
            settings: workbench?.settings,
            dispatch: workbench?.dispatch,
            sessions: workbench?.sessions,
            workspaces: workbench?.workspaces,
            api: workbench?.api,
            ctx: workbench?.ctx,
            renderSlot: props.renderSlot,
          });
        }
        return h(WorkbenchProvider, { ctx }, h(NativeSidebarBody));
      }
      ctx.slots.inject("sidebar", () => {
        return ctx.slots.register(createSidebarRegistration(), NativeSidebar);
      });
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "dsh-ai-workbench-overlay",
        order: 100,
        label: "正方 AI 工作台",
      }, Overlay));
      return undefined;
    }
    return { apply, inject, name };
  },
});
