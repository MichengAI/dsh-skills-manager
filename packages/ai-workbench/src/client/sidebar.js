import { createBrand } from "./brand.js";

const WORK = [
  ["new-work", "新建任务", true, "home"],
  ["workspace", "工作空间", false, "workspace"],
  ["capabilities", "能力库", true, "capabilities"],
  ["dashboard", "数据看板", false, "dashboard"],
  ["automations", "自动化任务", true, "automations"],
  ["results", "成果空间", false, "results"],
];

const CHAT = [
  ["new-chat", "新建对话", true, "home"],
  ["agents", "智能体广场", false, "agents"],
  ["ai-tools", "AI 工具集", false, "ai-tools"],
];

export function navigationFor(mode) {
  return (mode === "chat" ? CHAT : WORK).map(([id, label, available, route]) => ({ id, label, available, route }));
}

function clearSession(sessions) {
  if (typeof sessions?.clear === "function") sessions.clear();
}

const ICONS = {
  "new-work": "＋", workspace: "▦", capabilities: "✦", dashboard: "▥", automations: "↻", results: "□",
  "new-chat": "＋", agents: "♙", "ai-tools": "⌘",
};

export function createSidebar(React) {
  const h = React.createElement;
  const Brand = createBrand(React);

  function dispatchNavigation(dispatch, item, mode, sessions) {
    if (item.available) {
      if (item.route === "home") clearSession(sessions);
      dispatch({ type: "navigate", route: { name: item.route, mode } });
    } else {
      dispatch({ type: "dialog/open", dialog: { title: item.label, message: "功能暂未开发" } });
    }
  }

  return function Sidebar({ state, settings, dispatch, sessions, renderSlot, collapsed, toggleSidebar }) {
    const [query, setQuery] = React.useState("");
    const items = navigationFor(state.mode);
    const history = (state.history[state.mode] || []).filter((item) => {
      const needle = query.trim().toLowerCase();
      return !needle || String(item.title || "未命名").toLowerCase().includes(needle);
    });
    const displayName = settings?.localDisplayName || "本地用户";
    const openSession = (sessionId) => {
      sessions?.open?.(sessionId);
      dispatch({ type: "navigate", route: { name: "conversation", mode: state.mode } });
    };

    return h("div", { className: "daw-sidebar-content", "data-collapsed": collapsed ? "true" : "false" },
      h("div", { className: "daw-sidebar-top" },
        h(Brand),
        h("div", { className: "daw-mode-switch", role: "tablist", "aria-label": "工作模式" },
          ["work", "chat"].map((mode) => h("button", {
            key: mode,
            type: "button",
            role: "tab",
            "aria-selected": state.mode === mode,
            onClick: () => {
              clearSession(sessions);
              dispatch({ type: "mode/change", mode });
            },
          }, mode === "work" ? "Work" : "Chat"))),
        h("nav", { className: "daw-mode-navigation", "aria-label": state.mode === "work" ? "Work 导航" : "Chat 导航" },
          items.map((item) => h("button", {
            key: item.id,
            type: "button",
            className: "daw-nav-button",
            "aria-current": state.route.name === item.route ? "page" : undefined,
            onClick: () => dispatchNavigation(dispatch, item, state.mode, sessions),
          }, h("span", { className: "daw-nav-icon", "aria-hidden": "true" }, ICONS[item.id] || "•"), h("span", null, item.label)))),
      ),
      h("div", { className: "daw-sidebar-divider" }),
      h("section", { className: "daw-history", "aria-label": "历史" },
        h("div", { className: "daw-history-heading" }, h("span", null, "历史"), h("span", { className: "daw-history-count" }, history.length)),
        h("label", { className: "daw-search" },
          h("span", { className: "daw-search-icon", "aria-hidden": "true" }, "⌕"),
          h("span", { className: "daw-visually-hidden" }, "搜索历史"),
          h("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "搜索历史", type: "search" })),
        h("div", { className: "daw-history-list" },
          history.length === 0
            ? h("p", { className: "daw-empty" }, "暂无历史")
            : history.map((item) => h("button", {
              key: item.sessionId,
              type: "button",
              className: "daw-history-item",
              onClick: () => openSession(item.sessionId),
            },
            h("span", { className: "daw-history-title" }, item.title || "未命名"),
            item.origin === "migration" ? h("span", { className: "daw-history-badge" }, "历史导入") : item.origin === "automation" ? h("span", { className: "daw-history-badge" }, "自动化") : null))),
      ),
      h("footer", { className: "daw-sidebar-footer" },
        h("div", { className: "daw-user-footer" }, h("span", { className: "daw-user-avatar", "aria-hidden": "true" }, displayName.slice(0, 1)), h("span", null, displayName)),
        h("div", { className: "daw-official-settings" }, renderSlot?.("sidebar.settings", {})),
        h("div", { className: "daw-official-footer-actions" }, renderSlot?.("sidebar.footer.action", {})),
        h("button", {
          type: "button",
          className: "daw-sidebar-toggle",
          onClick: toggleSidebar,
          "aria-label": collapsed ? "展开侧边栏" : "收起侧边栏",
        }, collapsed ? "›" : "‹"),
      ),
    );
  };
}

export const SIDEBAR_CHILDREN = {
  "sidebar.settings": { kind: "single", scope: "root" },
  "sidebar.footer.action": { kind: "list", scope: "root" },
};
