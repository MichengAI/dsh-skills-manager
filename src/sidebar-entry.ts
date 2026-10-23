import * as React from "react";
import { Switch as PrimitiveSwitch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ClientContext, Translate } from "./client-types.js";
import { SKILL_PATHS } from "./settings-nav-icon.js";

const h = React.createElement;

export const BUNDLE_KEY = "@michengai/dsh-skills-manager";
export const SIDEBAR_PANEL_ID = "skills-manager";
export const SIDEBAR_PANEL_ORDER = 2;

export const sidebarLocales = {
  zh: {
    "sidebar.entry.title": "侧边栏入口",
    "sidebar.entry.desc": "在侧栏「插件」下方显示技能。设置里的入口不变。",
    "sidebar.entry.toggle": "切换侧边栏入口",
    "update.entry.title": "在线更新",
    "update.entry.desc": "允许检查并在线安装技能管理器的新版本。关闭后隐藏更新入口。",
    "update.entry.toggle": "切换在线更新",
  },
  en: {
    "sidebar.entry.title": "Sidebar entry",
    "sidebar.entry.desc": "Show Skills below Plugins in the sidebar. The Settings entry stays either way.",
    "sidebar.entry.toggle": "Toggle sidebar entry",
    "update.entry.title": "Online updates",
    "update.entry.desc": "Allow checking and installing new versions online. Hides the update entry when disabled.",
    "update.entry.toggle": "Toggle online updates",
  },
};

export const SIDEBAR_ENTRY_STYLE_ID = "dssm-sidebar-entry-style";

export const sidebarEntryCss = `
.dssm-main-panel{box-sizing:border-box;height:100%;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:28px clamp(24px,4vw,48px) 48px}
.dssm-main-panel>*{width:100%;max-width:960px}
.dssm-bundle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.dssm-bundle-label-box{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;text-align:left}
.dssm-bundle-title{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.dssm-bundle-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
`;

export function ensureSidebarEntryStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(SIDEBAR_ENTRY_STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = SIDEBAR_ENTRY_STYLE_ID;
  style.textContent = sidebarEntryCss;
  (document.head ?? document.documentElement).appendChild(style);
}

export function SkillSidebarIcon(props?: { size?: number }) {
  const size = props && typeof props.size === "number" ? props.size : 16;
  return h("svg", {
    viewBox: "0 0 16 16",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": "true",
    focusable: "false",
    dangerouslySetInnerHTML: { __html: SKILL_PATHS },
  } as React.SVGProps<SVGSVGElement>);
}

export function SkillBundleConfigCard(props: {
  t: Translate;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  onlineUpdateEnabled?: boolean;
  onToggleOnlineUpdate?: (enabled: boolean) => void;
  onlineUpdateDisabled?: boolean;
}) {
  ensureSidebarEntryStyle();
  const {
    t,
    enabled,
    onToggle,
    disabled,
    onlineUpdateEnabled = true,
    onToggleOnlineUpdate,
    onlineUpdateDisabled,
  } = props;

  const rows = [
    h("div", { key: "sidebar-entry", className: "dssm-bundle-row" },
      h("div", { className: "dssm-bundle-label-box" },
        h("span", { className: "dssm-bundle-title" }, t("sidebar.entry.title")),
        h("span", { className: "dssm-bundle-desc" }, t("sidebar.entry.desc"))
      ),
      h(PrimitiveSwitch, {
        checked: enabled,
        onChange: onToggle,
        label: t("sidebar.entry.toggle"),
        disabled: disabled,
      })
    ),
  ];

  if (typeof onToggleOnlineUpdate === "function") {
    rows.push(
      h("div", { key: "online-update", className: "dssm-bundle-row" },
        h("div", { className: "dssm-bundle-label-box" },
          h("span", { className: "dssm-bundle-title" }, t("update.entry.title")),
          h("span", { className: "dssm-bundle-desc" }, t("update.entry.desc"))
        ),
        h(PrimitiveSwitch, {
          checked: onlineUpdateEnabled,
          onChange: onToggleOnlineUpdate,
          label: t("update.entry.toggle"),
          disabled: onlineUpdateDisabled,
        })
      )
    );
  }

  return h(React.Fragment, null, rows);
}

