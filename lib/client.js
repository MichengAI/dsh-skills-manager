// dsh-skills-manager client half：DSH 设置中的本地管理与公共 Agent 只读技能面板。
window.__ModuleLoader__.load({
  id: "@michengai/dsh-skills-manager",
  factory: (require) => {
    var module = { exports: {} };
    Object.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");
    var h = react.createElement;
    var pickDirectory = null;
    var MUTATION_HEADERS = { "content-type": "application/json", "x-dsh-skills-manager": "1" };

    // 词典命名空间：注册进 DSH locale 服务，渲染机制按该命名空间把 t 注入组件 props。
    var NS = "skills-manager";
    // 双语词典：zh 与现有硬编码文案逐字一致，保证中文用户无感知；en 为通顺英文。
    var DICT = {
      zh: {
        "title": "技能",
        "desc": "DSH 技能可上传、启停和删除；公共 Agent 技能仅供查看。",
        "btn.refresh": "刷新",
        "btn.upload": "上传插件",
        "btn.disable": "停用",
        "btn.enable": "启用",
        "btn.repair.enable": "修复并启用",
        "btn.delete": "删除",
        "btn.cancel": "取消",
        "btn.overwrite.upload": "覆盖上传",
        "btn.delete.confirm": "确认删除",
        "btn.file.pick": "选择本地文件",
        "btn.dir.pick": "选择插件文件夹",
        "btn.uploading": "上传中…",
        "btn.upload.dsh": "上传到 DSH",
        "status.enabled": "已启用",
        "status.disabled": "已停用",
        "status.invalid": "配置异常",
        "status.bundle": "目录插件",
        "status.single": "单文件",
        "status.selected": "已选择",
        "summary.total.one": "个插件",
        "summary.total.other": "个插件",
        "summary.enabled.one": "个已启用",
        "summary.enabled.other": "个已启用",
        "summary.group": "{count} 个",
        "note.missing": "未提供简介",
        "empty.dir.uncreated": "目录尚未创建，上传第一个插件后会自动创建。",
        "empty.dir.missing": "公共目录不存在。",
        "empty.skills.none": "暂未安装插件。",
        "loading": "加载中…",
        "error.action": "操作失败：{error}",
        // 列表连接符由词典侧决定：zh 用顿号/分号，en 用逗号/分号。
        "sep.names": "、",
        "sep.errors": "；",
        "result.failed": "上传失败：{error}",
        "result.partial": "部分上传成功：{names}；失败：{errors}",
        "result.failed.only": "上传失败：{errors}",
        "result.done": "上传完成：{names}",
        "result.skipped": "未导入：同名插件已跳过：{names}",
        "result.none": "未导入任何插件。",
        "upload.title": "上传插件",
        "upload.close": "关闭上传弹窗",
        "upload.drop.title": "拖放 SKILL.md 文件到这里",
        "upload.drop.copy": "或点击打开系统原生文件选择窗口",
        "upload.hint": "请选择插件目录中的 SKILL.md；目录内其他文件会一并上传。",
        "upload.picking.dir": "正在打开系统原生目录选择窗口…",
        "select.file.invalid": "请选择插件目录中的 SKILL.md 文件。",
        "select.path.missing": "已选择 SKILL.md，但当前运行环境无法读取文件路径。请点击“选择插件文件夹”继续上传。",
        "select.failed": "选择失败：{error}",
        "dir.selected": "已选择插件目录",
        "dir.service.missing": "当前运行环境无法读取本地文件路径，也未提供原生目录选择服务。",
        "dir.pick.failed": "选择插件目录失败：{error}",
        "confirm.overwrite.title": "发现同名插件",
        "confirm.overwrite.desc": "将覆盖现有插件：{names}",
        "confirm.delete.title": "删除插件？",
        "confirm.delete.desc": "“{name}”将从 DSH 技能目录中永久删除，无法恢复。",
        // Step 2 业务错误码：zh 值保持与 core 原有中文文案逐字一致（{action} 由 action.* 映射后替换）。
        "error.root.readonly": "公共 Agent 技能目录不允许{action}",
        "error.skill.notFound": "技能不存在: {name}",
        "error.skill.noFrontmatter": "技能缺少完整 frontmatter，无法{action}: {name}",
        "error.source.notFound": "路径不存在: {path}",
        "error.source.symlink": "不支持包含符号链接的 skill 来源: {path}",
        "error.source.unrecognized": "无法识别的 skill 来源: {path}",
        "error.source.tooDeep": "skill 来源目录层级超过 {depth} 层: {path}",
        "error.import.overlap": "导入来源不能与 DSH 技能目录相同、包含或位于其中",
        "error.import.emptySource": "目录下未找到任何 skill 条目（需含 SKILL.md 的子目录或 .md 文件）: {path}",
        "error.import.invalidName": "无法生成合法 kebab-case 名称（原始名: {name}）",
        "error.import.duplicateName": "批量来源中存在多个同名插件: {name}",
        "error.import.failed": "导入失败",
        "error.proto.forbidden": "禁止的修改请求（缺少客户端标记）",
        "error.proto.contentType": "请求体必须是 application/json",
        "error.proto.method": "不支持的请求方法",
        "error.proto.unknownAction": "未知操作",
        "error.proto.bodyTooLarge": "请求体过大",
        "error.proto.invalidJson": "请求体不是合法 JSON",
        "action.enable": "启用",
        "action.disable": "停用",
        "action.delete": "删除",
        "action.toggle": "启用或停用",
        "root.dsh": "DSH 技能",
        "root.agents": "公共 Agent 技能"
      },
      en: {
        "title": "Skills",
        "desc": "DSH skills can be uploaded, enabled or disabled, and deleted; shared Agent skills are view-only.",
        "btn.refresh": "Refresh",
        "btn.upload": "Upload",
        "btn.disable": "Disable",
        "btn.enable": "Enable",
        "btn.repair.enable": "Repair & enable",
        "btn.delete": "Delete",
        "btn.cancel": "Cancel",
        "btn.overwrite.upload": "Overwrite & upload",
        "btn.delete.confirm": "Delete",
        "btn.file.pick": "Choose local file",
        "btn.dir.pick": "Choose plugin folder",
        "btn.uploading": "Uploading…",
        "btn.upload.dsh": "Upload to DSH",
        "status.enabled": "Enabled",
        "status.disabled": "Disabled",
        "status.invalid": "Invalid config",
        "status.bundle": "Bundle",
        "status.single": "Single file",
        "status.selected": "Selected",
        "summary.total.one": "skill",
        "summary.total.other": "skills",
        "summary.enabled.one": "enabled",
        "summary.enabled.other": "enabled",
        "summary.group": "{count} items",
        "note.missing": "No description provided",
        "empty.dir.uncreated": "The directory has not been created yet; it will be created automatically after the first upload.",
        "empty.dir.missing": "The public directory does not exist.",
        "empty.skills.none": "No plugins installed yet.",
        "loading": "Loading…",
        "error.action": "Action failed: {error}",
        "sep.names": ", ",
        "sep.errors": "; ",
        "result.failed": "Upload failed: {error}",
        "result.partial": "Partially uploaded: {names}; failed: {errors}",
        "result.failed.only": "Upload failed: {errors}",
        "result.done": "Upload complete: {names}",
        "result.skipped": "Not imported: same-name plugins were skipped: {names}",
        "result.none": "Nothing was imported.",
        "upload.title": "Upload plugin",
        "upload.close": "Close upload dialog",
        "upload.drop.title": "Drop SKILL.md file here",
        "upload.drop.copy": "or click to open the native file picker",
        "upload.hint": "Choose a SKILL.md inside the plugin directory; other files in that directory are uploaded too.",
        "upload.picking.dir": "Opening native directory picker…",
        "select.file.invalid": "Please choose the SKILL.md file inside the plugin directory.",
        "select.path.missing": "SKILL.md was selected, but this environment cannot read the file path. Click “Choose plugin folder” to continue uploading.",
        "select.failed": "Selection failed: {error}",
        "dir.selected": "Plugin folder selected",
        "dir.service.missing": "This environment cannot read local file paths and provides no native directory picker.",
        "dir.pick.failed": "Failed to choose plugin folder: {error}",
        "confirm.overwrite.title": "Same-name plugin found",
        "confirm.overwrite.desc": "Will overwrite existing plugin(s): {names}",
        "confirm.delete.title": "Delete plugin?",
        "confirm.delete.desc": "“{name}” will be permanently deleted from the DSH skills directory and cannot be recovered.",
        "error.root.readonly": "The shared Agent skills directory does not allow {action}",
        "error.skill.notFound": "Skill not found: {name}",
        "error.skill.noFrontmatter": "Skill lacks complete frontmatter, cannot {action}: {name}",
        "error.source.notFound": "Path does not exist: {path}",
        "error.source.symlink": "Skill source containing symbolic links is not supported: {path}",
        "error.source.unrecognized": "Unrecognized skill source: {path}",
        "error.source.tooDeep": "Skill source directory depth exceeds the {depth}-level limit: {path}",
        "error.import.overlap": "Import source cannot be the same as, contain, or be inside the DSH skills directory",
        "error.import.emptySource": "No skill entries found in the directory (needs SKILL.md subdirectories or .md files): {path}",
        "error.import.invalidName": "Cannot generate a valid kebab-case name (original name: {name})",
        "error.import.duplicateName": "Batch source contains multiple plugins with the same name: {name}",
        "error.import.failed": "Import failed",
        "error.proto.forbidden": "Forbidden mutation request (missing client marker)",
        "error.proto.contentType": "Content type must be application/json",
        "error.proto.method": "Method not allowed",
        "error.proto.unknownAction": "Unknown action",
        "error.proto.bodyTooLarge": "Request body too large",
        "error.proto.invalidJson": "Invalid JSON request body",
        "action.enable": "enable",
        "action.disable": "disable",
        "action.delete": "deleting",
        "action.toggle": "enabling or disabling",
        "root.dsh": "DSH skills",
        "root.agents": "Shared Agent skills"
      }
    };

    var CSS = `
.dssm-section{display:flex;min-width:0;flex-direction:column;gap:20px;color:var(--dsw-alias-label-primary)}
.dssm-toolbar{display:flex;align-items:flex-start;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dssm-title{margin:0;font-size:20px;line-height:28px;font-weight:650;letter-spacing:-.2px}.dssm-desc{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dssm-actions{display:flex;align-items:center;gap:8px;margin-left:auto}.dssm-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 13px;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:inherit;font-size:13px;font-weight:550;cursor:pointer;transition:opacity 180ms ease,background 180ms ease,border-color 180ms ease}
.dssm-btn:hover:not(:disabled){opacity:.9}.dssm-btn:disabled{opacity:.5;cursor:default}.dssm-btn-secondary{background:transparent;border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.dssm-btn-danger{background:transparent;border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dssm-btn:focus-visible,.dssm-dropzone:focus-visible,.dssm-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-summary{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dssm-summary-count{font-size:18px;font-weight:650}.dssm-summary-label{color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-summary-separator{width:1px;height:24px;background:var(--dsw-alias-border-l2)}
.dssm-group{display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}.dssm-group-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-group-title{margin:0;font-size:14px;font-weight:600}.dssm-count{color:var(--dsw-alias-label-tertiary);font-size:12px}.dssm-path{margin-left:auto;max-width:48%;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.dssm-row{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-row:last-child{border-bottom:0}.dssm-row-main{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.dssm-row-id{display:flex;align-items:center;gap:7px;min-width:0}.dssm-row-name{overflow:hidden;font-size:14px;font-weight:560;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.dssm-tag{flex:none;padding:1px 6px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}.dssm-tag-on{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.dssm-tag-off{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.dssm-note{overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.dssm-empty{padding:28px 16px;color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center}.dssm-error{color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}
.dssm-mask{position:fixed;z-index:1100;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.58)}.dssm-modal{box-sizing:border-box;display:flex;width:min(480px,100%);flex-direction:column;gap:18px;padding:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}.dssm-modal-head{display:flex;align-items:center;gap:12px}.dssm-modal-title{margin:0;flex:1;font-size:17px;line-height:24px;font-weight:650}.dssm-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:20px;line-height:1;cursor:pointer}.dssm-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dssm-dropzone{display:flex;min-height:144px;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:border-color 180ms ease,background 180ms ease}.dssm-dropzone:hover,.dssm-dropzone-active{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-interactive-bg-hover)}.dssm-dropzone-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:560}.dssm-dropzone-copy{font-size:12px;line-height:18px;text-align:center}.dssm-file{display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font-size:13px}.dssm-file-name{overflow:hidden;flex:1;text-overflow:ellipsis;white-space:nowrap}.dssm-modal-actions{display:flex;justify-content:flex-end;gap:8px}.dssm-hidden-input{display:none}
@media (max-width:560px){.dssm-toolbar{flex-wrap:wrap}.dssm-actions{margin-left:0}.dssm-path{display:none}.dssm-row{align-items:flex-start;flex-wrap:wrap}.dssm-row>.dssm-btn{margin-left:auto}}@media (prefers-reduced-motion:reduce){.dssm-btn,.dssm-dropzone{transition:none}}
`;

    function callApi(path, options) {
      return fetch("/api/dsh-skills-manager" + path, options).then(function (response) {
        return response.json().then(function (payload) {
          if (!payload.ok) {
            var error = new Error(payload.error || ("HTTP " + response.status));
            // 透传业务错误码与失败明细，供 translateError 按词典翻译。
            if (payload.code) error.code = payload.code;
            if (payload.params) error.params = payload.params;
            if (payload.failed) error.failed = payload.failed;
            throw error;
          }
          return payload.data;
        });
      });
    }

    // 翻译业务错误：payload.code 存在则查词典（params 替换占位符），词典 miss 回退原文。
    // 兼容 { code, params, error }、Error 对象、纯字符串三种形态。
    function translateError(t, payload) {
      if (payload && typeof payload === "object") {
        var code = payload.code;
        if (typeof code === "string" && code !== "") {
          var params = payload.params || {};
          // {action} 占位符按当前语言映射（enable/disable/delete → 启用/停用/删除）。
          if (params.action !== undefined) {
            var actionKey = "action." + params.action;
            var actionText = t(actionKey);
            if (actionText !== undefined && actionText !== actionKey) params = Object.assign({}, params, { action: actionText });
          }
          var translated = t(code, params);
          // locale miss 时 t 返回 key 本身（或 undefined/null），此时回退原文。
          if (typeof translated === "string" && translated !== code) return translated;
        }
        if (payload.error !== undefined) return translateError(t, payload.error);
        if (payload.message !== undefined) return String(payload.message);
      }
      return String(payload == null ? "" : payload);
    }

    // 词典命中返回翻译，miss（t 返回 key 本身或 undefined/null）回退 fallback。
    function translateOrFallback(t, key, fallback) {
      var value = t(key);
      return typeof value === "string" && value !== key ? value : fallback;
    }

    // 渲染机制按 register 的 locale 字段把命名空间绑定的 t 注入组件 props。
    function SkillManagerSection(props) {
      var t = props.t;
      var snapshotState = react.useState({ loading: true, error: null, data: null });
      var snapshot = snapshotState[0];
      var setSnapshot = snapshotState[1];
      var busyState = react.useState(null);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var uploadState = react.useState(false);
      var uploadOpen = uploadState[0];
      var setUploadOpen = uploadState[1];
      var selectedState = react.useState(null);
      var selected = selectedState[0];
      var setSelected = selectedState[1];
      var resultState = react.useState(null);
      var importResult = resultState[0];
      var setImportResult = resultState[1];
      var confirmState = react.useState(null);
      var confirmImport = confirmState[0];
      var setConfirmImport = confirmState[1];
      var deleteState = react.useState(null);
      var confirmDelete = deleteState[0];
      var setConfirmDelete = deleteState[1];
      var inputRef = react.useRef(null);

      function refresh() {
        setSnapshot({ loading: true, error: null, data: snapshot.data });
        callApi("/state").then(function (data) {
          setSnapshot({ loading: false, error: null, data: data });
        }).catch(function (error) {
          setSnapshot({ loading: false, error: error, data: snapshot.data });
        });
      }

      react.useEffect(function () { refresh(); }, []);

      react.useEffect(function () {
        if (!uploadOpen && !confirmImport && !confirmDelete) return undefined;
        function closeTopModal(event) {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          if (confirmDelete) setConfirmDelete(null);
          else if (confirmImport) setConfirmImport(null);
          else setUploadOpen(false);
        }
        window.addEventListener("keydown", closeTopModal, true);
        return function () { window.removeEventListener("keydown", closeTopModal, true); };
      }, [uploadOpen, confirmImport, confirmDelete]);

      function action(path, body) {
        if (busy) return;
        setBusy(path);
        callApi(path, { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(body || {}) }).then(function () {
          setBusy(null);
          refresh();
        }).catch(function (error) {
          setBusy(null);
          setSnapshot({ loading: false, error: error, data: snapshot.data });
        });
      }

      function selectFile(file) {
        if (!file) return;
        if (file.name.toLowerCase() !== "skill.md") {
          setImportResult({ code: "select.file.invalid" });
          return;
        }
        if (!file.path) {
          setSelected(null);
          setImportResult({ code: "select.path.missing" });
          return;
        }
        setSelected({ name: file.name, source: file.path });
        setImportResult(null);
      }

      function selectDirectory() {
        if (!pickDirectory) {
          setImportResult({ code: "dir.service.missing" });
          return;
        }
        setImportResult(null);
        setBusy("pick-directory");
        pickDirectory().then(function (path) {
          setBusy(null);
          if (path) {
            setSelected({ nameKey: "dir.selected", source: path });
            setImportResult(null);
          }
        }).catch(function (error) {
          setBusy(null);
          setImportResult({ code: "dir.pick.failed", params: { error: String(error && error.message || error) } });
        });
      }

      function openNativePicker() {
        if (!busy && inputRef.current) inputRef.current.click();
      }

      function executeImport(source, conflict) {
        setBusy("import");
        setConfirmImport(null);
        callApi("/import", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ source: source, conflict: conflict }) }).then(function (data) {
          setBusy(null);
          setImportResult(data);
          setSelected(null);
          setUploadOpen(false);
          refresh();
        }).catch(function (error) {
          setBusy(null);
          setImportResult({ error: error });
        });
      }

      function installSelected() {
        if (!selected || busy) return;
        setBusy("import-check");
        callApi("/import", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ source: selected.source, dryRun: true }) }).then(function (data) {
          if (data.conflicts && data.conflicts.length) {
            setBusy(null);
            setConfirmImport({ source: selected.source, conflicts: data.conflicts });
            return;
          }
          executeImport(selected.source, "skip");
        }).catch(function (error) {
          setBusy(null);
          setImportResult({ error: error });
        });
      }

      function skillRow(skill, root) {
        var enabled = skill.modelInvocable && skill.userInvocable;
        var policyValid = skill.invocationPolicyValid !== false;
        var actionEnabled = policyValid && enabled;
        return h("div", { key: skill.name, className: "dssm-row" },
          h("div", { className: "dssm-row-main" },
            h("div", { className: "dssm-row-id" },
              h("span", { className: "dssm-row-name" }, skill.name),
              h("span", { className: "dssm-tag" }, skill.kind === "bundle" ? t("status.bundle") : t("status.single")),
              h("span", { className: "dssm-tag " + (policyValid && enabled ? "dssm-tag-on" : "dssm-tag-off") }, policyValid ? (enabled ? t("status.enabled") : t("status.disabled")) : t("status.invalid"))),
            h("div", { className: "dssm-note", title: skill.description || "" }, skill.description || t("note.missing"))),
          root.mutable ? h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: function () { action(actionEnabled ? "/disable" : "/enable", { name: skill.name, root: root.key }); } }, actionEnabled ? t("btn.disable") : policyValid ? t("btn.enable") : t("btn.repair.enable")) : null,
          root.mutable ? h("button", { className: "dssm-btn dssm-btn-danger", disabled: !!busy, onClick: function () { setConfirmDelete(skill); } }, t("btn.delete")) : null);
      }

      var nodes = [h("style", { key: "css" }, CSS)];
      if (snapshot.error) nodes.push(h("div", { key: "error", className: "dssm-error", role: "alert" }, t("error.action", { error: translateError(t, snapshot.error) })));
      if (snapshot.data) {
        var roots = snapshot.data.roots || [];
        var skills = roots.reduce(function (all, root) { return all.concat(root.skills || []); }, []);
        var enabled = skills.filter(function (skill) { return skill.modelInvocable; }).length;
        nodes.push(h("div", { key: "toolbar", className: "dssm-toolbar" },
          h("div", null, h("h2", { className: "dssm-title" }, t("title")), h("p", { className: "dssm-desc" }, t("desc"))),
          h("div", { className: "dssm-actions" },
            h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: refresh }, t("btn.refresh")),
            h("button", { className: "dssm-btn", disabled: !!busy, onClick: function () { setImportResult(null); setUploadOpen(true); } }, t("btn.upload")))));
        // 复数按 en 的 one/other 二元规则选择；zh/en 均适用，扩展多复数语言时需改 CLDR 规则。
        nodes.push(h("div", { key: "summary", className: "dssm-summary" },
          h("span", { className: "dssm-summary-count" }, skills.length), h("span", { className: "dssm-summary-label" }, t(skills.length === 1 ? "summary.total.one" : "summary.total.other", { count: skills.length })), h("span", { className: "dssm-summary-separator" }), h("span", { className: "dssm-summary-count" }, enabled), h("span", { className: "dssm-summary-label" }, t(enabled === 1 ? "summary.enabled.one" : "summary.enabled.other", { count: enabled }))));
        roots.forEach(function (root) {
          var groupSkills = root.skills || [];
          nodes.push(h("div", { key: root.key, className: "dssm-group" },
            h("div", { className: "dssm-group-head" }, h("h3", { className: "dssm-group-title" }, translateOrFallback(t, "root." + root.key, root.label)), h("span", { className: "dssm-count" }, t("summary.group", { count: groupSkills.length })), h("span", { className: "dssm-path", title: root.path }, root.path)),
            root.exists === false ? h("div", { className: "dssm-empty" }, root.mutable ? t("empty.dir.uncreated") : t("empty.dir.missing")) : (groupSkills.length ? groupSkills.map(function (skill) { return skillRow(skill, root); }) : h("div", { className: "dssm-empty" }, t("empty.skills.none")))));
        });
      } else if (snapshot.loading) {
        nodes.push(h("div", { key: "loading", className: "dssm-note" }, t("loading")));
      }
      if (importResult) {
        var nameSeparator = t("sep.names");
        var errorSeparator = t("sep.errors");
        // 错误形态：业务/协议错误带 code，或 host 失败带 error（Error 对象）；结果形态只有 imported/failed/skipped。
        var isImportError = importResult.code !== undefined || importResult.error !== undefined;
        var importedNames = (importResult.imported || []).map(function (item) { return item.name; });
        // catch 场景把 core 的失败明细挂在 Error.failed 上，这里一并取用。
        var failedItems = importResult.failed || (importResult.error && importResult.error.failed) || [];
        var skippedNames = (importResult.skipped || []).map(function (item) { return item.name; });
        var failedText = failedItems.map(function (item) { return translateError(t, item); }).join(errorSeparator);
        var resultText;
        if (isImportError) {
          // 顶层聚合错误优先展示已翻译的失败明细；无明细时由 translateError 兜底（含 Error 对象）。
          resultText = t("result.failed", { error: failedItems.length ? failedText : translateError(t, importResult) });
        } else if (failedItems.length) {
          resultText = importedNames.length ? t("result.partial", { names: importedNames.join(nameSeparator), errors: failedText }) : t("result.failed.only", { errors: failedText });
        } else if (importedNames.length) {
          resultText = t("result.done", { names: importedNames.join(nameSeparator) });
        } else if (skippedNames.length) {
          resultText = t("result.skipped", { names: skippedNames.join(nameSeparator) });
        } else {
          resultText = t("result.none");
        }
        nodes.push(h("div", { key: "import-result", className: isImportError || failedItems.length ? "dssm-error" : "dssm-note", role: "status" }, resultText));
      }
      if (uploadOpen) {
        nodes.push(h("div", { key: "upload", className: "dssm-mask" }, h("div", { className: "dssm-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "dssm-upload-title" },
          h("div", { className: "dssm-modal-head" }, h("h3", { id: "dssm-upload-title", className: "dssm-modal-title" }, t("upload.title")), h("button", { className: "dssm-icon-btn", "aria-label": t("upload.close"), onClick: function () { setUploadOpen(false); } }, "×")),
          h("input", { ref: inputRef, className: "dssm-hidden-input", type: "file", accept: ".md", onChange: function (event) { selectFile(event.target.files && event.target.files[0]); event.target.value = ""; } }),
          h("div", { className: "dssm-dropzone", tabIndex: 0, onClick: openNativePicker, onKeyDown: function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openNativePicker(); } }, onDragOver: function (event) { event.preventDefault(); }, onDrop: function (event) { event.preventDefault(); selectFile(event.dataTransfer.files && event.dataTransfer.files[0]); } }, h("span", { className: "dssm-dropzone-title" }, t("upload.drop.title")), h("span", { className: "dssm-dropzone-copy" }, t("upload.drop.copy"))),
          selected ? h("div", { className: "dssm-file", title: selected.source }, h("span", { className: "dssm-file-name" }, selected.nameKey ? t(selected.nameKey) : selected.name), h("span", { className: "dssm-tag dssm-tag-on" }, t("status.selected"))) : h("p", { className: "dssm-desc" }, t("upload.hint")),
          busy === "pick-directory" ? h("div", { className: "dssm-note", role: "status" }, t("upload.picking.dir")) : null,
          importResult && (importResult.code !== undefined || importResult.error !== undefined) ? h("div", { className: "dssm-error", role: "alert" }, t("select.failed", { error: translateError(t, importResult) })) : null,
          h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: openNativePicker }, t("btn.file.pick")), pickDirectory ? h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: selectDirectory }, t("btn.dir.pick")) : null, h("button", { className: "dssm-btn", disabled: !selected || !!busy, onClick: installSelected }, busy === "import" || busy === "import-check" ? t("btn.uploading") : t("btn.upload.dsh"))))));
      }
      if (confirmImport) {
        nodes.push(h("div", { key: "import-confirm", className: "dssm-mask" }, h("div", { className: "dssm-modal", role: "dialog", "aria-modal": "true" }, h("div", { className: "dssm-modal-head" }, h("h3", { className: "dssm-modal-title" }, t("confirm.overwrite.title"))), h("p", { className: "dssm-desc" }, t("confirm.overwrite.desc", { names: confirmImport.conflicts.map(function (item) { return item.name; }).join(t("sep.names")) })), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function () { setConfirmImport(null); } }, t("btn.cancel")), h("button", { className: "dssm-btn", disabled: !!busy, onClick: function () { executeImport(confirmImport.source, "overwrite"); } }, t("btn.overwrite.upload"))))));
      }
      if (confirmDelete) {
        nodes.push(h("div", { key: "delete-confirm", className: "dssm-mask" }, h("div", { className: "dssm-modal", role: "dialog", "aria-modal": "true" }, h("div", { className: "dssm-modal-head" }, h("h3", { className: "dssm-modal-title" }, t("confirm.delete.title"))), h("p", { className: "dssm-desc" }, t("confirm.delete.desc", { name: confirmDelete.name })), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: function () { setConfirmDelete(null); } }, t("btn.cancel")), h("button", { className: "dssm-btn dssm-btn-danger", disabled: !!busy, onClick: function () { setConfirmDelete(null); action("/delete", { name: confirmDelete.name }); } }, t("btn.delete.confirm"))))));
      }
      return h("section", { className: "dssm-section" }, nodes);
    }

    function apply(ctx) {
      pickDirectory = function () { return ctx.workspaces.pickDirectory(); };
      ctx.effect(function () {
        return ctx.locale.register(NS, DICT);
      }, "skills-manager: dictionaries");
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({ name: "settings.section", id: "skills-manager", order: 17, label: function () { return ctx.locale.bind(NS)("title"); }, locale: NS }, SkillManagerSection);
      });
    }
    module.exports.apply = apply;
    module.exports.inject = ["slots", "workspaces", "locale"];
    // 导出词典与翻译函数供零依赖对齐测试读取（宿主只消费 apply/inject，不影响运行时）。
    module.exports.DICT = DICT;
    module.exports.translateError = translateError;
    return module.exports;
  }
});
