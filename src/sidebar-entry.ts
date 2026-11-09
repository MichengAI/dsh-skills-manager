import * as React from "react";
import { SegmentedControl, Switch as PrimitiveSwitch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ClientContext, Translate } from "./client-types.js";
import type { EntryLocation } from "./types.js";
import { SKILL_PATHS } from "./settings-nav-icon.js";

const h = React.createElement;

export const BUNDLE_KEY = "@michengai/dsh-skills-manager";
export const SIDEBAR_PANEL_ID = "skills-manager";
export const SIDEBAR_PANEL_ORDER = 2;

export const sidebarLocales = {
  zh: {
    "entry.location.title": "入口展示位置",
    "entry.location.desc": "选择技能管理入口的展示位置（至少保留一处，防止无法打开面板）。",
    "entry.location.both": "两边显示",
    "entry.location.sidebar": "仅侧边栏",
    "entry.location.settings": "仅设置",
    "sidebar.entry.title": "侧边栏入口",
    "sidebar.entry.desc": "在侧栏「插件」下方显示技能。设置里的入口不变。",
    "sidebar.entry.toggle": "切换侧边栏入口",
  },
  en: {
    "entry.location.title": "Entry placement",
    "entry.location.desc": "Choose where to show the entry (at least one is retained to avoid losing access).",
    "entry.location.both": "Both",
    "entry.location.sidebar": "Sidebar only",
    "entry.location.settings": "Settings only",
    "sidebar.entry.title": "Sidebar entry",
    "sidebar.entry.desc": "Show Skills below Plugins in the sidebar. The Settings entry stays either way.",
    "sidebar.entry.toggle": "Toggle sidebar entry",
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
  location?: EntryLocation;
  onLocationChange?: (location: EntryLocation) => void;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  ensureSidebarEntryStyle();
  const {
    t,
    location: propLocation,
    onLocationChange,
    enabled = false,
    onToggle,
    disabled,
  } = props;

  const effectiveLocation: EntryLocation = propLocation ?? (enabled ? "both" : "settings");

  const handleLocationChange = (next: string) => {
    if (next === "both" || next === "sidebar" || next === "settings") {
      if (typeof onLocationChange === "function") {
        onLocationChange(next);
      } else if (typeof onToggle === "function") {
        onToggle(next !== "settings");
      }
    }
  };

  const rows = [
    h("div", { key: "entry-location", className: "dssm-bundle-row" },
      h("div", { className: "dssm-bundle-label-box" },
        h("span", { className: "dssm-bundle-title" }, t("entry.location.title") || t("sidebar.entry.title")),
        h("span", { className: "dssm-bundle-desc" }, t("entry.location.desc") || t("sidebar.entry.desc"))
      ),
      h(SegmentedControl, {
        id: "dssm-bundle-entry-location",
        value: effectiveLocation,
        onChange: handleLocationChange,
        label: t("entry.location.title") || t("sidebar.entry.title"),
        disabled: disabled,
        options: [
          { value: "both", label: t("entry.location.both") || "两边显示" },
          { value: "sidebar", label: t("entry.location.sidebar") || "仅侧边栏" },
          { value: "settings", label: t("entry.location.settings") || "仅设置" },
        ],
      })
    ),
  ];

  return h(React.Fragment, null, rows);
}

function SkillBundleConfigCardWrapper(props: {
  t: Translate;
  getLocation: () => EntryLocation;
  setLocation: (next: EntryLocation) => Promise<unknown>;
  getEnabled?: () => boolean;
  setSidebar?: (next: boolean) => Promise<unknown>;
  subscribe: (fn: () => void) => () => void;
}) {
  const [location, setLocation] = React.useState<EntryLocation>(props.getLocation);
  const [savingLocation, setSavingLocation] = React.useState(false);

  React.useEffect(() => {
    const syncState = () => {
      setLocation(props.getLocation());
    };
    syncState();
    return props.subscribe(syncState);
  }, [props]);

  const onLocationChange = (next: EntryLocation) => {
    setSavingLocation(true);
    setLocation(next);
    props.setLocation(next).catch(() => {
      setLocation(props.getLocation());
    }).finally(() => {
      setSavingLocation(false);
    });
  };

  return h(SkillBundleConfigCard, {
    t: props.t,
    location,
    disabled: savingLocation,
    onLocationChange,
  });
}

export interface SetupSidebarEntryOptions {
  callApi: (path: "/sidebar-entry", options?: RequestInit) => Promise<{ location?: EntryLocation; enabled?: boolean }>;
  headers: Record<string, string>;
  renderPanel: (ownerProps?: any) => React.ReactNode;
  ns: string;
  onLocationChange?: (location: EntryLocation) => void;
}

export interface SidebarEntryController {
  getLocation(): EntryLocation;
  setLocation(location: EntryLocation): Promise<EntryLocation>;
  isSettingsSectionEnabled(): boolean;
  isEnabled(): boolean;
  isSupported(): boolean;
  setEnabled(enabled: boolean): Promise<boolean>;
  destroy(): void;
}

export function setupSidebarEntry(
  ctx: ClientContext,
  options: SetupSidebarEntryOptions
): SidebarEntryController {
  ensureSidebarEntryStyle();
  if (!ctx.locale) {
    return {
      getLocation: () => "settings",
      setLocation: async () => "settings",
      isSettingsSectionEnabled: () => true,
      isEnabled: () => false,
      isSupported: () => false,
      setEnabled: async () => false,
      destroy: () => {},
    };
  }
  const { callApi, headers, renderPanel, ns } = options;
  let entryLocation: EntryLocation = "settings";
  let sidebarSupported = false;
  let offPanel: (() => void) | null = null;
  let offRow: (() => void) | null = null;
  let epoch = 0;
  let destroyed = false;
  let layoutService: {
    selectPanel(id: string | null): void;
    panelInfo?: { getSnapshot(): { activePanelId?: string | null } };
  } | undefined;
  const listeners = new Set<() => void>();

  const isSidebarEnabled = () => entryLocation === "both" || entryLocation === "sidebar";
  const isSettingsSectionEnabled = () => entryLocation === "both" || entryLocation === "settings";

  const notify = () => {
    if (destroyed) return;
    for (const listener of listeners) {
      try { listener(); } catch {}
    }
  };

  const sync = () => {
    if (destroyed) return;
    if (sidebarSupported && isSidebarEnabled()) {
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

  const setLocation = async (next: EntryLocation): Promise<EntryLocation> => {
    if (destroyed) return entryLocation;
    const currentEpoch = ++epoch;
    const previous = entryLocation;
    entryLocation = next;
    sync();
    notify();
    if (typeof options.onLocationChange === "function") {
      try { options.onLocationChange(next); } catch {}
    }
    try {
      await callApi("/sidebar-entry", {
        method: "POST",
        headers,
        body: JSON.stringify({ location: next }),
      });
      return next;
    } catch (err) {
      if (currentEpoch === epoch) {
        entryLocation = previous;
        sync();
        notify();
        if (typeof options.onLocationChange === "function") {
          try { options.onLocationChange(previous); } catch {}
        }
      }
      throw err;
    }
  };

  const setEnabled = async (next: boolean): Promise<boolean> => {
    await setLocation(next ? "both" : "settings");
    return isSidebarEnabled();
  };

  // 读取服务端已保存的状态
  const loadEpoch = epoch;
  callApi("/sidebar-entry")
    .then((res) => {
      if (!destroyed && epoch === loadEpoch && res) {
        if (res.location === "both" || res.location === "sidebar" || res.location === "settings") {
          entryLocation = res.location;
        } else if (typeof res.enabled === "boolean") {
          entryLocation = res.enabled ? "both" : "settings";
        }
        sync();
        notify();
        if (typeof options.onLocationChange === "function") {
          try { options.onLocationChange(entryLocation); } catch {}
        }
      }
    })
    .catch(() => {});

  // 监听宿主 layout 服务
  if (typeof (ctx as any).inject === "function") {
    (ctx as any).inject(["layout"], (scoped: any) => {
      if (!destroyed) layoutService = scoped.layout;
    });
  }

  // 监听 sidebar.panellist 槽位
  ctx.slots.inject("sidebar.panellist", () => {
    if (destroyed) return;
    sidebarSupported = true;
    sync();
  });

  // 监听宿主插件管理页的 plugins.bundle.config 槽位
  ctx.slots.inject("plugins.bundle.config", () => {
    if (destroyed) return;
    return ctx.slots.register({
      name: "plugins.bundle.config",
      key: BUNDLE_KEY,
      locale: ns,
    }, (ownerProps?: { view?: string }) => {
      if (ownerProps && ownerProps.view === "summary") return null;
      return h(SkillBundleConfigCardWrapper, {
        t: ctx.locale.bind(ns),
        getLocation: () => entryLocation,
        setLocation,
        getEnabled: () => isSidebarEnabled(),
        setSidebar: setEnabled,
        subscribe: (fn) => {
          listeners.add(fn);
          return () => { listeners.delete(fn); };
        },
      });
    });
  });

  return {
    getLocation: () => entryLocation,
    setLocation,
    isSettingsSectionEnabled,
    isEnabled: () => isSidebarEnabled(),
    isSupported: () => sidebarSupported,
    setEnabled,
    destroy: () => {
      if (destroyed) return;
      // 让在途初始化请求和保存失败的回滚失效，避免卸载后重新注册或通知。
      destroyed = true;
      epoch++;
      layoutService = undefined;
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