function SkillBundleConfigCardWrapper(props: {
  t: Translate;
  getEnabled: () => boolean;
  setSidebar: (next: boolean) => Promise<unknown>;
  getOnlineUpdateEnabled?: () => boolean;
  setOnlineUpdate?: (next: boolean) => Promise<unknown>;
  onlineUpdateLocked?: boolean;
  subscribe: (fn: () => void) => () => void;
}) {
  const [enabled, setEnabled] = React.useState(props.getEnabled);
  const [onlineUpdateEnabled, setOnlineUpdateEnabled] = React.useState(props.getOnlineUpdateEnabled ? props.getOnlineUpdateEnabled : () => true);
  const [savingSidebar, setSavingSidebar] = React.useState(false);
  const [savingUpdate, setSavingUpdate] = React.useState(false);

  React.useEffect(() => {
    setEnabled(props.getEnabled());
    if (props.getOnlineUpdateEnabled) {
      setOnlineUpdateEnabled(props.getOnlineUpdateEnabled());
    }
    return props.subscribe(() => {
      setEnabled(props.getEnabled());
      if (props.getOnlineUpdateEnabled) {
        setOnlineUpdateEnabled(props.getOnlineUpdateEnabled());
      }
    });
  }, [props]);

  const onToggleSidebar = (next: boolean) => {
    setSavingSidebar(true);
    setEnabled(next);
    props.setSidebar(next).catch(() => {
      setEnabled(props.getEnabled());
    }).finally(() => {
      setSavingSidebar(false);
    });
  };

  const onToggleOnlineUpdate = props.setOnlineUpdate ? (next: boolean) => {
    setSavingUpdate(true);
    setOnlineUpdateEnabled(next);
    props.setOnlineUpdate!(next).catch(() => {
      if (props.getOnlineUpdateEnabled) {
        setOnlineUpdateEnabled(props.getOnlineUpdateEnabled());
      }
    }).finally(() => {
      setSavingUpdate(false);
    });
  } : undefined;

  return h(SkillBundleConfigCard, {
    t: props.t,
    enabled,
    disabled: savingSidebar,
    onToggle: onToggleSidebar,
    onlineUpdateEnabled,
    onlineUpdateDisabled: savingUpdate || !!props.onlineUpdateLocked,
    onToggleOnlineUpdate: props.onlineUpdateLocked ? undefined : onToggleOnlineUpdate,
  });
}

export interface SetupSidebarEntryOptions {
  callApi: (path: "/sidebar-entry" | "/online-update", options?: RequestInit) => Promise<{ enabled: boolean; locked?: boolean }>;
  headers: Record<string, string>;
  renderPanel: (ownerProps?: any) => React.ReactNode;
  ns: string;
  onOnlineUpdateChange?: (enabled: boolean) => void;
}

export interface SidebarEntryController {
  isEnabled(): boolean;
  isSupported(): boolean;
  setEnabled(enabled: boolean): Promise<boolean>;
  isOnlineUpdateEnabled(): boolean;
  setOnlineUpdate(enabled: boolean): Promise<boolean>;
  destroy(): void;
}

