const defaultDestination = () => ({ scope: "user", location: "dsh", workspace: "", presetKey: "" });
function destinationPayload(value) {
  if (value.scope === "workspace") return { workspace: value.workspace };
  if (value.scope === "preset") return { root: value.presetKey };
  return { root: value.location === "agents" ? "agents" : "dsh" };
}
function destinationReady(value, workspaces, userDestinations, presetDestinations) {
  if (value.scope === "preset") {
    return !!presetDestinations && presetDestinations.length > 0 && presetDestinations.some((item) => item.key === value.presetKey && item.available !== false);
  }
  if (value.scope === "user") return !userDestinations || userDestinations.some((item) => item.key === value.location && item.available === true);
  return workspaces.some((row) => row.available && !!row.registeredPaths[0] && row.registeredPaths[0] === value.workspace);
}
function projectPreview(path) {
  const separator = path.includes("\\") ? "\\" : "/";
  return path.replace(/[\\/]+$/, "") + separator + ".dsh" + separator + "skills";
}
const destinationLocales = {
  zh: {
    "dest.scope": "\u8303\u56F4",
    "dest.scope.user": "\u7528\u6237\u76EE\u5F55",
    "dest.scope.workspace": "\u6307\u5B9A\u5DE5\u4F5C\u533A",
    "dest.scope.preset": "\u9884\u8BBE\u6A21\u5F0F",
    "dest.workspace": "\u5DE5\u4F5C\u533A",
    "dest.workspace.placeholder": "\u8BF7\u9009\u62E9\u5DE5\u4F5C\u533A",
    "dest.workspace.unavailable": "{name}\uFF08\u76EE\u5F55\u4E0D\u53EF\u7528\uFF09",
    "dest.preset": "\u9884\u8BBE\u6A21\u5F0F",
    "dest.preset.placeholder": "\u8BF7\u9009\u62E9\u9884\u8BBE\u6A21\u5F0F",
    "dest.pickFirst": "\u5148\u9009\u62E9\u4E00\u4E2A\u5DF2\u767B\u8BB0\u5DE5\u4F5C\u533A\u3002\u786E\u8BA4\u524D\u4E0D\u4F1A\u521B\u5EFA\u76EE\u5F55\u3002",
    "dest.empty": "\u8FD8\u6CA1\u6709\u5DF2\u767B\u8BB0\u7684\u5DE5\u4F5C\u533A\u3002\u8BF7\u5148\u5728\u4FA7\u680F\u6DFB\u52A0\uFF0C\u518D\u56DE\u5230\u8FD9\u91CC\u9009\u62E9\u3002",
    "dest.location": "\u4F4D\u7F6E",
    "dest.location.dsh": "DSH skills",
    "dest.location.agents": "Shared Agent",
    "dest.location.agentsOff": "\u5DE5\u4F5C\u533A\u53EA\u652F\u6301 DSH skills\u3002",
    "dest.projectNote": "\u4F1A\u5199\u8FDB\u8FD9\u4E2A\u9879\u76EE\uFF0C\u53EF\u80FD\u88AB\u63D0\u4EA4\u5230\u4ED3\u5E93\u3002",
    "dest.presetNote": "\u4F1A\u5B89\u88C5\u5230\u8BE5\u9884\u8BBE\u6A21\u5F0F\u4E13\u5C5E\u7684\u6280\u80FD\u76EE\u5F55\uFF0C\u4EC5\u5728\u8BE5\u6A21\u5F0F\u4E0B\u53EF\u7528\u3002",
    "dest.createdInWorkspace": "\u5DF2\u521B\u5EFA\u5728\u6240\u9009\u5DE5\u4F5C\u533A\u3002\u8981\u5728\u8BE5\u5DE5\u4F5C\u533A\u7684\u4F1A\u8BDD\u91CC\u624D\u4F1A\u770B\u5230\u3002"
  },
  en: {
    "dest.scope": "Scope",
    "dest.scope.user": "User directory",
    "dest.scope.workspace": "Specific workspace",
    "dest.scope.preset": "Agent Preset",
    "dest.workspace": "Workspace",
    "dest.workspace.placeholder": "Select a workspace",
    "dest.workspace.unavailable": "{name} (directory unavailable)",
    "dest.preset": "Agent Preset",
    "dest.preset.placeholder": "Select a preset",
    "dest.pickFirst": "Select a registered workspace first. No directory is created before you confirm.",
    "dest.empty": "No registered workspaces yet. Add one in the sidebar, then come back.",
    "dest.location": "Location",
    "dest.location.dsh": "DSH skills",
    "dest.location.agents": "Shared Agent",
    "dest.location.agentsOff": "Workspaces support DSH skills only.",
    "dest.projectNote": "This is written into the project and may be committed to its repository.",
    "dest.presetNote": "Installed into this preset's dedicated directory and available only in this preset.",
    "dest.createdInWorkspace": "Created in the selected workspace. It appears in sessions of that workspace."
  }
};
const destinationCss = [
  ".dssm-destination{display:flex;flex-direction:column;gap:12px}",
  ".dssm-destination .dssm-field{display:flex;flex-direction:column;gap:6px;min-width:0}",
  // 两列等宽且控件铺满，避免筛选下拉按文字收缩留下大块空白；窄屏时上下排列。
  ".dssm-destination-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
  ".dssm-destination-pair .dssm-menu-select-wrap{width:100%;min-width:0}",
  '.dssm-destination-pair .dssm-menu-select-wrap,.dssm-destination-pair span[class*="_root_"],.dssm-destination-pair .dssm-source-select-menu{display:flex!important;width:100%!important;min-width:0!important;height:auto!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important}',
  ".dssm-destination-pair .dssm-menu-select-trigger{display:flex!important;width:100%!important;min-width:0!important;height:36px!important;border-radius:var(--dsw-radius-md,10px)!important;padding:0 12px!important;box-sizing:border-box!important}",
  "@media (max-width:420px){.dssm-destination-pair{grid-template-columns:minmax(0,1fr)}}",
  ".dssm-destination-path{display:block;box-sizing:border-box;width:100%;padding:8px 10px;border:0.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));overflow-wrap:anywhere;font-size:12px;line-height:18px}",
  ".dssm-destination-unavailable{display:flex;flex-direction:column;gap:2px}"
].join("");
function createDestinationPicker({ react, SourceSelect, translateError }) {
  const h = react.createElement;
  return function DestinationPicker({ t, value, onChange, workspaces, userDestinations, presetDestinations = [], allowAgents, disabled }) {
    const inWorkspace = value.scope === "workspace";
    const inPreset = value.scope === "preset";
    const chosen = workspaces.find((row) => !!row.registeredPaths[0] && row.registeredPaths[0] === value.workspace);
    const chosenPreset = (presetDestinations || []).find((row) => row.key === value.presetKey);
    const scopeOptions = [
      { value: "user", label: t("dest.scope.user") },
      { value: "workspace", label: t("dest.scope.workspace") },
      ...presetDestinations && presetDestinations.length > 0 ? [{ value: "preset", label: t("dest.scope.preset") }] : []
    ];
    const nameCount = /* @__PURE__ */ new Map();
    for (const row of workspaces) nameCount.set(row.name, (nameCount.get(row.name) ?? 0) + 1);
    const workspaceOptions = [{ value: "", label: t("dest.workspace.placeholder") }].concat(
      workspaces.map((row) => ({
        value: row.registeredPaths[0] || "",
        label: !row.available ? t("dest.workspace.unavailable", { name: row.name }) : (nameCount.get(row.name) ?? 0) > 1 ? row.name + " \xB7 " + row.path : row.name,
        disabled: !row.available || !row.registeredPaths[0]
      }))
    );
    const presetOptions = [{ value: "", label: t("dest.preset.placeholder") }].concat(
      (presetDestinations || []).map((row) => ({
        value: row.key,
        label: row.name,
        disabled: row.available === false
      }))
    );
    const offered = allowAgents ? ["dsh", "agents"] : ["dsh"];
    const locations = offered.filter((key) => userDestinations.some((item) => item.key === key));
    const target = (key) => userDestinations.find((item) => item.key === key);
    const usable = (key) => locations.some((item) => item === key) && target(key)?.available !== false;
    const locationOptions = locations.map((key) => ({ value: key, label: t("dest.location." + key), disabled: target(key)?.available === false }));
    const second = inWorkspace ? h(
      "div",
      { className: "dssm-field", key: "workspace" },
      h("span", { className: "dssm-label" }, t("dest.workspace")),
      h(SourceSelect, { label: t("dest.workspace"), value: value.workspace, disabled: disabled || workspaces.length === 0, options: workspaceOptions, onChange: (next) => {
        if (!disabled && workspaces.length > 0 && (next === "" || destinationReady({ ...value, scope: "workspace", workspace: next }, workspaces))) onChange({ workspace: next });
      } })
    ) : inPreset ? h(
      "div",
      { className: "dssm-field", key: "preset" },
      h("span", { className: "dssm-label" }, t("dest.preset")),
      h(SourceSelect, {
        label: t("dest.preset"),
        value: value.presetKey || "",
        disabled: disabled || (presetDestinations || []).length === 0,
        options: presetOptions,
        onChange: (next) => {
          if (!disabled) onChange({ presetKey: next });
        }
      })
    ) : h(
      "div",
      { className: "dssm-field", key: "location" },
      h("span", { className: "dssm-label" }, t("dest.location")),
      h(SourceSelect, {
        label: t("dest.location"),
        value: value.location,
        disabled: disabled || locations.length === 0,
        options: locationOptions,
        // 置灰项也可能被合成事件触发，所以选择器自己再拒绝一次，不靠 disabled 属性兜底。
        onChange: (next) => {
          if (!disabled && usable(next)) onChange({ location: next });
        }
      })
    );
    const path = inWorkspace ? chosen && chosen.available ? projectPreview(chosen.projectRoot || chosen.path) : "" : inPreset ? chosenPreset?.path ?? "" : target(value.location)?.path ?? "";
    const broken = inWorkspace || inPreset ? [] : locations.filter((key) => target(key)?.available === false);
    return h(
      "div",
      { className: "dssm-destination" },
      h(
        "div",
        { className: "dssm-destination-pair" },
        h(
          "div",
          { className: "dssm-field", key: "scope" },
          h("span", { className: "dssm-label" }, t("dest.scope")),
          h(SourceSelect, {
            label: t("dest.scope"),
            value: value.scope,
            disabled,
            options: scopeOptions,
            onChange: (next) => {
              if (!disabled && (next === "workspace" || next === "user" || next === "preset")) {
                if (next === "workspace") onChange({ scope: "workspace", location: "dsh", presetKey: "" });
                else if (next === "preset") onChange({ scope: "preset", presetKey: presetDestinations?.[0]?.key || "" });
                else onChange({ scope: "user", workspace: "", presetKey: "" });
              }
            }
          })
        ),
        second
      ),
      inWorkspace && workspaces.length === 0 ? h("p", { className: "dssm-feedback dssm-warning", role: "status" }, t("dest.empty")) : null,
      inWorkspace && workspaces.length > 0 && !chosen ? h("p", { className: "dssm-note" }, t("dest.pickFirst")) : null,
      path ? h("code", { className: "dssm-destination-path" }, path) : null,
      // 不可用的位置在下拉里置灰，原因与路径写在这里，用户才知道为什么选不了。
      broken.map((key) => h(
        "div",
        { key, className: "dssm-note dssm-destination-unavailable" },
        h("span", null, t("dest.location." + key)),
        h("code", { className: "dssm-destination-path" }, target(key)?.path ?? ""),
        h("span", null, target(key)?.error ? translateError(t, target(key).error) : "")
      )),
      inWorkspace && chosen ? h("p", { className: "dssm-note" }, t("dest.projectNote") + " " + t("dest.location.agentsOff")) : null,
      inPreset && chosenPreset ? h("p", { className: "dssm-note" }, t("dest.presetNote")) : null
    );
  };
}
function createDestinationKit(dependencies) {
  return { DestinationPicker: createDestinationPicker(dependencies), defaultDestination, destinationPayload, destinationReady };
}
export {
  createDestinationKit,
  createDestinationPicker,
  defaultDestination,
  destinationCss,
  destinationLocales,
  destinationPayload,
  destinationReady
};
