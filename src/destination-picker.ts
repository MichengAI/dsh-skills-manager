import type * as React from "react";
import type { SourceSelectProps, Translate } from "./client-types.js";
import type { WorkspaceRow } from "./core.js";
import type { DestinationKit, DestinationValue, DestinationPickerProps, UserDestination } from "./destination-types.js";

export type { DestinationKit, DestinationValue, UserDestination } from "./destination-types.js";

export const defaultDestination = (): DestinationValue => ({ scope: "user", location: "dsh", workspace: "" });

/** 请求体只带必要字段：用户目录沿用旧的 root；工作区只带 workspace，位置固定为项目 DSH。 */
export function destinationPayload(value: DestinationValue): { root?: "dsh" | "agents"; workspace?: string } {
  if (value.scope === "workspace") return { workspace: value.workspace };
  return { root: value.location === "agents" ? "agents" : "dsh" };
}

/** 能否提交：工作区必须是列表里可用的一项；传入用户位置时，所选位置也必须可用。 */
export function destinationReady(value: DestinationValue, workspaces: readonly WorkspaceRow[], userDestinations?: readonly { key: string; available?: boolean }[]): boolean {
  if (value.scope === "user") return !userDestinations || userDestinations.some((item) => item.key === value.location && item.available === true);
  return workspaces.some((row) => row.available && !!row.registeredPaths[0] && row.registeredPaths[0] === value.workspace);
}

/** 工作区项目 DSH 目录的预览，仅用于展示；实际写入路径由服务端重新解析。 */
function projectPreview(path: string) {
  const separator = path.includes("\\") ? "\\" : "/";
  return path.replace(/[\\/]+$/, "") + separator + ".dsh" + separator + "skills";
}

export const destinationLocales = {
  zh: {
    "dest.scope": "范围", "dest.scope.user": "用户目录", "dest.scope.workspace": "指定工作区",
    "dest.workspace": "工作区", "dest.workspace.placeholder": "请选择工作区", "dest.workspace.unavailable": "{name}（目录不可用）",
    "dest.pickFirst": "先选择一个已登记工作区。确认前不会创建目录。", "dest.empty": "还没有已登记的工作区。请先在侧栏添加，再回到这里选择。",
    "dest.location": "位置", "dest.location.dsh": "DSH skills", "dest.location.agents": "Shared Agent",
    "dest.location.agentsOff": "工作区只支持 DSH skills。",
    "dest.projectNote": "会写进这个项目，可能被提交到仓库。",
    "dest.createdInWorkspace": "已创建在所选工作区。要在该工作区的会话里才会看到。",
  },
  en: {
    "dest.scope": "Scope", "dest.scope.user": "User directory", "dest.scope.workspace": "Specific workspace",
    "dest.workspace": "Workspace", "dest.workspace.placeholder": "Select a workspace", "dest.workspace.unavailable": "{name} (directory unavailable)",
    "dest.pickFirst": "Select a registered workspace first. No directory is created before you confirm.", "dest.empty": "No registered workspaces yet. Add one in the sidebar, then come back.",
    "dest.location": "Location", "dest.location.dsh": "DSH skills", "dest.location.agents": "Shared Agent",
    "dest.location.agentsOff": "Workspaces support DSH skills only.",
    "dest.projectNote": "This is written into the project and may be committed to its repository.",
    "dest.createdInWorkspace": "Created in the selected workspace. It appears in sessions of that workspace.",
  },
};

/**
 * 选择器自带样式，由使用它的页面一并注入：仓库页与创建、导入弹窗共用同一份，
 * 不能只放在某一页的样式里，否则其他入口会出现标题、路径、说明黏在一起。
 */
export const destinationCss = [
  ".dssm-destination{display:flex;flex-direction:column;gap:12px}",
  ".dssm-destination .dssm-field{display:flex;flex-direction:column;gap:6px;min-width:0}",
  // 两列等宽且控件铺满，避免筛选下拉按文字收缩留下大块空白；窄屏时上下排列。
    ".dssm-destination-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
  ".dssm-destination-pair .dssm-menu-select-wrap{width:100%;min-width:0}",
  ".dssm-destination-pair .dssm-menu-select-wrap,.dssm-destination-pair span[class*=\"_root_\"],.dssm-destination-pair .dssm-source-select-menu{display:flex!important;width:100%!important;min-width:0!important;height:auto!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important}",
  ".dssm-destination-pair .dssm-menu-select-trigger{display:flex!important;width:100%!important;min-width:0!important;height:36px!important;border-radius:var(--dsw-radius-md,10px)!important;padding:0 12px!important;box-sizing:border-box!important}",
  "@media (max-width:420px){.dssm-destination-pair{grid-template-columns:minmax(0,1fr)}}",
  ".dssm-destination-path{display:block;box-sizing:border-box;width:100%;padding:8px 10px;border:0.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));overflow-wrap:anywhere;font-size:12px;line-height:18px}",
  ".dssm-destination-unavailable{display:flex;flex-direction:column;gap:2px}",
].join("");

interface Dependencies {
  react: typeof React;
  SourceSelect: React.ComponentType<SourceSelectProps>;
  translateError: (t: Translate, error: unknown) => string;
}

