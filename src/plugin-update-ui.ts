import React from "react";
import { createRoot } from "react-dom/client";
import { Button as PrimitiveButton, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import { createUpdateFlow, handlePluginUpdateEscape, manualPluginUpdateCommand, pluginUpdateCopy, type UpdatePayload } from "./plugin-update-model.js";

interface UpdateUIOptions { endpoint: string; packageName: string; titleRowSelector: string; linksSelector: string; zhName: string; enName: string; createIcon: (name: "refresh" | "download" | "copy" | "close") => HTMLElement }

const UPDATE_HEADER = "x-michengai-plugin-update";
const STYLE_ID = "michengai-plugin-update-ui";
const CSS = `
.mpi-version{margin-left:8px;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-family:inherit;font-size:12px;font-weight:500;line-height:18px;letter-spacing:0;white-space:nowrap;vertical-align:baseline}.mpi-check-host{display:inline-flex;align-items:center}.mpi-icon{display:inline-flex;flex:0 0 auto;width:16px;height:16px;align-items:center;justify-content:center;pointer-events:none}.mpi-icon svg{display:block;width:16px;height:16px}
.mpi-intro{margin:0 0 16px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:13px;line-height:20px}.mpi-meta{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 18px;margin:0 0 16px;font-size:12px;line-height:18px}.mpi-meta dt{color:var(--dsw-alias-label-secondary,#b9b9b9)}.mpi-meta dd{margin:0}.mpi-mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.mpi-latest{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}.mpi-status{font-size:13px;font-weight:600;line-height:18px}.mpi-status[data-kind=error]{color:var(--dsw-alias-state-error-primary,#ef7272)}.mpi-status[data-kind=success]{color:var(--dsw-alias-state-success-primary,#51b976)}.mpi-status[data-kind=update]{color:#e8b15a !important}.mpi-manual{border-top:0.5px solid var(--dsw-alias-border-l2,#494949);padding-top:16px}.mpi-manual h3{margin:0 0 6px;font-size:14px;line-height:20px}.mpi-manual p{margin:0 0 10px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:12px;line-height:18px}.mpi-command{display:flex;align-items:flex-start;gap:8px;border:0.5px solid var(--dsw-alias-border-l2,#494949);border-radius:var(--dsw-radius-lg,16px);padding:10px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-interactive-bg-hover,transparent))}.mpi-command code{min-width:0;flex:1;overflow:visible;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
.dssm-update-progress{height:4px;border-radius:2px;background:var(--dsw-alias-border-l1,#3a3a3a);overflow:hidden;margin:12px 0;position:relative}
.dssm-update-progress-bar{height:100%;width:40%;background:var(--dsw-alias-button-primary-fill,#4176e6);border-radius:2px;animation:dssm-progress-slide 1.4s ease-in-out infinite}
@keyframes dssm-progress-slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
@media (prefers-reduced-motion:reduce){.dssm-update-progress-bar{animation:none;width:100%;opacity:.6}}
@media(max-width:560px){.mpi-meta{grid-template-columns:1fr;gap:2px}.mpi-meta dd{margin-bottom:6px}}
`;
function ensureStyle() {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).append(style);
}
function validPayload(value: unknown): value is UpdatePayload {
  if (value === null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.packageName === "string" && typeof item.currentVersion === "string" && typeof item.updateAvailable === "boolean" && typeof item.profileName === "string" && typeof item.canAutoUpdate === "boolean" && typeof item.latestCheckFailed === "boolean" && (item.latestVersion === undefined || typeof item.latestVersion === "string");
}
async function requestStatus(endpoint: string, method: "GET" | "POST", signal?: AbortSignal) {
  const signalOption = signal === undefined ? {} : { signal };
  const response = await fetch(endpoint, method === "GET" ? { cache: "no-store", ...signalOption } : {
    method: "POST", headers: { "content-type": "application/json", [UPDATE_HEADER]: "1" }, body: "{}", ...signalOption,
  });
  const value: unknown = await response.json();
  if (!response.ok || !validPayload(value)) throw new Error(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : pluginUpdateCopy(document.documentElement.lang).failed);
  return value;
}
function HostIcon(props: { node: HTMLElement }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => { ref.current?.replaceChildren(props.node); }, [props.node]);
  return React.createElement("span", { ref, className: "mpi-icon", "aria-hidden": true });
}

