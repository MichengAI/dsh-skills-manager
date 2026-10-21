import * as React from "react";
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
  },
  en: {
    "sidebar.entry.title": "Sidebar entry",
    "sidebar.entry.desc": "Show Skills below Plugins in the sidebar. The Settings entry stays either way.",
    "sidebar.entry.toggle": "Toggle sidebar entry",
  },
};

export const sidebarEntryCss = `
.dssm-main-panel{box-sizing:border-box;height:100%;min-height:0;overflow-y:auto;padding:24px clamp(16px,4vw,48px) 48px}
.dssm-bundle-config{display:flex;flex-direction:column;gap:12px;padding:12px 14px;border-radius:var(--dsw-radius-md,10px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dssm-bundle-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.dssm-bundle-label-box{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.dssm-bundle-title{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.dssm-bundle-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
`;

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
}) {
  const { t, enabled, onToggle, disabled } = props;
  return h("div", { className: "dssm-bundle-config" },
    h("div", { className: "dssm-bundle-row" },
      h("div", { className: "dssm-bundle-label-box" },
        h("div", { className: "dssm-bundle-title" }, t("sidebar.entry.title")),
        h("div", { className: "dssm-bundle-desc" }, t("sidebar.entry.desc"))
      ),
      h("button", {
        type: "button",
        role: "switch",
        "aria-checked": enabled,
        "aria-label": t("sidebar.entry.toggle"),
        disabled: disabled,
        className: "dssm-enable-switch",
        onClick: () => onToggle(!enabled),
      }, h("span", { className: "dssm-enable-switch-thumb" }))
    )
  );
}

function SkillBundleConfigCardWrapper(props: {
  t: Translate;
  getEnabled: () => boolean;
  setSidebar: (next: boolean) => Promise<unknown>;
  subscribe: (fn: () => void) => () => void;
}) {
  const [enabled, setEnabled] = React.useState(props.getEnabled);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setEnabled(props.getEnabled());
    return props.subscribe(() => {
      setEnabled(props.getEnabled());
    });
  }, [props]);

  const onToggle = (next: boolean) => {
    setSaving(true);
    setEnabled(next);
    props.setSidebar(next).catch(() => {
      setEnabled(props.getEnabled());
    }).finally(() => {
      setSaving(false);
    });
  };

  return h(SkillBundleConfigCard, {
    t: props.t,
    enabled,
    disabled: saving,
    onToggle,
  });
}

export interface SetupSidebarEntryOptions {
  callApi: (path: "/sidebar-entry", options?: RequestInit) => Promise<{ enabled: boolean }>;
  headers: Record<string, string>;
  renderPanel: () => React.ReactNode;
  ns: string;
}

export interface SidebarEntryController {
  isEnabled(): boolean;
  isSupported(): boolean;
  setEnabled(enabled: boolean): Promise<boolean>;
  destroy(): void;
}

export function setupSidebarEntry(
  ctx: ClientContext,
  options: SetupSidebarEntryOptions
): SidebarEntryController {
  if (!ctx.locale) {
    return {
      isEnabled: () => false,
      isSupported: () => false,
      setEnabled: async () => false,
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
        }, () => h("div", { className: "dssm-main-panel" }, renderPanel()));
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