/** 创建、导入、仓库安装共用的目标选择器：范围、工作区下拉、位置、写入预览。 */
export function createDestinationPicker({ react, SourceSelect, translateError }: Dependencies) {
  const h = react.createElement;
  return function DestinationPicker({ t, value, onChange, workspaces, userDestinations, allowAgents, disabled }: DestinationPickerProps) {
    const inWorkspace = value.scope === "workspace";
    const chosen = workspaces.find((row) => !!row.registeredPaths[0] && row.registeredPaths[0] === value.workspace);
    const scopeOptions = [
      { value: "user", label: t("dest.scope.user") },
      { value: "workspace", label: t("dest.scope.workspace") },
    ];
    // 下拉只显示名称；只有重名时才附上路径，否则用户分不清选的是哪一个。
    const nameCount = new Map<string, number>();
    for (const row of workspaces) nameCount.set(row.name, (nameCount.get(row.name) ?? 0) + 1);
    const workspaceOptions = [{ value: "", label: t("dest.workspace.placeholder") }].concat(
      workspaces.map((row) => ({
        value: row.registeredPaths[0] || "",
        label: !row.available ? t("dest.workspace.unavailable", { name: row.name }) : (nameCount.get(row.name) ?? 0) > 1 ? row.name + " · " + row.path : row.name,
        disabled: !row.available || !row.registeredPaths[0],
      })),
    );
    // 用户目录下只展示后端确实返回的位置，避免出现用不了的选项；工作区的位置固定为项目 DSH，不是选项。
    const offered = (allowAgents ? ["dsh", "agents"] : ["dsh"]) as ("dsh" | "agents")[];
    const locations = offered.filter((key) => userDestinations.some((item) => item.key === key));
    const target = (key: "dsh" | "agents") => userDestinations.find((item) => item.key === key);
    const usable = (key: string) => locations.some((item) => item === key) && target(key as "dsh" | "agents")?.available !== false;
    const locationOptions = locations.map((key) => ({ value: key, label: t("dest.location." + key), disabled: target(key)?.available === false }));
    // 右侧二级选择器：用户目录下选位置，指定工作区下选工作区。两者都是下拉，放在范围右边。
    const second = inWorkspace
      ? h("div", { className: "dssm-field", key: "workspace" },
          h("span", { className: "dssm-label" }, t("dest.workspace")),
          h(SourceSelect, { label: t("dest.workspace"), value: value.workspace, disabled: disabled || workspaces.length === 0, options: workspaceOptions, onChange: (next: string) => {
            if (!disabled && workspaces.length > 0 && (next === "" || destinationReady({ ...value, scope: "workspace", workspace: next }, workspaces))) onChange({ workspace: next });
          } }))
      : h("div", { className: "dssm-field", key: "location" },
          h("span", { className: "dssm-label" }, t("dest.location")),
          h(SourceSelect, {
            label: t("dest.location"), value: value.location, disabled: disabled || locations.length === 0, options: locationOptions,
            // 置灰项也可能被合成事件触发，所以选择器自己再拒绝一次，不靠 disabled 属性兜底。
            onChange: (next: string) => { if (!disabled && usable(next)) onChange({ location: next as "dsh" | "agents" }); },
          }));
    // 实际写入路径只显示一行：用户目录显示所选位置的配置路径，工作区显示项目的 .dsh/skills。
    const path = inWorkspace ? (chosen && chosen.available ? projectPreview(chosen.projectRoot || chosen.path) : "") : (target(value.location)?.path ?? "");
    const broken = inWorkspace ? [] : locations.filter((key) => target(key)?.available === false);
    return h("div", { className: "dssm-destination" },
      h("div", { className: "dssm-destination-pair" },
        h("div", { className: "dssm-field", key: "scope" },
          h("span", { className: "dssm-label" }, t("dest.scope")),
          h(SourceSelect, {
            label: t("dest.scope"), value: value.scope, disabled, options: scopeOptions,
            onChange: (next: string) => { if (!disabled && (next === "workspace" || next === "user")) onChange(next === "workspace" ? { scope: "workspace", location: "dsh" } : { scope: "user", workspace: "" }); },
          })),
        second),
      inWorkspace && workspaces.length === 0 ? h("p", { className: "dssm-feedback dssm-warning", role: "status" }, t("dest.empty")) : null,
      inWorkspace && workspaces.length > 0 && !chosen ? h("p", { className: "dssm-note" }, t("dest.pickFirst")) : null,
      path ? h("code", { className: "dssm-destination-path" }, path) : null,
      // 不可用的位置在下拉里置灰，原因与路径写在这里，用户才知道为什么选不了。
      broken.map((key) => h("div", { key, className: "dssm-note dssm-destination-unavailable" },
        h("span", null, t("dest.location." + key)),
        h("code", { className: "dssm-destination-path" }, target(key)?.path ?? ""),
        h("span", null, target(key)?.error ? translateError(t, target(key)!.error) : ""))),
      inWorkspace && chosen ? h("p", { className: "dssm-note" }, t("dest.projectNote") + " " + t("dest.location.agentsOff")) : null,
    );
  };
}

/** 把组件和纯函数打包成注入用的套件。 */
export function createDestinationKit(dependencies: Dependencies): DestinationKit {
  return { DestinationPicker: createDestinationPicker(dependencies), defaultDestination, destinationPayload, destinationReady };
}
