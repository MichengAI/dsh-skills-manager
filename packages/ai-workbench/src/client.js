import { probeClientContracts } from "./shared/compatibility.js";
import CHAT_HOME_CONFIG from "../assets/chat-home.json" with { type: "json" };
import { workbenchApi } from "./client/api.js";
import { createDraftSaveScheduler, initialState, reduceWorkbench } from "./client/store.js";
import { createSpeechInput } from "./client/speech-input.js";
import { automationCss, automationEnhancementCss, foundationCss, installStyles, overlayCss } from "./client/styles.js";
import { createWorkbenchOverlay } from "./client/workbench-overlay.js";

window.__ModuleLoader__.load({
  id: "@michengai/dsh-ai-workbench",
  factory: (require) => {
    const React = require("react");
    const runtime = require("@deepseek-ai/dsh-client-runtime/client");
    const WorkbenchContext = typeof React.createContext === "function" ? React.createContext(null) : { Provider: ({ children }) => children };
    const name = "ai-workbench-client";
    const inject = ["slots", "sessions", "workspaces"];

    function WorkbenchProvider({ ctx, children, onConversation }) {
      const [state, reduce] = React.useReducer(reduceWorkbench, undefined, initialState);
      const [settings, setSettings] = React.useState(null);
      const draftScheduler = React.useRef(null);
      const observedDrafts = React.useRef(state.drafts);
      const speech = React.useRef(null);
      const dispatch = (action) => {
        reduce(action);
        if (action?.type === "navigate" && action.route?.name === "conversation") onConversation?.();
      };

      if (!speech.current) speech.current = createSpeechInput(window);

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
          workspaces: ctx.workspaces,
          speech: speech.current,
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
      ctx.effect(() => installStyles(`${foundationCss}${automationCss}${automationEnhancementCss}${overlayCss}`));
      const Overlay = createWorkbenchOverlay(React, {
        context: WorkbenchContext,
        chatConfig: CHAT_HOME_CONFIG,
        provider: (props) => h(WorkbenchProvider, { ctx, ...props }),
      });
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({
        name: "shell.overlay",
        id: "dsh-ai-workbench",
        order: 100,
        label: "正方 AI 工作台",
      }, Overlay));
      return undefined;
    }
    return { apply, inject, name };
  },
});