function UpdateDialog(props: { flow: ReturnType<typeof createUpdateFlow>; packageName: string; zhName: string; enName: string; onClose: () => void }) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [, setRev] = React.useState(0);
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">("idle");
  React.useEffect(() => props.flow.subscribe(() => setRev((value) => value + 1)), [props.flow]);
  React.useEffect(() => {
    const element = document.documentElement;
    const observer = new MutationObserver(() => setRev((value) => value + 1));
    observer.observe(element, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => { void props.flow.check(); }, [props.flow]);
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) { handlePluginUpdateEscape(event, props.onClose); }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [props.onClose]);
  const lang = document.documentElement.lang;
  const view = props.flow.view(lang);
  const name = lang.toLowerCase().startsWith("zh") ? props.zhName : props.enName;
  const command = manualPluginUpdateCommand(view.profileRaw, props.packageName, view.latestRaw);
  const copyLabel = copyState === "copied" ? view.copy.copied : copyState === "failed" ? view.copy.copyFailed : view.copy.copy;
  return React.createElement(Modal, {
    open: true, className: "mpi-dialog", title: `${name} ${view.copy.update}`, onClose: props.onClose, closeLabel: "Close",
    footer: [
      React.createElement(PrimitiveButton, { key: "check", variant: "outline", size: "sm", disabled: view.busy, onClick: () => { void props.flow.check(); } }, view.copy.recheck),
      React.createElement(PrimitiveButton, { key: "update", variant: "primary", size: "sm", disabled: view.disabled, onClick: () => { void props.flow.update(); } }, view.updateLabel),
    ],
  }, React.createElement("div", { ref: bodyRef },
    React.createElement("p", { className: "mpi-intro" }, view.copy.intro),
    React.createElement("dl", { className: "mpi-meta" },
      React.createElement("dt", null, view.copy.current), React.createElement("dd", null, React.createElement("span", { className: "mpi-mono" }, view.currentVersion)),
      React.createElement("dt", null, view.copy.latestLabel), React.createElement("dd", { className: "mpi-latest" }, React.createElement("span", { className: "mpi-mono" }, view.latestVersion), React.createElement("span", { className: "mpi-status", role: "status", "data-kind": view.kind, ...(view.kind === "update" ? { style: { color: "#e8b15a" } } : {}) }, view.message)),
      React.createElement("dt", null, view.copy.profile), React.createElement("dd", null, React.createElement("span", { className: "mpi-mono" }, view.profileName))),
    view.busy ? React.createElement("div", { className: "dssm-update-progress", role: "progressbar", "aria-busy": "true" },
      React.createElement("div", { className: "dssm-update-progress-bar" })
    ) : null,
    React.createElement("section", { className: "mpi-manual" },
      React.createElement("h3", null, view.copy.manual),
      React.createElement("p", null, view.copy.manualHint),
      React.createElement("div", { className: "mpi-command" },
        React.createElement("code", null, command),
        React.createElement(PrimitiveButton, { variant: "outline", size: "sm", disabled: view.busy, onClick: () => {
          const write = navigator.clipboard?.writeText(command);
          if (write === undefined) { setCopyState("failed"); return; }
          void write.then(() => { setCopyState("copied"); window.setTimeout(() => setCopyState("idle"), 1400); }).catch(() => setCopyState("failed"));
        } }, copyLabel)))));
}

function observePluginUpdate(options: UpdateUIOptions) {
  if (typeof document === "undefined" || document.body === null) return () => {};
  ensureStyle();
  const controller = new AbortController();
  let payload: UpdatePayload | undefined;
  let buttonHost: HTMLElement | undefined;
  let buttonRoot: ReturnType<typeof createRoot> | undefined;
  let iconNode: HTMLElement | undefined;
  let dialogHost: HTMLElement | undefined;
  let dialogRoot: ReturnType<typeof createRoot> | undefined;
  let frame: number | undefined;

  function unmountCheck() { buttonRoot?.unmount(); buttonRoot = undefined; buttonHost = undefined; iconNode = undefined; }
  function renderCheck() {
    if (buttonRoot === undefined) return;
    if (iconNode === undefined) iconNode = options.createIcon("refresh");
    const icon = iconNode;
    buttonRoot.render(React.createElement(PrimitiveButton, {
      variant: "outline", size: "sm", onClick: openDialog, icon: React.createElement(HostIcon, { node: icon }),
    }, React.createElement("span", { "data-mpi-label": "" }, pluginUpdateCopy(document.documentElement.lang).check)));
  }
  function closeDialog() { dialogRoot?.unmount(); dialogRoot = undefined; dialogHost?.remove(); dialogHost = undefined; }
  function openDialog() {
    closeDialog();
    const host = document.createElement("div");
    host.className = "mpi-dialog-root";
    document.body.append(host);
    dialogHost = host;
    dialogRoot = createRoot(host);
    dialogRoot.render(React.createElement(UpdateDialog, {
      flow: createUpdateFlow((method) => requestStatus(options.endpoint, method, controller.signal), payload, (next) => { payload = next; applyControls(); }),
      packageName: options.packageName, zhName: options.zhName, enName: options.enName, onClose: closeDialog,
    }));
  }
  function applyControls() {
    const row = document.querySelector(options.titleRowSelector);
    if (row === null) return;
    const heading = row.querySelector("h1,h2");
    if (heading !== null && payload !== undefined) {
      let version = heading.querySelector<HTMLElement>(`.mpi-version[data-package="${options.packageName}"]`);
      if (version === null) {
        version = document.createElement("span");
        version.className = "mpi-version";
        version.dataset.package = options.packageName;
        heading.append(version);
      }
      const versionLabel = `v${payload.currentVersion}`;
      if (version.textContent !== versionLabel) version.textContent = versionLabel;
    }
    if (buttonHost !== undefined && !buttonHost.isConnected) unmountCheck();
    const links = row.querySelector(options.linksSelector);
    if (links === null) return;
    const existing = links.querySelector<HTMLElement>(`[data-mpi-check="${options.packageName}"]`);
    if (existing !== null) {
      const label = existing.querySelector("[data-mpi-label]");
      if (label === null || label.textContent !== pluginUpdateCopy(document.documentElement.lang).check) renderCheck();
      return;
    }
    const host = document.createElement("span");
    host.dataset.mpiCheck = options.packageName;
    host.className = "mpi-check-host";
    links.append(host);
    buttonHost = host;
    buttonRoot = createRoot(host);
    renderCheck();
  }
  const load = async () => {
    payload = await requestStatus(options.endpoint, "GET", controller.signal);
    applyControls();
    return payload;
  };
  const observer = new MutationObserver(() => {
    if (frame !== undefined) return;
    frame = window.requestAnimationFrame(() => { frame = undefined; applyControls(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["lang"] });
  applyControls();
  void load().catch(() => {});
  return () => {
    controller.abort(); observer.disconnect(); closeDialog(); unmountCheck();
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    document.querySelectorAll(`[data-mpi-check="${options.packageName}"],.mpi-version[data-package="${options.packageName}"]`).forEach((node) => node.remove());
  };
}

export { handlePluginUpdateEscape, manualPluginUpdateCommand, observePluginUpdate };
