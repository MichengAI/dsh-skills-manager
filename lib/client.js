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

    // 词典命名空间必须与 settings.section 的 locale 一致，宿主据此注入 t。
    var NS = "skills-manager";
    // 宿主支持运行时切换语言，所有用户可见文案必须同时维护 zh/en。
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
        "filter.category": "分类",
        "filter.all": "全部",
        "filter.option": "{name}（{count}）",
        "filter.showing.one": "显示 {count} 个",
        "filter.showing.other": "显示 {count} 个",
        "search": "搜索",
        "search.placeholder": "名称、形态或简介",
        "search.clear": "清除搜索",
        "empty.search": "没有匹配的插件。试试其他关键词，或切换到「{all}」。",
        "empty.search.reset": "清除筛选",
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
        "result.warnings": "警告：{warnings}",
        "warning.backupUncleaned": "旧版本备份未清理: {path}（{error}）",
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
        "error.import.rollbackFailed": "覆盖导入回滚失败，备份保留在: {path}（{error}）",
        "error.proto.forbidden": "禁止的修改请求（缺少客户端标记）",
        "error.proto.forbiddenHost": "禁止的请求来源（非法 Host）",
        "error.proto.contentType": "请求体必须是 application/json",
        "error.proto.method": "不支持的请求方法",
        "error.proto.unknownAction": "未知操作",
        "error.proto.bodyTooLarge": "请求体过大",
        "error.proto.invalidJson": "请求体不是合法 JSON",
        "error.proto.nonJson": "服务端返回非 JSON 响应（HTTP {status}）",
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
        "filter.category": "Category",
        "filter.all": "All",
        "filter.option": "{name} ({count})",
        "filter.showing.one": "Showing {count} skill",
        "filter.showing.other": "Showing {count} skills",
        "search": "Search",
        "search.placeholder": "Name, kind, or description",
        "search.clear": "Clear search",
        "empty.search": "No matching plugins. Try another keyword, or switch to {all}.",
        "empty.search.reset": "Clear filters",
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
        "result.warnings": "Warning: {warnings}",
        "warning.backupUncleaned": "Old version backup was not cleaned up: {path} ({error})",
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
        "error.import.rollbackFailed": "Overwrite import rollback failed; backups kept at: {path} ({error})",
        "error.proto.forbidden": "Forbidden mutation request (missing client marker)",
        "error.proto.forbiddenHost": "Forbidden request origin (invalid host)",
        "error.proto.contentType": "Content type must be application/json",
        "error.proto.method": "Method not allowed",
        "error.proto.unknownAction": "Unknown action",
        "error.proto.bodyTooLarge": "Request body too large",
        "error.proto.invalidJson": "Invalid JSON request body",
        "error.proto.nonJson": "Server returned a non-JSON response (HTTP {status})",
        "action.enable": "enable",
        "action.disable": "disable",
        "action.delete": "deleting",
        "action.toggle": "enabling or disabling",
        "root.dsh": "DSH skills",
        "root.agents": "Shared Agent skills"
      }
    };

    var CSS = `
.dssm-section{box-sizing:border-box;display:flex;min-width:0;max-width:760px;width:100%;margin:0 auto;flex-direction:column;gap:16px;padding:0 0 32px;color:var(--dsw-alias-label-primary)}
.dssm-toolbar{display:flex;align-items:flex-start;gap:16px;padding-bottom:12px}
.dssm-title{margin:0;font-size:20px;line-height:28px;font-weight:650;letter-spacing:-.2px}.dssm-desc{margin:4px 0 0;max-width:42em;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dssm-actions{display:flex;align-items:center;gap:8px;margin-left:auto}.dssm-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 12px;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:inherit;font-size:13px;font-weight:550;cursor:pointer;transition:opacity 180ms ease,background 180ms ease,border-color 180ms ease}
.dssm-btn:hover:not(:disabled){opacity:.9}.dssm-btn:disabled{opacity:.5;cursor:default}.dssm-btn-secondary{background:transparent;border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.dssm-btn-danger{background:transparent;border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dssm-btn:focus-visible,.dssm-dropzone:focus-visible,.dssm-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-summary{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.dssm-summary-count{font-size:18px;font-weight:650}.dssm-summary-label{color:var(--dsw-alias-label-secondary);font-size:12px}.dssm-summary-separator{width:1px;height:24px;background:var(--dsw-alias-border-l2)}
.dssm-group{display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}.dssm-group-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-group-title{margin:0;font-size:14px;font-weight:600}.dssm-count{color:var(--dsw-alias-label-tertiary);font-size:12px}.dssm-path{margin-left:auto;max-width:48%;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.dssm-row{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dssm-row:last-child{border-bottom:0}.dssm-row-main{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.dssm-row-id{display:flex;align-items:center;gap:7px;min-width:0}.dssm-row-name{overflow:hidden;font-size:13px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.dssm-tag{flex:none;padding:1px 6px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}.dssm-tag-on{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}.dssm-tag-off{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.dssm-note{overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.dssm-empty{padding:28px 16px;color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center}.dssm-error{color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}
.dssm-mask{position:fixed;z-index:1100;inset:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;height:100%;padding:24px;background:rgba(0,0,0,.58)}.dssm-modal{box-sizing:border-box;display:flex;width:min(480px,100%)!important;height:auto!important;max-width:100%;max-height:100%;min-width:0;min-height:0;flex:0 0 auto!important;align-self:center!important;flex-direction:column;gap:18px;padding:24px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}.dssm-modal-upload{width:min(480px,100%)!important;height:auto!important;max-width:100%;max-height:100%;align-self:center!important;flex:0 0 auto!important;overflow:auto}.dssm-modal-head{display:flex;align-items:center;gap:12px}.dssm-modal-title{margin:0;flex:1;font-size:17px;line-height:24px;font-weight:650}.dssm-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:20px;line-height:1;cursor:pointer}.dssm-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dssm-dropzone{box-sizing:border-box;display:flex;width:100%;min-height:144px;flex:none;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:border-color 180ms ease,background 180ms ease}.dssm-dropzone:hover,.dssm-dropzone-active{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-interactive-bg-hover)}.dssm-dropzone-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:560}.dssm-dropzone-copy{font-size:12px;line-height:18px;text-align:center}.dssm-file{display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font-size:13px}.dssm-file-name{overflow:hidden;flex:1;text-overflow:ellipsis;white-space:nowrap}.dssm-modal-head,.dssm-file,.dssm-modal-actions{flex:none}.dssm-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}.dssm-hidden-input{display:none}
.dssm-filters{display:flex;align-items:flex-end;gap:10px}.dssm-field{display:flex;min-width:0;flex:1;flex-direction:column;gap:6px}.dssm-field-category{flex:0 1 220px}.dssm-field-search{flex:1 1 240px}.dssm-label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}.dssm-control{box-sizing:border-box;width:100%;min-height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}.dssm-control:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-select{position:relative}.dssm-select-trigger{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}.dssm-select-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.dssm-select-trigger:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-select-trigger[aria-expanded="true"]{border-color:var(--dsw-alias-state-success-primary)}.dssm-select-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dssm-select-caret{flex:none;width:12px;height:12px;color:var(--dsw-alias-label-tertiary)}.dssm-select-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:30;box-sizing:border-box;max-height:280px;overflow:auto;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));box-shadow:var(--dsw-shadow-lv3)}.dssm-select-option{box-sizing:border-box;display:flex;align-items:center;width:100%;min-height:32px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}.dssm-select-option:hover,.dssm-select-option[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}.dssm-select-option[aria-selected="true"]{color:var(--dsw-alias-state-success-primary)}.dssm-search-wrap{position:relative;display:flex;align-items:center}.dssm-search{padding-right:32px}.dssm-search::-webkit-search-cancel-button,.dssm-search::-webkit-search-decoration{-webkit-appearance:none;appearance:none}.dssm-search-clear{position:absolute;right:4px;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:16px;line-height:1;cursor:pointer}.dssm-search-clear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dssm-search-clear:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.dssm-empty-filter{display:flex;flex-direction:column;align-items:center;gap:12px;padding:28px 16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;text-align:center}.dssm-filter-meta{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:12px}
@media (max-width:560px){.dssm-mask{padding:12px;align-items:center}.dssm-modal{width:100%!important;height:auto!important;padding:16px;gap:12px;align-self:center!important}.dssm-modal-upload{width:100%!important;align-self:center!important}.dssm-toolbar{flex-wrap:wrap}.dssm-actions{margin-left:0}.dssm-path{display:none}.dssm-row{align-items:flex-start;flex-wrap:wrap}.dssm-row>.dssm-btn{margin-left:auto}.dssm-filters{flex-direction:column;align-items:stretch}.dssm-field-category,.dssm-field-search{flex:none}.dssm-filter-meta{margin-left:0}.dssm-modal-actions{justify-content:stretch}.dssm-modal-actions .dssm-btn{flex:1 1 auto}}@media (prefers-reduced-motion:reduce){.dssm-btn,.dssm-dropzone{transition:none}}
`;

    function callApi(path, options) {
      return fetch("/api/dsh-skills-manager" + path, options).then(parseApiResponse);
    }

    function parseApiResponse(response) {
      return response.json().catch(function () {
        var error = new Error("HTTP " + response.status + " returned a non-JSON response");
        error.code = "error.proto.nonJson";
        error.params = { status: response.status };
        throw error;
      }).then(function (payload) {
        if (!payload.ok) {
          var error = new Error(payload.error || ("HTTP " + response.status));
          if (payload.code) error.code = payload.code;
          if (payload.params) error.params = payload.params;
          if (payload.failed) error.failed = payload.failed;
          throw error;
        }
        return payload.data;
      });
    }

    function translateError(t, payload) {
      // 调用方会传入 API payload、Error 和纯字符串，统一在此处兼容可避免漏翻译。
      if (payload && typeof payload === "object") {
        var code = payload.code;
        if (typeof code === "string" && code !== "") {
          var params = payload.params || {};
          // error.* 使用动作键，而动作名称必须随当前语言切换。
          if (params.action !== undefined) {
            var actionKey = "action." + params.action;
            var actionText = t(actionKey);
            if (actionText !== undefined && actionText !== actionKey) params = Object.assign({}, params, { action: actionText });
          }
          var translated = t(code, params);
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

    function isSkillEnabled(skill) {
      return skill.invocationPolicyValid && skill.modelInvocable && skill.userInvocable;
    }

    /** 规范化检索词：去首尾空白并转小写，便于名称、形态和简介统一匹配。 */
    function normalizeSkillQuery(query) {
      return String(query == null ? "" : query).trim().toLowerCase();
    }

    /** 按名称、简介、形态或分类标签做包含匹配；空检索视为全部命中。 */
    function matchSkillQuery(skill, query) {
      var q = normalizeSkillQuery(query);
      if (q === "") return true;
      return [
        skill.name,
        skill.description,
        skill.kind,
        skill.kindLabel,
        skill.statusLabel,
        skill.rootKey,
        skill.rootLabel,
      ].some(function (field) {
        return String(field == null ? "" : field).toLowerCase().includes(q);
      });
    }

    /** 先按目录分类收窄，再按检索词过滤。rootKey 为空表示全部分类。 */
    function filterSkills(list, options) {
      var query = options && options.query;
      var rootKey = options && options.rootKey != null ? options.rootKey : "";
      return list.filter(function (skill) {
        return (rootKey === "" || skill.rootKey === rootKey) && matchSkillQuery(skill, query);
      });
    }

    function skillSearchMeta(skill, root, t) {
      var enabled = isSkillEnabled(skill);
      return {
        name: skill.name,
        description: skill.description,
        kind: skill.kind,
        kindLabel: t(skill.kind === "bundle" ? "status.bundle" : "status.single"),
        statusLabel: skill.invocationPolicyValid ? (enabled ? t("status.enabled") : t("status.disabled")) : t("status.invalid"),
        rootKey: root.key,
        rootLabel: translateOrFallback(t, "root." + root.key, root.label),
      };
    }

    function modalFocusable(modal) {
      return Array.prototype.slice.call(modal.querySelectorAll("button:not(:disabled), [href], input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex=\"-1\"])"));
    }

    function trapModalFocus(modal, event) {
      if (event.key !== "Tab") return;
      var focusable = modalFocusable(modal);
      if (focusable.length === 0) return;
      var active = document.activeElement;
      if (!modal.contains(active) || (event.shiftKey ? active === focusable[0] : active === focusable[focusable.length - 1])) {
        event.preventDefault();
        (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
      }
    }

    function CategorySelect(props) {
      var openState = react.useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      var selectedIndex = 0;
      for (var i = 0; i < props.options.length; i++) {
        if (props.options[i].value === props.value) { selectedIndex = i; break; }
      }
      var activeState = react.useState(selectedIndex);
      var active = activeState[0];
      var setActive = activeState[1];
      var rootRef = react.useRef(null);
      var triggerRef = react.useRef(null);
      var listRef = react.useRef(null);
      var wasOpen = react.useRef(false);
      var selected = props.options[selectedIndex];

      react.useEffect(function () {
        if (!open) return undefined;
        setActive(selectedIndex);
        function onPointerDown(event) {
          var node = rootRef.current;
          if (node && event.target && node.contains(event.target)) return;
          setOpen(false);
        }
        document.addEventListener("pointerdown", onPointerDown);
        return function () { document.removeEventListener("pointerdown", onPointerDown); };
      }, [open, selectedIndex]);

      react.useEffect(function () {
        if (open) {
          if (listRef.current) listRef.current.focus();
          wasOpen.current = true;
          return;
        }
        if (wasOpen.current) {
          if (triggerRef.current) triggerRef.current.focus();
          wasOpen.current = false;
        }
      }, [open]);

      react.useEffect(function () {
        if (!open) return;
        var option = document.getElementById(props.id + "-opt-" + String(active));
        if (option) option.scrollIntoView({ block: "nearest" });
      }, [active, open, props.id]);

      function choose(value) {
        props.onChange(value);
        setOpen(false);
      }

      function move(next) {
        if (!props.options.length) return;
        setActive(Math.min(props.options.length - 1, Math.max(0, next)));
      }

      function onTriggerKeyDown(event) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setOpen(true);
        }
      }

      function onListKeyDown(event) {
        if (event.key === "ArrowDown") { event.preventDefault(); move(active + 1); return; }
        if (event.key === "ArrowUp") { event.preventDefault(); move(active - 1); return; }
        if (event.key === "Home") { event.preventDefault(); move(0); return; }
        if (event.key === "End") { event.preventDefault(); move(props.options.length - 1); return; }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          var option = props.options[active];
          if (option) choose(option.value);
          return;
        }
        if (event.key === "Escape" || event.key === "Tab") setOpen(false);
      }

      return h("div", { className: "dssm-select", ref: rootRef },
        h("button", {
          id: props.id,
          ref: triggerRef,
          type: "button",
          className: "dssm-select-trigger",
          "aria-haspopup": "listbox",
          "aria-expanded": open,
          "aria-controls": props.id + "-list",
          onClick: function () { setOpen(function (current) { return !current; }); },
          onKeyDown: onTriggerKeyDown,
        },
          h("span", { className: "dssm-select-value" }, selected ? selected.label : ""),
          h("svg", { className: "dssm-select-caret", viewBox: "0 0 12 12", "aria-hidden": true, focusable: false },
            h("path", { d: "M2.5 4.5L6 8l3.5-3.5", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }))),
        open ? h("div", {
          id: props.id + "-list",
          ref: listRef,
          className: "dssm-select-menu",
          role: "listbox",
          tabIndex: 0,
          "aria-activedescendant": props.id + "-opt-" + String(active),
          onKeyDown: onListKeyDown,
        }, props.options.map(function (option, index) {
          return h("button", {
            key: option.value === "" ? "all" : option.value,
            id: props.id + "-opt-" + String(index),
            type: "button",
            role: "option",
            className: "dssm-select-option",
            "aria-selected": option.value === props.value,
            "data-active": index === active,
            onMouseEnter: function () { setActive(index); },
            onClick: function () { choose(option.value); },
          }, option.label);
        })) : null);
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
      var inflightRef = react.useRef(false);
      var queryState = react.useState("");
      var query = queryState[0];
      var setQuery = queryState[1];
      var categoryState = react.useState("");
      var category = categoryState[0];
      var setCategory = categoryState[1];
      var inputRef = react.useRef(null);
      var modalRef = react.useRef(null);

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

      react.useEffect(function () {
        var modal = modalRef.current;
        if (!modal) return undefined;
        var focusable = modalFocusable(modal);
        (focusable[0] || modal).focus();
        function trapFocus(event) { trapModalFocus(modal, event); }
        modal.addEventListener("keydown", trapFocus);
        return function () { modal.removeEventListener("keydown", trapFocus); };
      }, [uploadOpen, confirmImport, confirmDelete]);

      function action(path, body) {
        if (busy || inflightRef.current) return;
        inflightRef.current = true;
        setBusy(path);
        callApi(path, { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(body || {}) }).then(function () {
          inflightRef.current = false;
          setBusy(null);
          refresh();
        }).catch(function (error) {
          inflightRef.current = false;
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

      function executeImport(source, conflict, chained) {
        // busy 闭包值停留在点击那次渲染，读不到 setBusy("import-check")；链式放行必须显式传参。
        if (inflightRef.current && !chained) return;
        inflightRef.current = true;
        setBusy("import");
        setConfirmImport(null);
        callApi("/import", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ source: source, conflict: conflict }) }).then(function (data) {
          inflightRef.current = false;
          setBusy(null);
          setImportResult(data);
          setSelected(null);
          setUploadOpen(false);
          refresh();
        }).catch(function (error) {
          inflightRef.current = false;
          setBusy(null);
          setUploadOpen(false);
          setSelected(null);
          setImportResult({ error: error });
        });
      }

      function installSelected() {
        if (!selected || busy || inflightRef.current) return;
        inflightRef.current = true;
        setBusy("import-check");
        callApi("/import", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ source: selected.source, dryRun: true }) }).then(function (data) {
          if (data.conflicts && data.conflicts.length) {
            inflightRef.current = false;
            setBusy(null);
            setConfirmImport({ source: selected.source, conflicts: data.conflicts });
            return;
          }
          executeImport(selected.source, "skip", true);
        }).catch(function (error) {
          inflightRef.current = false;
          setBusy(null);
          setImportResult({ error: error });
        });
      }

      function skillRow(skill, root) {
        var policyValid = skill.invocationPolicyValid;
        var enabled = isSkillEnabled(skill);
        var actionEnabled = enabled;
        return h("div", { key: skill.name, className: "dssm-row" },
          h("div", { className: "dssm-row-main" },
            h("div", { className: "dssm-row-id" },
              h("span", { className: "dssm-row-name" }, skill.name),
              h("span", { className: "dssm-tag" }, skill.kind === "bundle" ? t("status.bundle") : t("status.single")),
              h("span", { className: "dssm-tag " + (policyValid && enabled ? "dssm-tag-on" : "dssm-tag-off") }, policyValid ? (enabled ? t("status.enabled") : t("status.disabled")) : t("status.invalid"))),
            h("div", { className: "dssm-note", title: skill.description || "" }, skill.description || t("note.missing"))),
          root.mutable ? h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: function () { action(actionEnabled ? "/disable" : "/enable", { name: skill.name, root: root.key }); } }, actionEnabled ? t("btn.disable") : policyValid ? t("btn.enable") : t("btn.repair.enable")) : null,
          root.mutable ? h("button", { className: "dssm-btn dssm-btn-danger", disabled: !!busy, onClick: function () { setConfirmDelete({ name: skill.name, root: root.key }); } }, t("btn.delete")) : null);
      }

      var nodes = [h("style", { key: "css" }, CSS)];
      if (snapshot.error) nodes.push(h("div", { key: "error", className: "dssm-error", role: "alert" }, t("error.action", { error: translateError(t, snapshot.error) })));
      if (snapshot.data) {
        var roots = snapshot.data.roots || [];
        var skills = roots.reduce(function (all, root) { return all.concat(root.skills || []); }, []);
        var enabled = skills.filter(isSkillEnabled).length;
        nodes.push(h("div", { key: "toolbar", className: "dssm-toolbar" },
          h("div", null, h("h2", { className: "dssm-title" }, t("title")), h("p", { className: "dssm-desc" }, t("desc"))),
          h("div", { className: "dssm-actions" },
            h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: refresh }, t("btn.refresh")),
            h("button", { className: "dssm-btn", disabled: !!busy, onClick: function () { setImportResult(null); setUploadOpen(true); } }, t("btn.upload")))));
        var searchable = roots.reduce(function (all, root) {
          return all.concat((root.skills || []).map(function (skill) { return skillSearchMeta(skill, root, t); }));
        }, []);
        var filtered = filterSkills(searchable, { query: query, rootKey: category });
        var filteredCount = filtered.length;
        var hasQuery = normalizeSkillQuery(query) !== "";
        var hasFilter = hasQuery || category !== "";
        var resetFilters = function () { setQuery(""); setCategory(""); };
        // 复数按 en 的 one/other 二元规则选择；zh/en 均适用，扩展多复数语言时需改 CLDR 规则。
        nodes.push(h("div", { key: "summary", className: "dssm-summary" },
          h("span", { className: "dssm-summary-count" }, skills.length), h("span", { className: "dssm-summary-label" }, t(skills.length === 1 ? "summary.total.one" : "summary.total.other", { count: skills.length })), h("span", { className: "dssm-summary-separator" }), h("span", { className: "dssm-summary-count" }, enabled), h("span", { className: "dssm-summary-label" }, t(enabled === 1 ? "summary.enabled.one" : "summary.enabled.other", { count: enabled })),
          hasFilter ? h("span", { className: "dssm-filter-meta", "aria-live": "polite" }, t(filteredCount === 1 ? "filter.showing.one" : "filter.showing.other", { count: filteredCount })) : null));
        nodes.push(h("div", { key: "filters", className: "dssm-filters" },
          h("div", { className: "dssm-field dssm-field-category" },
            h("label", { className: "dssm-label", htmlFor: "dssm-filter-category" }, t("filter.category")),
            h(CategorySelect, {
              id: "dssm-filter-category",
              value: category,
              onChange: setCategory,
              options: [{ value: "", label: t("filter.option", { name: t("filter.all"), count: skills.length }) }].concat(roots.map(function (root) {
                return { value: root.key, label: t("filter.option", { name: translateOrFallback(t, "root." + root.key, root.label), count: (root.skills || []).length }) };
              })),
            })),
          h("div", { className: "dssm-field dssm-field-search" },
            h("label", { className: "dssm-label", htmlFor: "dssm-filter-search" }, t("search")),
            h("div", { className: "dssm-search-wrap" },
              h("input", {
                id: "dssm-filter-search",
                className: "dssm-control dssm-search",
                type: "search",
                value: query,
                autoComplete: "off",
                spellCheck: false,
                placeholder: t("search.placeholder"),
                onChange: function (event) { setQuery(event.currentTarget.value); },
              }),
              query !== "" ? h("button", { type: "button", className: "dssm-search-clear", "aria-label": t("search.clear"), onClick: function () { setQuery(""); } }, "×") : null))));
        var visibleRoots = [];
        roots.forEach(function (root) {
          if (category !== "" && root.key !== category) return;
          var groupSkills = (root.skills || []).filter(function (skill) {
            return matchSkillQuery(skillSearchMeta(skill, root, t), query);
          });
          if (hasQuery && groupSkills.length === 0) return;
          visibleRoots.push({ root: root, groupSkills: groupSkills });
        });
        if (hasQuery && visibleRoots.length === 0) {
          nodes.push(h("div", { key: "empty-search", className: "dssm-empty-filter" },
            h("div", null, t("empty.search", { all: t("filter.all") })),
            h("button", { type: "button", className: "dssm-btn dssm-btn-secondary", onClick: resetFilters }, t("empty.search.reset"))));
        } else {
          visibleRoots.forEach(function (item) {
            var root = item.root;
            var groupSkills = item.groupSkills;
            nodes.push(h("div", { key: root.key, className: "dssm-group" },
              h("div", { className: "dssm-group-head" }, h("h3", { className: "dssm-group-title" }, translateOrFallback(t, "root." + root.key, root.label)), h("span", { className: "dssm-count" }, t("summary.group", { count: groupSkills.length })), h("span", { className: "dssm-path", title: root.path }, root.path)),
              root.exists === false ? h("div", { className: "dssm-empty" }, root.mutable ? t("empty.dir.uncreated") : t("empty.dir.missing")) : (groupSkills.length ? groupSkills.map(function (skill) { return skillRow(skill, root); }) : h("div", { className: "dssm-empty" }, t("empty.skills.none")))));
          });
        }
      } else if (snapshot.loading) {
        nodes.push(h("div", { key: "loading", className: "dssm-note" }, t("loading")));
      }
      function isUploadPickerError(result) {
        return !!(result && typeof result.code === "string" && (result.code.indexOf("select.") === 0 || result.code.indexOf("dir.") === 0));
      }
      if (importResult && !uploadOpen && !isUploadPickerError(importResult)) {
        var nameSeparator = t("sep.names");
        var errorSeparator = t("sep.errors");
        // 错误形态：业务/协议错误带 code，或 host 失败带 error（Error 对象）；结果形态只有 imported/failed/skipped。
        var isImportError = importResult.code !== undefined || importResult.error !== undefined;
        var importedNames = (importResult.imported || []).map(function (item) { return item.name; });
        // catch 场景把 core 的失败明细挂在 Error.failed 上，这里一并取用。
        var failedItems = importResult.failed || (importResult.error && importResult.error.failed) || [];
        var skippedNames = (importResult.skipped || []).map(function (item) { return item.name; });
        var failedText = failedItems.map(function (item) { return translateError(t, item); }).join(errorSeparator);
        var warningItems = [];
        (importResult.imported || []).forEach(function (item) {
          if (item.warnings && item.warnings.length) {
            for (var i = 0; i < item.warnings.length; i++) warningItems.push(item.warnings[i]);
          }
        });
        var warningText = warningItems.map(function (item) { return translateError(t, item); }).join(errorSeparator);
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
        if (warningText) resultText = resultText + errorSeparator + t("result.warnings", { warnings: warningText });
        nodes.push(h("div", { key: "import-result", className: isImportError || failedItems.length ? "dssm-error" : "dssm-note", role: "status" }, resultText));
      }
      if (uploadOpen) {
        nodes.push(h("div", { key: "upload", className: "dssm-mask" }, h("div", { ref: modalRef, tabIndex: -1, className: "dssm-modal dssm-modal-upload", role: "dialog", "aria-modal": "true", "aria-labelledby": "dssm-upload-title" },
          h("div", { className: "dssm-modal-head" }, h("h3", { id: "dssm-upload-title", className: "dssm-modal-title" }, t("upload.title")), h("button", { className: "dssm-icon-btn", "aria-label": t("upload.close"), onClick: function () { setUploadOpen(false); } }, "×")),
          h("input", { ref: inputRef, className: "dssm-hidden-input", type: "file", accept: ".md", onChange: function (event) { selectFile(event.target.files && event.target.files[0]); event.target.value = ""; } }),
          h("div", { className: "dssm-dropzone", tabIndex: 0, onClick: openNativePicker, onKeyDown: function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openNativePicker(); } }, onDragOver: function (event) { event.preventDefault(); }, onDrop: function (event) { event.preventDefault(); selectFile(event.dataTransfer.files && event.dataTransfer.files[0]); } }, h("span", { className: "dssm-dropzone-title" }, t("upload.drop.title")), h("span", { className: "dssm-dropzone-copy" }, t("upload.drop.copy"))),
          selected ? h("div", { className: "dssm-file", title: selected.source }, h("span", { className: "dssm-file-name" }, selected.nameKey ? t(selected.nameKey) : selected.name), h("span", { className: "dssm-tag dssm-tag-on" }, t("status.selected"))) : h("p", { className: "dssm-desc" }, t("upload.hint")),
          busy === "pick-directory" ? h("div", { className: "dssm-note", role: "status" }, t("upload.picking.dir")) : null,
          importResult && (importResult.code !== undefined || importResult.error !== undefined) ? h("div", { className: "dssm-error", role: "alert" }, t("select.failed", { error: translateError(t, importResult) })) : null,
          h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: openNativePicker }, t("btn.file.pick")), pickDirectory ? h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: selectDirectory }, t("btn.dir.pick")) : null, h("button", { className: "dssm-btn", disabled: !selected || !!busy, onClick: installSelected }, busy === "import" || busy === "import-check" ? t("btn.uploading") : t("btn.upload.dsh"))))));
      }
      if (confirmImport) {
        nodes.push(h("div", { key: "import-confirm", className: "dssm-mask" }, h("div", { ref: modalRef, tabIndex: -1, className: "dssm-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "dssm-import-title" }, h("div", { className: "dssm-modal-head" }, h("h3", { id: "dssm-import-title", className: "dssm-modal-title" }, t("confirm.overwrite.title"))), h("p", { className: "dssm-desc" }, t("confirm.overwrite.desc", { names: confirmImport.conflicts.map(function (item) { return item.name; }).join(t("sep.names")) })), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", onClick: function () { setConfirmImport(null); } }, t("btn.cancel")), h("button", { className: "dssm-btn", disabled: !!busy, onClick: function () { executeImport(confirmImport.source, "overwrite"); } }, t("btn.overwrite.upload"))))));
      }
      if (confirmDelete) {
        nodes.push(h("div", { key: "delete-confirm", className: "dssm-mask" }, h("div", { ref: modalRef, tabIndex: -1, className: "dssm-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "dssm-delete-title" }, h("div", { className: "dssm-modal-head" }, h("h3", { id: "dssm-delete-title", className: "dssm-modal-title" }, t("confirm.delete.title"))), h("p", { className: "dssm-desc" }, t("confirm.delete.desc", { name: confirmDelete.name })), h("div", { className: "dssm-modal-actions" }, h("button", { className: "dssm-btn dssm-btn-secondary", disabled: !!busy, onClick: function () { setConfirmDelete(null); } }, t("btn.cancel")), h("button", { className: "dssm-btn dssm-btn-danger", disabled: !!busy, onClick: function () { setConfirmDelete(null); action("/delete", { name: confirmDelete.name, root: confirmDelete.root || "dsh" }); } }, t("btn.delete.confirm"))))));
      }
      return h("section", { className: "dssm-section" }, nodes);
    }

    function apply(ctx) {
      pickDirectory = function () { return ctx.workspaces.pickDirectory(); };
      ctx.effect(function () {
        return ctx.locale.register(NS, DICT);
      }, "skills-manager: dictionaries");
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({ name: "settings.section", id: "skills-manager", order: 17, label: function () { return ctx.locale.bind(NS)("title"); }, icon: "skill", locale: NS }, SkillManagerSection);
      });
    }
    module.exports.apply = apply;
    module.exports.inject = ["slots", "workspaces", "locale"];
    // 导出词典与翻译函数供零依赖对齐测试读取（宿主只消费 apply/inject，不影响运行时）。
    module.exports.DICT = DICT;
    module.exports.translateError = translateError;
    module.exports.isSkillEnabled = isSkillEnabled;
    module.exports.normalizeSkillQuery = normalizeSkillQuery;
    module.exports.matchSkillQuery = matchSkillQuery;
    module.exports.filterSkills = filterSkills;
    module.exports.parseApiResponse = parseApiResponse;
    module.exports.trapModalFocus = trapModalFocus;
    return module.exports;
  }
});





