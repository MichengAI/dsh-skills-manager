import * as React from "react";
import type { Translate, ApiRoutes, ModalProps, SessionSnapshot, SectionProps, ViewProps, Filters, ClientContext, ManagerSnapshot, Detail, TrashItem } from './client-types.js';
import type { SkillView, RootView, SkillRoot, CodedError, ImportResult, Diagnostic } from './types.js';
type SearchSkill = Partial<SkillView> & {kindLabel?: string; statusLabel?: string; rootKey?: string; rootLabel?: string};
type UploadFile = File & {_dssmPath?: string};
type UploadSelection = {kind: string; name: string; files: UploadFile[]; count: number; size: number; error?: never};
type SelectionResult = UploadSelection | {error: Diagnostic};
type ResultMessage = {ok: boolean; text: string; warning?: boolean; scope?: string};
type ConfirmModal = {type: 'trash-confirm'; root: string; name: string} | {type: 'delete-confirm'; id: string; name: string};
type ModalState = 'detail' | 'create' | 'import' | ConfirmModal | null;
import { createRepositoryUI, repositoryLocales } from "./repository-ui.js";
import { observePluginUpdate } from "./plugin-update-ui.js";
import { createSourceSelect } from "./source-select.js";
import { AntdProvider, Button, Collapse, Input, List, Modal as AntdModal, Segmented, Switch as AntdSwitch, Tag as AntdTag, Tooltip } from "./antd-ui.js";
import { antdLocaleFromDocument } from "./antd-locale.js";

