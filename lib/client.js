(() => {
  // src/plugin-update-ui.js
  var UPDATE_HEADER = "x-michengai-plugin-update";
  var STYLE_ID = "michengai-plugin-update-ui";
  var CSS = `
.mpi-version{margin-left:8px;color:var(--dsw-alias-label-tertiary,#9da1aa);font-family:inherit;font-size:12px;font-weight:500;line-height:18px;letter-spacing:0;white-space:nowrap;vertical-align:baseline}.mpi-check{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#4b4d52);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#b8bbc2);font:inherit;font-size:12px;font-weight:500;line-height:18px;white-space:nowrap;cursor:pointer}.mpi-check:hover{background:var(--dsw-alias-interactive-bg-hover,#3a3b3f);color:var(--dsw-alias-label-primary,#fff)}.mpi-check:focus-visible,.mpi-action:focus-visible,.mpi-dialog-close:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f8cff);outline-offset:2px}.mpi-icon{display:inline-flex;flex:0 0 auto;width:16px;height:16px;align-items:center;justify-content:center;pointer-events:none}.mpi-icon svg{display:block;width:16px;height:16px}
.mpi-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.62)}.mpi-dialog{position:relative;box-sizing:border-box;width:min(680px,100%);max-height:calc(100vh - 48px);overflow:auto;border:1px solid var(--dsw-alias-border-l2,#4b4d52);border-radius:14px;padding:22px;background:var(--dsw-alias-bg-layer-2,var(--dsw-specific-menu,#202124));color:var(--dsw-alias-label-primary,#fff);box-shadow:var(--dsw-shadow-lv3,0 16px 48px rgba(0,0,0,.24));font-family:inherit}.mpi-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.mpi-dialog h2{margin:0;font-size:18px;line-height:26px}.mpi-dialog-close{display:inline-flex;flex:0 0 28px;width:28px;height:28px;align-items:center;justify-content:center;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#b8bbc2);cursor:pointer}.mpi-dialog-close:hover{background:var(--dsw-alias-interactive-bg-hover,#3a3b3f);color:var(--dsw-alias-label-primary,#fff)}.mpi-intro{margin:8px 0 18px;color:var(--dsw-alias-label-secondary,#c2c4ca);font-size:13px;line-height:20px}.mpi-meta{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 18px;margin:0 0 16px;font-size:12px;line-height:18px}.mpi-meta dt{color:var(--dsw-alias-label-secondary,#c2c4ca)}.mpi-meta dd{margin:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.mpi-status{margin:0 0 18px;border-radius:7px;padding:12px 14px;background:var(--dsw-alias-bg-layer-3,var(--dsw-specific-menu-item-hover,#252527));font-size:13px;font-weight:600;line-height:20px}.mpi-status[data-kind=error]{color:var(--dsw-alias-state-error-primary,#ff6464)}.mpi-status[data-kind=success]{color:var(--dsw-alias-state-success-primary,#36d67a)}.mpi-manual{border-top:1px solid var(--dsw-alias-border-l2,#4b4d52);padding-top:16px}.mpi-manual h3{margin:0 0 6px;font-size:14px;line-height:20px}.mpi-manual p{margin:0 0 10px;color:var(--dsw-alias-label-secondary,#c2c4ca);font-size:12px;line-height:18px}.mpi-command{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2,#4b4d52);border-radius:7px;padding:10px;background:var(--dsw-alias-bg-layer-3,var(--dsw-specific-menu-item-hover,#252527))}.mpi-command code{min-width:0;flex:1;overflow:auto;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:18px;white-space:nowrap}.mpi-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:18px}.mpi-actions-group{display:flex;gap:8px}.mpi-action{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;border:1px solid var(--dsw-alias-border-l2,#4b4d52);border-radius:7px;padding:6px 10px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}.mpi-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#414247)}.mpi-action:disabled{cursor:not-allowed;opacity:.55}.mpi-primary{border-color:var(--dsw-alias-state-business-primary,#4f8cff);background:var(--dsw-alias-state-business-primary,#4f8cff);color:#fff}.mpi-progress{height:4px;margin-top:10px;overflow:hidden;border-radius:99px;background:var(--dsw-alias-border-l2,#4b4d52)}.mpi-progress::after{display:block;width:32%;height:100%;background:var(--dsw-alias-state-business-primary,#4f8cff);content:'';animation:mpi-wave 1.15s ease-in-out infinite}@keyframes mpi-wave{from{transform:translateX(-110%)}to{transform:translateX(330%)}}@media(max-width:560px){.mpi-overlay{padding:10px}.mpi-dialog{max-height:calc(100vh - 20px);padding:16px}.mpi-actions{align-items:stretch}.mpi-actions-group{justify-content:flex-end;flex-wrap:wrap}.mpi-meta{grid-template-columns:1fr;gap:2px}.mpi-meta dd{margin-bottom:6px}}
`;
  var ZH = {
    check: "\u68C0\u67E5\u66F4\u65B0",
    update: "\u66F4\u65B0",
    close: "\u5173\u95ED",
    recheck: "\u91CD\u65B0\u68C0\u67E5",
    auto: "\u81EA\u52A8\u66F4\u65B0",
    updating: "\u6B63\u5728\u66F4\u65B0\u2026",
    copy: "\u590D\u5236\u547D\u4EE4",
    copied: "\u5DF2\u590D\u5236",
    copyFailed: "\u590D\u5236\u5931\u8D25",
    checking: "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026",
    latest: "\u5DF2\u662F\u6700\u65B0\u7248\u672C",
    found: "\u53D1\u73B0\u65B0\u7248\u672C",
    failed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    current: "\u8FD0\u884C\u7248\u672C",
    latestLabel: "\u6700\u65B0\u7248\u672C",
    profile: "\u76EE\u6807 profile",
    unknown: "\u672A\u77E5",
    manual: "\u624B\u5DE5\u66F4\u65B0",
    manualHint: "\u81EA\u52A8\u66F4\u65B0\u5931\u8D25\u65F6\uFF0C\u53EF\u5728\u5F53\u524D DSH \u7EC8\u7AEF\u6267\u884C\u4EE5\u4E0B\u547D\u4EE4\uFF0C\u5B8C\u6210\u540E\u91CD\u542F DSH Web\u3002",
    intro: "\u4EC5\u68C0\u67E5\u5E76\u66F4\u65B0\u5F53\u524D\u63D2\u4EF6\uFF0C\u4E0D\u4F1A\u8054\u52A8\u5B89\u88C5\u5176\u4ED6\u63D2\u4EF6\u3002",
    restart: "\u66F4\u65B0\u5B8C\u6210\uFF0C\u8BF7\u91CD\u542F DSH Web\u3002",
    restarting: "\u66F4\u65B0\u5B8C\u6210\uFF0C\u6B63\u5728\u91CD\u542F DSH Desktop\u2026",
    unavailable: "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u81EA\u52A8\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u624B\u5DE5\u66F4\u65B0\u547D\u4EE4\u3002"
  };
  var EN = {
    check: "Check for updates",
    update: "Update",
    close: "Close",
    recheck: "Check again",
    auto: "Update automatically",
    updating: "Updating\u2026",
    copy: "Copy command",
    copied: "Copied",
    copyFailed: "Copy failed",
    checking: "Checking for updates\u2026",
    latest: "You are up to date",
    found: "New version available",
    failed: "Could not check for updates. Try again later.",
    current: "Running version",
    latestLabel: "Latest version",
    profile: "Target profile",
    unknown: "Unknown",
    manual: "Manual update",
    manualHint: "If automatic update fails, run this command in the current DSH terminal, then restart DSH Web.",
    intro: "Only this plugin is checked and updated. Other plugins are not changed.",
    restart: "Update complete. Restart DSH Web.",
    restarting: "Update complete. Restarting DSH Desktop\u2026",
    unavailable: "Automatic update is unavailable. Use the manual command."
  };
  function strings() {
    const lang = document.documentElement.lang.toLowerCase();
    const settings = document.querySelector('[role="dialog"]')?.textContent ?? "";
    return lang.startsWith("en") || settings.includes("Settings") && !settings.includes("\u8BBE\u7F6E") ? EN : ZH;
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID) !== null) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).append(style);
  }
  function validPayload(value) {
    if (value === null || typeof value !== "object") return false;
    const item = value;
    return typeof item.packageName === "string" && typeof item.currentVersion === "string" && typeof item.updateAvailable === "boolean" && typeof item.profileName === "string" && typeof item.canAutoUpdate === "boolean" && typeof item.latestCheckFailed === "boolean" && (item.latestVersion === void 0 || typeof item.latestVersion === "string");
  }
  async function requestStatus(endpoint, method, signal) {
    const signalOption = signal === void 0 ? {} : { signal };
    const response = await fetch(endpoint, method === "GET" ? { cache: "no-store", ...signalOption } : {
      method: "POST",
      headers: { "content-type": "application/json", [UPDATE_HEADER]: "1" },
      body: "{}",
      ...signalOption
    });
    const value = await response.json();
    if (!response.ok || !validPayload(value)) throw new Error(typeof value.error === "string" ? value.error : strings().failed);
    return value;
  }
  function manualPluginUpdateCommand(profileName, packageName, version) {
    const profile = profileName.trim() === "" ? "" : ` --profile ${profileName.trim()}`;
    return `dsh plugin${profile} add ${packageName}@${version} --registry=https://registry.npmjs.org/`;
  }
  function handlePluginUpdateEscape(event, close) {
    if (event.key !== "Escape") return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    close();
    return true;
  }
  function observePluginUpdate(options) {
    if (typeof document === "undefined" || document.body === null) return () => {
    };
    ensureStyle();
    const controller = new AbortController();
    let payload;
    let overlay;
    let frame;
    const setButtonContent = (button, label, iconName) => {
      const icon = options.createIcon(iconName);
      icon.classList.add("mpi-icon");
      icon.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.dataset.mpiLabel = "";
      text.textContent = label;
      button.replaceChildren(icon, text);
    };
    const setButtonLabel = (button, label) => {
      const text = button.querySelector("[data-mpi-label]");
      if (text === null) button.textContent = label;
      else text.textContent = label;
    };
    const applyControls = () => {
      const row = document.querySelector(options.titleRowSelector);
      if (row === null) return;
      const heading = row.querySelector("h1,h2");
      if (heading !== null && payload !== void 0) {
        let version = heading.querySelector(`.mpi-version[data-package="${options.packageName}"]`);
        if (version === null) {
          version = document.createElement("span");
          version.className = "mpi-version";
          version.dataset.package = options.packageName;
          heading.append(version);
        }
        const versionLabel = `v${payload.currentVersion}`;
        if (version.textContent !== versionLabel) version.textContent = versionLabel;
      }
      const links = row.querySelector(options.linksSelector);
      if (links === null || links.querySelector(`[data-mpi-check="${options.packageName}"]`) !== null) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mpi-check";
      button.dataset.mpiCheck = options.packageName;
      setButtonContent(button, strings().check, "refresh");
      button.addEventListener("click", openDialog);
      links.append(button);
    };
    const load = async () => {
      payload = await requestStatus(options.endpoint, "GET", controller.signal);
      applyControls();
      return payload;
    };
    const closeDialog = () => {
      overlay?.remove();
      overlay = void 0;
    };
    function openDialog() {
      closeDialog();
      const text = strings();
      overlay = document.createElement("div");
      overlay.className = "mpi-overlay";
      const dialog = document.createElement("section");
      dialog.className = "mpi-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.innerHTML = `<header class="mpi-head"><h2></h2><button type="button" class="mpi-dialog-close" data-action="close"></button></header><p class="mpi-intro"></p><dl class="mpi-meta"><dt></dt><dd data-role="current"></dd><dt></dt><dd data-role="latest"></dd><dt></dt><dd data-role="profile"></dd></dl><div class="mpi-status" role="status"></div><div class="mpi-progress" hidden></div><section class="mpi-manual"><h3></h3><p></p><div class="mpi-command"><code></code><button type="button" class="mpi-action" data-action="copy"></button></div></section><footer class="mpi-actions"><div class="mpi-actions-group"><button type="button" class="mpi-action" data-action="check"></button><button type="button" class="mpi-action mpi-primary" data-action="update"></button></div></footer>`;
      const name = document.documentElement.lang.toLowerCase().startsWith("en") ? options.enName : options.zhName;
      dialog.querySelector("h2").textContent = `${name} ${text.update}`;
      dialog.querySelector(".mpi-intro").textContent = text.intro;
      const terms = dialog.querySelectorAll("dt");
      terms[0].textContent = text.current;
      terms[1].textContent = text.latestLabel;
      terms[2].textContent = text.profile;
      dialog.querySelector(".mpi-manual h3").textContent = text.manual;
      dialog.querySelector(".mpi-manual p").textContent = text.manualHint;
      const status = dialog.querySelector(".mpi-status");
      const progress = dialog.querySelector(".mpi-progress");
      const command = dialog.querySelector(".mpi-command code");
      const close = dialog.querySelector("[data-action=close]");
      const check = dialog.querySelector("[data-action=check]");
      const update = dialog.querySelector("[data-action=update]");
      const copy = dialog.querySelector("[data-action=copy]");
      setButtonContent(close, text.close, "close");
      close.querySelector("[data-mpi-label]")?.remove();
      close.setAttribute("aria-label", text.close);
      close.title = text.close;
      setButtonContent(check, text.recheck, "refresh");
      setButtonContent(update, text.auto, "download");
      setButtonContent(copy, text.copy, "copy");
      let busy = false;
      const setMessage = (message, kind = "") => {
        status.textContent = message;
        status.dataset.kind = kind;
      };
      const setBusy = (value) => {
        busy = value;
        check.disabled = value;
        copy.disabled = value;
        update.disabled = value || payload?.canAutoUpdate !== true || payload.updateAvailable !== true;
        progress.hidden = !value;
      };
      const render = () => {
        dialog.querySelector("[data-role=current]").textContent = payload === void 0 ? text.unknown : `v${payload.currentVersion}`;
        dialog.querySelector("[data-role=latest]").textContent = payload?.latestVersion === void 0 ? text.unknown : `v${payload.latestVersion}`;
        dialog.querySelector("[data-role=profile]").textContent = payload?.profileName ?? text.unknown;
        command.textContent = manualPluginUpdateCommand(payload?.profileName ?? "", options.packageName, payload?.latestVersion ?? "latest");
        update.disabled = busy || payload?.canAutoUpdate !== true || payload.updateAvailable !== true;
        if (payload === void 0) setMessage(text.checking);
        else if (payload.latestCheckFailed) setMessage(text.failed, "error");
        else if (payload.updateAvailable) setMessage(`${text.found}: v${payload.latestVersion ?? text.unknown}`);
        else setMessage(text.latest, "success");
        if (payload !== void 0 && !payload.canAutoUpdate && payload.updateAvailable) setMessage(text.unavailable);
      };
      const checkNow = async () => {
        if (busy) return;
        setBusy(true);
        setMessage(text.checking);
        try {
          await load();
          setBusy(false);
          render();
        } catch (error) {
          setBusy(false);
          setMessage(error instanceof Error ? error.message : text.failed, "error");
        }
      };
      const updateNow = async () => {
        if (busy) return;
        setBusy(true);
        setButtonLabel(update, text.updating);
        setMessage(text.updating);
        try {
          payload = await requestStatus(options.endpoint, "POST", controller.signal);
          applyControls();
          render();
          setMessage(payload.autoReload === true ? text.restarting : text.restart, "success");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : text.failed, "error");
        } finally {
          setButtonLabel(update, text.auto);
          setBusy(false);
        }
      };
      close.addEventListener("click", closeDialog);
      check.addEventListener("click", () => {
        void checkNow();
      });
      update.addEventListener("click", () => {
        void updateNow();
      });
      copy.addEventListener("click", () => {
        void navigator.clipboard?.writeText(command.textContent ?? "").then(() => {
          setButtonLabel(copy, text.copied);
          setTimeout(() => {
            setButtonLabel(copy, text.copy);
          }, 1400);
        }).catch(() => {
          setButtonLabel(copy, text.copyFailed);
        });
      });
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeDialog();
      });
      overlay.addEventListener("keydown", (event) => {
        handlePluginUpdateEscape(event, closeDialog);
      }, true);
      overlay.append(dialog);
      document.body.append(overlay);
      render();
      close.focus();
      void checkNow();
    }
    const observer = new MutationObserver(() => {
      if (frame !== void 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = void 0;
        applyControls();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    applyControls();
    void load().catch(() => {
    });
    return () => {
      controller.abort();
      observer.disconnect();
      closeDialog();
      if (frame !== void 0) window.cancelAnimationFrame(frame);
      document.querySelectorAll(`[data-mpi-check="${options.packageName}"],.mpi-version[data-package="${options.packageName}"]`).forEach((node) => node.remove());
    };
  }

  // src/client.js
  window.__ModuleLoader__.load({
    id: "@michengai/dsh-skills-manager",
    factory: (require2) => {
      var module = { exports: {} };
      Object.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });
      var react = require2("react");
      var h = react.createElement;
      var primitives = require2("@deepseek-ai/dsh-client-ui-primitives");
      var UPDATE_ICON_PATHS = {
        refresh: ["M13.5 5.5V2.5m0 0h-3m3 0-2.1 2.1A5.5 5.5 0 1 0 13.2 12"],
        download: ["M8 2v8m0 0 3-3m-3 3-3-3M3 13v2h10v-2"],
        copy: ["M5 5h8v8H5z", "M3 3h8"],
        close: ["m4 4 8 8M12 4 4 12"]
      };
      function createPluginUpdateIcon(name) {
        var element = document.createElement("span");
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.5");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        UPDATE_ICON_PATHS[name].forEach(function(d) {
          var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", d);
          svg.append(path);
        });
        element.append(svg);
        return element;
      }
      var MUTATION_HEADERS = { "content-type": "application/json", "x-dsh-skills-manager": "1" };
      var NS = "skills-manager";
      var DICT = {
        zh: {
          "title": "\u6280\u80FD",
          "desc": "\u7EDF\u4E00\u52A0\u8F7D\u548C\u7BA1\u7406\u672C\u673A Agent Skills\u3002",
          "link.project": "GitHub",
          "link.feedback": "\u95EE\u9898\u53CD\u9988",
          "btn.create": "\u521B\u5EFA\u6280\u80FD",
          "btn.import": "\u5BFC\u5165",
          "btn.refresh": "\u5237\u65B0",
          "btn.cancel": "\u53D6\u6D88",
          "btn.close": "\u5173\u95ED",
          "btn.detail": "\u67E5\u770B\u8BE6\u60C5",
          "btn.trash": "\u79FB\u5230\u56DE\u6536\u7AD9",
          "btn.restore": "\u6062\u590D",
          "btn.delete.forever": "\u6C38\u4E45\u5220\u9664",
          "btn.file.pick": "\u9009\u62E9\u6587\u4EF6",
          "btn.folder.pick": "\u9009\u62E9\u6587\u4EF6\u5939",
          "btn.import.now": "\u5B89\u88C5",
          "btn.create.now": "\u521B\u5EFA\u6280\u80FD",
          "btn.disable": "\u505C\u7528",
          "btn.enable": "\u542F\u7528",
          "status.enabled": "\u5DF2\u542F\u7528",
          "status.disabled": "\u5DF2\u505C\u7528",
          "status.invalid": "\u8BCA\u65AD\u5F02\u5E38",
          "status.shadowed": "\u88AB\u8986\u76D6",
          "status.readonly": "\u6E90\u6587\u4EF6\u53EA\u8BFB",
          "status.manageable": "\u53EF\u7BA1\u7406",
          "status.project": "\u9879\u76EE\u7EA7",
          "status.rank": "\u4F18\u5148\u7EA7 {rank}",
          "status.source.on": "\u5DF2\u542F\u7528",
          "status.source.off": "\u5DF2\u505C\u7528",
          "status.bundle": "\u76EE\u5F55\u6280\u80FD",
          "status.single": "\u5355\u6587\u4EF6",
          "summary.total.one": "{count} \u4E2A\u6280\u80FD",
          "summary.total.other": "{count} \u4E2A\u6280\u80FD",
          "summary.enabled.one": "{count} \u4E2A\u5DF2\u542F\u7528",
          "summary.enabled.other": "{count} \u4E2A\u5DF2\u542F\u7528",
          "summary.disabled.one": "{count} \u4E2A\u5DF2\u505C\u7528",
          "summary.disabled.other": "{count} \u4E2A\u5DF2\u505C\u7528",
          "summary.issues.one": "{count} \u4E2A\u8BCA\u65AD\u9879",
          "summary.issues.other": "{count} \u4E2A\u8BCA\u65AD\u9879",
          "summary.group.one": "{count} \u4E2A\u6280\u80FD",
          "summary.group.other": "{count} \u4E2A\u6280\u80FD",
          "table.skill": "\u6280\u80FD\u540D\u79F0\u4E0E\u63CF\u8FF0",
          "table.status": "\u8C03\u7528\u72B6\u6001",
          "filter.source": "\u6765\u6E90",
          "filter.all": "\u5168\u90E8\u6765\u6E90",
          "filter.option": "{name}\uFF08{count}\uFF09",
          "search": "\u641C\u7D22",
          "search.placeholder": "\u641C\u7D22\u6280\u80FD\u540D\u79F0\u6216\u63CF\u8FF0",
          "search.clear": "\u6E05\u9664\u641C\u7D22",
          "empty.search": "\u6CA1\u6709\u5339\u914D\u7684\u6280\u80FD\u3002",
          "empty.source": "\u8BE5\u6765\u6E90\u76EE\u5F55\u4E0D\u5B58\u5728\u6216\u6682\u65F6\u6CA1\u6709\u6280\u80FD\u3002",
          "loading": "\u6B63\u5728\u52A0\u8F7D\u6280\u80FD\u2026",
          "note.missing": "\u672A\u63D0\u4F9B\u7B80\u4ECB",
          "source.toggle": "\u542F\u505C\u6765\u6E90",
          "skill.toggle": "\u542F\u505C\u6280\u80FD",
          "source.external.note": "\u901A\u8FC7 Skills Manager \u63A5\u5165\uFF0C\u542F\u505C\u4E0D\u4F1A\u6539\u5199\u6E90\u6587\u4EF6\u3002",
          "source.dsh.note": "DSH \u672C\u5730\u6280\u80FD\u53EF\u521B\u5EFA\u3001\u5BFC\u5165\u548C\u79FB\u5230\u56DE\u6536\u7AD9\uFF1B\u542F\u505C\u53EA\u66F4\u65B0\u7BA1\u7406\u5668\u72B6\u6001\u3002",
          "detail.title": "\u6280\u80FD\u8BE6\u60C5",
          "detail.body": "\u6B63\u6587",
          "detail.frontmatter": "Frontmatter",
          "detail.diagnostics": "\u8BCA\u65AD",
          "detail.path": "\u6E90\u6587\u4EF6",
          "detail.noIssues": "\u672A\u53D1\u73B0\u8BCA\u65AD\u95EE\u9898\u3002",
          "create.title": "\u521B\u5EFA\u6280\u80FD",
          "create.target": "\u521B\u5EFA\u4F4D\u7F6E",
          "create.name": "\u540D\u79F0",
          "create.name.placeholder": "\u4F8B\u5982 code-review-helper",
          "create.description": "\u7B80\u4ECB",
          "create.description.placeholder": "\u4E00\u53E5\u8BDD\u8BF4\u660E\u4EC0\u4E48\u65F6\u5019\u4F7F\u7528",
          "create.body": "\u6B63\u6587\uFF08Markdown\uFF09",
          "create.body.placeholder": "\u5199\u4E0B\u6280\u80FD\u8981\u9075\u5FAA\u7684\u6307\u4EE4\u3001\u6B65\u9AA4\u548C\u8FB9\u754C\u2026",
          "create.chat.note": "\u5BF9\u8BDD\u4E2D\u7684 create_skill \u4ECD\u521B\u5EFA\u7528\u6237\u7EA7 DSH Skill\uFF1B\u9879\u76EE Skill \u53EF\u5728\u8FD9\u91CC\u9009\u62E9\u6D3B\u52A8\u9879\u76EE\u540E\u521B\u5EFA\u3002",
          "import.title": "\u5BFC\u5165\u6280\u80FD",
          "upload.drop.title": "\u62D6\u62FD\u6280\u80FD\u5230\u6B64\u5904",
          "upload.drop.copy": "\u652F\u6301 .zip\u3001\u6280\u80FD\u6587\u4EF6\u5939\u6216\u5355\u4E2A SKILL.md",
          "upload.selected.one": "{count} \u4E2A\u6587\u4EF6 \xB7 {size}",
          "upload.selected.other": "{count} \u4E2A\u6587\u4EF6 \xB7 {size}",
          "upload.remove": "\u79FB\u9664\u6240\u9009\u5185\u5BB9",
          "upload.requirements": "\u6587\u4EF6\u8981\u6C42",
          "upload.requirement.skill": "\u538B\u7F29\u5305\u6216\u6587\u4EF6\u5939\u9700\u5305\u542B SKILL.md",
          "upload.requirement.frontmatter": "SKILL.md \u9700\u5305\u542B YAML \u683C\u5F0F\u7684\u6280\u80FD\u540D\u79F0\u548C\u63CF\u8FF0",
          "upload.requirement.copy": "\u5BFC\u5165\u65F6\u590D\u5236\u5B8C\u6574\u5185\u5BB9\uFF0C\u4E0D\u4FEE\u6539\u539F\u59CB\u6765\u6E90",
          "upload.importing": "\u6B63\u5728\u5B89\u88C5\u2026",
          "status.selected": "\u5DF2\u9009\u62E9",
          "select.file.invalid": "\u8BF7\u9009\u62E9 .zip \u6216\u5355\u4E2A SKILL.md\u3002",
          "select.folder.invalid": "\u6240\u9009\u6587\u4EF6\u5939\u4E2D\u6CA1\u6709\u627E\u5230 SKILL.md\u3002",
          "error.browse.absolute": "\u76EE\u5F55\u8DEF\u5F84\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A{path}",
          "error.browse.unreadable": "\u65E0\u6CD5\u8BFB\u53D6\u76EE\u5F55\uFF1A{path}",
          "error.browse.notDirectory": "\u4E0D\u662F\u76EE\u5F55\uFF1A{path}",
          "trash.title": "\u56DE\u6536\u7AD9",
          "trash.count.one": "{count} \u4E2A\u5F85\u5904\u7406\u6280\u80FD",
          "trash.count.other": "{count} \u4E2A\u5F85\u5904\u7406\u6280\u80FD",
          "trash.empty": "\u56DE\u6536\u7AD9\u4E3A\u7A7A\u3002",
          "trash.deletedAt": "\u5220\u9664\u4E8E {time}",
          "trash.source": "\u6765\u6E90\uFF1A{source}",
          "confirm.trash.title": "\u79FB\u5230\u56DE\u6536\u7AD9\uFF1F",
          "confirm.trash.desc": "\u201C{name}\u201D\u5C06\u4ECE\u5F53\u524D\u6280\u80FD\u6765\u6E90\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C\u4E4B\u540E\u53EF\u4EE5\u6062\u590D\u5230\u539F\u4F4D\u7F6E\u3002",
          "confirm.delete.title": "\u6C38\u4E45\u5220\u9664\uFF1F",
          "confirm.delete.desc": "\u201C{name}\u201D\u5C06\u4ECE\u56DE\u6536\u7AD9\u6C38\u4E45\u5220\u9664\uFF0C\u65E0\u6CD5\u6062\u590D\u3002",
          "result.created": "\u5DF2\u521B\u5EFA\u6280\u80FD\uFF1A{name}",
          "result.imported": "\u5BFC\u5165\u5B8C\u6210\uFF1A{names}",
          "result.importPartial": "\u5DF2\u5BFC\u5165\uFF1A{imported}\uFF1B\u5DF2\u8DF3\u8FC7\u540C\u540D\u6280\u80FD\uFF1A{skipped}",
          "result.importSkipped": "\u672A\u5BFC\u5165\u4EFB\u4F55\u6280\u80FD\uFF1B\u5DF2\u8DF3\u8FC7\u540C\u540D\u6280\u80FD\uFF1A{names}",
          "result.importEmpty": "\u672A\u5BFC\u5165\u4EFB\u4F55\u6280\u80FD\u3002",
          "result.importWarnings": "{result}\uFF1B\u8B66\u544A\uFF1A{warnings}",
          "result.restored": "\u5DF2\u6062\u590D\u6280\u80FD\uFF1A{name}",
          "result.trashed": "\u5DF2\u79FB\u5230\u56DE\u6536\u7AD9\uFF1A{name}",
          "result.deleted": "\u5DF2\u6C38\u4E45\u5220\u9664\uFF1A{name}",
          "result.updated": "\u72B6\u6001\u5DF2\u66F4\u65B0\u3002",
          "error.action": "\u64CD\u4F5C\u5931\u8D25\uFF1A{error}",
          "warning.scan.truncated": "\u6280\u80FD\u76EE\u5F55\u8F83\u5927\u6216\u5D4C\u5957\u8FC7\u6DF1\uFF0C\u90E8\u5206\u6280\u80FD\u672A\u663E\u793A\uFF1A{path}",
          "warning.state.invalid": "\u6280\u80FD\u7BA1\u7406\u5668\u72B6\u6001\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF1B\u6240\u6709\u6280\u80FD\u5DF2\u5B89\u5168\u505C\u7528\uFF0C\u4FEE\u590D\u6587\u4EF6\u524D\u4E0D\u4F1A\u8986\u76D6\u72B6\u6001\uFF1A{path}",
          "warning.backupUncleaned": "\u65E7\u7248\u672C\u5907\u4EFD\u672A\u6E05\u7406\uFF1A{path}\uFF08{error}\uFF09",
          "warning.project.unavailable": "\u65E0\u6CD5\u4ECE\u5BBF\u4E3B\u8BFB\u53D6\u6D3B\u52A8\u5DE5\u4F5C\u533A\uFF0C\u9879\u76EE\u6280\u80FD\u672A\u663E\u793A\uFF1A{path}",
          "error.root.readonly": "\u8BE5\u6765\u6E90\u4E0D\u5141\u8BB8{action}",
          "error.root.unknown": "\u672A\u77E5\u6280\u80FD\u6765\u6E90\uFF1A{root}",
          "error.root.unsafe": "\u9879\u76EE\u6280\u80FD\u76EE\u5F55\u4E0D\u5B89\u5168\uFF0C\u62D2\u7EDD\u5199\u5165\uFF1A{path}",
          "error.skill.notFound": "\u6280\u80FD\u4E0D\u5B58\u5728: {name}",
          "error.skill.noFrontmatter": "\u6280\u80FD\u7F3A\u5C11\u5B8C\u6574 frontmatter\uFF0C\u65E0\u6CD5{action}: {name}",
          "error.skill.notLoadable": "\u6280\u80FD\u7ED3\u6784\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5{action}: {name}",
          "error.source.notFound": "\u8DEF\u5F84\u4E0D\u5B58\u5728: {path}",
          "error.source.symlink": "\u4E0D\u652F\u6301\u5305\u542B\u7B26\u53F7\u94FE\u63A5\u7684 skill \u6765\u6E90: {path}",
          "error.source.unrecognized": "\u65E0\u6CD5\u8BC6\u522B\u7684 skill \u6765\u6E90: {path}",
          "error.source.tooDeep": "skill \u6765\u6E90\u76EE\u5F55\u5C42\u7EA7\u8D85\u8FC7 {depth} \u5C42: {path}",
          "error.import.overlap": "\u5BFC\u5165\u6765\u6E90\u4E0D\u80FD\u4E0E DSH \u6280\u80FD\u76EE\u5F55\u76F8\u540C\u3001\u5305\u542B\u6216\u4F4D\u4E8E\u5176\u4E2D",
          "error.import.emptySource": "\u76EE\u5F55\u4E0B\u672A\u627E\u5230\u4EFB\u4F55 skill \u6761\u76EE: {path}",
          "error.import.invalidName": "\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 kebab-case \u540D\u79F0\uFF08\u539F\u59CB\u540D: {name}\uFF09",
          "error.import.duplicateName": "\u6279\u91CF\u6765\u6E90\u4E2D\u5B58\u5728\u591A\u4E2A\u540C\u540D\u6280\u80FD: {name}",
          "error.import.failed": "\u5BFC\u5165\u5931\u8D25",
          "error.import.rollbackFailed": "\u8986\u76D6\u5BFC\u5165\u56DE\u6EDA\u5931\u8D25\uFF0C\u5907\u4EFD\u4FDD\u7559\u5728: {path}\uFF08{error}\uFF09",
          "error.upload.path": "\u4E0A\u4F20\u5185\u5BB9\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\uFF1A{path}",
          "error.upload.encoding": "\u4E0A\u4F20\u5185\u5BB9\u7F16\u7801\u65E0\u6548",
          "error.upload.empty": "\u4E0A\u4F20\u5185\u5BB9\u4E3A\u7A7A",
          "error.upload.tooMany": "\u4E0A\u4F20\u6587\u4EF6\u8FC7\u591A\uFF0C\u6700\u591A {limit} \u4E2A",
          "error.upload.tooLarge": "\u4E0A\u4F20\u5185\u5BB9\u8FC7\u5927\uFF0C\u9650\u5236\u4E3A {limit} \u5B57\u8282",
          "error.upload.archiveTooLarge": "ZIP \u538B\u7F29\u5305\u8FC7\u5927\uFF0C\u9650\u5236\u4E3A {limit} \u5B57\u8282",
          "error.upload.duplicate": "\u4E0A\u4F20\u5185\u5BB9\u5305\u542B\u91CD\u590D\u8DEF\u5F84\uFF1A{path}",
          "error.upload.zipInvalid": "ZIP \u538B\u7F29\u5305\u65E0\u6CD5\u89E3\u538B",
          "error.trash.notFound": "\u56DE\u6536\u7AD9\u6761\u76EE\u4E0D\u5B58\u5728: {id}",
          "error.trash.conflict": "\u65E0\u6CD5\u6062\u590D\uFF0C\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728: {name}",
          "error.trash.invalid": "\u56DE\u6536\u7AD9\u6761\u76EE\u8DEF\u5F84\u975E\u6CD5: {id}",
          "error.trash.projectUnavailable": "\u539F\u9879\u76EE\u5F53\u524D\u4E0D\u5728\u6D3B\u52A8\u5DE5\u4F5C\u533A\u4E2D\uFF0C\u65E0\u6CD5\u6062\u590D\uFF1A{path}",
          "error.trash.rollbackFailed": "\u79FB\u5165\u56DE\u6536\u7AD9\u56DE\u6EDA\u5931\u8D25\uFF0C\u672A\u6062\u590D\u5185\u5BB9\u4FDD\u7559\u5728: {path}\uFF08{error}\uFF09",
          "error.state.invalid": "\u6280\u80FD\u7BA1\u7406\u5668\u72B6\u6001\u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF0C\u5DF2\u62D2\u7EDD\u8986\u76D6\uFF1A{path}",
          "error.create.descriptionRequired": "\u6280\u80FD\u7B80\u4ECB\u4E0D\u80FD\u4E3A\u7A7A",
          "error.create.bodyRequired": "\u6280\u80FD\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A",
          "error.create.tooLarge": "\u6280\u80FD\u5185\u5BB9\u8FC7\u957F",
          "error.create.conflict": "\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728: {name}",
          "error.proto.forbidden": "\u7981\u6B62\u7684\u4FEE\u6539\u8BF7\u6C42\uFF08\u7F3A\u5C11\u5BA2\u6237\u7AEF\u6807\u8BB0\uFF09",
          "error.proto.forbiddenHost": "\u7981\u6B62\u7684\u8BF7\u6C42\u6765\u6E90\uFF08\u975E\u6CD5 Host\uFF09",
          "error.proto.contentType": "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F application/json",
          "error.proto.method": "\u4E0D\u652F\u6301\u7684\u8BF7\u6C42\u65B9\u6CD5",
          "error.proto.unknownAction": "\u672A\u77E5\u64CD\u4F5C",
          "error.proto.bodyTooLarge": "\u8BF7\u6C42\u4F53\u8FC7\u5927",
          "error.proto.invalidJson": "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON",
          "error.proto.nonJson": "\u670D\u52A1\u7AEF\u8FD4\u56DE\u975E JSON \u54CD\u5E94\uFF08HTTP {status}\uFF09",
          "diagnostic.frontmatter.missing": "\u7F3A\u5C11\u5B8C\u6574 YAML frontmatter",
          "diagnostic.name.missing": "frontmatter \u7F3A\u5C11 name",
          "diagnostic.name.invalid": "\u6280\u80FD\u540D\u79F0\u4E0D\u662F\u5408\u6CD5 kebab-case\uFF1A{name}",
          "diagnostic.description.missing": "frontmatter \u7F3A\u5C11 description",
          "diagnostic.invocation.invalid": "\u8C03\u7528\u7B56\u7565\u5B57\u6BB5\u503C\u65E0\u6548",
          "diagnostic.shadowed": "\u88AB\u66F4\u9AD8\u4F18\u5148\u7EA7\u6765\u6E90 {root} \u8986\u76D6",
          "action.enable": "\u542F\u7528",
          "action.disable": "\u505C\u7528",
          "action.create": "\u521B\u5EFA",
          "action.delete": "\u5220\u9664",
          "action.restore": "\u6062\u590D",
          "action.toggle": "\u542F\u7528\u6216\u505C\u7528",
          "scope.user": "\u5168\u5C40\u6280\u80FD",
          "scope.project": "\u9879\u76EE\u6280\u80FD",
          "scope.label": "\u6280\u80FD\u4F5C\u7528\u57DF",
          "scope.userHint": "\u8DE8\u9879\u76EE\u53EF\u7528\u3002\u542F\u505C\u4EC5\u5F71\u54CD DSH \u4E2D\u7684\u8C03\u7528\u3002",
          "scope.projectHint": "\u4EC5\u5728\u6240\u9009\u9879\u76EE\u4E2D\u751F\u6548\u3002\u542F\u505C\u4E0D\u4FEE\u6539\u5176\u4ED6 Agent \u7684\u6E90\u6587\u4EF6\u3002",
          "project.select": "\u9009\u62E9\u9879\u76EE",
          "project.empty": "\u6CA1\u6709\u53EF\u8BC6\u522B\u7684\u9879\u76EE\u3002\u8BF7\u5728 Git \u9879\u76EE\u4E2D\u6253\u5F00 DSH \u4F1A\u8BDD\u540E\u5237\u65B0\u3002",
          "filter.status": "\u8C03\u7528\u72B6\u6001",
          "filter.statusAll": "\u5168\u90E8\u72B6\u6001",
          "status.shadowedBy": "\u88AB {source} \u4E2D\u7684\u540C\u540D\u6280\u80FD\u8986\u76D6",
          "root.copilot": "Copilot",
          "source.selectHint": "\u9009\u62E9\u5177\u4F53\u6765\u6E90\u53EF\u67E5\u770B\u76EE\u5F55\u548C\u8BBE\u7F6E\u6765\u6E90\u5F00\u5173\u3002",
          "import.global": "\u5BFC\u5165\u5230\u5168\u5C40 DSH",
          "root.dsh": "DSH \u6280\u80FD",
          "root.agents": "\u516C\u5171 Agent",
          "root.ccswitch": "CC Switch",
          "root.projectDsh": "\u9879\u76EE DSH",
          "root.projectAgents": "\u9879\u76EE Agent",
          "root.codex": "Codex",
          "root.claude": "Claude",
          "root.gemini": "Gemini",
          "root.opencode": "OpenCode",
          "root.cursor": "Cursor",
          "root.windsurf": "Windsurf",
          "root.windsurfUser": "Windsurf \u4E3B\u76EE\u5F55",
          "root.trae": "Trae",
          "root.traeCn": "Trae \u56FD\u5185\u7248",
          "root.openclaw": "OpenClaw",
          "root.clawdbot": "OpenClaw \u65E7\u76EE\u5F55",
          "root.roo": "Roo",
          "root.codebuddy": "CodeBuddy"
        },
        en: {
          "title": "Skills",
          "desc": "Load and manage Agent Skills on this computer in one place.",
          "link.project": "GitHub",
          "link.feedback": "Issues",
          "btn.create": "Create skill",
          "btn.import": "Import",
          "btn.refresh": "Refresh",
          "btn.cancel": "Cancel",
          "btn.close": "Close",
          "btn.detail": "View details",
          "btn.trash": "Move to trash",
          "btn.restore": "Restore",
          "btn.delete.forever": "Delete forever",
          "btn.file.pick": "Choose file",
          "btn.folder.pick": "Choose folder",
          "btn.import.now": "Install",
          "btn.create.now": "Create skill",
          "btn.disable": "Disable",
          "btn.enable": "Enable",
          "status.enabled": "Enabled",
          "status.disabled": "Disabled",
          "status.invalid": "Needs attention",
          "status.shadowed": "Shadowed",
          "status.readonly": "Source read-only",
          "status.manageable": "Manageable",
          "status.project": "Project scoped",
          "status.rank": "Rank {rank}",
          "status.source.on": "Enabled",
          "status.source.off": "Disabled",
          "status.bundle": "Bundle",
          "status.single": "Single file",
          "summary.total.one": "{count} skill",
          "summary.total.other": "{count} skills",
          "summary.enabled.one": "{count} enabled",
          "summary.enabled.other": "{count} enabled",
          "summary.disabled.one": "{count} disabled",
          "summary.disabled.other": "{count} disabled",
          "summary.issues.one": "{count} diagnostic",
          "summary.issues.other": "{count} diagnostics",
          "summary.group.one": "{count} skill",
          "summary.group.other": "{count} skills",
          "table.skill": "Skill name and description",
          "table.status": "Invocation status",
          "filter.source": "Source",
          "filter.all": "All sources",
          "filter.option": "{name} ({count})",
          "search": "Search",
          "search.placeholder": "Search skill names or descriptions",
          "search.clear": "Clear search",
          "empty.search": "No matching skills.",
          "empty.source": "This source does not exist or has no skills yet.",
          "loading": "Loading skills\u2026",
          "note.missing": "No description provided",
          "source.toggle": "Toggle source",
          "skill.toggle": "Toggle skill",
          "source.external.note": "Managed through Skills Manager; toggles never rewrite source files.",
          "source.dsh.note": "Local DSH skills can be created, imported, and moved to trash; toggles update manager state only.",
          "detail.title": "Skill details",
          "detail.body": "Body",
          "detail.frontmatter": "Frontmatter",
          "detail.diagnostics": "Diagnostics",
          "detail.path": "Source file",
          "detail.noIssues": "No diagnostic issues found.",
          "create.title": "Create skill",
          "create.target": "Create in",
          "create.name": "Name",
          "create.name.placeholder": "e.g. code-review-helper",
          "create.description": "Description",
          "create.description.placeholder": "One sentence describing when to use it",
          "create.body": "Body (Markdown)",
          "create.body.placeholder": "Write the instructions, steps, and boundaries\u2026",
          "create.chat.note": "The conversational create_skill tool still creates a user-level DSH Skill; choose an active project here for a project Skill.",
          "import.title": "Import skill",
          "upload.drop.title": "Drop a skill here",
          "upload.drop.copy": "Supports .zip, a skill folder, or one SKILL.md",
          "upload.selected.one": "{count} file \xB7 {size}",
          "upload.selected.other": "{count} files \xB7 {size}",
          "upload.remove": "Remove selection",
          "upload.requirements": "File requirements",
          "upload.requirement.skill": "Archives and folders must contain SKILL.md",
          "upload.requirement.frontmatter": "SKILL.md must include a YAML name and description",
          "upload.requirement.copy": "Import copies all content and never modifies the source",
          "upload.importing": "Installing\u2026",
          "status.selected": "Selected",
          "select.file.invalid": "Choose a .zip archive or one SKILL.md.",
          "select.folder.invalid": "No SKILL.md was found in the selected folder.",
          "error.browse.absolute": "Folder path must be absolute: {path}",
          "error.browse.unreadable": "Could not read folder: {path}",
          "error.browse.notDirectory": "Not a folder: {path}",
          "trash.title": "Trash",
          "trash.count.one": "{count} skill pending",
          "trash.count.other": "{count} skills pending",
          "trash.empty": "Trash is empty.",
          "trash.deletedAt": "Deleted {time}",
          "trash.source": "Source: {source}",
          "confirm.trash.title": "Move to trash?",
          "confirm.trash.desc": "\u201C{name}\u201D will move out of its current skill source and can be restored to the same location later.",
          "confirm.delete.title": "Delete forever?",
          "confirm.delete.desc": "\u201C{name}\u201D will be permanently deleted from trash and cannot be recovered.",
          "result.created": "Created skill: {name}",
          "result.imported": "Import complete: {names}",
          "result.importPartial": "Imported: {imported}; skipped existing skills: {skipped}",
          "result.importSkipped": "No skills were imported; existing skills were skipped: {names}",
          "result.importEmpty": "No skills were imported.",
          "result.importWarnings": "{result}; warnings: {warnings}",
          "result.restored": "Restored skill: {name}",
          "result.trashed": "Moved to trash: {name}",
          "result.deleted": "Permanently deleted: {name}",
          "result.updated": "Status updated.",
          "error.action": "Action failed: {error}",
          "warning.scan.truncated": "Some skills were not shown because the directory is too large or deeply nested: {path}",
          "warning.state.invalid": "The manager state file could not be read; all skills are disabled and state writes are blocked until it is repaired: {path}",
          "warning.backupUncleaned": "Old version backup was not cleaned up: {path} ({error})",
          "warning.project.unavailable": "The active workspace could not be read from the host, so its project skills are hidden: {path}",
          "error.root.readonly": "This source does not allow {action}",
          "error.root.unknown": "Unknown skill source: {root}",
          "error.root.unsafe": "The project skill directory is unsafe, so the write was refused: {path}",
          "error.skill.notFound": "Skill not found: {name}",
          "error.skill.noFrontmatter": "Skill lacks complete frontmatter, cannot {action}: {name}",
          "error.skill.notLoadable": "Skill structure is incomplete, cannot {action}: {name}",
          "error.source.notFound": "Path does not exist: {path}",
          "error.source.symlink": "Skill sources containing symbolic links are not supported: {path}",
          "error.source.unrecognized": "Unrecognized skill source: {path}",
          "error.source.tooDeep": "Skill source directory depth exceeds {depth} levels: {path}",
          "error.import.overlap": "Import source cannot be the same as, contain, or be inside the DSH skills directory",
          "error.import.emptySource": "No skill entries found in the directory: {path}",
          "error.import.invalidName": "Cannot generate a valid kebab-case name (original: {name})",
          "error.import.duplicateName": "Batch source contains duplicate skill names: {name}",
          "error.import.failed": "Import failed",
          "error.import.rollbackFailed": "Overwrite import rollback failed; backups kept at: {path} ({error})",
          "error.upload.path": "Upload contains an invalid path: {path}",
          "error.upload.encoding": "Upload encoding is invalid",
          "error.upload.empty": "Upload is empty",
          "error.upload.tooMany": "Too many uploaded files; maximum {limit}",
          "error.upload.tooLarge": "Upload is too large; limit {limit} bytes",
          "error.upload.archiveTooLarge": "ZIP archive is too large; limit {limit} bytes",
          "error.upload.duplicate": "Upload contains a duplicate path: {path}",
          "error.upload.zipInvalid": "ZIP archive could not be extracted",
          "error.trash.notFound": "Trash item not found: {id}",
          "error.trash.conflict": "Cannot restore because a skill with the same name exists: {name}",
          "error.trash.invalid": "Invalid trash item path: {id}",
          "error.trash.projectUnavailable": "The original project is not an active workspace, so this skill cannot be restored: {path}",
          "error.trash.rollbackFailed": "Move-to-trash rollback failed; unrecovered content was kept at: {path} ({error})",
          "error.state.invalid": "The manager state file could not be read, so overwriting it was refused: {path}",
          "error.create.descriptionRequired": "Skill description is required",
          "error.create.bodyRequired": "Skill body is required",
          "error.create.tooLarge": "Skill content is too large",
          "error.create.conflict": "A skill with the same name already exists: {name}",
          "error.proto.forbidden": "Forbidden mutation request (missing client marker)",
          "error.proto.forbiddenHost": "Forbidden request origin (invalid host)",
          "error.proto.contentType": "Content type must be application/json",
          "error.proto.method": "Method not allowed",
          "error.proto.unknownAction": "Unknown action",
          "error.proto.bodyTooLarge": "Request body too large",
          "error.proto.invalidJson": "Invalid JSON request body",
          "error.proto.nonJson": "Server returned a non-JSON response (HTTP {status})",
          "diagnostic.frontmatter.missing": "Missing complete YAML frontmatter",
          "diagnostic.name.missing": "Frontmatter is missing name",
          "diagnostic.name.invalid": "Skill name is not valid kebab-case: {name}",
          "diagnostic.description.missing": "Frontmatter is missing description",
          "diagnostic.invocation.invalid": "Invocation policy value is invalid",
          "diagnostic.shadowed": "Shadowed by higher-priority source {root}",
          "action.enable": "enable",
          "action.disable": "disable",
          "action.create": "create",
          "action.delete": "delete",
          "action.restore": "restore",
          "action.toggle": "enabling or disabling",
          "scope.user": "Global skills",
          "scope.project": "Project skills",
          "scope.label": "Skill scope",
          "scope.userHint": "Available across projects. Toggles only affect invocation in DSH.",
          "scope.projectHint": "Applies to the selected project. Toggles do not modify other agents\u2019 source files.",
          "project.select": "Select project",
          "project.empty": "No project available. Open a DSH session in a Git repository, then refresh.",
          "filter.status": "Invocation status",
          "filter.statusAll": "All statuses",
          "status.shadowedBy": "Overridden by the same skill in {source}",
          "root.copilot": "Copilot",
          "source.selectHint": "Select a source to view its directory and change its source toggle.",
          "import.global": "Import to global DSH",
          "root.dsh": "DSH skills",
          "root.agents": "Shared Agent",
          "root.ccswitch": "CC Switch",
          "root.projectDsh": "Project DSH",
          "root.projectAgents": "Project Agent",
          "root.codex": "Codex",
          "root.claude": "Claude",
          "root.gemini": "Gemini",
          "root.opencode": "OpenCode",
          "root.cursor": "Cursor",
          "root.windsurf": "Windsurf",
          "root.windsurfUser": "Windsurf home",
          "root.trae": "Trae",
          "root.traeCn": "Trae CN",
          "root.openclaw": "OpenClaw",
          "root.clawdbot": "OpenClaw (legacy)",
          "root.roo": "Roo",
          "root.codebuddy": "CodeBuddy"
        }
      };
      var CSS2 = `
.dssm-tabs{display:flex;gap:24px;border-bottom:1px solid var(--dsw-alias-border-l2)}.dssm-tab{padding:12px 2px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-weight:600;cursor:pointer}.dssm-tab[aria-selected=true]{border-bottom-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary)}.dssm-tab:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-project-picker{display:grid;gap:8px;min-width:0}.dssm-source-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.dssm-status-filter{width:140px;flex:none}.dssm-sources{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden}.dssm-source-controls .dssm-path{flex:1}.dssm-note{overflow-wrap:anywhere}.dssm-row .dssm-name{overflow-wrap:anywhere}
@container (max-width:600px){.dssm-filters{flex-wrap:wrap}.dssm-filters .dssm-search{flex-basis:100%}.dssm-filters .dssm-source-filter{width:auto;flex:1}.dssm-status-filter{width:130px}}

.dssm-section{box-sizing:border-box;display:flex;width:100%;max-width:820px;min-width:0;margin:0 auto;padding:2px 0 36px;container-type:inline-size;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font-family:inherit}.dssm-head{display:flex;flex-direction:column;align-items:stretch;gap:16px}.dssm-title-block{min-width:0}.dssm-title-row{display:flex;align-items:center;gap:8px 12px;min-width:0;flex-wrap:wrap}.dssm-feedback-links{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.dssm-title{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.4px;white-space:nowrap}.dssm-feedback-link{display:inline-flex;min-height:28px;align-items:center;gap:5px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;line-height:18px;text-decoration:none;white-space:nowrap}.dssm-feedback-link:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dssm-feedback-link:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-feedback-link svg{flex:none}.dssm-desc{margin:12px 0 0;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:22px}.dssm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-left:0;flex:none}
.dssm-btn{box-sizing:border-box;display:inline-flex;min-height:34px;align-items:center;justify-content:center;padding:0 13px;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:inherit;font-size:13px;font-weight:580;white-space:nowrap;cursor:pointer}.dssm-btn:hover:not(:disabled){filter:brightness(1.08)}.dssm-btn:disabled{opacity:.48;cursor:default}.dssm-btn-secondary,.dssm-btn-quiet{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}.dssm-btn-quiet{min-height:28px;padding:0 9px;color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-btn-danger{border-color:var(--dsw-alias-state-error-primary);background:transparent;color:var(--dsw-alias-state-error-primary)}.dssm-btn:focus-visible,.dssm-control:focus-visible,.dssm-select-trigger:focus-visible,.dssm-source-head:focus-visible,.dssm-switch:focus-visible,.dssm-upload-link:focus-visible,.dssm-file-remove:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}
.dssm-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.dssm-stat{padding:12px 14px;border-right:1px solid var(--dsw-alias-border-l1);font-size:13px;color:var(--dsw-alias-label-secondary)}.dssm-stat:last-child{border-right:0}.dssm-stat strong{margin-right:5px;color:var(--dsw-alias-label-primary);font-size:17px;font-weight:680}.dssm-filters{display:flex;gap:9px}.dssm-search{flex:1}.dssm-source-filter{width:210px;flex:none}
.dssm-control,.dssm-select-trigger{box-sizing:border-box;width:100%;min-height:34px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}.dssm-control::placeholder{color:var(--dsw-alias-label-tertiary)}textarea.dssm-control{min-height:160px;padding-top:9px;resize:vertical;line-height:20px}.dssm-select{position:relative}.dssm-select-trigger{display:flex;align-items:center;justify-content:space-between;text-align:left;cursor:pointer}.dssm-select-menu{position:absolute;z-index:40;top:calc(100% + 5px);right:0;left:0;display:flex;max-height:260px;padding:5px;overflow:auto;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-3);box-shadow:var(--dsw-shadow-lv2)}.dssm-option{padding:8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}.dssm-option:hover,.dssm-option[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover)}
.dssm-sources{display:flex;flex-direction:column}.dssm-source{overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}.dssm-source-head{box-sizing:border-box;display:flex;width:100%;min-height:48px;align-items:center;padding:0 13px}.dssm-source-head-main{display:flex;min-width:0;min-height:48px;flex:1;align-items:center;gap:10px;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.dssm-source-head:hover,.dssm-row:hover,.dssm-trash-row:hover{background:var(--dsw-alias-interactive-bg-hover)}.dssm-source-title{font-size:14px;font-weight:650}.dssm-count{color:var(--dsw-alias-label-tertiary);font-size:12px}.dssm-path{min-width:0;margin-left:auto;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.dssm-source-actions{display:flex;align-items:center;gap:9px;margin-left:8px}.dssm-source-body{border-top:1px solid var(--dsw-alias-border-l1)}.dssm-source-note{padding:9px 13px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dssm-table-head,.dssm-row{display:grid;grid-template-columns:minmax(180px,1fr) 120px 90px max-content;align-items:center;column-gap:12px;padding:0 13px}.dssm-table-head{min-height:32px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px}.dssm-row{min-height:58px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-row:last-child{border-bottom:0}.dssm-main{min-width:0}.dssm-name{overflow-wrap:anywhere;font-size:13px;font-weight:570}.dssm-note{overflow-wrap:anywhere;margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}.dssm-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.dssm-tag{display:inline-flex;min-height:19px;align-items:center;padding:0 6px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;color:var(--dsw-alias-label-secondary);font-size:10px;white-space:nowrap}.dssm-tag-on{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.dssm-tag-off{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.dssm-enabled{color:var(--dsw-alias-state-success-primary);font-size:12px;white-space:nowrap}.dssm-disabled{color:#d49245;font-size:12px;white-space:nowrap}.dssm-shadowed{color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap}.dssm-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px}
.dssm-switch{position:relative;width:34px;height:20px;flex:none;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}.dssm-switch:after{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;content:"";transition:transform 160ms ease}.dssm-switch-on{background:var(--dsw-alias-state-success-primary)}.dssm-switch-on:after{transform:translateX(14px)}.dssm-switch:disabled{opacity:.45;cursor:default}.dssm-trash-row{display:flex;min-height:48px;align-items:center;padding:0 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:13px;cursor:pointer}.dssm-trash-count{margin-left:auto;padding:2px 7px;border-radius:99px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:11px}.dssm-empty{padding:25px 14px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}.dssm-feedback{padding:9px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-warning{border-color:#d49245;color:#d49245}.dssm-error{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dssm-mask{position:fixed;z-index:1100;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.62)}.dssm-modal{box-sizing:border-box;display:flex;width:min(560px,100%)!important;max-height:min(760px,calc(100vh - 48px));min-width:0;flex-direction:column;gap:16px;padding:22px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}.dssm-modal-wide{width:min(720px,100%)!important}.dssm-modal-import{width:min(480px,100%)!important;padding:24px}.dssm-modal-head{display:flex;align-items:flex-start;gap:12px}.dssm-modal-title{margin:0;flex:1;font-size:17px;line-height:24px;font-weight:670}.dssm-form,.dssm-field,.dssm-detail-section{display:flex;flex-direction:column}.dssm-form{gap:12px}.dssm-field{gap:6px}.dssm-label,.dssm-detail-title{font-size:12px}.dssm-label{color:var(--dsw-alias-label-secondary)}.dssm-detail-title{font-weight:650}.dssm-help{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}.dssm-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}.dssm-hidden-input{display:none}.dssm-dropzone{box-sizing:border-box;display:flex;width:100%;min-height:170px;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:22px;border:1px dashed var(--dsw-alias-border-l3);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);transition:border-color 180ms ease,background 180ms ease}.dssm-dropzone:hover,.dssm-dropzone-active{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-interactive-bg-hover)}.dssm-dropzone-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:620}.dssm-dropzone-copy{font-size:12px;line-height:18px;text-align:center}.dssm-upload-choices{display:flex;align-items:center;gap:7px}.dssm-upload-link,.dssm-file-remove{padding:0;border:0;background:transparent;font:inherit;font-size:12px;cursor:pointer}.dssm-upload-link{color:var(--dsw-alias-label-secondary)}.dssm-upload-link:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.dssm-upload-link:disabled{opacity:.45;cursor:default}.dssm-upload-divider{color:var(--dsw-alias-label-tertiary);font-size:11px}.dssm-file{display:flex;align-items:center;gap:9px;padding:10px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px}.dssm-file-kind{display:inline-flex;min-width:30px;height:24px;align-items:center;justify-content:center;border-radius:5px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:700}.dssm-file-name{min-width:0;overflow:hidden;flex:1;text-overflow:ellipsis;white-space:nowrap}.dssm-file-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}.dssm-file-remove{width:24px;height:24px;color:var(--dsw-alias-label-secondary);font-size:18px}.dssm-upload-requirements{padding:1px 1px 0}.dssm-upload-requirements ul{display:flex;margin:7px 0 0;padding-left:18px;flex-direction:column;gap:5px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.dssm-detail-section{gap:7px}.dssm-detail-path,.dssm-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px}.dssm-detail-path{padding:8px 10px;border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);word-break:break-all}.dssm-code{max-height:280px;margin:0;padding:12px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);line-height:18px;white-space:pre-wrap}.dssm-diag{padding:8px 10px;border-left:2px solid #d49245;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-trash-item{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-trash-item:last-child{border-bottom:0}.dssm-trash-main{min-width:0;flex:1}
@container(max-width:780px){.dssm-table-head{display:none}.dssm-row{grid-template-columns:minmax(0,1fr) max-content;gap:8px;padding:11px 13px}.dssm-row>.dssm-tags,.dssm-row>.dssm-status{grid-column:1}.dssm-row-actions{grid-column:2;grid-row:1 / span 3}.dssm-path{display:none}}@media(max-width:760px){.dssm-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.dssm-title-row{flex-wrap:wrap}}@container(max-width:520px){.dssm-head{flex-direction:column}.dssm-actions{width:100%;margin-left:0}.dssm-actions .dssm-btn{flex:1}.dssm-filters{flex-direction:column}.dssm-source-filter{width:100%}.dssm-summary{grid-template-columns:1fr}}
`;
      function translateOrFallback(t, key, fallback, params) {
        var value = t(key, params);
        return typeof value === "string" && value !== key ? value : fallback;
      }
      function translateError(t, payload) {
        if (payload instanceof Error && !payload.code) return payload.message;
        if (payload && typeof payload === "object") {
          if (payload.code) {
            var params = Object.assign({}, payload.params || {});
            if (params.action) params.action = translateOrFallback(t, "action." + params.action, params.action);
            var translated = t(payload.code, params);
            if (typeof translated === "string" && translated !== payload.code) return translated;
          }
          if (payload.error !== void 0) return translateError(t, payload.error);
          if (payload.message !== void 0) return String(payload.message);
        }
        return String(payload == null ? "" : payload);
      }
      function parseApiResponse(response) {
        return response.json().catch(function() {
          var error = new Error("non-json response");
          error.code = "error.proto.nonJson";
          error.params = { status: response.status };
          throw error;
        }).then(function(payload) {
          if (!response.ok || payload.ok === false) throw payload;
          return payload.data;
        });
      }
      function callApi(path, options) {
        return fetch("/api/dsh-skills-manager" + path, options).then(parseApiResponse);
      }
      function isSkillEnabled(skill) {
        if (skill.enabled !== void 0) return skill.enabled === true;
        return skill.invocationPolicyValid && skill.modelInvocable && skill.userInvocable && skill.managerEnabled !== false;
      }
      function countKey(key, count) {
        return key + (Number(count) === 1 ? ".one" : ".other");
      }
      function rootDisplayName(t, root) {
        var base = translateOrFallback(t, "root." + (root.localeKey || root.kind || root.key), root.label);
        return root.projectName ? base + " \xB7 " + root.projectName : base;
      }
      function summarizeImportResult(t, data) {
        var importedItems = data && data.imported || [];
        var imported = importedItems.map(function(item) {
          return item.name;
        });
        var skipped = (data && data.skipped || []).map(function(item) {
          return item.name;
        });
        var warnings = [];
        importedItems.forEach(function(item) {
          (item.warnings || []).forEach(function(warning) {
            warnings.push(translateError(t, warning));
          });
        });
        var summary;
        if (imported.length && skipped.length) summary = { ok: true, warning: true, imported: true, text: t("result.importPartial", { imported: imported.join(", "), skipped: skipped.join(", ") }) };
        else if (imported.length) summary = { ok: true, warning: false, imported: true, text: t("result.imported", { names: imported.join(", ") }) };
        else if (skipped.length) summary = { ok: false, warning: true, imported: false, text: t("result.importSkipped", { names: skipped.join(", ") }) };
        else summary = { ok: false, warning: false, imported: false, text: t("result.importEmpty") };
        if (warnings.length) {
          summary.warning = true;
          summary.text = t("result.importWarnings", { result: summary.text, warnings: warnings.join("\uFF1B") });
        }
        return summary;
      }
      function normalizeSkillQuery(query) {
        return String(query == null ? "" : query).trim().toLowerCase();
      }
      function matchSkillQuery(skill, query) {
        var q = normalizeSkillQuery(query);
        if (!q) return true;
        return [skill.name, skill.declaredName, skill.description, skill.kind, skill.kindLabel, skill.statusLabel, skill.rootKey, skill.rootLabel].some(function(value) {
          return String(value == null ? "" : value).toLowerCase().includes(q);
        });
      }
      function filterSkills(list, options) {
        var rootKey = options && options.rootKey != null ? options.rootKey : "";
        return list.filter(function(skill) {
          return (!rootKey || skill.rootKey === rootKey) && matchSkillQuery(skill, options && options.query);
        });
      }
      function visibleSkillRoots(roots) {
        return (roots || []).filter(function(root) {
          return root.mutable || root.exists !== false;
        });
      }
      function skillStatus(skill) {
        return skill.shadowedBy ? "shadowed" : skill.loadable === false ? "invalid" : isSkillEnabled(skill) ? "enabled" : "disabled";
      }
      function scopeSkillRoots(roots, scope, project) {
        return visibleSkillRoots(roots).filter(function(root) {
          return scope === "project" ? root.scope === "project" && root.projectRoot === project : root.scope !== "project";
        });
      }
      var MAX_UPLOAD_ARCHIVE_BYTES = 32 << 20, MAX_UPLOAD_ENTRY_BYTES = 32 << 20, MAX_UPLOAD_TOTAL_BYTES = 64 << 20, MAX_UPLOAD_ENTRIES = 1e3;
      function uploadFilePath(file) {
        return String(file && (file._dssmPath || file.webkitRelativePath || file.name) || "").replace(/\\/g, "/");
      }
      function inspectUploadSelection(files) {
        var list = Array.prototype.slice.call(files || []);
        if (!list.length) return null;
        if (list.length > MAX_UPLOAD_ENTRIES) return { error: { code: "error.upload.tooMany", params: { limit: MAX_UPLOAD_ENTRIES } } };
        var relative = list.some(function(file) {
          return uploadFilePath(file).includes("/");
        });
        if (relative) {
          if (!list.some(function(file) {
            return /(^|\/)skill\.md$/i.test(uploadFilePath(file));
          })) return { error: { code: "select.folder.invalid" } };
          var oversized = list.find(function(file) {
            return Number(file.size || 0) > MAX_UPLOAD_ENTRY_BYTES;
          });
          if (oversized) return { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_ENTRY_BYTES } } };
          var total = list.reduce(function(sum, file) {
            return sum + Number(file.size || 0);
          }, 0);
          if (total > MAX_UPLOAD_TOTAL_BYTES) return { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_TOTAL_BYTES } } };
          return { kind: "folder", name: uploadFilePath(list[0]).split("/")[0], files: list, count: list.length, size: total };
        }
        if (list.length !== 1) return { error: { code: "select.file.invalid" } };
        var name = String(list[0].name || ""), lower = name.toLowerCase();
        var size = Number(list[0].size || 0);
        if (lower === "skill.md") return size > MAX_UPLOAD_ENTRY_BYTES ? { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_ENTRY_BYTES } } } : { kind: "skill", name, files: list, count: 1, size };
        if (lower.endsWith(".zip")) return size > MAX_UPLOAD_ARCHIVE_BYTES ? { error: { code: "error.upload.archiveTooLarge", params: { limit: MAX_UPLOAD_ARCHIVE_BYTES } } } : { kind: "zip", name, files: list, count: 1, size };
        return { error: { code: "select.file.invalid" } };
      }
      function bytesToBase64(buffer) {
        var bytes = new Uint8Array(buffer), binary = "", chunk = 32768;
        for (var i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
        return btoa(binary);
      }
      function buildUploadPayload(selection) {
        return Promise.all(selection.files.map(function(file) {
          return file.arrayBuffer().then(function(buffer) {
            return { path: uploadFilePath(file), data: bytesToBase64(buffer) };
          });
        })).then(function(entries) {
          return selection.kind === "zip" ? { name: selection.name, zip: entries[0].data } : { name: selection.name, entries };
        });
      }
      function readDroppedEntry(entry, prefix, output) {
        if (entry.isFile) return new Promise(function(resolve, reject) {
          entry.file(function(file) {
            file._dssmPath = prefix + file.name;
            output.push(file);
            resolve();
          }, reject);
        });
        if (!entry.isDirectory) return Promise.resolve();
        return new Promise(function(resolve, reject) {
          var reader = entry.createReader(), children = [];
          function next() {
            reader.readEntries(function(batch) {
              if (!batch.length) {
                Promise.all(children.map(function(child) {
                  return readDroppedEntry(child, prefix + entry.name + "/", output);
                })).then(resolve, reject);
                return;
              }
              children = children.concat(batch);
              next();
            }, reject);
          }
          next();
        });
      }
      function droppedFiles(dataTransfer) {
        var items = Array.prototype.slice.call(dataTransfer && dataTransfer.items || []), entries = items.map(function(item) {
          return item.webkitGetAsEntry && item.webkitGetAsEntry();
        }).filter(Boolean);
        if (!entries.length) return Promise.resolve(Array.prototype.slice.call(dataTransfer && dataTransfer.files || []));
        var files = [];
        return Promise.all(entries.map(function(entry) {
          return readDroppedEntry(entry, "", files);
        })).then(function() {
          return files;
        });
      }
      function modalFocusable(modal) {
        return Array.prototype.slice.call(modal.querySelectorAll('button:not(:disabled), [href], input:not([type=hidden]):not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || []);
      }
      function trapModalFocus(modal, event) {
        if (event.key !== "Tab") return;
        var focusable = modalFocusable(modal);
        if (!focusable.length) return;
        var active = document.activeElement;
        if (!modal.contains(active) || (event.shiftKey ? active === focusable[0] : active === focusable[focusable.length - 1])) {
          event.preventDefault();
          (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
        }
      }
      function handleModalEscape(event, onClose) {
        if (event.key !== "Escape") return false;
        event.preventDefault();
        event.stopPropagation();
        if (event.nativeEvent && typeof event.nativeEvent.stopImmediatePropagation === "function") event.nativeEvent.stopImmediatePropagation();
        onClose();
        return true;
      }
      function SourceSelect(props) {
        return h("select", { className: "dssm-control", value: props.value, "aria-label": props.label, onChange: function(event) {
          props.onChange(event.target.value);
        } }, props.options.map(function(option) {
          return h("option", { key: option.value, value: option.value }, option.label);
        }));
      }
      function Switch(props) {
        return h("button", { type: "button", className: "dssm-switch" + (props.on ? " dssm-switch-on" : ""), role: "switch", "aria-checked": props.on, "aria-label": props.label, disabled: props.disabled, onClick: props.onClick });
      }
      function GithubMark16() {
        return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: "false" }, h("path", { fill: "currentColor", d: "M8 0a8 8 0 0 0-2.53 15.59c.4.074.547-.173.547-.385 0-.19-.007-.693-.01-1.36-2.226.484-2.695-1.073-2.695-1.073-.364-.924-.89-1.17-.89-1.17-.726-.496.055-.486.055-.486.803.056 1.225.824 1.225.824.714 1.223 1.872.87 2.328.665.072-.517.28-.87.508-1.07-1.777-.202-3.645-.888-3.645-3.956 0-.874.31-1.588.823-2.148-.083-.202-.357-1.017.078-2.12 0 0 .672-.215 2.2.82A7.65 7.65 0 0 1 8 4.8c.68.003 1.365.092 2.004.27 1.527-1.035 2.197-.82 2.197-.82.437 1.103.162 1.918.08 2.12.513.56.822 1.274.822 2.148 0 3.076-1.872 3.752-3.654 3.95.288.248.544.735.544 1.482 0 1.07-.01 1.932-.01 2.195 0 .214.144.463.55.384A8.001 8.001 0 0 0 8 0Z" }));
      }
      function Modal(props) {
        var ref = react.useRef(null);
        react.useEffect(function() {
          if (ref.current) ref.current.focus();
        }, []);
        return h("div", { className: "dssm-mask", onMouseDown: function(e) {
          if (e.target === e.currentTarget) props.onClose();
        } }, h("div", { ref, tabIndex: -1, className: "dssm-modal" + (props.wide ? " dssm-modal-wide" : "") + (props.className ? " " + props.className : ""), role: "dialog", "aria-modal": "true", onKeyDown: function(e) {
          if (!handleModalEscape(e, props.onClose)) trapModalFocus(e.currentTarget, e);
        } }, h("div", { className: "dssm-modal-head" }, h("h3", { className: "dssm-modal-title" }, props.title), h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", onClick: props.onClose }, props.closeLabel)), props.children));
      }
      function SkillManagerSection(props) {
        var t = props.t;
        var ss = react.useState({ loading: true, error: null, data: null }), snapshot = ss[0], setSnapshot = ss[1];
        var bs = react.useState(false), busy = bs[0], setBusy = bs[1];
        var scopes = react.useState("user"), scope = scopes[0], setScope = scopes[1];
        var projectsState = react.useState(""), selectedProject = projectsState[0], setSelectedProject = projectsState[1];
        var filtersState = react.useState({}), savedFilters = filtersState[0], setSavedFilters = filtersState[1];
        var ms = react.useState(null), modal = ms[0], setModal = ms[1];
        var rs = react.useState(null), result = rs[0], setResult = rs[1];
        var fms = react.useState({ root: "dsh", name: "", description: "", body: "" }), form = fms[0], setForm = fms[1];
        var us = react.useState(null), upload = us[0], setUpload = us[1];
        var ds = react.useState(null), detail = ds[0], setDetail = ds[1];
        var inflightRef = react.useRef(false);
        var importInputRef = react.useRef(null);
        var folderInputRef = react.useRef(null);
        var pickerOpenRef = react.useRef(false);
        function refresh(silent) {
          if (!silent) setSnapshot({ loading: true, error: null, data: snapshot.data });
          return callApi("/state").then(function(data2) {
            setSnapshot({ loading: false, error: null, data: data2 });
            return data2;
          }).catch(function(error) {
            setSnapshot({ loading: false, error: translateError(t, error), data: snapshot.data });
          });
        }
        react.useEffect(function() {
          refresh(false);
        }, []);
        function post(path, body, successKey, successParams) {
          if (inflightRef.current) return Promise.reject({ error: "operation already in progress" });
          inflightRef.current = true;
          setBusy(true);
          setResult(null);
          return callApi(path, { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(body || {}) }).then(function(data2) {
            setResult({ ok: true, text: successKey ? t(successKey, successParams || data2 || {}) : t("result.updated") });
            return refresh(true).then(function() {
              return data2;
            });
          }).catch(function(error) {
            setResult({ ok: false, text: t("error.action", { error: translateError(t, error) }) });
            throw error;
          }).finally(function() {
            inflightRef.current = false;
            setBusy(false);
          });
        }
        function openDetail(root, skill) {
          setBusy(true);
          setDetail(null);
          setModal("detail");
          callApi("/detail", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ root: root.key, name: skill.name }) }).then(setDetail).catch(function(error) {
            setResult({ ok: false, text: t("error.action", { error: translateError(t, error) }) });
            setModal(null);
          }).finally(function() {
            setBusy(false);
          });
        }
        function updateForm(key, value) {
          setForm(Object.assign({}, form, { [key]: value }));
        }
        function submitCreate() {
          post("/create", form, null).then(function(data2) {
            setModal(null);
            setForm({ root: "dsh", name: "", description: "", body: "" });
            setResult({ ok: true, text: t("result.created", { name: data2.name }) });
          }).catch(function() {
          });
        }
        function selectUploadFiles(files) {
          pickerOpenRef.current = false;
          var selected = inspectUploadSelection(files);
          if (!selected) return;
          if (selected.error) {
            setUpload(null);
            setResult({ ok: false, text: translateError(t, selected.error) });
            return;
          }
          setUpload(selected);
          setResult(null);
        }
        function openNativePicker(ref) {
          if (busy || pickerOpenRef.current || !ref.current) return;
          pickerOpenRef.current = true;
          ref.current.value = "";
          function release() {
            setTimeout(function() {
              pickerOpenRef.current = false;
            }, 0);
          }
          window.addEventListener("focus", release, { once: true });
          ref.current.click();
          setTimeout(function() {
            pickerOpenRef.current = false;
          }, 3e4);
        }
        function submitImport() {
          if (!upload) return;
          buildUploadPayload(upload).then(function(payload) {
            return post("/upload", payload, null);
          }).then(function(data2) {
            var summary2 = summarizeImportResult(t, data2);
            setResult({ ok: summary2.ok, warning: summary2.warning, text: summary2.text });
            if (summary2.imported) {
              setModal(null);
              setUpload(null);
            }
          }).catch(function() {
          });
        }
        var data = snapshot.data || { roots: [], projects: [], trash: [] }, allRoots = data.roots || [], projects = data.projects || [];
        var activeProject = projects.some(function(project) {
          return project.root === selectedProject;
        }) ? selectedProject : projects.length === 1 ? projects[0].root : "";
        var filterKey = scope === "project" ? "project:" + activeProject : "user", filters = savedFilters[filterKey] || { query: "", source: "", status: "" }, query = filters.query, source = filters.source;
        function updateFilter(key, value) {
          setSavedFilters(function(previous) {
            return Object.assign({}, previous, { [filterKey]: Object.assign({}, filters, { [key]: value }) });
          });
        }
        function setQuery(value) {
          updateFilter("query", value);
        }
        function setSource(value) {
          updateFilter("source", value);
        }
        var roots = scopeSkillRoots(allRoots, scope, activeProject), activeSource = roots.some(function(root) {
          return root.key === source;
        }) ? source : "";
        var selectedRoot = roots.find(function(root) {
          return root.key === activeSource;
        });
        var createRoots = roots.filter(function(root) {
          return root.mutable === true;
        }), createOptions = createRoots.map(function(root) {
          return { value: root.key, label: rootDisplayName(t, root) };
        });
        function openCreate() {
          if (!createRoots.length) return;
          var target = createRoots.find(function(root) {
            return root.key === activeSource;
          }) || createRoots[0];
          setForm(Object.assign({}, form, { root: target.key }));
          setModal("create");
        }
        function trashRootLabel(item) {
          return item.root && item.root.scope === "project" ? t("root.projectDsh") + " \xB7 " + (item.root.projectName || item.root.projectRoot) : t("root.dsh");
        }
        var options = [{ value: "", label: t("filter.all") }].concat(roots.map(function(root) {
          return { value: root.key, label: t("filter.option", { name: rootDisplayName(t, root), count: root.count == null ? root.skills.length : root.count }) };
        }));
        function renderSkill(root, skill) {
          var enabled = isSkillEnabled(skill), key = skill.shadowedBy ? "status.shadowed" : skill.loadable === false ? "status.invalid" : enabled ? "status.enabled" : "status.disabled", cls = skill.shadowedBy ? "dssm-shadowed" : enabled ? "dssm-enabled" : "dssm-disabled";
          return h("div", { key: root.key + ":" + skill.name, className: "dssm-row" }, h("div", { className: "dssm-main" }, h("div", { className: "dssm-name" }, skill.declaredName || skill.name), h("div", { className: "dssm-note" }, skill.description || t("note.missing"))), h("div", { className: "dssm-tags" }, h("span", { className: "dssm-tag", title: root.path }, t("root." + (root.localeKey || root.key))), !root.mutable ? h("span", { className: "dssm-tag" }, t("status.readonly")) : null), h("div", { className: "dssm-status " + cls, title: skill.shadowedBy ? t("status.shadowedBy", { source: (allRoots.find(function(item) {
            return item.key === skill.shadowedBy.root;
          }) || {}).label || skill.shadowedBy.root }) : void 0 }, t(key)), h("div", { className: "dssm-row-actions" }, root.toggleable !== false ? h(Switch, { on: enabled, disabled: busy || root.enabled === false || !!skill.shadowedBy || skill.loadable === false, label: t("skill.toggle") + " " + skill.name, onClick: function() {
            post(enabled ? "/disable" : "/enable", { root: root.key, name: skill.name });
          } }) : null, h("button", { type: "button", className: "dssm-btn dssm-btn-quiet", onClick: function() {
            openDetail(root, skill);
          } }, t("btn.detail")), root.mutable ? h("button", { type: "button", className: "dssm-btn dssm-btn-quiet", onClick: function() {
            setModal({ type: "trash-confirm", root: root.key, name: skill.name });
          } }, t("btn.trash")) : null));
        }
        var rows = roots.flatMap(function(root) {
          return (root.skills || []).map(function(skill) {
            return { root, skill };
          });
        });
        var filteredRows = rows.filter(function(row) {
          return (!activeSource || row.root.key === activeSource) && (!filters.status || skillStatus(row.skill) === filters.status) && matchSkillQuery(Object.assign({}, row.skill, { rootLabel: rootDisplayName(t, row.root) }), query);
        });
        var summary = { total: rows.length, enabled: rows.filter(function(row) {
          return !row.skill.shadowedBy && isSkillEnabled(row.skill);
        }).length };
        summary.disabled = summary.total - summary.enabled;
        function renderList() {
          return h("div", { key: "sources", id: "dssm-scope-panel", role: "tabpanel", "aria-labelledby": "dssm-tab-" + scope, className: "dssm-sources" }, filteredRows.length ? h(react.Fragment, null, h("div", { className: "dssm-table-head" }, h("span", null, t("table.skill")), h("span", null, t("filter.source")), h("span", null, t("table.status")), h("span", null, "")), filteredRows.map(function(row) {
            return renderSkill(row.root, row.skill);
          })) : h("div", { className: "dssm-empty" }, scope === "project" && !projects.length ? t("project.empty") : scope === "project" && !activeProject ? t("project.select") : query || filters.status ? t("empty.search") : t("empty.source")));
        }
        var tabs = h("div", { key: "tabs", className: "dssm-tabs", role: "tablist", "aria-label": t("scope.label") }, ["user", "project"].map(function(value) {
          return h("button", { key: value, id: "dssm-tab-" + value, type: "button", role: "tab", "aria-selected": scope === value, "aria-controls": "dssm-scope-panel", tabIndex: scope === value ? 0 : -1, className: "dssm-tab", onClick: function() {
            setScope(value);
          }, onKeyDown: function(event) {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            var next = event.key === "Home" ? "user" : event.key === "End" ? "project" : value === "user" ? "project" : "user";
            setScope(next);
            document.getElementById("dssm-tab-" + next).focus();
          } }, t("scope." + value));
        }));
        var projectPicker = scope === "project" ? h("div", { key: "project", className: "dssm-project-picker" }, h(SourceSelect, { value: activeProject, label: t("project.select"), options: [{ value: "", label: t("project.select") }].concat(projects.map(function(project) {
          return { value: project.root, label: project.name + " \xB7 " + project.root };
        })), onChange: setSelectedProject }), activeProject ? h("div", { className: "dssm-path", title: activeProject }, activeProject) : null) : null;
        var sourceControls = h("div", { key: "source-controls", className: "dssm-source-controls" }, selectedRoot ? h(react.Fragment, null, h("span", { className: "dssm-path", title: selectedRoot.path }, selectedRoot.path), scope === "user" && selectedRoot.key !== "dsh" && selectedRoot.toggleable !== false ? h(Switch, { on: selectedRoot.enabled, disabled: busy, label: t("source.toggle") + " " + rootDisplayName(t, selectedRoot), onClick: function() {
          post(selectedRoot.enabled ? "/source-disable" : "/source-enable", { root: selectedRoot.key });
        } }) : null) : h("span", { className: "dssm-note" }, t("source.selectHint")));
        var content = [h("style", { key: "css" }, CSS2), h("div", { key: "head", className: "dssm-head" }, h("div", { className: "dssm-title-block" }, h("div", { className: "dssm-title-row" }, h("h2", { className: "dssm-title" }, t("title")), h("div", { className: "dssm-feedback-links" }, h("a", { className: "dssm-feedback-link", href: "https://github.com/MichengAI/dsh-skills-manager", target: "_blank", rel: "noreferrer", "aria-label": t("link.project") }, h(GithubMark16, null), t("link.project")), h("a", { className: "dssm-feedback-link", href: "https://github.com/MichengAI/dsh-skills-manager/issues", target: "_blank", rel: "noreferrer", "aria-label": t("link.feedback") }, h(primitives.IconListPenOutline16, null), t("link.feedback")))), h("p", { className: "dssm-desc" }, t("desc"))), h("div", { className: "dssm-actions" }, h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", disabled: busy || snapshot.loading, onClick: function() {
          refresh(false);
        } }, t("btn.refresh")), h("button", { type: "button", className: "dssm-btn", disabled: busy || !createRoots.length, onClick: openCreate }, t("btn.create")), h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", onClick: function() {
          setResult(null);
          setUpload(null);
          setModal("import");
        } }, t("import.global")))), tabs, projectPicker, h("p", { key: "scope-hint", className: "dssm-note" }, t(scope === "project" ? "scope.projectHint" : "scope.userHint")), h("div", { key: "summary", className: "dssm-summary" }, [[summary.total, "summary.total"], [summary.enabled, "summary.enabled"], [summary.disabled, "summary.disabled"]].map(function(item) {
          return h("div", { key: item[1], className: "dssm-stat" }, h("strong", null, item[0]), t(countKey(item[1], item[0]), { count: item[0] }).replace(String(item[0]), ""));
        })), h("div", { key: "filters", className: "dssm-filters" }, h("input", { className: "dssm-control dssm-search", value: query, "aria-label": t("search"), placeholder: t("search.placeholder"), onChange: function(e) {
          setQuery(e.target.value);
        } }), h("div", { className: "dssm-source-filter" }, h(SourceSelect, { value: activeSource, label: t("filter.source"), options, onChange: setSource })), h("div", { className: "dssm-status-filter" }, h(SourceSelect, { value: filters.status, label: t("filter.status"), options: [{ value: "", label: t("filter.statusAll") }].concat(["enabled", "disabled", "shadowed", "invalid"].map(function(value) {
          return { value, label: t("status." + value) };
        })), onChange: function(value) {
          updateFilter("status", value);
        } }))), sourceControls, result && modal !== "import" ? h("div", { key: "result", className: "dssm-feedback" + (result.warning ? " dssm-warning" : result.ok ? "" : " dssm-error") }, result.text) : null].concat((data.warnings || []).map(function(warning, index) {
          return h("div", { key: "warning-" + index, className: "dssm-feedback dssm-warning", role: "alert" }, translateError(t, warning));
        }), [snapshot.error ? h("div", { key: "error", className: "dssm-feedback dssm-error" }, snapshot.error) : null, snapshot.loading && !snapshot.data ? h("div", { key: "loading", className: "dssm-empty" }, t("loading")) : renderList(), h("button", { key: "trash", type: "button", className: "dssm-trash-row", onClick: function() {
          setModal("trash");
        } }, h("span", null, t("trash.title")), h("span", { className: "dssm-trash-count" }, (data.trash || []).length))]);
        if (modal === "create") content.push(h(Modal, { key: "create", title: t("create.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal(null);
        } }, h("div", { className: "dssm-form" }, h("label", { className: "dssm-field" }, h("span", { className: "dssm-label" }, t("create.target")), h(SourceSelect, { value: form.root, label: t("create.target"), options: createOptions, onChange: function(value) {
          updateForm("root", value);
        } })), [["name", "create.name", "create.name.placeholder"], ["description", "create.description", "create.description.placeholder"]].map(function(field) {
          return h("label", { key: field[0], className: "dssm-field" }, h("span", { className: "dssm-label" }, t(field[1])), h("input", { className: "dssm-control", value: form[field[0]], placeholder: t(field[2]), onChange: function(e) {
            updateForm(field[0], e.target.value);
          } }));
        }), h("label", { className: "dssm-field" }, h("span", { className: "dssm-label" }, t("create.body")), h("textarea", { className: "dssm-control", value: form.body, placeholder: t("create.body.placeholder"), onChange: function(e) {
          updateForm("body", e.target.value);
        } })), h("p", { className: "dssm-help" }, t("create.chat.note"))), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function() {
          setModal(null);
        } }, t("btn.cancel")), h("button", { className: "dssm-btn", disabled: busy || !form.name.trim() || !form.description.trim() || !form.body.trim(), onClick: submitCreate }, t("btn.create.now")))));
        if (modal === "import") content.push(h(
          Modal,
          { key: "import", className: "dssm-modal-import", title: t("import.title"), closeLabel: t("btn.close"), onClose: function() {
            pickerOpenRef.current = false;
            setUpload(null);
            setResult(null);
            setModal(null);
          } },
          h("input", { ref: importInputRef, className: "dssm-hidden-input", type: "file", accept: ".zip,.md", onChange: function(event) {
            selectUploadFiles(event.target.files);
            event.target.value = "";
          } }),
          h("input", { ref: folderInputRef, className: "dssm-hidden-input", type: "file", multiple: true, webkitdirectory: "", directory: "", onChange: function(event) {
            selectUploadFiles(event.target.files);
            event.target.value = "";
          } }),
          h(
            "div",
            { className: "dssm-dropzone", onDragOver: function(event) {
              event.preventDefault();
              event.currentTarget.classList.add("dssm-dropzone-active");
            }, onDragLeave: function(event) {
              event.currentTarget.classList.remove("dssm-dropzone-active");
            }, onDrop: function(event) {
              event.preventDefault();
              event.currentTarget.classList.remove("dssm-dropzone-active");
              droppedFiles(event.dataTransfer).then(selectUploadFiles).catch(function(error) {
                setResult({ ok: false, text: translateError(t, error) });
              });
            } },
            h("span", { className: "dssm-dropzone-title" }, t("upload.drop.title")),
            h("span", { className: "dssm-dropzone-copy" }, t("upload.drop.copy")),
            h("div", { className: "dssm-upload-choices" }, h("button", { type: "button", className: "dssm-upload-link", disabled: busy, onClick: function(event) {
              event.stopPropagation();
              openNativePicker(folderInputRef);
            } }, t("btn.folder.pick")), h("span", { className: "dssm-upload-divider" }, "/"), h("button", { type: "button", className: "dssm-upload-link", disabled: busy, onClick: function(event) {
              event.stopPropagation();
              openNativePicker(importInputRef);
            } }, t("btn.file.pick")))
          ),
          upload ? h("div", { className: "dssm-file", title: upload.name }, h("span", { className: "dssm-file-kind", "aria-hidden": "true" }, upload.kind === "zip" ? "ZIP" : upload.kind === "folder" ? "DIR" : "MD"), h("span", { className: "dssm-file-name" }, upload.name), h("span", { className: "dssm-file-meta" }, t(countKey("upload.selected", upload.count), { count: upload.count, size: upload.size < 1024 ? upload.size + " B" : Math.ceil(upload.size / 1024) + " KB" })), h("button", { type: "button", className: "dssm-file-remove", "aria-label": t("upload.remove"), onClick: function() {
            setUpload(null);
          } }, "\xD7")) : null,
          result ? h("div", { className: "dssm-feedback" + (result.warning ? " dssm-warning" : result.ok ? "" : " dssm-error"), role: "alert" }, result.text) : null,
          h("div", { className: "dssm-upload-requirements" }, h("div", { className: "dssm-label" }, t("upload.requirements")), h("ul", null, h("li", null, t("upload.requirement.skill")), h("li", null, t("upload.requirement.frontmatter")), h("li", null, t("upload.requirement.copy")))),
          h("div", { className: "dssm-modal-actions" }, h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", onClick: function() {
            pickerOpenRef.current = false;
            setUpload(null);
            setResult(null);
            setModal(null);
          } }, t("btn.cancel")), h("button", { type: "button", className: "dssm-btn", disabled: busy || !upload, onClick: submitImport }, busy ? t("upload.importing") : t("btn.import.now")))
        ));
        if (modal === "detail") content.push(h(Modal, { key: "detail", wide: true, title: t("detail.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal(null);
        } }, detail ? h(react.Fragment, null, h("div", { className: "dssm-detail-path" }, detail.path), h("div", { className: "dssm-detail-section" }, h("div", { className: "dssm-detail-title" }, t("detail.diagnostics")), detail.diagnostics.length ? detail.diagnostics.map(function(item, index) {
          return h("div", { key: index, className: "dssm-diag" }, t(item.code, item.params || {}));
        }) : h("div", { className: "dssm-note" }, t("detail.noIssues"))), h("div", { className: "dssm-detail-section" }, h("div", { className: "dssm-detail-title" }, t("detail.body")), h("pre", { className: "dssm-code" }, detail.body || "")), h("div", { className: "dssm-detail-section" }, h("div", { className: "dssm-detail-title" }, t("detail.frontmatter")), h("pre", { className: "dssm-code" }, JSON.stringify(detail.frontmatter, null, 2)))) : h("div", { className: "dssm-empty" }, t("loading"))));
        if (modal === "trash") content.push(h(Modal, { key: "trash-modal", title: t("trash.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal(null);
        } }, h("div", { className: "dssm-count" }, t(countKey("trash.count", data.trash.length), { count: data.trash.length })), data.trash.length ? data.trash.map(function(item) {
          return h("div", { key: item.id, className: "dssm-trash-item" }, h("div", { className: "dssm-trash-main" }, h("div", { className: "dssm-name" }, item.name), h("div", { className: "dssm-note" }, t("trash.deletedAt", { time: new Date(item.deletedAt).toLocaleString() }) + " \xB7 " + t("trash.source", { source: trashRootLabel(item) }))), h("button", { className: "dssm-btn dssm-btn-quiet", disabled: busy, onClick: function() {
            post("/trash-restore", { id: item.id }, "result.restored", { name: item.name });
          } }, t("btn.restore")), h("button", { className: "dssm-btn dssm-btn-quiet dssm-btn-danger", disabled: busy, onClick: function() {
            setModal({ type: "delete-confirm", id: item.id, name: item.name });
          } }, t("btn.delete.forever")));
        }) : h("div", { className: "dssm-empty" }, t("trash.empty"))));
        if (modal && modal.type === "trash-confirm") content.push(h(Modal, { key: "trash-confirm", title: t("confirm.trash.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal(null);
        } }, h("p", { className: "dssm-desc" }, t("confirm.trash.desc", { name: modal.name })), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function() {
          setModal(null);
        } }, t("btn.cancel")), h("button", { className: "dssm-btn", disabled: busy, onClick: function() {
          post("/delete", { root: modal.root, name: modal.name }, "result.trashed", { name: modal.name }).then(function() {
            setModal(null);
          }).catch(function() {
          });
        } }, t("btn.trash")))));
        if (modal && modal.type === "delete-confirm") content.push(h(Modal, { key: "delete-confirm", title: t("confirm.delete.title"), closeLabel: t("btn.close"), onClose: function() {
          setModal("trash");
        } }, h("p", { className: "dssm-desc" }, t("confirm.delete.desc", { name: modal.name })), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function() {
          setModal("trash");
        } }, t("btn.cancel")), h("button", { className: "dssm-btn dssm-btn-danger", disabled: busy, onClick: function() {
          post("/trash-delete", { id: modal.id }, "result.deleted", { name: modal.name }).then(function() {
            setModal("trash");
          }).catch(function() {
          });
        } }, t("btn.delete.forever")))));
        return h("section", { className: "dssm-section" }, content);
      }
      var inject = ["slots", "locale"];
      function apply(ctx) {
        ctx.effect(function() {
          return ctx.locale.register(NS, DICT);
        });
        ctx.effect(function() {
          return observePluginUpdate({ endpoint: "/api/michengai/dsh-skills-manager/update", packageName: "@michengai/dsh-skills-manager", titleRowSelector: ".dssm-title-row", linksSelector: ".dssm-feedback-links", zhName: "\u6280\u80FD", enName: "Skills", createIcon: createPluginUpdateIcon });
        }, "skills-manager: plugin update ui");
        ctx.slots.inject("settings.section", function() {
          return ctx.slots.register({ name: "settings.section", id: "skills-manager", order: 17, label: function() {
            return ctx.locale.bind(NS)("title");
          }, icon: "skill", locale: NS }, SkillManagerSection);
        });
      }
      module.exports.DICT = DICT;
      module.exports.translateError = translateError;
      module.exports.parseApiResponse = parseApiResponse;
      module.exports.isSkillEnabled = isSkillEnabled;
      module.exports.countKey = countKey;
      module.exports.rootDisplayName = rootDisplayName;
      module.exports.summarizeImportResult = summarizeImportResult;
      module.exports.normalizeSkillQuery = normalizeSkillQuery;
      module.exports.matchSkillQuery = matchSkillQuery;
      module.exports.filterSkills = filterSkills;
      module.exports.visibleSkillRoots = visibleSkillRoots;
      module.exports.scopeSkillRoots = scopeSkillRoots;
      module.exports.skillStatus = skillStatus;
      module.exports.trapModalFocus = trapModalFocus;
      module.exports.handleModalEscape = handleModalEscape;
      module.exports.inspectUploadSelection = inspectUploadSelection;
      module.exports.apply = apply;
      module.exports.inject = inject;
      return module.exports;
    }
  });
})();
