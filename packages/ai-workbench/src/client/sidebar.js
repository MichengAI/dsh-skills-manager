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
const CHAT_PRESET_ID = "zf-chat-workbench-v1";

export function navigationFor(mode) {
  return (mode === "chat" ? CHAT : WORK).map(([id, label, available, route]) => ({ id, label, available, route }));
}

export function defaultWorkspaceId(workspaces) {
  const snapshot = workspaces?.list?.getSnapshot?.() || workspaces?.getSnapshot?.();
  return workspaceIdFromSnapshot(snapshot);
}

function workspaceIdFromSnapshot(snapshot) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const item = items.find((candidate) => typeof (candidate?.workspaceId || candidate?.id) === "string");
  return item?.workspaceId || item?.id || snapshot?.recentWorkspaceId || null;
}

function nativeSessionId(value) {
  return typeof value === "string"
    ? value
    : value?.sessionId
      || value?.id
      || value?.value?.sessionId
      || value?.result?.value?.sessionId
      || null;
}

export async function resolveDefaultWorkspaceId(workspaces, ctx) {
  const read = workspaces?.list?.getSnapshot || workspaces?.getSnapshot;
  if (typeof read !== "function") return null;
  if (typeof workspaces?.refresh === "function") await Promise.resolve(workspaces.refresh()).catch(() => {});
  const connection = ctx?.connection || ctx?.get?.("connection");
  const list = connection?.api?.workspace?.list;
  if (typeof list === "function") {
    try {
      const response = await list.call(connection.api.workspace, {});
      if (response?.result?.ok) {
        const workspaceId = workspaceIdFromSnapshot(response.result.value);
        if (workspaceId) return workspaceId;
      }
    } catch {
      // The runtime projection may still become ready after a transient RPC failure.
    }
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const workspaceId = defaultWorkspaceId(workspaces);
    if (workspaceId) return workspaceId;
    const snapshot = read.call(workspaces.list || workspaces);
    if (snapshot?.state === "error") return null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return defaultWorkspaceId(workspaces);
}

async function openWhenListed(sessions, sessionId) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = sessions?.list?.getSnapshot?.();
    const listed = !snapshot || !Array.isArray(snapshot.ids) || snapshot.ids.includes(sessionId);
    if (listed) {
      try {
        sessions?.open?.(sessionId);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw lastError || new Error("DSH 会话尚未进入可打开列表");
}

export async function createNativeSession(sessions, workspaces, mode, workspaceId) {
  if (workspaceId && typeof sessions?.create === "function") {
    const created = await sessions.create({ workspaceId });
    const sessionId = nativeSessionId(created);
    if (sessionId) return sessionId;
    if (created?.ok === false || created?.result?.ok === false) {
      throw new Error(created.error?.message || created.result?.error?.message || "DSH 工作区会话创建失败");
    }
  }
  if (workspaceId && typeof workspaces?.connectWorkspace === "function") {
    try {
      const connected = await workspaces.connectWorkspace(workspaceId);
      const sessionId = nativeSessionId(connected);
      if (sessionId) return sessionId;
      if (connected?.ok === false || connected?.result?.ok === false) {
        throw new Error(connected.error?.message || connected.result?.error?.message || "DSH 工作区会话创建失败");
      }
      return connected;
    } catch (error) {
      if (typeof sessions?.create !== "function") throw error;
    }
  }
  if (typeof workspaces?.startSession === "function") {
    const before = sessions?.list?.getSnapshot?.()?.current;
    workspaces.startSession(workspaceId || undefined);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = sessions?.list?.getSnapshot?.()?.current;
      if (current && current !== before) return current;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (typeof sessions?.create !== "function") return null;
  const created = await sessions.create(workspaceId ? { workspaceId } : {});
  const sessionId = nativeSessionId(created);
  if (sessionId) return sessionId;
  if (created?.ok === false || created?.result?.ok === false) {
    throw new Error(created.error?.message || created.result?.error?.message || "DSH 原生会话创建失败");
  }
  return created;
}

export async function selectNativeAgentPreset(ctx, sessions, sessionId, mode) {
  if (mode !== "chat" || !sessionId) return null;
  const connection = ctx?.connection || ctx?.get?.("connection");
  const agentPresets = connection?.api?.agentPresets;
  if (typeof agentPresets?.select !== "function") {
    throw new Error("DSH Chat 预设选择服务不可用");
  }
  const response = await agentPresets.select({ sessionId, agentPreset: CHAT_PRESET_ID });
  if (!response?.result?.ok) {
    throw new Error(response?.result?.error?.message || "DSH Chat 预设选择失败");
  }
  sessions?.noteAgentPreset?.(sessionId, response.result.value?.agentPreset || CHAT_PRESET_ID);
  return response.result.value;
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

  return function Sidebar({ state, settings, dispatch, sessions, workspaces, api, renderSlot, collapsed, toggleSidebar, ctx }) {
    const [query, setQuery] = React.useState("");
    const [actionError, setActionError] = React.useState(null);
    const newSessionSequence = typeof React.useRef === "function" ? React.useRef(0) : { current: 0 };
    const pendingNewSession = typeof React.useRef === "function" ? React.useRef(null) : { current: null };
    const items = navigationFor(state.mode);
    const history = (state.history[state.mode] || []).filter((item) => {
      const needle = query.trim().toLowerCase();
      return !needle || String(item.title || "未命名").toLowerCase().includes(needle);
    });
    const displayName = settings?.localDisplayName || "本地用户";
    const openSession = (sessionId) => {
      sessions?.open?.(sessionId);
      dispatch({ type: "navigate", route: { name: "conversation", mode: state.mode, sessionId } });
    };

    const openNewSession = async () => {
      if (typeof api?.prepareSession !== "function") {
        clearSession(sessions);
        dispatch({ type: "navigate", route: { name: "home", mode: state.mode } });
        return;
      }
      if (pendingNewSession.current) return pendingNewSession.current;
      setActionError(null);
      const draftKey = `sidebar:${state.mode}:${newSessionSequence.current}`;
      const workspaceId = state.drafts?.[state.mode]?.workspaceId
        || state.drafts?.work?.workspaceId
        || await resolveDefaultWorkspaceId(workspaces, ctx)
        || null;
      const request = Promise.resolve(createNativeSession(sessions, workspaces, state.mode, workspaceId))
        .then((nativeSession) => {
          const sessionId = nativeSessionId(nativeSession);
          return selectNativeAgentPreset(ctx, sessions, sessionId, state.mode).then(() =>
            api.prepareSession({ mode: state.mode, draftKey, workspaceId, ...(sessionId ? { sessionId } : {}) }),
          );
        })
        .then(async (result) => {
          if (!result?.sessionId) throw new Error("会话准备未返回 sessionId");
          await sessions?.refresh?.();
          await openWhenListed(sessions, result.sessionId);
          dispatch({ type: "navigate", route: { name: "conversation", mode: state.mode, sessionId: result.sessionId } });
          newSessionSequence.current += 1;
          return result;
        })
        .catch((error) => {
          setActionError(error?.message || "暂时无法创建会话");
          dispatch({ type: "dialog/open", dialog: { title: "新建会话失败", message: error?.message || "暂时无法创建会话" } });
        })
        .finally(() => {
          pendingNewSession.current = null;
        });
      pendingNewSession.current = request;
      return request;
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
            onClick: () => item.route === "home" ? openNewSession() : dispatchNavigation(dispatch, item, state.mode, sessions),
            }, h("span", { className: "daw-nav-icon", "aria-hidden": "true" }, ICONS[item.id] || "•"), h("span", null, item.label)))),
        actionError ? h("p", { className: "daw-inline-error daw-sidebar-error", role: "alert" }, actionError) : null,
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
            h("span", { className: "daw-history-title" }, item.title || "未命名任务"),
            item.setupStatus === "failed" ? h("span", { className: "daw-history-badge daw-history-badge-error" }, "启动失败") : item.origin === "migration" ? h("span", { className: "daw-history-badge" }, "历史导入") : item.origin === "automation" ? h("span", { className: "daw-history-badge" }, "自动化") : null))),
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
  "sidebar.brand.mark": { kind: "single", scope: "root" },
  "sidebar.brand.name": { kind: "single", scope: "root" },
  "sidebar.workspaces": { kind: "single", scope: "root" },
  "sidebar.settings": { kind: "single", scope: "root" },
  "sidebar.footer.action": { kind: "list", scope: "root" },
};

export function createSidebarRegistration() {
  return {
    name: "sidebar",
    id: "dsh-ai-workbench",
    priority: -1,
  };
}