// dsh-skills-manager client half：按全局与项目作用域切换的多 Agent Skills 管理面板。
    var react = React;
    var h = react.createElement;
    function FeedbackIcon() { return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: "false" }, h("path", { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", d: "M9.5 2.5 13.5 6.5 6 14H2v-4z" })); }
    var UPDATE_ICON_PATHS = {
      refresh: ["M13.5 5.5V2.5m0 0h-3m3 0-2.1 2.1A5.5 5.5 0 1 0 13.2 12"],
      download: ["M8 2v8m0 0 3-3m-3 3-3-3M3 13v2h10v-2"],
      copy: ["M5 5h8v8H5z", "M3 3h8"],
      close: ["m4 4 8 8M12 4 4 12"],
    };
    function createPluginUpdateIcon(name: keyof typeof UPDATE_ICON_PATHS) {
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
      UPDATE_ICON_PATHS[name].forEach(function (d) {
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
        "summary.group.one": "{count} 个技能", "summary.group.other": "{count} 个技能", "format.locale": "zh-CN", "format.warningSeparator": "；",
        "title": "技能", "desc": "统一加载和管理本机 Agent Skills。", "link.project": "GitHub", "link.feedback": "问题反馈",
        "btn.create": "创建技能", "btn.import": "导入", "btn.refresh": "刷新", "btn.cancel": "取消", "btn.close": "关闭", "btn.detail": "查看详情", "btn.more": "更多", "btn.trash": "移到回收站", "btn.restore": "恢复", "btn.delete.forever": "永久删除", "btn.file.pick": "选择文件", "btn.folder.pick": "选择文件夹", "btn.import.now": "安装", "btn.create.now": "创建技能", "btn.disable": "停用", "btn.enable": "启用",
        "status.enabled": "已启用", "status.disabled": "已停用", "status.invalid": "诊断异常", "status.shadowed": "被覆盖", "status.readonly": "源文件只读",
        "summary.total.one": "{count} 个技能", "summary.total.other": "{count} 个技能", "summary.enabled.one": "{count} 个已启用", "summary.enabled.other": "{count} 个已启用", "summary.disabled.one": "{count} 个已停用", "summary.disabled.other": "{count} 个已停用", "summary.shadowed.one": "{count} 个被覆盖", "summary.shadowed.other": "{count} 个被覆盖", "summary.invalid.one": "{count} 个诊断异常", "summary.invalid.other": "{count} 个诊断异常", "table.skill": "技能名称与描述", "table.status": "调用状态",
        "filter.source": "来源", "filter.all": "全部来源", "filter.option": "{name}（{count}）", "search": "搜索", "search.placeholder": "搜索技能名称或描述", "search.clear": "清除搜索",
        "empty.search": "没有匹配的技能。", "empty.source": "该来源目录不存在或暂时没有技能。", "loading": "正在加载技能…", "note.missing": "未提供简介", "source.toggle": "启停来源", "skill.toggle": "启停技能",
        "detail.title": "技能详情", "detail.description": "简介", "detail.document": "SKILL.md", "detail.body": "正文", "detail.frontmatter": "Frontmatter", "detail.diagnostics": "诊断", "detail.path": "源文件", "detail.noIssues": "未发现诊断问题。",
        "create.title": "创建技能", "create.target": "创建位置", "create.globalTarget": "全局 DSH", "create.name": "名称", "create.name.placeholder": "例如 code-review-helper", "create.description": "简介", "create.description.placeholder": "一句话说明什么时候使用", "create.body": "正文（Markdown）", "create.body.placeholder": "写下技能要遵循的指令、步骤和边界…", "create.chat.note": "创建和导入均保存到全局 DSH，跨项目可用。",
        "import.title": "导入技能", "upload.drop.title": "拖拽技能到此处", "upload.drop.copy": "支持 .zip、技能文件夹或单个 SKILL.md", "upload.selected.one": "{count} 个文件 · {size}", "upload.selected.other": "{count} 个文件 · {size}", "upload.remove": "移除所选内容", "upload.requirements": "文件要求", "upload.requirement.skill": "压缩包或文件夹需包含 SKILL.md", "upload.requirement.frontmatter": "SKILL.md 需包含 YAML 格式的技能名称和描述", "upload.requirement.copy": "导入时复制完整内容，不修改原始来源", "upload.importing": "正在安装…", "status.selected": "已选择", "select.file.invalid": "请选择 .zip 或单个 SKILL.md。", "select.folder.invalid": "所选文件夹中没有找到 SKILL.md。", "error.browse.absolute": "目录路径必须是绝对路径：{path}", "error.browse.unreadable": "无法读取目录：{path}", "error.browse.notDirectory": "不是目录：{path}",
        "trash.title": "回收站", "trash.count.one": "{count} 个待处理技能", "trash.count.other": "{count} 个待处理技能", "trash.empty": "回收站为空。", "trash.deletedAt": "删除于 {time}", "trash.source": "来源：{source}",
        "confirm.trash.title": "移到回收站？", "confirm.trash.desc": "“{name}”将从当前技能来源移入回收站，之后可以恢复到原位置。", "confirm.delete.title": "永久删除？", "confirm.delete.desc": "“{name}”将从回收站永久删除，无法恢复。",
        "result.created": "已创建技能：{name}", "result.imported": "导入完成：{names}", "result.importPartial": "已导入：{imported}；已跳过同名技能：{skipped}", "result.importSkipped": "未导入任何技能；已跳过同名技能：{names}", "result.importEmpty": "未导入任何技能。", "result.importWarnings": "{result}；警告：{warnings}", "result.restored": "已恢复技能：{name}", "result.trashed": "已移到回收站：{name}", "result.deleted": "已永久删除：{name}", "result.updated": "状态已更新。", "error.action": "操作失败：{error}",
        "warning.scan.truncated": "技能目录较大或嵌套过深，部分技能未显示：{path}", "warning.state.invalid": "技能管理器状态文件不可读；所有技能已安全停用，修复文件前不会覆盖状态：{path}", "warning.backupUncleaned": "旧版本备份未清理：{path}（{error}）", "warning.project.unavailable": "无法从宿主读取活动工作区，项目技能未显示：{path}",
        "error.root.readonly": "该来源不允许{action}", "error.root.unknown": "未知技能来源：{root}", "error.root.unsafe": "项目技能目录不安全，拒绝写入：{path}", "error.skill.notFound": "技能不存在: {name}", "error.skill.noFrontmatter": "技能缺少完整 frontmatter，无法{action}: {name}", "error.skill.notLoadable": "技能结构不完整，无法{action}: {name}",
        "error.source.notFound": "路径不存在: {path}", "error.source.symlink": "不支持包含符号链接的 skill 来源: {path}", "error.source.unrecognized": "无法识别的 skill 来源: {path}", "error.source.tooDeep": "skill 来源目录层级超过 {depth} 层: {path}",
        "error.import.overlap": "导入来源不能与 DSH 技能目录相同、包含或位于其中", "error.import.emptySource": "目录下未找到任何 skill 条目: {path}", "error.import.invalidName": "无法生成合法 kebab-case 名称（原始名: {name}）", "error.import.duplicateName": "批量来源中存在多个同名技能: {name}", "error.import.failed": "导入失败", "error.import.rollbackFailed": "覆盖导入回滚失败，备份保留在: {path}（{error}）",
        "error.upload.path": "上传内容包含非法路径：{path}", "error.upload.encoding": "上传内容编码无效", "error.upload.empty": "上传内容为空", "error.upload.tooMany": "上传文件过多，最多 {limit} 个", "error.upload.tooLarge": "上传内容过大，限制为 {limit} 字节", "error.upload.archiveTooLarge": "ZIP 压缩包过大，限制为 {limit} 字节", "error.upload.duplicate": "上传内容包含重复路径：{path}", "error.upload.zipInvalid": "ZIP 压缩包无法解压",
        "error.trash.notFound": "回收站条目不存在: {id}", "error.trash.conflict": "无法恢复，同名技能已存在: {name}", "error.trash.invalid": "回收站条目路径非法: {id}", "error.trash.projectUnavailable": "原项目当前不在活动工作区中，无法恢复：{path}", "error.trash.rollbackFailed": "移入回收站回滚失败，未恢复内容保留在: {path}（{error}）",
        "error.state.invalid": "技能管理器状态文件不可读，已拒绝覆盖：{path}",
        "error.create.descriptionRequired": "技能简介不能为空", "error.create.bodyRequired": "技能正文不能为空", "error.create.tooLarge": "技能内容过长", "error.create.conflict": "同名技能已存在: {name}",
        "error.proto.forbidden": "禁止的修改请求（缺少客户端标记）", "error.proto.forbiddenHost": "禁止的请求来源（非法 Host）", "error.proto.contentType": "请求体必须是 application/json", "error.proto.method": "不支持的请求方法", "error.proto.unknownAction": "未知操作", "error.proto.bodyTooLarge": "请求体过大", "error.proto.invalidJson": "请求体不是合法 JSON", "error.proto.nonJson": "服务端返回非 JSON 响应（HTTP {status}）",
        "diagnostic.frontmatter.missing": "缺少完整 YAML frontmatter", "diagnostic.name.missing": "frontmatter 缺少 name", "diagnostic.name.invalid": "技能名称不是合法 kebab-case：{name}", "diagnostic.description.missing": "frontmatter 缺少 description", "diagnostic.invocation.invalid": "调用策略字段值无效", "diagnostic.shadowed": "被更高优先级来源 {root} 覆盖",
        "action.enable": "启用", "action.disable": "停用", "action.create": "创建", "action.delete": "删除", "action.restore": "恢复", "action.toggle": "启用或停用",
        "scope.user": "全局技能", "scope.project": "项目技能", "scope.trash": "回收站", "scope.label": "技能管理视图", "scope.userHint": "跨项目可用。启停仅影响 DSH 中的调用。", "scope.projectHint": "仅在当前会话的项目中生效。启停不修改其他 Agent 的源文件。导入仍写入全局 DSH。", "project.empty": "当前会话没有可识别的工作区。请打开工作区中的会话。", "filter.status": "调用状态", "filter.statusAll": "全部状态", "status.shadowedBy": "被 {source} 中的同名技能覆盖", "status.fallback.user": "当前使用全局 {source} 副本。", "status.fallback.project": "当前使用项目 {source} 副本。", "root.copilot": "Copilot", "source.selectHint": "先选择一个来源，才能查看目录或关闭整个来源。关闭来源只影响 DSH 调用，不改文件。", "import.global": "导入到全局 DSH", "root.dsh": "DSH 技能", "root.agents": "公共 Agent", "root.ccswitch": "CC Switch", "root.projectDsh": "项目 DSH", "root.projectAgents": "项目 Agent", "root.projectSkills": "项目 Skills", "root.codex": "Codex", "root.claude": "Claude", "root.gemini": "Gemini", "root.opencode": "OpenCode", "root.cursor": "Cursor", "root.windsurf": "Windsurf", "root.windsurfUser": "Windsurf 主目录", "root.trae": "Trae", "root.traeCn": "Trae 国内版", "root.openclaw": "OpenClaw", "root.clawdbot": "OpenClaw 旧目录", "root.roo": "Roo", "root.codebuddy": "CodeBuddy", "root.workbuddy": "WorkBuddy", "root.qoder": "Qoder", "root.qoderCn": "Qoder CN CLI", "root.lingma": "Qoder CN"
      },
      en: {
        "summary.group.one": "{count} skill", "summary.group.other": "{count} skills", "format.locale": "en-US", "format.warningSeparator": "; ",
        "title": "Skills", "desc": "Load and manage Agent Skills on this computer in one place.", "link.project": "GitHub", "link.feedback": "Issues",
        "btn.create": "Create skill", "btn.import": "Import", "btn.refresh": "Refresh", "btn.cancel": "Cancel", "btn.close": "Close", "btn.detail": "View details", "btn.more": "More", "btn.trash": "Move to trash", "btn.restore": "Restore", "btn.delete.forever": "Delete forever", "btn.file.pick": "Choose file", "btn.folder.pick": "Choose folder", "btn.import.now": "Install", "btn.create.now": "Create skill", "btn.disable": "Disable", "btn.enable": "Enable",
        "status.enabled": "Enabled", "status.disabled": "Disabled", "status.invalid": "Needs attention", "status.shadowed": "Shadowed", "status.readonly": "Source read-only",
        "summary.total.one": "{count} skill", "summary.total.other": "{count} skills", "summary.enabled.one": "{count} enabled", "summary.enabled.other": "{count} enabled", "summary.disabled.one": "{count} disabled", "summary.disabled.other": "{count} disabled", "summary.shadowed.one": "{count} shadowed", "summary.shadowed.other": "{count} shadowed", "summary.invalid.one": "{count} diagnostic", "summary.invalid.other": "{count} diagnostics", "table.skill": "Skill name and description", "table.status": "Invocation status",
        "filter.source": "Source", "filter.all": "All sources", "filter.option": "{name} ({count})", "search": "Search", "search.placeholder": "Search skill names or descriptions", "search.clear": "Clear search",
        "empty.search": "No matching skills.", "empty.source": "This source does not exist or has no skills yet.", "loading": "Loading skills…", "note.missing": "No description provided", "source.toggle": "Toggle source", "skill.toggle": "Toggle skill",
        "detail.title": "Skill details", "detail.description": "Description", "detail.document": "SKILL.md", "detail.body": "Body", "detail.frontmatter": "Frontmatter", "detail.diagnostics": "Diagnostics", "detail.path": "Source file", "detail.noIssues": "No diagnostic issues found.",
        "create.title": "Create skill", "create.target": "Create in", "create.globalTarget": "Global DSH", "create.name": "Name", "create.name.placeholder": "e.g. code-review-helper", "create.description": "Description", "create.description.placeholder": "One sentence describing when to use it", "create.body": "Body (Markdown)", "create.body.placeholder": "Write the instructions, steps, and boundaries…", "create.chat.note": "Created and imported skills are saved to global DSH and available across projects.",
        "import.title": "Import skill", "upload.drop.title": "Drop a skill here", "upload.drop.copy": "Supports .zip, a skill folder, or one SKILL.md", "upload.selected.one": "{count} file · {size}", "upload.selected.other": "{count} files · {size}", "upload.remove": "Remove selection", "upload.requirements": "File requirements", "upload.requirement.skill": "Archives and folders must contain SKILL.md", "upload.requirement.frontmatter": "SKILL.md must include a YAML name and description", "upload.requirement.copy": "Import copies all content and never modifies the source", "upload.importing": "Installing…", "status.selected": "Selected", "select.file.invalid": "Choose a .zip archive or one SKILL.md.", "select.folder.invalid": "No SKILL.md was found in the selected folder.", "error.browse.absolute": "Folder path must be absolute: {path}", "error.browse.unreadable": "Could not read folder: {path}", "error.browse.notDirectory": "Not a folder: {path}",
        "trash.title": "Trash", "trash.count.one": "{count} skill pending", "trash.count.other": "{count} skills pending", "trash.empty": "Trash is empty.", "trash.deletedAt": "Deleted {time}", "trash.source": "Source: {source}",
        "confirm.trash.title": "Move to trash?", "confirm.trash.desc": "“{name}” will move out of its current skill source and can be restored to the same location later.", "confirm.delete.title": "Delete forever?", "confirm.delete.desc": "“{name}” will be permanently deleted from trash and cannot be recovered.",
        "result.created": "Created skill: {name}", "result.imported": "Import complete: {names}", "result.importPartial": "Imported: {imported}; skipped existing skills: {skipped}", "result.importSkipped": "No skills were imported; existing skills were skipped: {names}", "result.importEmpty": "No skills were imported.", "result.importWarnings": "{result}; warnings: {warnings}", "result.restored": "Restored skill: {name}", "result.trashed": "Moved to trash: {name}", "result.deleted": "Permanently deleted: {name}", "result.updated": "Status updated.", "error.action": "Action failed: {error}",
        "warning.scan.truncated": "Some skills were not shown because the directory is too large or deeply nested: {path}", "warning.state.invalid": "The manager state file could not be read; all skills are disabled and state writes are blocked until it is repaired: {path}", "warning.backupUncleaned": "Old version backup was not cleaned up: {path} ({error})", "warning.project.unavailable": "The active workspace could not be read from the host, so its project skills are hidden: {path}",
        "error.root.readonly": "This source does not allow {action}", "error.root.unknown": "Unknown skill source: {root}", "error.root.unsafe": "The project skill directory is unsafe, so the write was refused: {path}", "error.skill.notFound": "Skill not found: {name}", "error.skill.noFrontmatter": "Skill lacks complete frontmatter, cannot {action}: {name}", "error.skill.notLoadable": "Skill structure is incomplete, cannot {action}: {name}",
        "error.source.notFound": "Path does not exist: {path}", "error.source.symlink": "Skill sources containing symbolic links are not supported: {path}", "error.source.unrecognized": "Unrecognized skill source: {path}", "error.source.tooDeep": "Skill source directory depth exceeds {depth} levels: {path}",
        "error.import.overlap": "Import source cannot be the same as, contain, or be inside the DSH skills directory", "error.import.emptySource": "No skill entries found in the directory: {path}", "error.import.invalidName": "Cannot generate a valid kebab-case name (original: {name})", "error.import.duplicateName": "Batch source contains duplicate skill names: {name}", "error.import.failed": "Import failed", "error.import.rollbackFailed": "Overwrite import rollback failed; backups kept at: {path} ({error})",
        "error.upload.path": "Upload contains an invalid path: {path}", "error.upload.encoding": "Upload encoding is invalid", "error.upload.empty": "Upload is empty", "error.upload.tooMany": "Too many uploaded files; maximum {limit}", "error.upload.tooLarge": "Upload is too large; limit {limit} bytes", "error.upload.archiveTooLarge": "ZIP archive is too large; limit {limit} bytes", "error.upload.duplicate": "Upload contains a duplicate path: {path}", "error.upload.zipInvalid": "ZIP archive could not be extracted",
        "error.trash.notFound": "Trash item not found: {id}", "error.trash.conflict": "Cannot restore because a skill with the same name exists: {name}", "error.trash.invalid": "Invalid trash item path: {id}", "error.trash.projectUnavailable": "The original project is not an active workspace, so this skill cannot be restored: {path}", "error.trash.rollbackFailed": "Move-to-trash rollback failed; unrecovered content was kept at: {path} ({error})",
        "error.state.invalid": "The manager state file could not be read, so overwriting it was refused: {path}",
        "error.create.descriptionRequired": "Skill description is required", "error.create.bodyRequired": "Skill body is required", "error.create.tooLarge": "Skill content is too large", "error.create.conflict": "A skill with the same name already exists: {name}",
        "error.proto.forbidden": "Forbidden mutation request (missing client marker)", "error.proto.forbiddenHost": "Forbidden request origin (invalid host)", "error.proto.contentType": "Content type must be application/json", "error.proto.method": "Method not allowed", "error.proto.unknownAction": "Unknown action", "error.proto.bodyTooLarge": "Request body too large", "error.proto.invalidJson": "Invalid JSON request body", "error.proto.nonJson": "Server returned a non-JSON response (HTTP {status})",
        "diagnostic.frontmatter.missing": "Missing complete YAML frontmatter", "diagnostic.name.missing": "Frontmatter is missing name", "diagnostic.name.invalid": "Skill name is not valid kebab-case: {name}", "diagnostic.description.missing": "Frontmatter is missing description", "diagnostic.invocation.invalid": "Invocation policy value is invalid", "diagnostic.shadowed": "Shadowed by higher-priority source {root}",
        "action.enable": "enable", "action.disable": "disable", "action.create": "create", "action.delete": "delete", "action.restore": "restore", "action.toggle": "enabling or disabling",
        "scope.user": "Global skills", "scope.project": "Project skills", "scope.trash": "Trash", "scope.label": "Skill manager views", "scope.userHint": "Available across projects. Toggles only affect invocation in DSH.", "scope.projectHint": "Applies to the current session’s project. Toggles do not modify other agents’ source files. Import still writes to global DSH.", "project.empty": "The current session has no recognized workspace. Open a session in a workspace.", "filter.status": "Invocation status", "filter.statusAll": "All statuses", "status.shadowedBy": "Overridden by the same skill in {source}", "status.fallback.user": "Currently using the global {source} copy.", "status.fallback.project": "Currently using the project {source} copy.", "root.copilot": "Copilot", "source.selectHint": "Select a source to view its directory or turn the whole source off. Turning a source off only affects invocation in DSH and does not change files.", "import.global": "Import to global DSH", "root.dsh": "DSH skills", "root.agents": "Shared Agent", "root.ccswitch": "CC Switch", "root.projectDsh": "Project DSH", "root.projectAgents": "Project Agent", "root.projectSkills": "Project Skills", "root.codex": "Codex", "root.claude": "Claude", "root.gemini": "Gemini", "root.opencode": "OpenCode", "root.cursor": "Cursor", "root.windsurf": "Windsurf", "root.windsurfUser": "Windsurf home", "root.trae": "Trae", "root.traeCn": "Trae CN", "root.openclaw": "OpenClaw", "root.clawdbot": "OpenClaw (legacy)", "root.roo": "Roo", "root.codebuddy": "CodeBuddy", "root.workbuddy": "WorkBuddy", "root.qoder": "Qoder", "root.qoderCn": "Qoder CN CLI", "root.lingma": "Qoder CN"
      }
    };

    Object.assign(DICT.zh, repositoryLocales.zh);
    Object.assign(DICT.en, repositoryLocales.en);
    var SourceSelect = createSourceSelect(react);
    var useRepositoryUI = createRepositoryUI({ react: react, Modal: Modal, Input: Input, Button: Button, SourceSelect: SourceSelect, api: callApi, headers: MUTATION_HEADERS, translateError: translateError });
    var CSS = `.dssm-sources{display:flex;flex-direction:column;gap:9px}.dssm-source.ant-collapse{background:transparent}.dssm-source .ant-collapse-item{border:0}.dssm-source .ant-collapse-header{align-items:center}.dssm-source-label{display:flex;align-items:center;gap:10px;min-width:0;flex:1}.dssm-source.ant-collapse-borderless>.ant-collapse-item>.ant-collapse-panel>.ant-collapse-body{padding:0}.dssm-source .ant-list{background:transparent}.dssm-source .ant-list .ant-list-item{align-items:center;padding:12px 16px}.dssm-source .ant-list .ant-list-item-action{margin-inline-start:12px}.dssm-source .ant-list .ant-list-item-action>li{padding-inline:0}.dssm-skill-actions{display:flex;align-items:center;gap:8px}.dssm-source{overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#494949);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#2c2c2c)}.dssm-source-head{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 13px}.dssm-source-head-main{display:flex;align-items:center;gap:10px;flex:1;min-width:0;min-height:48px;padding:8px 0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.dssm-source-head-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,var(--dsw-alias-label-primary,#f2f2f2));outline-offset:2px}.dssm-source-head:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}.dssm-source-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#a0a0a0)}.dssm-source-title{font-size:14px;font-weight:650;overflow-wrap:anywhere}.dssm-source-head-main .dssm-count{flex:none}.dssm-source-path{min-width:0;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px}.dssm-source-actions{display:flex;flex:none;align-items:center}.dssm-source-body{border-top:1px solid var(--dsw-alias-border-l1,#3a3a3a)}.dssm-source-body[hidden]{display:none}.dssm-fallback{margin-top:4px;color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-section{box-sizing:border-box;display:flex;width:100%;max-width:820px;min-width:0;margin:0 auto;padding:2px 0 36px;container-type:inline-size;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary,#eeeeee);font-family:inherit}.dssm-head{display:flex;flex-direction:column;align-items:stretch;gap:16px}.dssm-title-block{min-width:0}.dssm-title-row{display:flex;align-items:center;gap:8px 12px;min-width:0;flex-wrap:wrap}.dssm-feedback-links{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dssm-title{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.4px;white-space:nowrap}.dssm-desc{margin:12px 0 0;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:14px;line-height:22px}.dssm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-left:0;flex:none}.dssm-upload-link:focus-visible,.dssm-file-remove:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,var(--dsw-alias-label-primary,#f2f2f2));outline-offset:2px}.dssm-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#494949);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#2c2c2c)}.dssm-stat{padding:12px 14px;border-right:1px solid var(--dsw-alias-border-l1,#3a3a3a);font-size:13px;color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-stat:last-child{border-right:0}.dssm-stat strong{margin-right:5px;color:var(--dsw-alias-label-primary,#eeeeee);font-size:17px;font-weight:680}.dssm-filters{display:flex;align-items:center;gap:9px}.dssm-filters .dssm-search{flex:0 1 240px;min-width:140px;margin-left:auto}.dssm-source-filter,.dssm-status-filter{width:auto;flex:none}.dssm-antd-select{width:max-content;min-width:8em}.dssm-count{color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px}.dssm-name{overflow-wrap:anywhere;font-size:13px;font-weight:570}.dssm-note{overflow-wrap:anywhere;margin-top:2px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:11px;line-height:17px}.dssm-enabled{color:var(--dsw-alias-state-success-primary,#51b976);font-size:12px;white-space:nowrap}.dssm-disabled{color:var(--dsw-alias-state-warn-primary,#d49245);font-size:12px;white-space:nowrap}.dssm-shadowed{color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;white-space:nowrap}.dssm-trash-count{padding:2px 7px;border-radius:99px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:11px}.dssm-empty{padding:25px 14px;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;text-align:center}.dssm-feedback{padding:9px 11px;border:1px solid var(--dsw-alias-border-l2,#494949);border-radius:8px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:12px}.dssm-warning{border-color:var(--dsw-alias-state-warn-primary,#d49245);color:var(--dsw-alias-state-warn-primary,#d49245)}.dssm-error{border-color:var(--dsw-alias-state-error-primary,#ef7272);color:var(--dsw-alias-state-error-primary,#ef7272)}.dssm-form,.dssm-field,.dssm-detail-section{display:flex;flex-direction:column}.dssm-form{gap:12px}.dssm-detail{display:flex;flex-direction:column;gap:12px;min-width:0}.dssm-detail .dssm-desc{margin:0}.dssm-field{gap:6px}.dssm-label{font-size:12px;color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-detail-title{font-size:14px;line-height:22px;font-weight:650}.dssm-help{margin:0;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px;line-height:18px}.dssm-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}.dssm-hidden-input{display:none}.dssm-dropzone{box-sizing:border-box;display:flex;width:100%;min-height:170px;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:22px;border:1px dashed var(--dsw-alias-border-l3,#555555);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#252525);color:var(--dsw-alias-label-secondary,#b9b9b9);transition:border-color 180ms ease,background 180ms ease}.dssm-dropzone:hover,.dssm-dropzone-active{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-label-primary,#f2f2f2));background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}.dssm-dropzone-title{color:var(--dsw-alias-label-primary,#eeeeee);font-size:14px;font-weight:620}.dssm-dropzone-copy{font-size:12px;line-height:18px;text-align:center}.dssm-upload-choices{display:flex;align-items:center;gap:7px}.dssm-upload-link,.dssm-file-remove{padding:0;border:0;background:transparent;font:inherit;font-size:12px;cursor:pointer}.dssm-upload-link{color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-upload-link:hover{color:var(--dsw-alias-label-primary,#eeeeee);text-decoration:underline}.dssm-upload-link:disabled{opacity:.45;cursor:default}.dssm-upload-divider{color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px}.dssm-file{display:flex;align-items:center;gap:9px;padding:10px 11px;border:1px solid var(--dsw-alias-border-l2,#494949);border-radius:9px;background:var(--dsw-alias-bg-layer-1,#252525);color:var(--dsw-alias-label-primary,#eeeeee);font-size:12px}.dssm-file-kind{display:inline-flex;min-width:30px;height:24px;align-items:center;justify-content:center;border-radius:5px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:9px;font-weight:700}.dssm-file-name{min-width:0;overflow:hidden;flex:1;text-overflow:ellipsis;white-space:nowrap}.dssm-file-meta{color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px;white-space:nowrap}.dssm-file-remove{width:24px;height:24px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:18px}.dssm-upload-requirements{padding:1px 1px 0}.dssm-upload-requirements ul{display:flex;margin:7px 0 0;padding-left:18px;flex-direction:column;gap:5px;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px;line-height:17px}.dssm-detail-section{gap:7px}.dssm-detail-path{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:14px;line-height:22px}.dssm-detail-section .dssm-note,.dssm-diag{font-size:14px;line-height:22px}.dssm-detail-path{padding:8px 10px;border-radius:7px;background:var(--dsw-alias-bg-layer-1,#252525);color:var(--dsw-alias-label-secondary,#b9b9b9);word-break:break-all}.dssm-diag{padding:8px 10px;border-left:2px solid var(--dsw-alias-state-warn-primary,#d49245);background:var(--dsw-alias-bg-layer-1,#252525);color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-trash-panel{display:flex;flex-direction:column;gap:8px}.dssm-trash-item{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#3a3a3a)}.dssm-trash-item:last-child{border-bottom:0}.dssm-trash-main{min-width:0;flex:1}
@container(max-width:780px){.dssm-source-path{display:none}}@media(max-width:760px){.dssm-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.dssm-title-row{flex-wrap:wrap}}@container(max-width:520px){.dssm-trash-item{flex-wrap:wrap}.dssm-trash-main{flex-basis:100%}.dssm-head{flex-direction:column}.dssm-actions{width:100%;margin-left:0}.dssm-actions button{flex:1}.dssm-summary{grid-template-columns:1fr}}.dssm-row-state{display:flex;align-items:center;justify-content:flex-end;gap:8px}.dssm-row-meta{min-width:0;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;line-height:18px}.dssm-row-source{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.dssm-row-source a{color:inherit;overflow-wrap:anywhere;text-decoration:none}.dssm-row-source a:hover{text-decoration:underline;color:var(--dsw-alias-label-primary,#eeeeee)}

`;

    function translateOrFallback(t: Translate, key: string, fallback: string, params?: object) { var value = t(key, params); return typeof value === "string" && value !== key ? value : fallback; }
    function translateError(t: Translate, payload: unknown): string {
      if (payload instanceof Error && !(payload as CodedError).code) return payload.message;
      if (payload && typeof payload === "object") {
        const item = payload as Diagnostic & {message?: unknown};
        if (item.code) { var params = Object.assign({}, item.params || {}); if (params.action) params.action = translateOrFallback(t, "action." + params.action, String(params.action)); var translated = t(item.code, params); if (typeof translated === "string" && translated !== item.code) return translated; }
        if (item.error !== undefined) return translateError(t, item.error); if (item.message !== undefined) return String(item.message);
      }
      return String(payload == null ? "" : payload);
    }
    function parseApiResponse<T = unknown>(response: Response): Promise<T> { return response.json().catch(function () { var error: CodedError = new Error("non-json response"); error.code = "error.proto.nonJson"; error.params = { status: response.status }; throw error; }).then(function (value: unknown) { const payload = value as {ok?: boolean; data: T}; if (!response.ok || payload.ok === false) throw payload; return payload.data; }); }
    function callApi<K extends keyof ApiRoutes>(path: K, options?: RequestInit): Promise<ApiRoutes[K]> { return fetch("/api/dsh-skills-manager" + path, options).then(parseApiResponse<ApiRoutes[K]>); }
    function isSkillEnabled(skill: Partial<SkillView>): boolean { if (skill.enabled !== undefined) return skill.enabled === true; return !!(skill.invocationPolicyValid && skill.modelInvocable && skill.userInvocable && skill.managerEnabled !== false); }
    function countKey(key: string, count: number) { return key + (Number(count) === 1 ? ".one" : ".other"); }
    function formatTrashTime(t: Translate, value: string) { return new Date(value).toLocaleString(t("format.locale")); }
    function rootDisplayName(t: Translate, root: SkillRoot) { var base = translateOrFallback(t, "root." + (root.localeKey || root.kind || root.key), root.label); return root.projectName ? base + " · " + root.projectName : base; }
    function summarizeImportResult(t: Translate, data: ImportResult) {
      var importedItems = data && data.imported || [];
      var imported = importedItems.map(function (item) { return item.name; });
      var skipped = (data && data.skipped || []).map(function (item) { return item.name; });
      var warnings: string[] = [];
      importedItems.forEach(function (item) {
        (item.warnings || []).forEach(function (warning) { warnings.push(translateError(t, warning)); });
      });
      var summary;
      if (imported.length && skipped.length) summary = { ok: true, warning: true, imported: true, text: t("result.importPartial", { imported: imported.join(", "), skipped: skipped.join(", ") }) };
      else if (imported.length) summary = { ok: true, warning: false, imported: true, text: t("result.imported", { names: imported.join(", ") }) };
      else if (skipped.length) summary = { ok: false, warning: true, imported: false, text: t("result.importSkipped", { names: skipped.join(", ") }) };
      else summary = { ok: false, warning: false, imported: false, text: t("result.importEmpty") };
      if (warnings.length) {
        summary.warning = true;
        summary.text = t("result.importWarnings", { result: summary.text, warnings: warnings.join(t("format.warningSeparator")) });
      }
      return summary;
    }
    function normalizeSkillQuery(query: unknown) { return String(query == null ? "" : query).trim().toLowerCase(); }
    function matchSkillQuery(skill: SearchSkill, query: unknown) { var q = normalizeSkillQuery(query); if (!q) return true; return [skill.name, skill.declaredName, skill.description, skill.kind, skill.kindLabel, skill.statusLabel, skill.rootKey, skill.rootLabel].some(function (value) { return String(value == null ? "" : value).toLowerCase().includes(q); }); }
    function filterSkills<T extends SearchSkill>(list: T[], options?: {rootKey?: string; query?: unknown}) { var rootKey = options && options.rootKey != null ? options.rootKey : ""; return list.filter(function (skill) { return (!rootKey || skill.rootKey === rootKey) && matchSkillQuery(skill, options && options.query); }); }
    function visibleSkillRoots<T extends {mutable?: boolean; exists?: boolean}>(roots: T[]) { return (roots || []).filter(function (root) { return root.mutable || root.exists !== false; }); }
    function skillStatus(skill: Partial<SkillView>) { return skill.shadowedBy ? "shadowed" : skill.loadable === false ? "invalid" : isSkillEnabled(skill) ? "enabled" : "disabled"; }
    function countSkillStatuses(list: {skill: Partial<SkillView>}[]) {
      var summary: Record<string, number> = { total: list.length, enabled: 0, disabled: 0, shadowed: 0, invalid: 0 };
      list.forEach(function (row) { summary[skillStatus(row.skill)]++; });
      return summary;
    }
    function canToggleSource(root: Partial<SkillRoot> | null | undefined) { return !!(root && root.toggleable !== false && root.key !== "dsh" && root.kind !== "project-dsh"); }
    // 先限制作用域和项目，再筛选条目，避免同名技能跨项目混入当前列表。
    function scopeSkillRoots(roots: RootView[], scope: string, project?: string) { return visibleSkillRoots(roots).filter(function (root) { return scope === "project" ? root.scope === "project" && root.projectRoot === project : root.scope !== "project"; }); }
    var MAX_UPLOAD_ARCHIVE_BYTES = 32 << 20, MAX_UPLOAD_ENTRY_BYTES = 32 << 20, MAX_UPLOAD_TOTAL_BYTES = 64 << 20, MAX_UPLOAD_ENTRIES = 1000;
    function uploadFilePath(file: UploadFile) { return String(file && (file._dssmPath || file.webkitRelativePath || file.name) || "").replace(/\\/g, "/"); }
    function inspectUploadSelection(files: ArrayLike<UploadFile> | null): SelectionResult | null {
      var list = Array.from(files || []); if (!list.length) return null;
      if (list.length > MAX_UPLOAD_ENTRIES) return { error: { code: "error.upload.tooMany", params: { limit: MAX_UPLOAD_ENTRIES } } };
      var relative = list.some(function (file) { return uploadFilePath(file).includes("/"); });
      if (relative) {
        if (!list.some(function (file) { return /(^|\/)skill\.md$/i.test(uploadFilePath(file)); })) return { error: { code: "select.folder.invalid" } };
        var oversized = list.find(function (file) { return Number(file.size || 0) > MAX_UPLOAD_ENTRY_BYTES; });
        if (oversized) return { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_ENTRY_BYTES } } };
        var total = list.reduce(function (sum, file) { return sum + Number(file.size || 0); }, 0);
        if (total > MAX_UPLOAD_TOTAL_BYTES) return { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_TOTAL_BYTES } } };
        return { kind: "folder", name: uploadFilePath(list[0]).split("/")[0], files: list, count: list.length, size: total };
      }
      if (list.length !== 1) return { error: { code: "select.file.invalid" } };
      var name = String(list[0].name || ""), lower = name.toLowerCase();
      var size = Number(list[0].size || 0);
      if (lower === "skill.md") return size > MAX_UPLOAD_ENTRY_BYTES ? { error: { code: "error.upload.tooLarge", params: { limit: MAX_UPLOAD_ENTRY_BYTES } } } : { kind: "skill", name: name, files: list, count: 1, size: size };
      if (lower.endsWith(".zip")) return size > MAX_UPLOAD_ARCHIVE_BYTES ? { error: { code: "error.upload.archiveTooLarge", params: { limit: MAX_UPLOAD_ARCHIVE_BYTES } } } : { kind: "zip", name: name, files: list, count: 1, size: size };
      return { error: { code: "select.file.invalid" } };
    }
    function bytesToBase64(buffer: ArrayBuffer) { var bytes = new Uint8Array(buffer), binary = "", chunk = 0x8000; for (var i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length))); return btoa(binary); }
    function buildUploadPayload(selection: UploadSelection) { return Promise.all(selection.files.map(function (file) { return file.arrayBuffer().then(function (buffer) { return { path: uploadFilePath(file), data: bytesToBase64(buffer) }; }); })).then(function (entries) { return selection.kind === "zip" ? { name: selection.name, zip: entries[0].data } : { name: selection.name, entries: entries }; }); }
    function readDroppedEntry(entry: FileSystemEntry, prefix: string, output: UploadFile[]): Promise<void> { if (entry.isFile) return new Promise<void>(function (resolve, reject) { (entry as FileSystemFileEntry).file(function (file: UploadFile) { file._dssmPath = prefix + file.name; output.push(file); resolve(); }, reject); }); if (!entry.isDirectory) return Promise.resolve(); return new Promise<void>(function (resolve, reject) { var reader = (entry as FileSystemDirectoryEntry).createReader(), children: FileSystemEntry[] = []; function next() { reader.readEntries(function (batch) { if (!batch.length) { Promise.all(children.map(function (child) { return readDroppedEntry(child, prefix + entry.name + "/", output); })).then(function () { resolve(); }, reject); return; } children = children.concat(batch); next(); }, reject); } next(); }); }
    function droppedFiles(dataTransfer: DataTransfer) { var items = Array.from(dataTransfer && dataTransfer.items || []), entries = items.map(function (item) { return item.webkitGetAsEntry && item.webkitGetAsEntry(); }).filter((entry): entry is FileSystemEntry => !!entry); if (!entries.length) return Promise.resolve(Array.from(dataTransfer && dataTransfer.files || [])); var files: UploadFile[] = []; return Promise.all(entries.map(function (entry) { return readDroppedEntry(entry, "", files); })).then(function () { return files; }); }
    function modalFocusable(modal: HTMLElement): HTMLElement[] { return Array.prototype.slice.call(modal.querySelectorAll("button:not(:disabled), [href], input:not([type=hidden]):not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex=\"-1\"])") || []); }
    function trapModalFocus(modal: HTMLElement, event: Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">) { if (event.key !== "Tab") return; var focusable = modalFocusable(modal); if (!focusable.length) return; var active = document.activeElement; if (active === modal || !modal.contains(active) || (event.shiftKey ? active === focusable[0] : active === focusable[focusable.length - 1])) { event.preventDefault(); (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus(); } }
    function SkillSwitch(props: {on: boolean; label: string; disabled?: boolean; onClick: () => void}) {
      return h(AntdSwitch as React.ComponentType<Record<string, unknown>>, { checked: props.on, disabled: props.disabled, "aria-label": props.label, onChange: function () { props.onClick(); } });
    }
    function hostTag(label: React.ReactNode) { return h(AntdTag, null, label); }
    function hostButton(label: React.ReactNode, onClick: () => void, kind: "primary" | "outline" | "quiet" | "danger" = "primary", disabled?: boolean) {
      return h(Button, { type: kind === "primary" ? "primary" : "default", danger: kind === "danger", disabled: disabled, onClick: onClick }, label);
    }
    function GithubMark16() { return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: "false" }, h("path", { fill: "currentColor", d: "M8 0a8 8 0 0 0-2.53 15.59c.4.074.547-.173.547-.385 0-.19-.007-.693-.01-1.36-2.226.484-2.695-1.073-2.695-1.073-.364-.924-.89-1.17-.89-1.17-.726-.496.055-.486.055-.486.803.056 1.225.824 1.225.824.714 1.223 1.872.87 2.328.665.072-.517.28-.87.508-1.07-1.777-.202-3.645-.888-3.645-3.956 0-.874.31-1.588.823-2.148-.083-.202-.357-1.017.078-2.12 0 0 .672-.215 2.2.82A7.65 7.65 0 0 1 8 4.8c.68.003 1.365.092 2.004.27 1.527-1.035 2.197-.82 2.197-.82.437 1.103.162 1.918.08 2.12.513.56.822 1.274.822 2.148 0 3.076-1.872 3.752-3.654 3.95.288.248.544.735.544 1.482 0 1.07-.01 1.932-.01 2.195 0 .214.144.463.55.384A8.001 8.001 0 0 0 8 0Z" })); }
    // 禁用提交按钮会让浏览器把焦点丢到 body；下一次渲染恢复焦点，避免 Escape 传到宿主设置。
    function recoverModalFocus(modal: HTMLElement | null, active: Element | null, body: HTMLElement) { if (modal && active === body) modal.focus(); }
    function Modal(props: ModalProps) {
      var bodyRef = react.useRef<HTMLDivElement>(null);
      var closeRef = react.useRef(props.onClose);
      closeRef.current = props.onClose;
      function focusPanel() {
        var panel = bodyRef.current;
        if (!panel) return;
        var field = panel.querySelector("input, textarea");
        if (field instanceof HTMLElement) { field.focus(); return; }
        panel.tabIndex = -1;
        panel.focus();
      }
      react.useLayoutEffect(function () {
        if (typeof document === "undefined") return;
        var panel = bodyRef.current;
        if (panel) recoverModalFocus(panel, document.activeElement, document.body);
      });
      react.useEffect(function () {
        if (typeof document === "undefined") return;
        function onKey(event: KeyboardEvent) {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopImmediatePropagation();
          closeRef.current();
        }
        document.addEventListener("keydown", onKey, true);
        return function () { document.removeEventListener("keydown", onKey, true); };
      }, []);
      return h(AntdModal, { open: true, title: props.title, onCancel: props.onClose, footer: null, keyboard: false, destroyOnHidden: true, width: props.wide ? 720 : props.className === "dssm-modal-import" ? 480 : 560, afterOpenChange: function (open: boolean) { if (open) focusPanel(); } }, h("div", { ref: bodyRef }, props.children));
    }

    function currentSessionId(snapshot?: SessionSnapshot) {
      if (!snapshot) return undefined;
      if (typeof snapshot.current === "string" && snapshot.current) return snapshot.current;
      var byId = snapshot.byId || {};
      var ids = Array.isArray(snapshot.ids) && snapshot.ids.length ? snapshot.ids : Object.keys(byId);
      for (var i = 0; i < ids.length; i++) {
        var row = byId[ids[i]];
        if (row && row.retainedBy && row.retainedBy.mainView) return ids[i];
      }
      for (var id in byId) {
        if (ids.indexOf(id) !== -1) continue;
        if (byId[id] && byId[id].retainedBy && byId[id].retainedBy!.mainView) return id;
      }
    }
    function SkillManagerSection(props: SectionProps) {
      var sessionId = props.useSessions ? props.useSessions(currentSessionId) : undefined;
      var scopes = react.useState("user"), filtersState = react.useState<Record<string, Filters>>({}), expandedState = react.useState<Record<string, boolean>>({});
      // 按会话重挂载请求和表单状态，旧会话的异步响应不能覆盖新会话页面。
      return h(SkillManagerView, Object.assign({}, props, { key: sessionId || "no-session", sessionId: sessionId, scope: scopes[0], setScope: scopes[1], savedFilters: filtersState[0], setSavedFilters: filtersState[1], expanded: expandedState[0], setExpanded: expandedState[1] }));
    }
    function SkillManagerView(props: ViewProps) {
      var t = props.t;
      function sessionApi<K extends keyof ApiRoutes>(path: K, options?: RequestInit): Promise<ApiRoutes[K]> {
        var headers: Record<string, string> = Object.fromEntries(new Headers(options?.headers).entries());
        if (props.sessionId) headers["x-dsh-skills-session"] = props.sessionId;
        return callApi(path, Object.assign({}, options, { headers: headers }));
      }
      var ss = react.useState<{loading: boolean; error: string | null; data: ManagerSnapshot | null}>({ loading: true, error: null, data: null }), snapshot = ss[0], setSnapshot = ss[1];
      var bs = react.useState(false), busy = bs[0], setBusy = bs[1];
      var scope = props.scope, setScope = props.setScope;
      var expanded = props.expanded, setExpanded = props.setExpanded, savedFilters = props.savedFilters, setSavedFilters = props.setSavedFilters;
      var ms = react.useState<ModalState>(null), modal = ms[0], setModal = ms[1];
      var rs = react.useState<ResultMessage | null>(null), result = rs[0] && rs[0].scope === scope ? rs[0] : null;
      // 异步操作保留发起时的页签，完成提示不能泄漏到后来切换的页面。
      function setResult(value: ResultMessage | null) { rs[1](value ? Object.assign({}, value, { scope: scope }) : null); }
      var fms = react.useState<Record<string, string>>({ root: "dsh", name: "", description: "", body: "" }), form = fms[0], setForm = fms[1];
      var us = react.useState<UploadSelection | null>(null), upload = us[0], setUpload = us[1];
      var ds = react.useState<Detail | null>(null), detail = ds[0], setDetail = ds[1];
      var inflightRef = react.useRef(false);
      var importInputRef = react.useRef<HTMLInputElement>(null);
      var folderInputRef = react.useRef<HTMLInputElement>(null);
      var pickerOpenRef = react.useRef(false);
      function refresh(silent: boolean) { if (!silent) setSnapshot({ loading: true, error: null, data: snapshot.data }); return sessionApi("/state").then(function (data) { setSnapshot({ loading: false, error: null, data: data }); return data; }).catch(function (error) { setSnapshot({ loading: false, error: translateError(t, error), data: snapshot.data }); }); }
      react.useEffect(function () { refresh(false); }, []);
      function post<K extends keyof ApiRoutes>(path: K, body: unknown, successKey?: string | null, successParams?: object): Promise<ApiRoutes[K]> { if (inflightRef.current) return Promise.reject({ error: "operation already in progress" }); inflightRef.current = true; setBusy(true); setResult(null); return sessionApi(path, { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(body || {}) }).then(function (data) { setResult({ ok: true, text: successKey ? t(successKey, successParams || data || {}) : t("result.updated") }); return refresh(true).then(function () { return data; }); }).catch(function (error) { setResult({ ok: false, text: t("error.action", { error: translateError(t, error) }) }); throw error; }).finally(function () { inflightRef.current = false; setBusy(false); }); }
      function openDetail(root: RootView, skill: SkillView) { setBusy(true); setDetail(null); setModal("detail"); sessionApi("/detail", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ root: root.key, name: skill.name }) }).then(setDetail).catch(function (error) { setResult({ ok: false, text: t("error.action", { error: translateError(t, error) }) }); setModal(null); }).finally(function () { setBusy(false); }); }
      function updateForm(key: string, value: string) { setForm(Object.assign({}, form, { [key]: value })); }
      function submitCreate() { post("/create", form, null).then(function (data) { setModal(null); setForm({ root: "dsh", name: "", description: "", body: "" }); setResult({ ok: true, text: t("result.created", { name: data.name }) }); }).catch(function () {}); }
      function selectUploadFiles(files: ArrayLike<UploadFile> | null) { pickerOpenRef.current = false; var selected = inspectUploadSelection(files); if (!selected) return; if (selected.error) { setUpload(null); setResult({ ok: false, text: translateError(t, selected.error) }); return; } setUpload(selected); setResult(null); }
      function openNativePicker(ref: React.RefObject<HTMLInputElement>) { if (busy || pickerOpenRef.current || !ref.current) return; pickerOpenRef.current = true; ref.current.value = ""; function release() { setTimeout(function () { pickerOpenRef.current = false; }, 0); } window.addEventListener("focus", release, { once: true }); ref.current.click(); setTimeout(function () { pickerOpenRef.current = false; }, 30000); }
      function submitImport() { if (!upload) return; buildUploadPayload(upload).then(function (payload) { return post("/upload", payload, null); }).then(function (data) { var summary = summarizeImportResult(t, data); setResult({ ok: summary.ok, warning: summary.warning, text: summary.text }); if (summary.imported) { setModal(null); setUpload(null); } }).catch(function () {}); }
      var data = snapshot.data || { roots: [], projects: [], trash: [], warnings: [] }, allRoots = data.roots || [], projects = data.projects || [];
      var activeProject = projects.length === 1 ? projects[0].root : "";
      var filterKey = scope === "project" ? "project:" + activeProject : "user", filters = savedFilters[filterKey] || { query: "", source: "", status: "" }, query = filters.query, source = filters.source;
      function updateFilter(key: string, value: string) { setSavedFilters(function (previous) { return Object.assign({}, previous, { [filterKey]: Object.assign({}, filters, { [key]: value }) }); }); }
      function setQuery(value: string) { updateFilter("query", value); }
      function setSource(value: string) { updateFilter("source", value); }
      var roots = scope === "trash" ? [] : scopeSkillRoots(allRoots, scope, activeProject), activeSource = roots.some(function (root) { return root.key === source; }) ? source : "";
      var createRoot = allRoots.find(function (root) { return root.key === "dsh" && root.mutable === true; });
      function openCreate() { if (!createRoot) return; setForm(Object.assign({}, form, { root: "dsh" })); setModal("create"); }
      function trashRootLabel(item: TrashItem) { return item.root && item.root.scope === "project" ? t("root.projectDsh") + " · " + (item.root.projectName || item.root.projectRoot) : translateOrFallback(t, "root." + (item.root?.localeKey || item.root?.key || "dsh"), item.root?.label || t("root.dsh")); }
      var options = [{ value: "", label: t("filter.all") }].concat(roots.map(function (root) { return { value: root.key, label: t("filter.option", { name: rootDisplayName(t, root), count: root.skills.length }) }; }));

      function renderFallback(skill: SkillView) {
        if (!skill.fallbackTo) return null;
        var target = allRoots.find(function (root) { return root.key === skill.fallbackTo!.root; });
        if (!target) return null;
        return h("div", { className: "dssm-note dssm-fallback" }, t("status.fallback." + skill.fallbackTo.scope, { source: rootDisplayName(t, target) }));
      }
      function renderSkill(root: RootView, skill: SkillView) {
        var enabled = isSkillEnabled(skill);
        var showSwitch = root.toggleable !== false;
        var statusKey = skill.shadowedBy ? "status.shadowed" : skill.loadable === false ? "status.invalid" : enabled ? "status.enabled" : "status.disabled";
        var cls = skill.shadowedBy ? "dssm-shadowed" : enabled ? "dssm-enabled" : "dssm-disabled";
        var showStatus = !showSwitch || !!skill.shadowedBy || skill.loadable === false;
        var menu = [];
        if (skill.installSource) menu.push({ value: "update", label: t("repo.manageUpdate") });
        if (root.mutable) menu.push({ value: "trash", label: t("btn.trash"), danger: true });
        var statusTitle = skill.shadowedBy ? t("status.shadowedBy", { source: (function () { var winner = allRoots.find(function (item) { return item.key === skill.shadowedBy!.root; }); return winner ? rootDisplayName(t, winner) : skill.shadowedBy!.root; })() }) : undefined;
        var skillActions: React.ReactNode[] = [
          hostButton(t("btn.detail"), function () { openDetail(root, skill); }, "quiet"),
        ];
        if (menu.length) skillActions.push(h(SourceSelect, { action: true, label: t("btn.more"), disabled: busy, options: menu, onChange: function (action) {
          if (action === "update") { repositoryUI.focusSource(skill.installSource!, skill.name); setScope("repositories"); }
          if (action === "trash") setModal({ type: "trash-confirm", root: root.key, name: skill.name });
        } }));
        skillActions.push(h("div", { className: "dssm-row-state" }, showStatus ? h("span", { className: "dssm-status " + cls, title: statusTitle }, t(statusKey)) : null, showSwitch ? h(SkillSwitch, { on: enabled, disabled: busy || root.enabled === false || skill.loadable === false, label: t("skill.toggle") + " " + skill.name, onClick: function () { post(enabled ? "/disable" : "/enable", { root: root.key, name: skill.name }); } }) : null));
        var skillName = skill.declaredName || skill.name;
        var nameNode = h("div", { className: "dssm-name" }, skillName);
        return h(List.Item, { key: root.key + ":" + skill.name, actions: [h("div", { className: "dssm-skill-actions" }, skillActions)] }, h(List.Item.Meta, {
          title: skill.description ? h(Tooltip, { title: skill.description }, nameNode) : nameNode,
          description: h("div", { className: "dssm-row-meta" }, h("div", { className: "dssm-row-source" }, skill.installSource ? h("a", { href: "https://github.com/" + skill.installSource.owner + "/" + skill.installSource.name, target: "_blank", rel: "noreferrer", title: t("repo.source") }, skill.installSource.owner + "/" + skill.installSource.name) : t("repo.local"), !root.mutable ? hostTag(t("status.readonly")) : null), renderFallback(skill)),
        }));
      }
      var rows = roots.flatMap(function (root) { return (root.skills || []).map(function (skill) { return { root: root, skill: skill }; }); });
      var filteredRows = rows.filter(function (row) { return (!activeSource || row.root.key === activeSource) && (!filters.status || skillStatus(row.skill) === filters.status) && matchSkillQuery(Object.assign({}, row.skill, { rootLabel: rootDisplayName(t, row.root) }), query); });
      var summary = countSkillStatuses(rows);
      function renderRoot(root: RootView) {
        var filtered = filteredRows.filter(function (row) { return row.root.key === root.key; });
        if (activeSource && root.key !== activeSource || (query || filters.status) && !filtered.length) return null;
        var expansionKey = JSON.stringify([filterKey, root.key, query, activeSource, filters.status]);
        var open = expanded[expansionKey] === undefined ? !!(query || activeSource || filters.status) : expanded[expansionKey];
        var displayName = rootDisplayName(t, root);
        return h(Collapse, {
          key: root.key, className: "dssm-source", bordered: false, styles: { body: { padding: 0 } }, activeKey: open ? [root.key] : [],
          onChange: function (keys: string[]) { setExpanded(function (previous) { return Object.assign({}, previous, { [expansionKey]: keys.indexOf(root.key) !== -1 }); }); },
          items: [{
            key: root.key,
            label: h("div", { className: "dssm-source-label" }, h("span", { className: "dssm-source-title" }, displayName), h("span", { className: "dssm-count" }, t(countKey("summary.group", filtered.length), { count: filtered.length })), h("span", { className: "dssm-source-path", title: root.path }, root.path)),
            extra: canToggleSource(root) ? h("span", { className: "dssm-source-actions", onClick: function (event: React.MouseEvent) { event.stopPropagation(); } }, h(SkillSwitch, { on: root.enabled, disabled: busy, label: t("source.toggle") + " " + displayName, onClick: function () { post(root.enabled ? "/source-disable" : "/source-enable", { root: root.key }); } })) : null,
            children: open ? filtered.length ? h(List, { split: false }, filtered.map(function (row) { return renderSkill(root, row.skill); })) : h("div", { className: "dssm-empty" }, t("empty.source")) : null,
          }],
        });
      }
      function renderList() {
        var groups = roots.map(renderRoot).filter(Boolean);
        return h("div", { key: "sources", id: "dssm-scope-panel", role: "tabpanel", "aria-labelledby": "dssm-tab-" + scope, className: "dssm-sources" }, groups.length ? groups : h("div", { className: "dssm-empty" }, scope === "project" && !activeProject ? t("project.empty") : query || filters.status ? t("empty.search") : t("empty.source")));
      }
      function renderTrash() { return h("div", { key: "trash", id: "dssm-scope-panel", role: "tabpanel", "aria-labelledby": "dssm-tab-trash", className: "dssm-trash-panel" }, h("div", { className: "dssm-count" }, t(countKey("trash.count", data.trash.length), { count: data.trash.length })), data.trash.length ? data.trash.map(function (item) { return h("div", { key: item.id, className: "dssm-trash-item" }, h("div", { className: "dssm-trash-main" }, h("div", { className: "dssm-name" }, item.name), h("div", { className: "dssm-note" }, t("trash.deletedAt", { time: formatTrashTime(t, item.deletedAt) }) + " · " + t("trash.source", { source: trashRootLabel(item) }))), hostButton(t("btn.restore"), function () { post("/trash-restore", { id: item.id }, "result.restored", { name: item.name }).catch(function () {}); }, "quiet", busy), hostButton(t("btn.delete.forever"), function () { setModal({ type: "delete-confirm", id: item.id, name: item.name }); }, "danger", busy)); }) : h("div", { className: "dssm-empty" }, t("trash.empty"))); }
      var repositoryUI = useRepositoryUI({ active: scope === "repositories", t: t, onInstalled: function () { return refresh(false); } });
      var tabItems = ["user", "project", "trash", "repositories"].map(function (value) { var text = t("scope." + value); var count = value === "trash" ? (data.trash || []).length : 0; return { value: value, id: "dssm-tab-" + value, panelId: "dssm-scope-panel", label: count > 0 ? [text, h("span", { className: "dssm-trash-count" }, count)] : text }; });
      var tabs = h(Segmented, { key: "tabs", block: true, "aria-label": t("scope.label"), value: scope, onChange: function (value: string | number) { setScope(String(value)); }, options: tabItems.map(function (item) { return { value: item.value, label: item.label }; }) });
      var skillControls = [ h("div", { key: "summary", className: "dssm-summary" }, [["total", "summary.total"], ["enabled", "summary.enabled"], ["disabled", "summary.disabled"], ["invalid", "summary.invalid"]].map(function (item) { return h("div", { key: item[1], className: "dssm-stat" }, h("strong", null, summary[item[0]]), t(countKey(item[1], summary[item[0]]), { count: summary[item[0]] }).replace(String(summary[item[0]]), "")); })), h("div", { key: "filters", className: "dssm-filters" }, h("div", { className: "dssm-source-filter" }, h(SourceSelect, { value: activeSource, label: t("filter.source"), options: options, onChange: setSource })), h("div", { className: "dssm-status-filter" }, h(SourceSelect, { value: filters.status, label: t("filter.status"), options: [{ value: "", label: t("filter.statusAll") }].concat(["enabled", "disabled", "shadowed", "invalid"].map(function (value) { return { value: value, label: t("status." + value) }; })), onChange: function (value) { updateFilter("status", value); } })), h(Input, { className: "dssm-search", allowClear: true, value: query, "aria-label": t("search"), placeholder: t("search.placeholder"), onChange: function (e) { setQuery(e.target.value); } }))];
      var content: React.ReactNode[] = ([h("style", { key: "css" }, CSS), h("div", { key: "head", className: "dssm-head" }, h("div", { className: "dssm-title-block" }, h("div", { className: "dssm-title-row" }, h("h2", { className: "dssm-title" }, t("title")), h("div", { className: "dssm-feedback-links" }, h(Button, { size: "small", shape: "default", href: "https://github.com/MichengAI/dsh-skills-manager", target: "_blank", rel: "noreferrer", "aria-label": t("link.project"), icon: h(GithubMark16) }, t("link.project")), h(Button, { size: "small", shape: "default", href: "https://github.com/MichengAI/dsh-skills-manager/issues", target: "_blank", rel: "noreferrer", "aria-label": t("link.feedback"), icon: h(FeedbackIcon) }, t("link.feedback")))), h("p", { className: "dssm-desc" }, t("desc")))), tabs, scope === "repositories" ? repositoryUI.actions : h("div", { key: "actions", className: "dssm-actions" }, hostButton(t("btn.refresh"), function () { refresh(false); }, "outline", busy || snapshot.loading), scope !== "trash" ? hostButton(t("btn.create"), openCreate, "primary", busy || !createRoot) : null, scope !== "trash" ? hostButton(t("import.global"), function () { setResult(null); setUpload(null); setModal("import"); }, "outline") : null)] as React.ReactNode[]).concat(scope === "trash" || scope === "repositories" ? [] : skillControls, [result && modal !== "import" ? h("div", { key: "result", className: "dssm-feedback" + (result.warning ? " dssm-warning" : result.ok ? "" : " dssm-error") }, result.text) : null], (data.warnings || []).map(function (warning, index) { return h("div", { key: "warning-" + index, className: "dssm-feedback dssm-warning", role: "alert" }, translateError(t, warning)); }), [snapshot.error ? h("div", { key: "error", className: "dssm-feedback dssm-error" }, snapshot.error) : null, snapshot.loading && !snapshot.data ? h("div", { key: "loading", className: "dssm-empty" }, t("loading")) : scope === "repositories" ? repositoryUI.content : scope === "trash" ? renderTrash() : renderList()]);

      if (modal === "create") content.push(h(Modal, { key: "create", title: t("create.title"), closeLabel: t("btn.close"), onClose: function () { setModal(null); } }, h("div", { className: "dssm-form" }, h("label", { className: "dssm-field" }, h("span", { className: "dssm-label" }, t("create.target")), h("div", { className: "dssm-detail-path" }, t("create.globalTarget"), createRoot && createRoot.path ? " · " + createRoot.path : "")), [["name", "create.name", "create.name.placeholder"], ["description", "create.description", "create.description.placeholder"]].map(function (field) { return h("label", { key: field[0], className: "dssm-field" }, h("span", { className: "dssm-label" }, t(field[1])), h(Input, { value: form[field[0]], placeholder: t(field[2]), onChange: function (e) { updateForm(field[0], e.target.value); } })); }), h("label", { className: "dssm-field" }, h("span", { className: "dssm-label" }, t("create.body")), h(Input.TextArea, { rows: 8, value: form.body, placeholder: t("create.body.placeholder"), onChange: function (e) { updateForm("body", e.target.value); } })), h("p", { className: "dssm-help" }, t("create.chat.note"))), h("div", { className: "dssm-modal-actions" }, hostButton(t("btn.cancel"), function () { setModal(null); }, "outline"), hostButton(t("btn.create.now"), submitCreate, "primary", busy || !form.name.trim() || !form.description.trim() || !form.body.trim()))));
      if (modal === "import") content.push(h(Modal, { key: "import", className: "dssm-modal-import", title: t("import.title"), closeLabel: t("btn.close"), onClose: function () { pickerOpenRef.current = false; setUpload(null); setResult(null); setModal(null); } },
        h("input", { ref: importInputRef, className: "dssm-hidden-input", type: "file", accept: ".zip,.md", onChange: function (event) { selectUploadFiles(event.target.files); event.target.value = ""; } }),
        h("input", { ref: folderInputRef, className: "dssm-hidden-input", type: "file", multiple: true, webkitdirectory: "", directory: "", onChange: function (event) { selectUploadFiles(event.target.files); event.target.value = ""; } }),
        h("div", { className: "dssm-dropzone", onDragOver: function (event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); event.currentTarget.classList.add("dssm-dropzone-active"); }, onDragLeave: function (event: React.DragEvent<HTMLDivElement>) { event.currentTarget.classList.remove("dssm-dropzone-active"); }, onDrop: function (event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); event.currentTarget.classList.remove("dssm-dropzone-active"); droppedFiles(event.dataTransfer).then(selectUploadFiles).catch(function (error) { setResult({ ok: false, text: translateError(t, error) }); }); } },
          h("span", { className: "dssm-dropzone-title" }, t("upload.drop.title")),
          h("span", { className: "dssm-dropzone-copy" }, t("upload.drop.copy")),
          h("div", { className: "dssm-upload-choices" }, h("button", { type: "button", className: "dssm-upload-link", disabled: busy, onClick: function (event: React.MouseEvent<HTMLButtonElement>) { event.stopPropagation(); openNativePicker(folderInputRef); } }, t("btn.folder.pick")), h("span", { className: "dssm-upload-divider" }, "/"), h("button", { type: "button", className: "dssm-upload-link", disabled: busy, onClick: function (event: React.MouseEvent<HTMLButtonElement>) { event.stopPropagation(); openNativePicker(importInputRef); } }, t("btn.file.pick")))
        ),
        upload ? h("div", { className: "dssm-file", title: upload.name }, h("span", { className: "dssm-file-kind", "aria-hidden": "true" }, upload.kind === "zip" ? "ZIP" : upload.kind === "folder" ? "DIR" : "MD"), h("span", { className: "dssm-file-name" }, upload.name), h("span", { className: "dssm-file-meta" }, t(countKey("upload.selected", upload.count), { count: upload.count, size: upload.size < 1024 ? upload.size + " B" : Math.ceil(upload.size / 1024) + " KB" })), h("button", { type: "button", className: "dssm-file-remove", "aria-label": t("upload.remove"), onClick: function () { setUpload(null); } }, "×")) : null,
        result ? h("div", { className: "dssm-feedback" + (result.warning ? " dssm-warning" : result.ok ? "" : " dssm-error"), role: "alert" }, result.text) : null,
        h("div", { className: "dssm-upload-requirements" }, h("div", { className: "dssm-label" }, t("upload.requirements")), h("ul", null, h("li", null, t("upload.requirement.skill")), h("li", null, t("upload.requirement.frontmatter")), h("li", null, t("upload.requirement.copy")))),
        h("div", { className: "dssm-modal-actions" }, hostButton(t("btn.cancel"), function () { pickerOpenRef.current = false; setUpload(null); setResult(null); setModal(null); }, "outline"), hostButton(busy ? t("upload.importing") : t("btn.import.now"), submitImport, "primary", busy || !upload))
      ));      if (modal === "detail") content.push(h(Modal, { key: "detail", wide: true, title: t("detail.title"), closeLabel: t("btn.close"), onClose: function () { setModal(null); } }, detail ? h("div", { className: "dssm-detail" }, h("div", { className: "dssm-name" }, detail.declaredName || detail.name), detail.description ? h("p", { className: "dssm-desc" }, detail.description) : null, h("div", { className: "dssm-detail-path" }, detail.path), detail.diagnostics.length ? detail.diagnostics.map(function (item, index) { return h("div", { key: index, className: "dssm-diag" }, t(item.code!, item.params || {})); }) : null, h(Input.TextArea, { readOnly: true, value: detail.body || "", autoSize: { minRows: 6, maxRows: 16 } })) : h("div", { className: "dssm-empty" }, t("loading"))));
      if (modal && typeof modal === "object" && modal.type === "trash-confirm") content.push(h(Modal, { key: "trash-confirm", title: t("confirm.trash.title"), closeLabel: t("btn.close"), onClose: function () { setModal(null); } }, h("p", { className: "dssm-desc" }, t("confirm.trash.desc", { name: modal.name })), h("div", { className: "dssm-modal-actions" }, hostButton(t("btn.cancel"), function () { setModal(null); }, "outline"), hostButton(t("btn.trash"), function () { post("/delete", { root: (modal as Extract<ConfirmModal, {type: "trash-confirm"}>).root, name: (modal as ConfirmModal).name }, "result.trashed", { name: (modal as ConfirmModal).name }).then(function () { setModal(null); }).catch(function () {}); }, "primary", busy))));
      if (modal && typeof modal === "object" && modal.type === "delete-confirm") content.push(h(Modal, { key: "delete-confirm", title: t("confirm.delete.title"), closeLabel: t("btn.close"), onClose: function () { setModal(null); } }, h("p", { className: "dssm-desc" }, t("confirm.delete.desc", { name: modal.name })), h("div", { className: "dssm-modal-actions" }, hostButton(t("btn.cancel"), function () { setModal(null); }, "outline"), hostButton(t("btn.delete.forever"), function () { post("/trash-delete", { id: (modal as Extract<ConfirmModal, {type: "delete-confirm"}>).id }, "result.deleted", { name: (modal as ConfirmModal).name }).then(function () { setModal(null); }).catch(function () {}); }, "danger", busy))));
      return h(AntdProvider, { locale: antdLocaleFromDocument() }, h("section", { className: "dssm-section" }, content));
    }

    var inject = ["slots", "locale"];
    function apply(ctx: ClientContext) { ctx.effect(function () { return ctx.locale.register(NS, DICT); }); ctx.effect(function () { return observePluginUpdate({ endpoint: "/api/michengai/dsh-skills-manager/update", packageName: "@michengai/dsh-skills-manager", titleRowSelector: ".dssm-title-row", linksSelector: ".dssm-feedback-links", zhName: "技能", enName: "Skills", createIcon: createPluginUpdateIcon }); }, "skills-manager: plugin update ui"); ctx.slots.inject("settings.section", function () { return ctx.slots.register({ name: "settings.section", id: "skills-manager", order: 17, label: function () { return ctx.locale.bind(NS)("title"); }, icon: "skill", locale: NS }, SkillManagerSection); }); }
    module.exports.formatTrashTime = formatTrashTime; module.exports.DICT = DICT; module.exports.translateError = translateError; module.exports.parseApiResponse = parseApiResponse; module.exports.isSkillEnabled = isSkillEnabled; module.exports.countKey = countKey; module.exports.rootDisplayName = rootDisplayName; module.exports.summarizeImportResult = summarizeImportResult; module.exports.normalizeSkillQuery = normalizeSkillQuery; module.exports.matchSkillQuery = matchSkillQuery; module.exports.filterSkills = filterSkills; module.exports.visibleSkillRoots = visibleSkillRoots; module.exports.scopeSkillRoots = scopeSkillRoots; module.exports.skillStatus = skillStatus; module.exports.countSkillStatuses = countSkillStatuses; module.exports.currentSessionId = currentSessionId; module.exports.canToggleSource = canToggleSource; module.exports.recoverModalFocus = recoverModalFocus; module.exports.trapModalFocus = trapModalFocus; module.exports.inspectUploadSelection = inspectUploadSelection; module.exports.apply = apply; module.exports.inject = inject;
