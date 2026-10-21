import * as React from "react";
import { SKILL_PATHS } from "./settings-nav-icon.js";
const h = React.createElement;
const BUNDLE_KEY = "@michengai/dsh-skills-manager";
const SIDEBAR_PANEL_ID = "skills-manager";
const SIDEBAR_PANEL_ORDER = 2;
const sidebarLocales = {
  zh: {
    "sidebar.entry.title": "\u4FA7\u8FB9\u680F\u5165\u53E3",
    "sidebar.entry.desc": "\u5728\u4FA7\u680F\u300C\u63D2\u4EF6\u300D\u4E0B\u65B9\u663E\u793A\u6280\u80FD\u3002\u8BBE\u7F6E\u91CC\u7684\u5165\u53E3\u4E0D\u53D8\u3002",
    "sidebar.entry.toggle": "\u5207\u6362\u4FA7\u8FB9\u680F\u5165\u53E3"
  },
  en: {
    "sidebar.entry.title": "Sidebar entry",
    "sidebar.entry.desc": "Show Skills below Plugins in the sidebar. The Settings entry stays either way.",
    "sidebar.entry.toggle": "Toggle sidebar entry"
  }
};
const sidebarEntryCss = `
.dssm-main-panel{box-sizing:border-box;height:100%;min-height:0;overflow-y:auto;padding:24px clamp(16px,4vw,48px) 48px}
.dssm-bundle-config{display:flex;flex-direction:column;gap:12px;padding:12px 14px;border-radius:var(--dsw-radius-md,10px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dssm-bundle-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.dssm-bundle-label-box{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.dssm-bundle-title{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.dssm-bundle-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
`;
function SkillSidebarIcon(props) {
  const size = props && typeof props.size === "number" ? props.size : 16;
  return h("svg", {
    viewBox: "0 0 16 16",
    width: size,
    height: size,
    fill: "currentColor",
    "aria-hidden": "true",
    focusable: "false",
    dangerouslySetInnerHTML: { __html: SKILL_PATHS }
  });
}
function SkillBundleConfigCard(props) {
  const { t, enabled, onToggle, disabled } = props;
  return h(
    "div",
    { className: "dssm-bundle-config" },
    h(
      "div",
      { className: "dssm-bundle-row" },
      h(
        "div",
        { className: "dssm-bundle-label-box" },
        h("div", { className: "dssm-bundle-title" }, t("sidebar.entry.title")),
        h("div", { className: "dssm-bundle-desc" }, t("sidebar.entry.desc"))
      ),
      h("button", {
        type: "button",
        role: "switch",
        "aria-checked": enabled,
        "aria-label": t("sidebar.entry.toggle"),
        disabled,
        className: "dssm-enable-switch",
        onClick: () => onToggle(!enabled)
      }, h("span", { className: "dssm-enable-switch-thumb" }))
    )
  );
}
function SkillBundleConfigCardWrapper(props) {
  const [enabled, setEnabled] = React.useState(props.getEnabled);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setEnabled(props.getEnabled());
    return props.subscribe(() => {
      setEnabled(props.getEnabled());
    });
  }, [props]);
  const onToggle = (next) => {
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
    onToggle
  });
}
function setupSidebarEntry(ctx, options) {
  if (!ctx.locale) {
    return {
      isEnabled: () => false,
      isSupported: () => false,
      setEnabled: async () => false,
      destroy: () => {
      }
    };
  }
  const { callApi, headers, renderPanel, ns } = options;
  let sidebarEntryEnabled = false;
  let sidebarSupported = false;
  let offPanel = null;
  let offRow = null;
  let epoch = 0;
  let layoutService;
  const listeners = /* @__PURE__ */ new Set();
  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
      }
    }
  };
  const sync = () => {
    if (sidebarSupported && sidebarEntryEnabled) {
      if (!offPanel) {
        const res = ctx.slots.register({
          name: "main",
          key: SIDEBAR_PANEL_ID,
          locale: ns
        }, () => h("div", { className: "dssm-main-panel" }, renderPanel()));
        offPanel = typeof res === "function" ? res : () => {
        };
      }
      if (!offRow) {
        const res = ctx.slots.register({
          name: "sidebar.panellist",
          id: SIDEBAR_PANEL_ID,
          order: SIDEBAR_PANEL_ORDER,
          label: () => ctx.locale.bind(ns)("title"),
          locale: ns
        }, (ownerProps) => h(SkillSidebarIcon, ownerProps));
        offRow = typeof res === "function" ? res : () => {
        };
      }
    } else {
      if (layoutService?.panelInfo && typeof layoutService.selectPanel === "function") {
        try {
          if (layoutService.panelInfo.getSnapshot().activePanelId === SIDEBAR_PANEL_ID) {
            layoutService.selectPanel(null);
          }
        } catch {
        }
      }
      if (offRow) {
        try {
          offRow();
        } catch {
        }
        offRow = null;
      }
      if (offPanel) {
        try {
          offPanel();
        } catch {
        }
        offPanel = null;
      }
    }
  };
  const setEnabled = async (next) => {
    const currentEpoch = ++epoch;
    sidebarEntryEnabled = next;
    sync();
    notify();
    try {
      await callApi("/sidebar-entry", {
        method: "POST",
        headers,
        body: JSON.stringify({ enabled: next })
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
  const loadEpoch = epoch;
  callApi("/sidebar-entry").then((res) => {
    if (epoch === loadEpoch && res && typeof res.enabled === "boolean") {
      sidebarEntryEnabled = res.enabled;
      sync();
      notify();
    }
  }).catch(() => {
  });
  if (typeof ctx.inject === "function") {
    ctx.inject(["layout"], (scoped) => {
      layoutService = scoped.layout;
    });
  }
  ctx.slots.inject("sidebar.panellist", () => {
    sidebarSupported = true;
    sync();
  });
  ctx.slots.inject("plugins.bundle.config", () => {
    return ctx.slots.register({
      name: "plugins.bundle.config",
      key: BUNDLE_KEY,
      locale: ns
    }, (ownerProps) => {
      if (ownerProps && ownerProps.view === "summary") return null;
      return h(SkillBundleConfigCardWrapper, {
        t: ctx.locale.bind(ns),
        getEnabled: () => sidebarEntryEnabled,
        setSidebar: setEnabled,
        subscribe: (fn) => {
          listeners.add(fn);
          return () => {
            listeners.delete(fn);
          };
        }
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
        try {
          offRow();
        } catch {
        }
        offRow = null;
      }
      if (offPanel) {
        try {
          offPanel();
        } catch {
        }
        offPanel = null;
      }
    }
  };
}
export {
  BUNDLE_KEY,
  SIDEBAR_PANEL_ID,
  SIDEBAR_PANEL_ORDER,
  SkillBundleConfigCard,
  SkillSidebarIcon,
  setupSidebarEntry,
  sidebarEntryCss,
  sidebarLocales
};
