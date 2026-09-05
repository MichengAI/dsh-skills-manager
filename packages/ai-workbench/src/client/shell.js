import { createWorkHome } from "./work-home.js";
import { createChatHome } from "./chat-home.js";
import { createCapabilityLibrary } from "./capability-library.js";

export const ORB_SOURCE = "/assets/ai-orb.png";

function clearSession(sessions) {
  if (typeof sessions?.clear === "function") sessions.clear();
}

export function createWorkbenchShell(React, options = {}) {
  const h = React.createElement;
  const WorkHome = createWorkHome(React, options);
  const ChatHome = createChatHome(React, options);
  const CapabilityLibrary = createCapabilityLibrary(React, options);

  function Home({ mode, draft }) {
    const title = mode === "work" ? "从一个任务开始" : "从一个问题开始";
    const description = mode === "work" ? "让 AI 帮你完成工作、整理信息并交付成果。" : "和 AI 对话，探索想法、理解知识、解决问题。";
    return h("section", { className: "daw-placeholder daw-home", "aria-labelledby": "daw-home-title" },
      h("img", { className: "daw-ai-orb", src: ORB_SOURCE, alt: "", width: 144, height: 144 }),
      h("p", { className: "daw-eyebrow" }, mode === "work" ? "WORK MODE" : "CHAT MODE"),
      h("h1", { id: "daw-home-title" }, title),
      h("p", { className: "daw-placeholder-copy" }, description),
      draft?.text ? h("p", { className: "daw-draft-preview" }, `草稿：${draft.text}`) : null,
    );
  }

  function Placeholder({ title, copy }) {
    return h("section", { className: "daw-placeholder", "aria-labelledby": "daw-placeholder-title" },
      h("span", { className: "daw-placeholder-icon", "aria-hidden": "true" }, "✦"),
      h("h1", { id: "daw-placeholder-title" }, title),
      h("p", { className: "daw-placeholder-copy" }, copy),
      h("span", { className: "daw-coming-soon" }, "即将开放"),
    );
  }

  return function WorkbenchShell({ state, renderSlot, useSessions, workbench }) {
    const currentSessionId = useSessions ? useSessions((snapshot) => snapshot.current) : undefined;
    React.useEffect(() => {
      if (state.route.name === "home") clearSession(workbench?.sessions);
    }, [state.route.name, state.route.mode, currentSessionId, workbench?.sessions]);
    if (state.route.name === "home") {
      if (state.mode === "work") return h(WorkHome, { state, dispatch: workbench?.dispatch, workbench });
      return h(ChatHome, { state, dispatch: workbench?.dispatch, workbench });
    }
    if (state.route.name === "conversation") return renderSlot("conversation", {});
    if (currentSessionId) return renderSlot("conversation", {});
    if (state.route.name === "capabilities") return h(CapabilityLibrary, { workbench });
    if (state.route.name === "automations") return h(Placeholder, { title: "自动化任务", copy: "让重复工作自动运行，稍后回来查看成果。" });
    if (state.mode === "work") return h(WorkHome, { state, dispatch: workbench?.dispatch, workbench });
    return h(ChatHome, { state, dispatch: workbench?.dispatch, workbench });
  };
}