export function setupSidebarEntry(
  ctx: ClientContext,
  options: SetupSidebarEntryOptions
): SidebarEntryController {
  ensureSidebarEntryStyle();
  if (!ctx.locale) {
    return {
      isEnabled: () => false,
      isSupported: () => false,
      setEnabled: async () => false,
      isOnlineUpdateEnabled: () => true,
      setOnlineUpdate: async () => false,
      destroy: () => {},
    };
  }
  const { callApi, headers, renderPanel, ns } = options;
  let sidebarEntryEnabled = false;
  let sidebarSupported = false;
  let offPanel: (() => void) | null = null;
  let offRow: (() => void) | null = null;
  let epoch = 0;
  let layoutService: {
    selectPanel(id: string | null): void;
    panelInfo?: { getSnapshot(): { activePanelId?: string | null } };
  } | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      try { listener(); } catch {}
    }
  };

  const sync = () => {
    if (sidebarSupported && sidebarEntryEnabled) {
      if (!offPanel) {
        const res = ctx.slots.register({
          name: "main",
          key: SIDEBAR_PANEL_ID,
          locale: ns,
          inject: () => ({ t: ctx.locale?.bind ? ctx.locale.bind(ns) : undefined }),
        }, (ownerProps?: any) => h("div", { className: "dssm-main-panel" }, renderPanel(ownerProps)));
        offPanel = typeof res === "function" ? (res as () => void) : () => {};
      }
      if (!offRow) {
        const res = ctx.slots.register({
          name: "sidebar.panellist",
          id: SIDEBAR_PANEL_ID,
          order: SIDEBAR_PANEL_ORDER,
          label: () => ctx.locale.bind(ns)("title"),
          locale: ns,
        }, ((ownerProps?: { size?: number }) => h(SkillSidebarIcon as any, ownerProps)) as any);
        offRow = typeof res === "function" ? (res as () => void) : () => {};
      }
    } else {
      if (layoutService?.panelInfo && typeof layoutService.selectPanel === "function") {
        try {
          if (layoutService.panelInfo.getSnapshot().activePanelId === SIDEBAR_PANEL_ID) {
            layoutService.selectPanel(null);
          }
        } catch {}
      }
      if (offRow) {
        try { offRow(); } catch {}
        offRow = null;
      }
      if (offPanel) {
        try { offPanel(); } catch {}
        offPanel = null;
      }
    }
  };

  const setEnabled = async (next: boolean): Promise<boolean> => {
    const currentEpoch = ++epoch;
    sidebarEntryEnabled = next;
    sync();
    notify();
    try {
      await callApi("/sidebar-entry", {
        method: "POST",
        headers,
        body: JSON.stringify({ enabled: next }),
      });
      return next;
    } catch (err) {
      if (currentEpoch === epoch) {
        sidebarEntryEnabled = !next;
        sync();
        notify();
      }
      throw err;
    }
  };

  let onlineUpdateEnabled = true;
  let onlineUpdateLocked = false;
  let updateEpoch = 0;

  const setOnlineUpdate = async (next: boolean): Promise<boolean> => {
    const currentEpoch = ++updateEpoch;
    onlineUpdateEnabled = next;
    notify();
    if (typeof options.onOnlineUpdateChange === "function") {
      try { options.onOnlineUpdateChange(next); } catch {}
    }
    try {
      await callApi("/online-update", {
        method: "POST",
        headers,
        body: JSON.stringify({ enabled: next }),
      });
      return next;
    } catch (err) {
      if (currentEpoch === updateEpoch) {
        onlineUpdateEnabled = !next;
        notify();
        if (typeof options.onOnlineUpdateChange === "function") {
          try { options.onOnlineUpdateChange(!next); } catch {}
        }
      }
      throw err;
    }
  };

  // 读取服务端已保存的状态
  const loadEpoch = epoch;
  callApi("/sidebar-entry")
    .then((res) => {
      if (epoch === loadEpoch && res && typeof res.enabled === "boolean") {
        sidebarEntryEnabled = res.enabled;
        sync();
        notify();
      }
    })
    .catch(() => {});

  const loadUpdateEpoch = updateEpoch;
  callApi("/online-update")
    .then((res) => {
      if (updateEpoch === loadUpdateEpoch && res && typeof res.enabled === "boolean") {
        onlineUpdateEnabled = res.enabled;
        if (res.locked === true) onlineUpdateLocked = true;
        notify();
        if (typeof options.onOnlineUpdateChange === "function") {
          try { options.onOnlineUpdateChange(res.enabled); } catch {}
        }
      }
    })
    .catch(() => {});

  // 监听宿主 layout 服务
  if (typeof (ctx as any).inject === "function") {
    (ctx as any).inject(["layout"], (scoped: any) => {
      layoutService = scoped.layout;
    });
  }

  // 监听 sidebar.panellist 槽位
  ctx.slots.inject("sidebar.panellist", () => {
    sidebarSupported = true;
    sync();
  });

  // 监听宿主插件管理页的 plugins.bundle.config 槽位
  ctx.slots.inject("plugins.bundle.config", () => {
    return ctx.slots.register({
      name: "plugins.bundle.config",
      key: BUNDLE_KEY,
      locale: ns,
    }, (ownerProps?: { view?: string }) => {
      if (ownerProps && ownerProps.view === "summary") return null;
      return h(SkillBundleConfigCardWrapper, {
        t: ctx.locale.bind(ns),
        getEnabled: () => sidebarEntryEnabled,
        setSidebar: setEnabled,
        getOnlineUpdateEnabled: () => onlineUpdateEnabled,
        setOnlineUpdate: setOnlineUpdate,
        onlineUpdateLocked,
        subscribe: (fn) => {
          listeners.add(fn);
          return () => { listeners.delete(fn); };
        },
      });
    });
  });

  return {
    isEnabled: () => sidebarEntryEnabled,
    isSupported: () => sidebarSupported,
    setEnabled,
    isOnlineUpdateEnabled: () => onlineUpdateEnabled,
    setOnlineUpdate,
    destroy: () => {
      listeners.clear();
      if (offRow) {
        try { offRow(); } catch {}
        offRow = null;
      }
      if (offPanel) {
        try { offPanel(); } catch {}
        offPanel = null;
      }
    },
  };
}
