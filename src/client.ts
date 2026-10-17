import * as React from "react";
import type { Translate, ApiRoutes, ModalProps, SessionSnapshot, SectionProps, ViewProps, Filters, ClientContext, ManagerSnapshot, Detail, TrashItem } from './client-types.js';
import type { SkillView, RootView, SkillRoot, CodedError, ImportResult, Diagnostic } from './types.js';
type SearchSkill = Partial<SkillView> & {kindLabel?: string; statusLabel?: string; rootKey?: string; rootLabel?: string};
type UploadFile = File & {_dssmPath?: string};
type UploadSelection = {kind: string; name: string; files: UploadFile[]; count: number; size: number; error?: never};
type SelectionResult = UploadSelection | {error: Diagnostic};
type ResultMessage = {ok: boolean; text: string; warning?: boolean; scope?: string};
type ConfirmModal = {type: 'trash-confirm'; root: string; name: string; workspace?: string} | {type: 'delete-confirm'; id: string; name: string} | {type: 'category-create'; root: string; workspace?: string} | {type: 'category-rename'; root: string; id: string; name: string; workspace?: string} | {type: 'category-delete'; root: string; id: string; name: string; workspace?: string} | {type: 'category-add'; root: string; id: string; name: string; workspace?: string; skills: {name: string; declaredName?: string; description?: string; currentCatName: string}[]};
type ModalState = 'detail' | 'create' | 'import' | ConfirmModal | null;
import { createRepositoryUI, repositoryLocales } from "./repository-ui.js";
import { createDestinationKit, defaultDestination, destinationPayload, destinationReady, destinationLocales, destinationCss, type DestinationValue } from "./destination-picker.js";
import { observePluginUpdate } from "./plugin-update-ui.js";
import { createSourceSelect } from "./source-select.js";
import { Button as PrimitiveButton, Modal as PrimitiveModal, SegmentedTabs } from "@deepseek-ai/dsh-client-ui-primitives";
import { Input, foldChevron } from "./plugin-ui.js";
import { installSettingsNavIcon } from "./settings-nav-icon.js";

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
        "btn.create": "创建技能", "btn.import": "导入", "btn.refresh": "刷新", "btn.cancel": "取消", "btn.close": "关闭", "btn.detail": "查看详情", "btn.more": "更多", "btn.trash": "移到回收站", "btn.restore": "恢复", "btn.delete.forever": "永久删除", "btn.file.pick": "选择文件", "btn.folder.pick": "选择文件夹", "btn.import.now": "安装", "btn.create.now": "创建技能", "btn.disable": "停用", "btn.enable": "启用", "btn.confirm": "确定",
        "status.enabled": "已启用", "status.disabled": "已停用", "status.invalid": "诊断异常", "status.shadowed": "被覆盖",
        "summary.total.one": "{count} 个技能", "summary.total.other": "{count} 个技能", "summary.enabled.one": "{count} 个已启用", "summary.enabled.other": "{count} 个已启用", "summary.disabled.one": "{count} 个已停用", "summary.disabled.other": "{count} 个已停用", "summary.shadowed.one": "{count} 个被覆盖", "summary.shadowed.other": "{count} 个被覆盖", "summary.invalid.one": "{count} 个诊断异常", "summary.invalid.other": "{count} 个诊断异常", "table.skill": "技能名称与描述", "table.status": "调用状态",
        "filter.workspace": "工作区", "filter.source": "来源", "filter.all": "全部来源", "filter.option": "{name}（{count}）", "search": "搜索", "search.placeholder": "搜索技能名称或描述", "search.clear": "清除搜索",
        "empty.search": "没有匹配的技能。", "empty.source": "该来源目录不存在或暂时没有技能。", "loading": "正在加载技能…", "note.missing": "未提供简介", "source.toggle": "启停来源", "skill.toggle": "启停技能", "category.toggle": "启停分类", "category.create": "新建分类", "category.uncategorized": "未分类", "category.assign": "归入{name}", "category.rename": "重命名", "category.delete": "删除分类", "category.note": "分类只记在这个来源里，不移动文件。", "category.name": "分类名称", "category.empty": "还没有技能。从条目的「更多」归入。", "category.progress": "{count} 项 · {enabled}/{usable} 启用", "category.actions": "分类操作", "category.created": "已添加分类「{name}」。文件没有新建目录。", "category.renamed": "已重命名。技能文件名没有变化。", "category.deleted": "已删除分类「{name}」。技能回到未分类，没有进回收站。", "category.assigned": "已将 {name} 归入「{category}」。文件没有移动。", "category.dragTip": "拖拽调整顺序或移动到其他分类", "category.moved": "已调整技能 {name} 的分类或顺序。", "confirm.category.title": "删除分类？", "confirm.category.desc": "「{name}」会消失，里面的技能回到未分类。文件不会移动。", "error.category.duplicate": "已有同名分类: {name}", "error.category.name": "分类名称不能为空，且不能超过 24 个字符", "error.category.notFound": "分类不存在", "error.category.root": "技能来源不存在: {root}", "error.category.position": "技能排序位置无效", "error.category.target": "排序目标不属于目标分类",
        "detail.title": "技能详情", "detail.description": "简介", "detail.document": "SKILL.md", "detail.body": "正文", "detail.frontmatter": "Frontmatter", "detail.diagnostics": "诊断", "detail.path": "源文件", "detail.noIssues": "未发现诊断问题。",
        "create.title": "创建技能", "create.name": "名称", "create.name.placeholder": "例如 code-review-helper", "create.description": "简介", "create.description.placeholder": "一句话说明什么时候使用", "create.body": "正文（Markdown）", "create.body.placeholder": "写下技能要遵循的指令、步骤和边界…", "create.chat.note": "创建的技能不会挂仓库更新，也不会修改原文件。",
        "import.title": "导入技能", "upload.drop.title": "拖拽技能到此处", "upload.drop.copy": "支持 .zip、技能文件夹或单个 SKILL.md", "upload.selected.one": "{count} 个文件 · {size}", "upload.selected.other": "{count} 个文件 · {size}", "upload.remove": "移除所选内容", "upload.requirements": "文件要求", "upload.requirement.skill": "压缩包或文件夹需包含 SKILL.md", "upload.requirement.frontmatter": "SKILL.md 需包含 YAML 格式的技能名称和描述", "upload.requirement.copy": "导入时复制完整内容，不修改原始来源", "upload.importing": "正在安装…", "status.selected": "已选择", "select.file.invalid": "请选择 .zip 或单个 SKILL.md。", "select.folder.invalid": "所选文件夹中没有找到 SKILL.md。", "error.browse.absolute": "目录路径必须是绝对路径：{path}", "error.browse.unreadable": "无法读取目录：{path}", "error.browse.notDirectory": "不是目录：{path}",
        "trash.title": "回收站", "trash.empty": "回收站为空。", "trash.deletedAt": "删除于 {time}", "trash.source": "来源：{source}",
        "confirm.trash.title": "移到回收站？", "confirm.trash.desc": "“{name}”将从当前技能来源移入回收站，之后可以恢复到原位置。", "confirm.delete.title": "永久删除？", "confirm.delete.desc": "“{name}”将从回收站永久删除，无法恢复。",
        "result.created": "已创建技能：{name}", "result.imported": "导入完成：{names}", "result.importPartial": "已导入：{imported}；已跳过同名技能：{skipped}", "result.importSkipped": "未导入任何技能；已跳过同名技能：{names}", "result.importEmpty": "未导入任何技能。", "result.importWarnings": "{result}；警告：{warnings}", "result.restored": "已恢复技能：{name}", "result.trashed": "已移到回收站：{name}", "result.deleted": "已永久删除：{name}", "result.updated": "状态已更新。", "error.action": "操作失败：{error}",
        "warning.scan.truncated": "技能目录较大或嵌套过深，部分技能未显示：{path}", "warning.state.invalid": "技能管理器状态文件不可读；所有技能已安全停用，修复文件前不会覆盖状态：{path}", "warning.backupUncleaned": "旧版本备份未清理：{path}（{error}）", "warning.project.unavailable": "无法从宿主读取活动工作区，项目技能未显示：{path}",
        "error.root.readonly": "该来源不允许{action}", "error.root.unknown": "未知技能来源：{root}", "error.workspace.unregistered": "请选择已登记的工作区。", "error.workspace.unavailable": "工作区目录不可用：{path}", "error.root.unsafe": "项目技能目录不安全，拒绝写入：{path}", "error.skill.notFound": "技能不存在: {name}", "error.skill.noFrontmatter": "技能缺少完整 frontmatter，无法{action}: {name}", "error.skill.notLoadable": "技能结构不完整，无法{action}: {name}",
        "error.source.notFound": "路径不存在: {path}", "error.source.symlink": "不支持包含符号链接的 skill 来源: {path}", "error.source.unrecognized": "无法识别的 skill 来源: {path}", "error.source.tooDeep": "skill 来源目录层级超过 {depth} 层: {path}",
        "error.import.overlap": "导入来源不能与 DSH 技能目录相同、包含或位于其中", "error.import.emptySource": "目录下未找到任何 skill 条目: {path}", "error.import.invalidName": "无法生成合法 kebab-case 名称（原始名: {name}）", "error.import.duplicateName": "批量来源中存在多个同名技能: {name}", "error.import.failed": "导入失败", "error.import.rollbackFailed": "覆盖导入回滚失败，备份保留在: {path}（{error}）",
        "error.upload.path": "上传内容包含非法路径：{path}", "error.upload.encoding": "上传内容编码无效", "error.upload.empty": "上传内容为空", "error.upload.tooMany": "上传文件过多，最多 {limit} 个", "error.upload.tooLarge": "上传内容过大，限制为 {limit} 字节", "error.upload.archiveTooLarge": "ZIP 压缩包过大，限制为 {limit} 字节", "error.upload.duplicate": "上传内容包含重复路径：{path}", "error.upload.zipInvalid": "ZIP 压缩包无法解压",
        "error.trash.notFound": "回收站条目不存在: {id}", "error.trash.conflict": "无法恢复，同名技能已存在: {name}", "error.trash.invalid": "回收站条目路径非法: {id}", "error.trash.projectUnavailable": "原项目当前不在活动工作区中，无法恢复：{path}", "error.trash.rollbackFailed": "移入回收站回滚失败，未恢复内容保留在: {path}（{error}）",
        "error.state.invalid": "技能管理器状态文件不可读，已拒绝覆盖：{path}",
        "error.create.descriptionRequired": "技能简介不能为空", "error.create.bodyRequired": "技能正文不能为空", "error.create.tooLarge": "技能内容过长", "error.create.conflict": "同名技能已存在: {name}",
        "error.proto.forbidden": "禁止的修改请求（缺少客户端标记）", "error.proto.forbiddenHost": "禁止的请求来源（非法 Host）", "error.proto.contentType": "请求体必须是 application/json", "error.proto.method": "不支持的请求方法", "error.proto.unknownAction": "未知操作", "error.proto.bodyTooLarge": "请求体过大", "error.proto.invalidJson": "请求体不是合法 JSON", "error.proto.nonJson": "服务端返回非 JSON 响应（HTTP {status}）",
        "error.catalog.query": "搜索关键词无效。", "error.catalog.upstream": "目录服务暂时不可用。", "error.catalog.response": "目录返回的数据无效或过大。", "error.catalog.identity": "目录技能标识无效。",
        "diagnostic.frontmatter.missing": "缺少完整 YAML frontmatter", "diagnostic.name.missing": "frontmatter 缺少 name", "diagnostic.name.invalid": "技能名称不是合法 kebab-case：{name}", "diagnostic.description.missing": "frontmatter 缺少 description", "diagnostic.invocation.invalid": "调用策略字段值无效", "diagnostic.shadowed": "被更高优先级来源 {root} 覆盖",
        "action.enable": "启用", "action.disable": "停用", "action.create": "创建", "action.delete": "删除", "action.restore": "恢复", "action.toggle": "启用或停用",
        "scope.user": "全局技能", "scope.project": "项目技能", "scope.trash": "回收站", "scope.label": "技能管理视图", "scope.userHint": "跨项目可用。启停仅影响 DSH 中的调用。", "scope.projectHint": "按工作区查看项目技能。启停不修改其他 Agent 的源文件。", "project.empty": "还没有已登记的工作区。请先在侧栏添加工作区。", "project.noSkills": "已登记的工作区里还没有技能。", "workspace.unavailable": "目录不可用", "workspace.noSkills": "这个工作区还没有技能。", "workspace.loading": "正在读取…", "workspace.loadFailed": "读取失败：{error}", "workspace.listFailed": "无法读取工作区列表：{error}", "filter.status": "调用状态", "filter.statusAll": "全部状态", "status.shadowedBy": "被 {source} 中的同名技能覆盖", "status.fallback.user": "当前使用全局 {source} 副本。", "status.fallback.project": "当前使用项目 {source} 副本。", "root.copilot": "GitHub Copilot", "source.selectHint": "先选择一个来源，才能查看目录或关闭整个来源。关闭来源只影响 DSH 调用，不改文件。", "import.global": "导入技能", "category.batchAssigned": "已将 {count} 个技能添加到“{category}”。文件未移动。", "category.selectSkills": "添加技能到“{name}”", "category.noAvailableSkills": "没有可添加的技能", "category.addSkills": "添加技能", "root.dsh": "DSH", "root.agents": "公共 Agent", "root.ccswitch": "CC Switch", "root.projectDsh": "DSH", "root.projectAgents": "项目 Agent", "root.codex": "Codex", "root.claude": "Claude Code", "root.gemini": "Gemini", "root.opencode": "OpenCode", "root.cursor": "Cursor", "root.windsurf": "Windsurf", "root.windsurfUser": "Windsurf (用户目录)", "root.trae": "Trae", "root.traeCn": "Trae (国内版)", "root.openclaw": "OpenClaw", "root.clawdbot": "OpenClaw (旧目录)", "root.roo": "Roo", "root.codebuddy": "CodeBuddy", "root.workbuddy": "WorkBuddy", "root.qoder": "Qoder", "root.qoderCn": "Qoder CN CLI", "root.lingma": "Qoder CN"
      },
      en: {
        "summary.group.one": "{count} skill", "summary.group.other": "{count} skills", "format.locale": "en-US", "format.warningSeparator": "; ",
        "title": "Skills", "desc": "Load and manage Agent Skills on this computer in one place.", "link.project": "GitHub", "link.feedback": "Issues",
        "btn.create": "Create skill", "btn.import": "Import", "btn.refresh": "Refresh", "btn.cancel": "Cancel", "btn.close": "Close", "btn.detail": "View details", "btn.more": "More", "btn.trash": "Move to trash", "btn.restore": "Restore", "btn.delete.forever": "Delete forever", "btn.file.pick": "Choose file", "btn.folder.pick": "Choose folder", "btn.import.now": "Install", "btn.create.now": "Create skill", "btn.disable": "Disable", "btn.enable": "Enable", "btn.confirm": "Confirm",
        "status.enabled": "Enabled", "status.disabled": "Disabled", "status.invalid": "Needs attention", "status.shadowed": "Shadowed",
        "summary.total.one": "{count} skill", "summary.total.other": "{count} skills", "summary.enabled.one": "{count} enabled", "summary.enabled.other": "{count} enabled", "summary.disabled.one": "{count} disabled", "summary.disabled.other": "{count} disabled", "summary.shadowed.one": "{count} shadowed", "summary.shadowed.other": "{count} shadowed", "summary.invalid.one": "{count} diagnostic", "summary.invalid.other": "{count} diagnostics", "table.skill": "Skill name and description", "table.status": "Invocation status",
        "filter.workspace": "Workspace", "filter.source": "Source", "filter.all": "All sources", "filter.option": "{name} ({count})", "search": "Search", "search.placeholder": "Search skill names or descriptions", "search.clear": "Clear search",
        "empty.search": "No matching skills.", "empty.source": "This source does not exist or has no skills yet.", "loading": "Loading skills…", "note.missing": "No description provided", "source.toggle": "Toggle source", "skill.toggle": "Toggle skill", "category.toggle": "Toggle category", "category.create": "New category", "category.uncategorized": "Uncategorized", "category.assign": "Move to {name}", "category.rename": "Rename", "category.delete": "Delete category", "category.note": "Categories stay in this source and do not move files.", "category.name": "Category name", "category.empty": "No skills yet. Use More on a skill to place it here.", "category.progress": "{count} · {enabled}/{usable} enabled", "category.actions": "Category actions", "category.created": "Added category “{name}”. No directory was created.", "category.renamed": "Renamed. Skill file names are unchanged.", "category.deleted": "Deleted category “{name}”. Skills returned to Uncategorized and were not trashed.", "category.assigned": "Moved {name} to “{category}”. The file was not moved.", "category.dragTip": "Drag to reorder or move to another category", "category.moved": "Updated the category or order for {name}.", "confirm.category.title": "Delete category?", "confirm.category.desc": "“{name}” will be removed. Its skills return to Uncategorized. Files are not moved.", "error.category.duplicate": "A category with this name already exists: {name}", "error.category.name": "Category name is required and must be at most 24 characters", "error.category.notFound": "Category not found", "error.category.root": "Skill source not found: {root}", "error.category.position": "Invalid skill ordering position", "error.category.target": "The target skill is not in the destination category",
        "detail.title": "Skill details", "detail.description": "Description", "detail.document": "SKILL.md", "detail.body": "Body", "detail.frontmatter": "Frontmatter", "detail.diagnostics": "Diagnostics", "detail.path": "Source file", "detail.noIssues": "No diagnostic issues found.",
        "create.title": "Create skill", "create.name": "Name", "create.name.placeholder": "e.g. code-review-helper", "create.description": "Description", "create.description.placeholder": "One sentence describing when to use it", "create.body": "Body (Markdown)", "create.body.placeholder": "Write the instructions, steps, and boundaries…", "create.chat.note": "Created skills are not linked to repository updates, and no source file is modified.",
        "import.title": "Import skill", "upload.drop.title": "Drop a skill here", "upload.drop.copy": "Supports .zip, a skill folder, or one SKILL.md", "upload.selected.one": "{count} file · {size}", "upload.selected.other": "{count} files · {size}", "upload.remove": "Remove selection", "upload.requirements": "File requirements", "upload.requirement.skill": "Archives and folders must contain SKILL.md", "upload.requirement.frontmatter": "SKILL.md must include a YAML name and description", "upload.requirement.copy": "Import copies all content and never modifies the source", "upload.importing": "Installing…", "status.selected": "Selected", "select.file.invalid": "Choose a .zip archive or one SKILL.md.", "select.folder.invalid": "No SKILL.md was found in the selected folder.", "error.browse.absolute": "Folder path must be absolute: {path}", "error.browse.unreadable": "Could not read folder: {path}", "error.browse.notDirectory": "Not a folder: {path}",
        "trash.title": "Trash", "trash.empty": "Trash is empty.", "trash.deletedAt": "Deleted {time}", "trash.source": "Source: {source}",
        "confirm.trash.title": "Move to trash?", "confirm.trash.desc": "“{name}” will move out of its current skill source and can be restored to the same location later.", "confirm.delete.title": "Delete forever?", "confirm.delete.desc": "“{name}” will be permanently deleted from trash and cannot be recovered.",
        "result.created": "Created skill: {name}", "result.imported": "Import complete: {names}", "result.importPartial": "Imported: {imported}; skipped existing skills: {skipped}", "result.importSkipped": "No skills were imported; existing skills were skipped: {names}", "result.importEmpty": "No skills were imported.", "result.importWarnings": "{result}; warnings: {warnings}", "result.restored": "Restored skill: {name}", "result.trashed": "Moved to trash: {name}", "result.deleted": "Permanently deleted: {name}", "result.updated": "Status updated.", "error.action": "Action failed: {error}",
        "warning.scan.truncated": "Some skills were not shown because the directory is too large or deeply nested: {path}", "warning.state.invalid": "The manager state file could not be read; all skills are disabled and state writes are blocked until it is repaired: {path}", "warning.backupUncleaned": "Old version backup was not cleaned up: {path} ({error})", "warning.project.unavailable": "The active workspace could not be read from the host, so its project skills are hidden: {path}",
        "error.root.readonly": "This source does not allow {action}", "error.root.unknown": "Unknown skill source: {root}", "error.workspace.unregistered": "Select a registered workspace.", "error.workspace.unavailable": "Workspace directory is unavailable: {path}", "error.root.unsafe": "The project skill directory is unsafe, so the write was refused: {path}", "error.skill.notFound": "Skill not found: {name}", "error.skill.noFrontmatter": "Skill lacks complete frontmatter, cannot {action}: {name}", "error.skill.notLoadable": "Skill structure is incomplete, cannot {action}: {name}",
        "error.source.notFound": "Path does not exist: {path}", "error.source.symlink": "Skill sources containing symbolic links are not supported: {path}", "error.source.unrecognized": "Unrecognized skill source: {path}", "error.source.tooDeep": "Skill source directory depth exceeds {depth} levels: {path}",
        "error.import.overlap": "Import source cannot be the same as, contain, or be inside the DSH skills directory", "error.import.emptySource": "No skill entries found in the directory: {path}", "error.import.invalidName": "Cannot generate a valid kebab-case name (original: {name})", "error.import.duplicateName": "Batch source contains duplicate skill names: {name}", "error.import.failed": "Import failed", "error.import.rollbackFailed": "Overwrite import rollback failed; backups kept at: {path} ({error})",
        "error.upload.path": "Upload contains an invalid path: {path}", "error.upload.encoding": "Upload encoding is invalid", "error.upload.empty": "Upload is empty", "error.upload.tooMany": "Too many uploaded files; maximum {limit}", "error.upload.tooLarge": "Upload is too large; limit {limit} bytes", "error.upload.archiveTooLarge": "ZIP archive is too large; limit {limit} bytes", "error.upload.duplicate": "Upload contains a duplicate path: {path}", "error.upload.zipInvalid": "ZIP archive could not be extracted",
        "error.trash.notFound": "Trash item not found: {id}", "error.trash.conflict": "Cannot restore because a skill with the same name exists: {name}", "error.trash.invalid": "Invalid trash item path: {id}", "error.trash.projectUnavailable": "The original project is not an active workspace, so this skill cannot be restored: {path}", "error.trash.rollbackFailed": "Move-to-trash rollback failed; unrecovered content was kept at: {path} ({error})",
        "error.state.invalid": "The manager state file could not be read, so overwriting it was refused: {path}",
        "error.create.descriptionRequired": "Skill description is required", "error.create.bodyRequired": "Skill body is required", "error.create.tooLarge": "Skill content is too large", "error.create.conflict": "A skill with the same name already exists: {name}",
        "error.proto.forbidden": "Forbidden mutation request (missing client marker)", "error.proto.forbiddenHost": "Forbidden request origin (invalid host)", "error.proto.contentType": "Content type must be application/json", "error.proto.method": "Method not allowed", "error.proto.unknownAction": "Unknown action", "error.proto.bodyTooLarge": "Request body too large", "error.proto.invalidJson": "Invalid JSON request body", "error.proto.nonJson": "Server returned a non-JSON response (HTTP {status})",
        "error.catalog.query": "The search query is invalid.", "error.catalog.upstream": "The catalog service is temporarily unavailable.", "error.catalog.response": "The catalog response is invalid or too large.", "error.catalog.identity": "The catalog skill identifier is invalid.",
        "diagnostic.frontmatter.missing": "Missing complete YAML frontmatter", "diagnostic.name.missing": "Frontmatter is missing name", "diagnostic.name.invalid": "Skill name is not valid kebab-case: {name}", "diagnostic.description.missing": "Frontmatter is missing description", "diagnostic.invocation.invalid": "Invocation policy value is invalid", "diagnostic.shadowed": "Shadowed by higher-priority source {root}",
        "action.enable": "enable", "action.disable": "disable", "action.create": "create", "action.delete": "delete", "action.restore": "restore", "action.toggle": "enabling or disabling",
        "scope.user": "Global skills", "scope.project": "Project skills", "scope.trash": "Trash", "scope.label": "Skill manager views", "scope.userHint": "Available across projects. Toggles only affect invocation in DSH.", "scope.projectHint": "View project skills by workspace. Toggles do not modify other agents’ source files.", "project.empty": "No registered workspaces yet. Add one in the sidebar first.", "project.noSkills": "Registered workspaces do not have skills yet.", "workspace.unavailable": "Directory unavailable", "workspace.noSkills": "No skills in this workspace yet.", "workspace.loading": "Loading…", "workspace.loadFailed": "Failed to load: {error}", "workspace.listFailed": "Cannot read the workspace list: {error}", "filter.status": "Invocation status", "filter.statusAll": "All statuses", "status.shadowedBy": "Overridden by the same skill in {source}", "status.fallback.user": "Currently using the global {source} copy.", "status.fallback.project": "Currently using the project {source} copy.", "source.selectHint": "Select a source to view its directory or turn the whole source off. Turning a source off only affects invocation in DSH and does not change files.", "import.global": "Import skill", "category.batchAssigned": "Added {count} skills to “{category}”. Files were not moved.", "category.selectSkills": "Add skills to “{name}”", "category.noAvailableSkills": "No skills available to add", "category.addSkills": "Add skills", "root.dsh": "DSH skills", "root.agents": "Shared Agent", "root.ccswitch": "CC Switch", "root.projectDsh": "DSH skills", "root.projectAgents": "Project Agent", "root.codex": "Codex", "root.claude": "Claude Code", "root.gemini": "Gemini", "root.opencode": "OpenCode", "root.cursor": "Cursor", "root.copilot": "GitHub Copilot", "root.windsurf": "Windsurf", "root.windsurfUser": "Windsurf (User Home)", "root.trae": "Trae", "root.traeCn": "Trae CN", "root.openclaw": "OpenClaw", "root.clawdbot": "OpenClaw (Legacy)", "root.roo": "Roo", "root.codebuddy": "CodeBuddy", "root.workbuddy": "WorkBuddy", "root.qoder": "Qoder", "root.qoderCn": "Qoder CN CLI", "root.lingma": "Qoder CN"
      }
    };

    Object.assign(DICT.zh, repositoryLocales.zh, destinationLocales.zh);
    Object.assign(DICT.en, repositoryLocales.en, destinationLocales.en);
    var SourceSelect = createSourceSelect(react);
    var destinationKit = createDestinationKit({ react, SourceSelect, translateError });
    var DestinationPicker = destinationKit.DestinationPicker;
    var useRepositoryUI = createRepositoryUI({ react: react, Modal: Modal, Input: Input, Button: PrimitiveButton, SourceSelect: SourceSelect, destination: destinationKit, api: callApi, headers: MUTATION_HEADERS, translateError: translateError, getLocale: hostLocale });
    var CSS = destinationCss + `.dssm-sources{display:flex;flex-direction:column;gap:9px}.dssm-scope-tabs{width:100%}.dssm-source-head{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 12px}.dssm-source-toggle{display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.dssm-source-toggle:focus-visible{outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}.dssm-fold-chevron{flex:none;color:var(--dsw-alias-label-tertiary);transform:rotate(-90deg);transition:transform 160ms ease}.dssm-fold-chevron.is-open{transform:rotate(0deg)}@media (prefers-reduced-motion:reduce){.dssm-fold-chevron{transition:none}}.dssm-source-label{display:flex;align-items:center;gap:10px;min-width:0;flex:1}.dssm-drag-handle{cursor:grab;color:var(--dsw-alias-label-tertiary,#888);font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;width:16px;height:22px;border-radius:var(--dsw-radius-sm,8px);flex-shrink:0;user-select:none;transition:color 0.15s}.dssm-skill-row:hover .dssm-drag-handle{color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-drag-handle:active{cursor:grabbing}.dssm-cat.drag-over{border-color:var(--dsw-alias-brand-primary,#3b82f6);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#3b82f6)}.dssm-skill-row.dragging{opacity:0.4;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover,transparent))}.dssm-skill-row.drop-before{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary,#3b82f6)}.dssm-skill-row.drop-after{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary,#3b82f6)}.dssm-skill-row{display:flex;align-items:center;gap:8px;margin:0;padding:11px 13px;border:0;border-top:0.5px solid var(--dsw-alias-border-l1,#3a3a3a);border-radius:0;background:transparent}.dssm-skill-copy{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}.dssm-skill-actions{display:flex;align-items:center;gap:8px;flex:none;flex-wrap:nowrap}.dssm-skill-desc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;line-height:18px}.dssm-icon-danger{color:var(--dsw-alias-state-error-primary,#ef7272)}.dssm-skill-row .dssm-name{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary,#eeeeee)}.dssm-skill-actions{display:flex;align-items:center;gap:8px;flex:none}.dssm-source{overflow:hidden;border:0.5px solid var(--dsw-alias-border-l2,#494949);border-radius:var(--dsw-radius-xl,20px);background:transparent}.dssm-textarea{box-sizing:border-box;display:block;width:100%;min-height:160px;margin:0;padding:8px 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;resize:vertical}.dssm-textarea:focus,.dssm-textarea:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}.dssm-textarea[readonly]{resize:none}.dssm-source-title{font-size:14px;font-weight:650;white-space:nowrap;flex:none}.dssm-source-path{min-width:0;max-width:50%;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px}.dssm-source-actions{display:flex;flex:none;align-items:center;gap:8px;margin-left:12px}.dssm-cat{margin:0 10px 8px;border:0.5px solid var(--dsw-alias-border-l1,#3a3a3a);border-radius:var(--dsw-radius-lg,16px)}.dssm-cat-head{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 8px 0 6px}.dssm-cat-main{display:flex;align-items:center;gap:8px;flex:1;min-width:0;min-height:36px;padding:4px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.dssm-cat-title{font-size:14px;font-weight:700;display:inline-flex;align-items:center}.dssm-cat-note{margin:2px 16px 8px}.dssm-fallback{margin-top:4px;color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-section{box-sizing:border-box;display:flex;width:100%;max-width:820px;min-width:0;margin:0 auto;padding:2px 0 36px;container-type:inline-size;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary,#eeeeee);font-family:inherit}.dssm-head{display:flex;flex-direction:column;align-items:stretch;gap:16px}.dssm-title-block{min-width:0}.dssm-title-row{display:flex;align-items:center;gap:8px 12px;min-width:0;flex-wrap:wrap}.dssm-feedback-links{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dssm-feedback-links>span[data-mpi-check]{display:inline-flex;align-items:center}.dssm-title{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.4px;white-space:nowrap}.dssm-desc{margin:12px 0 0;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:14px;line-height:22px}.dssm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-left:0;flex:none}.dssm-upload-link:focus-visible,.dssm-file-remove:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,var(--dsw-alias-label-primary,#f2f2f2));outline-offset:2px}.dssm-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:hidden;border:0.5px solid var(--dsw-alias-border-l2,#494949);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1)}.dssm-stat{padding:4px 10px;border-right:0.5px solid var(--dsw-alias-border-l1,#3a3a3a);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-stat:last-child{border-right:0}.dssm-stat strong{margin-right:4px;color:var(--dsw-alias-label-primary,#eeeeee);font-size:14px;font-weight:650}.dssm-filters{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;width:100%!important;min-width:0;box-sizing:border-box}.dssm-filter-actions{display:flex;align-items:center;gap:8px;flex:none;margin-left:auto}.dssm-filters .dssm-search{flex:1 1 0;min-width:160px;max-width:none}.dssm-filters .dssm-source-filter,.dssm-filters .dssm-status-filter,.dssm-filters .dssm-project-filter,.dssm-filters .dssm-menu-select-wrap,.dssm-filters span[class*="_root_"],.dssm-filters .dssm-source-select-menu,.dssm-filters .dssm-menu-select-trigger{width:auto!important;min-width:0!important;display:inline-flex!important;flex:none}.dssm-field .dssm-menu-select-wrap,.dssm-destination-pair .dssm-menu-select-wrap,.dssm-destination-pair span[class*="_root_"]{display:flex!important;width:100%!important;min-width:0!important;height:auto!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important}.dssm-destination-pair .dssm-menu-select-trigger,.dssm-form .dssm-menu-select-trigger{display:flex!important;width:100%!important;height:36px!important;border-radius:var(--dsw-radius-md,10px)!important;padding:0 12px!important;box-sizing:border-box!important}.dssm-source-select-menu{min-width:130px;max-width:280px}.dssm-menu-select-trigger{display:inline-flex;align-items:center;justify-content:space-between;gap:6px;height:32px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer;user-select:none;width:max-content;min-width:8em;transition:border-color 120ms ease,background 120ms ease}.dssm-menu-select-trigger:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,#555)}.dssm-menu-select-trigger.is-open,.dssm-menu-select-trigger:focus-visible{border-color:var(--dsw-alias-brand-primary)!important;outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary))!important;outline-offset:0!important}.dssm-menu-select-trigger:disabled{opacity:.5;cursor:default}.dssm-menu-select-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;text-align:left}.dssm-menu-select-arrow{color:var(--dsw-alias-label-secondary);flex-shrink:0}.dssm-count{color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;white-space:nowrap;flex:none}.dssm-name{overflow-wrap:anywhere;font-size:13px;font-weight:570}.dssm-note{overflow-wrap:anywhere;margin-top:2px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:11px;line-height:17px}.dssm-enabled{color:var(--dsw-alias-state-success-primary,#51b976);font-size:12px;white-space:nowrap}.dssm-disabled{color:var(--dsw-alias-state-warn-primary,#d49245);font-size:12px;white-space:nowrap}.dssm-shadowed{color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;white-space:nowrap}.dssm-trash-count{padding:2px 7px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:11px}.dssm-empty{padding:25px 14px;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;text-align:center}.dssm-feedback{padding:9px 11px;border:0.5px solid var(--dsw-alias-border-l2,#494949);border-radius:var(--dsw-radius-lg,16px);color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:12px}.dssm-warning{border-color:var(--dsw-alias-state-warn-primary,#d49245);color:var(--dsw-alias-state-warn-primary,#d49245)}.dssm-error{border-color:var(--dsw-alias-state-error-primary,#ef7272);color:var(--dsw-alias-state-error-primary,#ef7272)}.dssm-form,.dssm-field,.dssm-detail-section{display:flex;flex-direction:column}.dssm-form{gap:12px}.dssm-detail{display:flex;flex-direction:column;gap:12px;min-width:0}.dssm-detail .dssm-desc{margin:0}.dssm-field{gap:6px}.dssm-label{font-size:12px;color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-detail-title{font-size:14px;line-height:22px;font-weight:650}.dssm-help{margin:0;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px;line-height:18px}.dssm-batch-list{display:flex;flex-direction:column;gap:6px;max-height:360px;overflow-y:auto;margin:12px 0;padding:2px}.dssm-batch-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border:0.5px solid var(--dsw-alias-border-l1,#3a3a3a);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-interactive-bg-hover,transparent));cursor:pointer;user-select:none;transition:background 0.15s,border-color 0.15s}.dssm-batch-item:hover{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover,transparent));border-color:var(--dsw-alias-border-l2,#494949)}.dssm-batch-item.selected{border-color:var(--dsw-alias-brand-primary,#3b82f6);background:var(--dsw-alias-state-business-tertiary)}.dssm-batch-item input[type="checkbox"]{cursor:pointer;margin:0;flex-shrink:0;width:15px;height:15px}.dssm-batch-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}.dssm-batch-name-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.dssm-batch-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#eee);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dssm-batch-cat-tag{font-size:10px;padding:1px 6px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary,#b9b9b9);white-space:nowrap;flex-shrink:0}.dssm-batch-desc{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary,#a0a0a0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}.dssm-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}.dssm-hidden-input{display:none}.dssm-dropzone{box-sizing:border-box;display:flex;width:100%;min-height:170px;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:22px;border:1px dashed var(--dsw-alias-border-l3,#555555);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-interactive-bg-hover,transparent));color:var(--dsw-alias-label-secondary,#b9b9b9);transition:border-color 180ms ease,background 180ms ease}.dssm-dropzone:hover,.dssm-dropzone-active{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-label-primary,#f2f2f2));background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}.dssm-dropzone-title{color:var(--dsw-alias-label-primary,#eeeeee);font-size:14px;font-weight:620}.dssm-dropzone-copy{font-size:12px;line-height:18px;text-align:center}.dssm-upload-choices{display:flex;align-items:center;gap:7px}.dssm-upload-link,.dssm-file-remove{padding:0;border:0;background:transparent;font:inherit;font-size:12px;cursor:pointer}.dssm-upload-link{color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-upload-link:hover{color:var(--dsw-alias-label-primary,#eeeeee);text-decoration:underline}.dssm-upload-link:disabled{opacity:.45;cursor:default}.dssm-upload-divider{color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px}.dssm-file{display:flex;align-items:center;gap:9px;padding:10px 11px;border:0.5px solid var(--dsw-alias-border-l2,#494949);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-interactive-bg-hover,transparent));color:var(--dsw-alias-label-primary,#eeeeee);font-size:12px}.dssm-file-kind{display:inline-flex;min-width:30px;height:24px;align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:9px;font-weight:700}.dssm-file-name{min-width:0;overflow:hidden;flex:1;text-overflow:ellipsis;white-space:nowrap}.dssm-file-meta{color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px;white-space:nowrap}.dssm-file-remove{width:24px;height:24px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:18px}.dssm-upload-requirements{padding:1px 1px 0}.dssm-upload-requirements ul{display:flex;margin:7px 0 0;padding-left:18px;flex-direction:column;gap:5px;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px;line-height:17px}.dssm-detail-section{gap:7px}.dssm-detail-path{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:14px;line-height:22px}.dssm-detail-section .dssm-note,.dssm-diag{font-size:14px;line-height:22px}.dssm-detail-path{padding:8px 10px;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-interactive-bg-hover,transparent));color:var(--dsw-alias-label-secondary,#b9b9b9);word-break:break-all}.dssm-diag{padding:8px 10px;border-left:2px solid var(--dsw-alias-state-warn-primary,#d49245);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-interactive-bg-hover,transparent));color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-trash-panel{display:flex;flex-direction:column;gap:10px}.dssm-trash-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:11px 13px;border:0.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));border-radius:var(--dsw-radius-xl,20px);background:transparent}.dssm-trash-main{min-width:0;display:flex;flex-direction:column;gap:6px}.dssm-trash-item .dssm-name{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary,inherit)}.dssm-trash-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,#909090);overflow-wrap:anywhere}.dssm-trash-source{min-width:0;background:transparent;color:var(--dsw-alias-label-tertiary,#a0a0a0)}.dssm-trash-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
@container(max-width:400px){.dssm-source-path{display:none}}@media(max-width:760px){.dssm-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.dssm-title-row{flex-wrap:wrap}}@container(max-width:520px){.dssm-trash-item{grid-template-columns:minmax(0,1fr)}.dssm-skill-row{flex-wrap:wrap}.dssm-skill-actions{width:100%;margin-inline-start:0;justify-content:flex-end}.dssm-trash-actions{justify-content:flex-end}.dssm-head{flex-direction:column}.dssm-actions{width:100%;margin-left:0}.dssm-actions button{flex:1}.dssm-summary{grid-template-columns:1fr}}.dssm-row-state{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.dssm-enable-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3,#555);cursor:pointer}.dssm-enable-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}.dssm-enable-switch:disabled{cursor:default;opacity:.5}.dssm-enable-switch:focus-visible{outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.dssm-enable-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-primary-foreground,#fff);transition:transform 120ms ease;pointer-events:none}.dssm-enable-switch[aria-checked=false] .dssm-enable-switch-thumb{background:var(--dsw-alias-switch-thumb,#fff)}.dssm-enable-switch[aria-checked=true] .dssm-enable-switch-thumb{transform:translateX(16px)}
.dssm-icon-action{width:22px;min-width:22px;height:22px;padding:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary,#b9b9b9);border-color:var(--dsw-alias-border-l2,#494949)}.dssm-icon-action:not(:disabled):not(.dssm-icon-danger):hover{color:var(--dsw-alias-link,#4176e6)!important;border-color:var(--dsw-alias-link,#4176e6)!important}.dssm-icon-action.dssm-icon-danger{color:var(--dsw-alias-state-error-primary,#ef7272);border-color:var(--dsw-alias-state-error-primary,#ef7272)}

`;

    function translateOrFallback(t: Translate, key: string, fallback: string, params?: object) { var value = t(key, params); return typeof value === "string" && value !== key ? value : fallback; }
    function translateError(t: Translate, payload: unknown): string {
      if (payload instanceof Error && !(payload as CodedError).code) return payload.message;
      if (payload && typeof payload === "object") {
        const item = payload as Diagnostic & {message?: unknown};
        if (item.code) { var params = Object.assign({}, item.params || {}); if (params.action) params.action = translateOrFallback(t, "action." + params.action, String(params.action)); var translated = t(item.code, params); if (typeof translated === "string" && translated !== item.code) return translated; if (translated === item.code) return item.error !== undefined ? translateError(t, item.error) : item.code; }
        if (item.error !== undefined) return translateError(t, item.error); if (item.message !== undefined) return String(item.message);
      }
      return String(payload == null ? "" : payload);
    }
    function parseApiResponse<T = unknown>(response: Response): Promise<T> { return response.json().catch(function () { var error: CodedError = new Error("non-json response"); error.code = "error.proto.nonJson"; error.params = { status: response.status }; throw error; }).then(function (value: unknown) { const payload = value as {ok?: boolean; data: T}; if (!response.ok || payload.ok === false) throw payload; return payload.data; }); }
    function callApi<K extends keyof ApiRoutes>(path: K, options?: RequestInit): Promise<ApiRoutes[K]> { return fetch("/api/dsh-skills-manager" + path, options).then(parseApiResponse<ApiRoutes[K]>); }
    function isSkillEnabled(skill: Partial<SkillView>): boolean { if (skill.enabled !== undefined) return skill.enabled === true; return !!(skill.invocationPolicyValid && skill.modelInvocable && skill.userInvocable && skill.managerEnabled !== false); }
    function countKey(key: string, count: number) { return key + (Number(count) === 1 ? ".one" : ".other"); }
    var localeService: ClientContext["locale"] | undefined;
    // getLocale().active 是宿主对 locale.preference 的最终有效解析，不读取网页/浏览器语言。
    function hostLocale() { return localeService?.getLocale?.().active; }
    function formatTrashTime(t: Translate, value: string) { return new Date(value).toLocaleString(hostLocale() || t("format.locale")); }
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
    function visibleSkillRoots<T extends {mutable?: boolean; exists?: boolean}>(roots: T[]) {
      return (roots || []).filter(function (root) {
        return root.mutable || root.exists !== false;
      });
    }
    function skillStatus(skill: Partial<SkillView>) { return skill.shadowedBy ? "shadowed" : skill.loadable === false ? "invalid" : isSkillEnabled(skill) ? "enabled" : "disabled"; }
    function countSkillStatuses(list: {skill: Partial<SkillView>}[]) {
      var summary: Record<string, number> = { total: list.length, enabled: 0, disabled: 0, shadowed: 0, invalid: 0 };
      list.forEach(function (row) { summary[skillStatus(row.skill)]++; });
      return summary;
    }
    function canToggleSource(root: Partial<SkillRoot> | null | undefined) { return !!(root && root.toggleable !== false && root.kind !== "project-dsh"); }
    // 先限制作用域和项目，再筛选条目：用户可写根始终展示，外部只读来源仅在有技能时展示
    function scopeSkillRoots(roots: RootView[]) {
      return visibleSkillRoots(roots).filter(function (root) {
        if (root.scope === "project") return false;
        return root.mutable || (root.skills || []).length > 0;
      });
    }
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
      return enableSwitch(props.on, props.label, props.disabled, props.onClick);
    }

    function hostButton(label: React.ReactNode, onClick: () => void, kind: "primary" | "outline" = "primary", disabled?: boolean) {
          const variant = kind === "primary" ? "primary" : "outline";
          return h(PrimitiveButton, { variant: variant, disabled: disabled, onClick: onClick }, label);
        }
    function strokeIcon(d: string) {
      return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: "false" }, h("path", { d: d, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }));
    }
    function moreIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: "false" }, [3.5, 8, 12.5].map(function (cx) { return h("circle", { key: cx, cx: cx, cy: 8, r: 1.15, fill: "none", stroke: "currentColor", strokeWidth: 1.5 }); }));
    }
    function iconButton(label: string, icon: React.ReactNode, onClick: () => void, danger?: boolean, disabled?: boolean) {
      return h(PrimitiveButton, { variant: "outline", size: "sm", className: "dssm-icon-action" + (danger ? " dssm-icon-danger" : ""), disabled: disabled, "aria-label": label, title: label, icon: icon, style: { width: 22, minWidth: 22, height: 22, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--dsw-radius-sm, 8px)" }, onClick: onClick } as any);
    }
    function filterActionButton(label: string, icon: React.ReactNode, onClick: () => void, disabled?: boolean, tooltip?: string) {
      return h(PrimitiveButton, {
        className: "dssm-icon-action",
        variant: "outline",
        size: "sm",
        disabled: disabled,
        "aria-label": label,
        title: tooltip || label,
        icon: icon,
        style: {
          width: 22,
          minWidth: 22,
          height: 22,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--dsw-radius-sm, 8px)"
        },
        onClick: onClick
      });
    }
    function enableSwitch(on: boolean, label: string, disabled: boolean | undefined, onToggle: () => void) {
      return h("button", {
        type: "button",
        role: "switch",
        "aria-checked": on,
        "aria-label": label,
        disabled: disabled,
        className: "dssm-enable-switch",
        onClick: function (event?: React.MouseEvent) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          onToggle();
        }
      }, h("span", { className: "dssm-enable-switch-thumb", "aria-hidden": "true" }));
    }



    var DSH_ICON_B64 = "data:image/png;base64,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";
    var WB_ICON_B64 = "data:image/png;base64,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";
    var CCSWITCH_ICON_B64 = "data:image/png;base64,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";
    var QODER_P0 = "M23.376 14.458v-4.056c0-2.304-1.003-4.154-2.748-5.075L11.612.574l-.046.086-.045.086c1.68.886 2.644 2.673 2.644 4.902v4.056a7.928 7.928 0 01-.014.454l-.005.061c-.005.081-.01.164-.018.245a4.897 4.897 0 01-.011.1l-.01.076c-.008.068-.015.135-.025.203l-.018.113-.01.058a9.99 9.99 0 01-.098.513l-.007.03a7.209 7.209 0 01-.074.294l-.024.086c-.027.099-.056.197-.087.296l-.027.085a9.592 9.592 0 01-.111.323l-.033.085-.018.046c-.032.082-.064.166-.098.248-.019.048-.04.096-.061.145l-.007.017a6 6 0 01-.084.187c-.024.056-.05.11-.077.165-.03.061-.058.122-.089.182a9.423 9.423 0 01-.176.332c-.03.056-.062.111-.094.167-.031.053-.062.108-.095.16-.033.055-.066.11-.101.164-.033.053-.065.104-.1.155-.034.055-.07.107-.111.169l-.099.144a15.193 15.193 0 01-.34.457c-.04.05-.08.102-.121.151l-.107.128-.007.008a6.987 6.987 0 01-.262.298l-.149.16-.116.12a9.562 9.562 0 01-.204.198l-.03.03-.072.069a9.05 9.05 0 01-.263.235l-.025.022-.029.026-.042.035a11.7 11.7 0 01-.22.18l-.07.055-.018.013a8.904 8.904 0 01-.194.146c-.029.02-.057.042-.086.063a7.7 7.7 0 01-.22.152l-.057.04a8.865 8.865 0 01-.293.185l-.062.037a10.424 10.424 0 01-.307.173l-.037.02-.196.103-.108.052-.012.006a6.196 6.196 0 01-.315.143c-.065.028-.13.054-.196.08l-.035.014-.086.034c-.07.026-.143.05-.215.075l-.039.014-.064.023a8.056 8.056 0 01-.323.097l-.63.173a7.285 7.285 0 01-.33.08l-.07.015c-.053.012-.104.023-.157.032l-.065.011-.085.015a2.332 2.332 0 01-.194.027l-.085.01a4.715 4.715 0 01-.16.018l-.034.003a4.861 4.861 0 01-.246.016h-.033a2.714 2.714 0 01-.155.005h-.106a3.384 3.384 0 01-.225-.007H4.86l-.15-.012-.066-.006a5.586 5.586 0 01-.187-.02l-.04-.005a5.14 5.14 0 01-.219-.035l-.054-.01a6.943 6.943 0 01-.347-.082l-.03-.008-.038-.01a5.034 5.034 0 01-.269-.086l-.063-.023a4.216 4.216 0 01-.188-.073l-.071-.031-.016-.007a4.959 4.959 0 01-.16-.074l-.026-.013a.164.164 0 00-.014-.007l-.671-.351.486.486h.016l8.995 4.742.093.048.03.014.02.01c.056.026.111.052.169.076l.016.008.073.032.195.076.022.008a.718.718 0 01.03.012l.014.004a4.693 4.693 0 00.323.1l.027.007c.073.02.147.038.22.055l.018.004.027.006.066.013.088.016c.075.014.15.026.226.038l.042.004c.064.009.128.016.193.022l.126.012.06.003.05.002.098.005c.046.002.094.002.14.003h.12c.05 0 .1-.002.161-.005h.033l.07-.004a6.17 6.17 0 00.184-.014l.033-.003a.753.753 0 00.058-.005l.108-.012.081-.01.08-.01.129-.021.082-.014.071-.012c.054-.01.107-.021.16-.033l.066-.013.059-.013c.096-.022.192-.046.287-.073l.63-.172a7.354 7.354 0 00.397-.122l.04-.015c.075-.025.149-.051.222-.078.032-.011.062-.024.093-.037l.03-.012c.067-.027.135-.054.2-.082l.128-.056.195-.09.021-.01.102-.05c.068-.034.135-.069.202-.105l.037-.02.073-.038c.08-.044.16-.092.24-.139l.026-.015a8.086 8.086 0 00.322-.2l.065-.045 1.98.902a1.748 1.748 0 002.472-1.59v-7.33l.004.004z";
    var QODER_P1 = "M11.617.576a3.904 3.904 0 00-.093-.047c-.016-.009-.033-.016-.05-.024a5.854 5.854 0 00-.166-.077l-.09-.04a4.094 4.094 0 00-.194-.074c-.017-.006-.035-.015-.053-.02l-.013-.005a5.18 5.18 0 00-.277-.088l-.07-.019a4.034 4.034 0 00-.219-.053c-.015-.003-.03-.008-.044-.012L10.253.1l-.057-.011a5.177 5.177 0 00-.225-.036L9.928.047a5.972 5.972 0 00-.191-.022L9.669.02a1.33 1.33 0 00-.058-.005L9.515.009a4.058 4.058 0 00-.111-.005C9.354 0 9.304 0 9.254 0h-.109c-.052 0-.106.004-.16.004L8.884.01A5.32 5.32 0 008.7.022l-.083.006h-.008c-.05.005-.1.013-.15.019l-.12.014c-.056.008-.112.018-.169.028-.037.006-.074.011-.11.018a7.054 7.054 0 00-.572.133l-.63.172c-.111.031-.22.064-.33.1-.037.011-.072.025-.108.037a12.91 12.91 0 00-.345.126c-.067.027-.133.054-.2.083l-.128.055a11.916 11.916 0 00-.318.15 7.376 7.376 0 00-.311.163c-.082.045-.16.092-.24.14a9.424 9.424 0 00-.35.218l-.016.01-.06.04a9.242 9.242 0 00-.51.37 12.54 12.54 0 00-.315.254l-.043.034-.01.007-.045.041c-.09.078-.18.158-.268.24l-.106.101c-.07.067-.139.135-.207.204l-.056.054-.063.067-.153.164-.12.133-.148.17c-.024.03-.049.057-.073.086l-.043.053a5.96 5.96 0 00-.123.155l-.118.151c-.04.053-.08.106-.118.16l-.075.101-.038.056-.107.155-.11.164a9.91 9.91 0 00-.168.265c-.012.02-.023.043-.037.063a12.43 12.43 0 00-.192.335l-.09.168c-.019.034-.04.07-.057.105-.011.022-.02.043-.032.065l-.092.188-.08.167a19.15 19.15 0 00-.083.192c-.017.038-.035.076-.05.115-.008.016-.014.034-.021.051-.035.083-.067.167-.1.253l-.051.134c-.04.11-.077.22-.113.33l-.02.057c0 .002 0 .005-.002.007l-.008.026c-.032.1-.06.2-.09.301l-.023.089c-.027.1-.052.2-.075.301l-.007.03a7.63 7.63 0 00-.057.267l-.008.048c-.015.074-.026.148-.038.223L.082 8.4c-.011.078-.02.156-.029.234-.006.051-.013.103-.017.154a6.57 6.57 0 00-.02.26c-.003.044-.007.086-.009.13-.004.128-.007.257-.007.386v4.056c0 1.478.42 2.741 1.138 3.692A4.75 4.75 0 002.73 18.67l9.015 4.753c-1.656-.874-2.728-2.685-2.73-5.051v-4.056c0-.13.004-.26.01-.39.002-.043.006-.085.01-.128.005-.088.01-.174.019-.261l.017-.155c.01-.077.018-.155.029-.234l.026-.164c.013-.074.025-.15.039-.223.02-.105.04-.21.064-.313l.008-.031c.023-.1.048-.201.075-.301l.023-.088c.028-.1.058-.202.09-.302l.008-.025.021-.063c.036-.11.073-.22.113-.33l.052-.134c.031-.085.065-.169.1-.253.022-.056.047-.111.07-.166a13.856 13.856 0 01.164-.358c.03-.063.06-.126.092-.188l.088-.172a9.22 9.22 0 01.187-.338l.096-.164c.034-.057.069-.112.104-.168l.1-.159a10.49 10.49 0 01.567-.786l.123-.155.116-.139c.05-.057.098-.115.148-.171a14.092 14.092 0 01.272-.297 9.706 9.706 0 01.432-.425c.088-.083.177-.163.268-.241l.054-.048a10.08 10.08 0 01.553-.435l.092-.068c.075-.053.15-.105.226-.156.019-.013.038-.028.06-.04a9.18 9.18 0 01.362-.227c.08-.047.16-.094.241-.139l.11-.058a7.643 7.643 0 01.521-.256l.126-.056a7.509 7.509 0 01.546-.208l.107-.037c.11-.036.22-.069.33-.1l.63-.172c.095-.026.191-.05.287-.072l.097-.02c.062-.014.125-.029.187-.04l.114-.018c.055-.01.11-.02.166-.028.04-.006.08-.01.12-.014.053-.007.105-.014.157-.019l.083-.006c.061-.005.123-.01.184-.013.034-.003.067-.003.101-.004l.16-.006h.11a3.187 3.187 0 01.261.008l.153.01.067.007c.064.006.128.013.192.022l.043.005a5.232 5.232 0 01.281.047l.141.03c.073.016.146.035.218.053l.07.019c.094.026.187.055.278.087l.067.025a4.326 4.326 0 01.449.19l.143.072L11.617.576z";
    var CODEX_D = "M6.13671 5.82399V4.30398C6.13671 4.17596 6.18431 4.07991 6.29527 4.01598L9.32406 2.256C9.73637 2.01602 10.228 1.90406 10.7353 1.90406C12.6382 1.90406 13.8434 3.3921 13.8434 4.97604C13.8434 5.088 13.8434 5.21602 13.8274 5.34404L10.6877 3.488C10.4975 3.37605 10.3071 3.37605 10.1168 3.488L6.13671 5.82399ZM13.209 11.7441V8.11195C13.209 7.88789 13.1138 7.72791 12.9236 7.61594L8.94344 5.27995L10.2437 4.5279C10.3547 4.46397 10.4499 4.46397 10.5609 4.5279L13.5896 6.28789C14.4619 6.79996 15.0484 7.88789 15.0484 8.94385C15.0484 10.1598 14.335 11.28 13.209 11.7441ZM5.20114 8.54404L3.90086 7.77608C3.78989 7.71215 3.7423 7.6161 3.7423 7.48808V3.96811C3.7423 2.25615 5.04259 0.960061 6.80278 0.960061C7.46883 0.960061 8.08714 1.18413 8.61056 1.58409L5.48672 3.40816C5.29649 3.52012 5.20129 3.68011 5.20129 3.90418L5.20114 8.54404ZM7.99999 10.176L6.13671 9.12005V6.8801L7.99999 5.82414L9.8631 6.8801V9.12005L7.99999 10.176ZM9.19719 15.0401C8.53113 15.0401 7.91282 14.816 7.3894 14.4161L10.5132 12.5919C10.7034 12.48 10.7987 12.3201 10.7987 12.096V7.45596L12.1149 8.22392C12.2258 8.28785 12.2734 8.3839 12.2734 8.51192V12.0319C12.2734 13.7438 10.9572 15.0401 9.19719 15.0401ZM5.43898 11.4721L2.41018 9.71211C1.53796 9.20003 0.95134 8.11211 0.95134 7.05615C0.95134 5.82414 1.68077 4.72016 2.80657 4.25611V7.9041C2.80657 8.12817 2.90177 8.28815 3.092 8.40012L7.05637 10.72L5.75609 11.4721C5.64513 11.5361 5.54993 11.5361 5.43898 11.4721ZM5.26465 14.0961C3.47278 14.0961 2.15658 12.736 2.15658 11.056C2.15658 10.928 2.17249 10.8 2.18826 10.672L5.3121 12.4961C5.50234 12.608 5.69273 12.608 5.88297 12.4961L9.8631 10.1762V11.6962C9.8631 11.8242 9.8155 11.9202 9.70454 11.9841L6.67574 13.7441C6.26344 13.9841 5.77199 14.0961 5.26465 14.0961ZM9.19719 16C11.1159 16 12.7174 14.624 13.0823 12.8C14.8582 12.3359 16 10.6559 16 8.944C16 7.82396 15.5243 6.73603 14.668 5.95201C14.7473 5.61598 14.7949 5.27995 14.7949 4.94407C14.7949 2.65612 12.9554 0.944002 10.8305 0.944002C10.4025 0.944002 9.99013 1.00794 9.57782 1.15201C8.86416 0.447988 7.88099 0 6.80278 0C4.88403 0 3.28254 1.37593 2.91768 3.19999C1.14173 3.66404 0 5.34404 0 7.056C0 8.17604 0.475669 9.26397 1.33197 10.048C1.25269 10.384 1.20509 10.72 1.20509 11.0559C1.20509 13.3438 3.04456 15.0559 5.16946 15.0559C5.59753 15.0559 6.00984 14.9921 6.42215 14.848C7.13565 15.552 8.11882 16 9.19719 16Z";
    var CURSOR_D = "M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z";
    var WINDSURF_D = "M23.78 5.004h-.228a2.187 2.187 0 00-2.18 2.196v4.912c0 .98-.804 1.775-1.76 1.775a1.818 1.818 0 01-1.472-.773L13.168 5.95a2.197 2.197 0 00-1.81-.95c-1.134 0-2.154.972-2.154 2.173v4.94c0 .98-.797 1.775-1.76 1.775-.57 0-1.136-.289-1.472-.773L.408 5.098C.282 4.918 0 5.007 0 5.228v4.284c0 .216.066.426.188.604l5.475 7.889c.324.466.8.812 1.351.938 1.377.316 2.645-.754 2.645-2.117V11.89c0-.98.787-1.775 1.76-1.775h.002c.586 0 1.135.288 1.472.773l4.972 7.163a2.15 2.15 0 001.81.95c1.158 0 2.151-.973 2.151-2.173v-4.939c0-.98.787-1.775 1.76-1.775h.194c.122 0 .22-.1.22-.222V5.225a.221.221 0 00-.22-.222z";
    var TRAE_D = "M24 20.541H3.428v-3.426H0V3.4h24V20.54zM3.428 17.115h17.144V6.827H3.428v10.288zm8.573-5.196l-2.425 2.424-2.424-2.424 2.424-2.424 2.425 2.424zm6.857-.001l-2.424 2.423-2.425-2.423 2.425-2.425 2.424 2.425z";
    var ROO_D = "M20.113 5.5l-.442 1.557a.157.157 0 01-.196.106l-7.414-2.157a.16.16 0 00-.143.028l-7.342 5.74a.159.159 0 01-.074.032l-4.37.656a.154.154 0 00-.132.162l.02.245c.005.078.071.14.152.141l5.074.128.058.002 3.75-1.953a.16.16 0 01.164.01l2.657 1.847a.152.152 0 01.066.125l-.023 2.45c0 .032.01.063.028.089l3.737 5.227c.03.04.077.065.129.065h1.182a.153.153 0 00.14-.224l-2.664-4.919a.15.15 0 01.005-.152l1.389-2.169a.156.156 0 01.062-.055l4.965-2.456a.16.16 0 01.158.01l1.418.921a.16.16 0 00.087.026h1.289c.125 0 .2-.136.13-.237l-3.578-5.29c-.074-.109-.246-.082-.282.044z";
    var CB_P0 = "M18.777 1.647c.28-.02.536.114.972.51 1.018.926 2.437 2.828 3.318 4.452l.34.631.482.24.11.06v3.638a5.206 5.206 0 00-5.32-1.23c-.491.166-1.021.471-2.08 1.082l-6.09 3.516c-1.057.61-1.586.916-1.975 1.259a5.208 5.208 0 00-1.493 5.572c.165.49.471 1.02 1.082 2.08l.315.543h-3.26c-.685 0-1.34-.135-1.939-.377-.169-.956-.009-1.789.469-2.335.158-.18.164-.189.13-.493a11.846 11.846 0 01-.057-1.711l.02-.444-.667-1.18C2.1 15.622 1.445 14.078 1.192 12.9c-.133-.647-.125-.934.04-1.146.1-.128.427-.261.822-.334.994-.175 3.162-.017 5.575.41l.25.043.551-.487c.915-.81 1.522-1.264 2.641-1.962 1.167-.73 2.484-1.331 3.967-1.807l.476-.152.261-.688c.937-2.471 1.896-4.293 2.58-4.9.235-.21.25-.22.422-.23z";
    var CB_P1 = "M12.139 18.2a1.203 1.203 0 011.642.44l1.296 2.243a1.204 1.204 0 01-2.083 1.203l-1.296-2.243a1.203 1.203 0 01.44-1.644zM18.629 14.452a1.203 1.203 0 011.642.44l1.295 2.244a1.203 1.203 0 11-2.083 1.203l-1.295-2.243a1.203 1.203 0 01.44-1.644z";
    var OC_P0 = "M16.877 1.912c.58-.27 1.14-.323 1.616-.037a.317.317 0 01-.326.542c-.227-.136-.547-.153-1.022.068-.352.165-.765.45-1.234.866 2.683 1.17 4.4 3.5 5.148 5.921a6.421 6.421 0 00-.704.184c-.578.016-1.174.204-1.502.735-.338.55-.268 1.276.072 2.069l.005.012.007.014c.523 1.045 1.318 1.91 2.2 2.284-.912 3.274-3.44 6.144-5.972 6.988v2.109h-2.11v-2.11c-1.043.417-2.086.01-2.11 0v2.11h-2.11v-2.11c-2.531-.843-5.061-3.713-5.973-6.987.882-.373 1.678-1.238 2.2-2.284l.007-.014.006-.012c.34-.793.41-1.518.071-2.069-.327-.531-.923-.719-1.503-.735a6.409 6.409 0 00-.704-.183c.749-2.421 2.466-4.751 5.149-5.922-.47-.416-.88-.701-1.234-.866-.474-.221-.794-.204-1.021-.068a.318.318 0 01-.435-.109.317.317 0 01.109-.433c.476-.286 1.036-.233 1.615.037.49.229 1.031.628 1.621 1.182A9.924 9.924 0 0112 2.568c1.199 0 2.284.19 3.256.526.59-.554 1.13-.953 1.62-1.182zM8.835 6.577a1.266 1.266 0 100 2.532 1.266 1.266 0 000-2.532zm6.33 0a1.267 1.267 0 100 2.533 1.267 1.267 0 000-2.533z";
    var OC_P1 = "M.395 13.118c-.966-1.932-.163-3.863 2.41-3.365v-.001l.05.01c.084.018.17.038.26.06.033.009.067.017.1.027.084.022.168.048.255.076l.09.027c.528 0 .95.158 1.16.501.212.343.212.87-.105 1.61-.085.17-.178.333-.276.489l-.01.017a4.967 4.967 0 01-.62.791l-.019.02c-1.092 1.117-2.496 1.336-3.295-.262z";
    var OC_P2 = "M21.193 9.753c2.574-.5 3.378 1.433 2.411 3.365-.58 1.159-1.476 1.361-2.342.96l-.011-.005a2.419 2.419 0 01-.114-.056l-.019-.01a2.751 2.751 0 01-.115-.067l-.023-.014c-.035-.022-.071-.044-.106-.068l-.05-.035c-.55-.388-1.062-1.007-1.44-1.76-.276-.647-.311-1.132-.174-1.472.176-.439.636-.639 1.23-.639.032-.011.066-.02.099-.03.08-.026.16-.05.238-.072l.117-.03a5.502 5.502 0 01.3-.067z";

    function getRootBrandIcon(key: string) {
      var k = String(key || "").toLowerCase();
      if (k.includes("dsh")) {
        return h("img", { src: DSH_ICON_B64, width: 16, height: 16, alt: "DSH", style: { width: 16, height: 16, objectFit: "contain", borderRadius: 3, display: "block" } });
      }
      if (k.includes("workbuddy")) {
        return h("img", { src: WB_ICON_B64, width: 16, height: 16, alt: "WorkBuddy", style: { width: 16, height: 16, objectFit: "contain", borderRadius: 3, display: "block" } });
      }
      if (k.includes("ccswitch") || k.includes("cc-switch")) {
        return h("img", { src: CCSWITCH_ICON_B64, width: 16, height: 16, alt: "CC Switch", style: { width: 16, height: 16, objectFit: "contain", borderRadius: 3, display: "block" } });
      }
      if (k.includes("qoder") || k.includes("lingma")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "#2ADB5C", d: QODER_P0 }),
          h("path", { fill: "#ffffff", d: QODER_P1 })
        );
      }
      if (k.includes("codex")) {
        return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "currentColor", d: CODEX_D })
        );
      }
      if (k.includes("cursor")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "currentColor", fillRule: "evenodd", d: CURSOR_D })
        );
      }
      if (k.includes("claude")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "#D97757", fillRule: "evenodd", clipRule: "evenodd", d: "M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" })
        );
      }
      if (k.includes("gemini")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "#3b82f6", d: "M12 2C12 7.5 7.5 12 2 12c5.5 0 10 4.5 10 10 0-5.5 4.5-10 10-10-5.5 0-10-4.5-10-10z" })
        );
      }
      if (k.includes("opencode")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "currentColor", d: "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" })
        );
      }
      if (k.includes("copilot")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "currentColor", d: "M12 2a8 8 0 0 0-8 8v4a4 4 0 0 0 4 4h1v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2h1a4 4 0 0 0 4-4v-4a8 8 0 0 0-8-8zm-3 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" })
        );
      }
      if (k.includes("windsurf")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "#00d084", fillRule: "evenodd", clipRule: "evenodd", d: WINDSURF_D })
        );
      }
      if (k.includes("trae")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "#32F08C", d: TRAE_D })
        );
      }
      if (k.includes("openclaw") || k.includes("clawdbot")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "#FF4D4D", fillRule: "evenodd", d: OC_P0 }),
          h("path", { fill: "#FF4D4D", d: OC_P1 }),
          h("path", { fill: "#FF4D4D", d: OC_P2 })
        );
      }
      if (k.includes("roo")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("path", { fill: "#eab308", fillRule: "evenodd", d: ROO_D })
        );
      }
      if (k.includes("codebuddy")) {
        return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
          h("rect", { width: 24, height: 24, rx: 5, fill: "#2EA99D" }),
          h("path", { fill: "#ffffff", d: CB_P0 }),
          h("path", { fill: "#ffffff", d: CB_P1 })
        );
      }
      // 公共 Agent 及默认: 翡翠绿 AI Agent 头盔
      return h("svg", { viewBox: "0 0 24 24", width: 16, height: 16, style: { display: "block" } },
        h("path", { fill: "#10b981", d: "M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h2a5 5 0 0 1 5 5v1a3 3 0 0 1 1 2.23V17a3 3 0 0 1-3 3h-1.1A6 6 0 0 1 12 22a6 6 0 0 1-4.9-2H6a3 3 0 0 1-3-3v-1.77A3 3 0 0 1 4 13v-1a5 5 0 0 1 5-5h2V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2zm-3 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-6 5a4 4 0 0 0 6 0H9z" })
      );
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
      return h(PrimitiveModal, {
              open: true,
              title: props.title,
              description: props.description,
              footer: props.footer,
              onClose: props.onClose,
              closeLabel: props.closeLabel || "Close",
              className: props.className,
              width: props.wide ? 720 : props.className === "dssm-modal-import" ? 480 : 560,
            }, props.children ? h("div", { ref: bodyRef }, props.children) : undefined);
    }

    function currentSessionId(snapshot?: SessionSnapshot) {
      if (!snapshot) return undefined;
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
      var asState = react.useState(""), addSearch = asState[0], setAddSearch = asState[1];
      var aselState = react.useState<Record<string, boolean>>({}), addSelection = aselState[0], setAddSelection = aselState[1];
      var rs = react.useState<ResultMessage | null>(null), result = rs[0] && rs[0].scope === scope ? rs[0] : null;
      // 异步操作保留发起时的页签，完成提示不能泄漏到后来切换的页面。
      function setResult(value: ResultMessage | null) { rs[1](value ? Object.assign({}, value, { scope: scope }) : null); }
      var fms = react.useState<Record<string, string>>({ root: "dsh", name: "", description: "", body: "" }), form = fms[0], setForm = fms[1];
      var cns = react.useState(""), categoryName = cns[0], setCategoryName = cns[1];
      var cds = react.useState<DestinationValue>(defaultDestination()), createDestination = cds[0], setCreateDestination = cds[1];
      var ids = react.useState<DestinationValue>(defaultDestination()), importDestination = ids[0], setImportDestination = ids[1];
      var wss = react.useState<ApiRoutes["/workspaces"]["items"]>([]), workspaceRows = wss[0], setWorkspaceRows = wss[1];
      var wps = react.useState(""), selectedWorkspace = wps[0], setSelectedWorkspace = wps[1];
      var selectedWorkspaceRef = react.useRef("");
      var workspaceListRequest = react.useRef(0);
      var wls = react.useState<{ loading: boolean; error: string | null }>({ loading: false, error: null }), workspaceList = wls[0], setWorkspaceList = wls[1];
      var wds = react.useState<Record<string, { loading: boolean; error: string | null; roots: RootView[] }>>({}), workspaceDetails = wds[0], setWorkspaceDetails = wds[1];
      var us = react.useState<UploadSelection | null>(null), upload = us[0], setUpload = us[1];
      var ds = react.useState<Detail | null>(null), detail = ds[0], setDetail = ds[1];
      var inflightRef = react.useRef(false);
      var draggingRef = react.useRef<{ root: string; name: string; currentCategoryId: string } | null>(null);
      var importInputRef = react.useRef<HTMLInputElement>(null);
      var folderInputRef = react.useRef<HTMLInputElement>(null);
      var pickerOpenRef = react.useRef(false);
      var workspaceRequests = react.useRef<Record<string, number>>({});
      var workspaceEpoch = react.useRef(0);
      react.useEffect(function () { return function () { workspaceEpoch.current++; }; }, []);
      function refresh(silent: boolean) { if (!silent) setSnapshot({ loading: true, error: null, data: snapshot.data }); return sessionApi("/state").then(function (data) { setSnapshot({ loading: false, error: null, data: data }); return data; }).catch(function (error) { setSnapshot({ loading: false, error: translateError(t, error), data: snapshot.data }); }); }
      react.useEffect(function () { refresh(false); }, []);
      function post<K extends keyof ApiRoutes>(path: K, body: unknown, successKey?: string | null, successParams?: object): Promise<ApiRoutes[K]> { if (inflightRef.current) return Promise.reject({ error: "operation already in progress" }); inflightRef.current = true; setBusy(true); setResult(null); return sessionApi(path, { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(body || {}) }).then(function (data) { setResult({ ok: true, text: successKey ? t(successKey, successParams || data || {}) : t("result.updated") }); var scopedWorkspace = body && typeof (body as { workspace?: unknown }).workspace === "string" ? (body as { workspace: string }).workspace : ""; return Promise.all([refresh(true), scopedWorkspace ? loadWorkspaceDetail(scopedWorkspace) : null]).then(function () { return data; }); }).catch(function (error) { setResult({ ok: false, text: t("error.action", { error: translateError(t, error) }) }); throw error; }).finally(function () { inflightRef.current = false; setBusy(false); }); }
      function openDetail(root: RootView, skill: SkillView, workspacePath?: string) { setBusy(true); setDetail(null); setModal("detail"); sessionApi("/detail", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(workspacePath ? { root: root.key, name: skill.name, workspace: workspacePath } : { root: root.key, name: skill.name }) }).then(setDetail).catch(function (error) { setResult({ ok: false, text: t("error.action", { error: translateError(t, error) }) }); setModal(null); }).finally(function () { setBusy(false); }); }
      function updateForm(key: string, value: string) { setForm(Object.assign({}, form, { [key]: value })); }
      function submitCreate() { if (!destinationReady(createDestination, workspaceRows, userDestinations)) return; post("/create", Object.assign({}, form, { root: undefined }, destinationPayload(createDestination)), null).then(function (data) { setModal(null); setForm({ root: "dsh", name: "", description: "", body: "" }); setResult({ ok: true, text: t("result.created", { name: data.name }) + (createDestination.scope === "workspace" ? " · " + t("dest.createdInWorkspace") : "") }); }).catch(function () {}); }
      function selectUploadFiles(files: ArrayLike<UploadFile> | null) { pickerOpenRef.current = false; var selected = inspectUploadSelection(files); if (!selected) return; if (selected.error) { setUpload(null); setResult({ ok: false, text: translateError(t, selected.error) }); return; } setUpload(selected); setResult(null); }
      function openNativePicker(ref: React.RefObject<HTMLInputElement>) { if (busy || pickerOpenRef.current || !ref.current) return; pickerOpenRef.current = true; ref.current.value = ""; function release() { setTimeout(function () { pickerOpenRef.current = false; }, 0); } window.addEventListener("focus", release, { once: true }); ref.current.click(); setTimeout(function () { pickerOpenRef.current = false; }, 30000); }
      function submitImport() { if (!upload || !destinationReady(importDestination, workspaceRows, userDestinations)) return; buildUploadPayload(upload).then(function (payload) { return post("/upload", Object.assign({}, payload, destinationPayload(importDestination)), null); }).then(function (data) { var summary = summarizeImportResult(t, data); setResult({ ok: summary.ok, warning: summary.warning, text: summary.text }); if (summary.imported) { setModal(null); setUpload(null); } }).catch(function () {}); }
      var data = snapshot.data || { roots: [], writeDestinations: [], projects: [], trash: [], warnings: [] }, allRoots = data.roots || [];
      var filterKey = scope === "project" ? "project" : "user", filters = savedFilters[filterKey] || { query: "", source: "", status: "" }, query = filters.query, source = filters.source;
      function updateFilter(key: string, value: string) { setSavedFilters(function (previous) { return Object.assign({}, previous, { [filterKey]: Object.assign({}, filters, { [key]: value }) }); }); }
      function setQuery(value: string) { updateFilter("query", value); }
      function setSource(value: string) { updateFilter("source", value); }
      var selectedDetail = workspaceDetails[selectedWorkspace];
      var roots = scope === "trash" ? [] : scope === "project" ? visibleSkillRoots(selectedDetail?.roots || []) : scopeSkillRoots(allRoots);
      var filteredOptionsRoots = roots.filter(function (r) { return (r.skills || []).length > 0; });
      var activeSource = scope !== "project" && filteredOptionsRoots.some(function (root) { return root.key === source; }) ? source : "";
      function workspacePath(row: ApiRoutes["/workspaces"]["items"][number]) { return row.registeredPaths[0] || ""; }
      function selectWorkspace(path: string) {
        if (!workspaceRows.some(function (row) { return row.available && workspacePath(row) === path; })) return;
        selectedWorkspaceRef.current = path;
        setSelectedWorkspace(path);
        if (!workspaceDetails[path]) loadWorkspaceDetail(path);
      }
      function loadWorkspaces(readSelected = scope === "project", forceDetail = false) {
        var epoch = workspaceEpoch.current, request = ++workspaceListRequest.current;
        var current = function () { return epoch === workspaceEpoch.current && request === workspaceListRequest.current; };
        setWorkspaceList({ loading: true, error: null });
        return callApi("/workspaces").then(function (listed) {
          if (!current()) return [];
          var items = listed.items || [];
          setWorkspaceRows(items);
          setWorkspaceList({ loading: false, error: null });
          var selected = items.find(function (row) { return row.available && workspacePath(row) === selectedWorkspaceRef.current; }) || items.find(function (row) { return row.available && workspacePath(row); });
          var path = selected ? workspacePath(selected) : "";
          selectedWorkspaceRef.current = path;
          setSelectedWorkspace(path);
          if (readSelected && path && (forceDetail || !workspaceDetails[path])) loadWorkspaceDetail(path);
          return items;
        }).catch(function (error) {
          if (!current()) return [];
          setWorkspaceRows([]);
          selectedWorkspaceRef.current = "";
          setSelectedWorkspace("");
          setWorkspaceList({ loading: false, error: translateError(t, error) });
          return [];
        });
      }
      // 只读所选登记路径：详情按路径缓存，操作完成后只重新读取原工作区。
      function loadWorkspaceDetail(path: string) {
        var epoch = workspaceEpoch.current, request = (workspaceRequests.current[path] || 0) + 1;
        workspaceRequests.current[path] = request;
        var current = function () { return epoch === workspaceEpoch.current && request === workspaceRequests.current[path]; };
        setWorkspaceDetails(function (previous) { return Object.assign({}, previous, { [path]: { loading: true, error: null, roots: previous[path] ? previous[path].roots : [] } }); });
        return callApi("/workspace-skills", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ workspace: path }) }).then(function (detail) { if (current()) setWorkspaceDetails(function (previous) { return Object.assign({}, previous, { [path]: { loading: false, error: null, roots: detail.roots || [] } }); }); }).catch(function (error) { if (current()) setWorkspaceDetails(function (previous) { return Object.assign({}, previous, { [path]: { loading: false, error: translateError(t, error), roots: [] } }); }); });
      }
      function refreshWorkspaceDetails() {
        workspaceEpoch.current++;
        setWorkspaceDetails({});
        return loadWorkspaces(true, true);
      }
      function openCreate() { setForm(Object.assign({}, form, { root: "dsh" })); setCreateDestination(defaultDestination()); setModal("create"); loadWorkspaces(); }
      function openImport() { setResult(null); setUpload(null); setImportDestination(defaultDestination()); setModal("import"); loadWorkspaces(); }
      var userDestinations = (data.writeDestinations || []).filter(function (item) { return item.key === "dsh" || item.key === "agents"; });
      // 项目条目用原项目的登记路径恢复：不依赖当前会话。找不到登记路径时不编造，交给服务端按会话判断。
      function trashRestoreBody(item: TrashItem) {
        var projectRoot = item.root && item.root.scope === "project" ? item.root.projectRoot : "";
        var row = projectRoot ? workspaceRows.find(function (candidate) { return candidate.projectRoot === projectRoot && candidate.available; }) : undefined;
        return row ? { id: item.id, workspace: row.registeredPaths[0] || row.path } : { id: item.id };
      }
      function trashRootLabel(item: TrashItem) { return item.root && item.root.scope === "project" ? t("root.projectDsh") + " · " + (item.root.projectName || item.root.projectRoot) : translateOrFallback(t, "root." + (item.root?.localeKey || item.root?.key || "dsh"), item.root?.label || t("root.dsh")); }
      function renderRootIcon(key: string) {
        return h("span", { className: "dssm-brand-icon", "aria-hidden": true, style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 } }, getRootBrandIcon(key));
      }
      // 下拉菜单筛选：只保留技能数量 > 0 的来源
      var options = ([{
        value: "",
        label: t("filter.all") as React.ReactNode
      }] as { value: string; label: React.ReactNode }[]).concat(filteredOptionsRoots.map(function (root) {
        return {
          value: root.key,
          label: t("filter.option", { name: rootDisplayName(t, root), count: root.skills.length })
        };
      }));

      function renderFallback(skill: SkillView) {
        if (!skill.fallbackTo) return null;
        var target = allRoots.find(function (root) { return root.key === skill.fallbackTo!.root; });
        if (!target) return null;
        return h("div", { className: "dssm-note dssm-fallback" }, t("status.fallback." + skill.fallbackTo.scope, { source: rootDisplayName(t, target) }));
      }
      function renderSkillStatusIcon(key: string, title?: string, cls?: string) {
        var isSuccess = key === "status.enabled";
        var isWarn = key === "status.disabled";
        var isError = key === "status.invalid";
        var color = isSuccess ? "var(--dsw-alias-state-success-primary, #51b976)" :
                    isWarn ? "var(--dsw-alias-state-warn-primary, #d49245)" :
                    isError ? "var(--dsw-alias-state-error-primary, #ef7272)" :
                    "var(--dsw-alias-label-tertiary, #a0a0a0)";
        var iconD = isSuccess ? "M8 0a8 8 0 100 16A8 8 0 008 0zm3.28 6.72l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 111.06-1.06L7 9.44l3.47-3.47a.75.75 0 011.06 1.06z" :
                    isWarn ? "M8 0a8 8 0 100 16A8 8 0 008 0zm3 8.75H5a.75.75 0 010-1.5h6a.75.75 0 010 1.5z" :
                    isError ? "M8.982 1.566a1.13 1.13 0 00-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 01-1.1 0L7.1 5.995A.905.905 0 018 5zm.002 6a1 1 0 110 2 1 1 0 010-2z" :
                    "M8.28 1.34a.75.75 0 00-.56 0l-6.5 2.5a.75.75 0 000 1.41l6.5 2.5a.75.75 0 00.56 0l6.5-2.5a.75.75 0 000-1.41l-6.5-2.5zm5.97 6.41L8 10.15 1.75 7.75l-.5.19a.75.75 0 000 1.41l6.5 2.5a.75.75 0 00.56 0l6.5-2.5a.75.75 0 000-1.41l-.56-.2zM14.25 11.5L8 13.9 1.75 11.5l-.5.19a.75.75 0 000 1.41l6.5 2.5a.75.75 0 00.56 0l6.5-2.5a.75.75 0 000-1.41l-.56-.19z";
        var tooltip = title || t(key);
        return h("span", {
          className: "dssm-status " + (cls || ""),
          title: tooltip,
          "aria-label": tooltip,
          style: { display: "inline-flex", alignItems: "center", justifyContent: "center", color: color, width: 20, height: 20, verticalAlign: "middle" }
        },
          h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "currentColor", "aria-hidden": true },
            h("path", { d: iconD })
          )
        );
      }
      function renderSkill(root: RootView, skill: SkillView, workspacePath?: string) {
        var scoped = function (extra: Record<string, unknown>) { return workspacePath ? Object.assign({}, extra, { workspace: workspacePath }) : extra; };
        var enabled = isSkillEnabled(skill);
        var showSwitch = root.toggleable !== false;
        var statusKey = skill.shadowedBy ? "status.shadowed" : skill.loadable === false ? "status.invalid" : enabled ? "status.enabled" : "status.disabled";
        var cls = skill.shadowedBy ? "dssm-shadowed" : enabled ? "dssm-enabled" : "dssm-disabled";
        var showStatus = !showSwitch || !!skill.shadowedBy || skill.loadable === false;
        var menu: { value: string; label: string; danger?: boolean }[] = [{ value: "detail", label: t("btn.detail") }];
        var categories = root.categories || [];
        var currentCatId = skill.categoryId || "";
        categories.forEach(function (category) {
          if (category.id !== currentCatId) {
            menu.push({ value: "category:" + category.id, label: t("category.assign", { name: category.name }) });
          }
        });
        if (categories.length && currentCatId !== "") {
          menu.push({ value: "category:", label: t("category.assign", { name: t("category.uncategorized") }) });
        }
        if (skill.installSource) menu.push({ value: "update", label: t("repo.manageUpdate") });
        if (root.mutable) menu.push({ value: "trash", label: t("btn.trash"), danger: true });
        var statusTitle = skill.shadowedBy ? t("status.shadowedBy", { source: (function () { var winner = allRoots.find(function (item) { return item.key === skill.shadowedBy!.root; }); return winner ? rootDisplayName(t, winner) : skill.shadowedBy!.root; })() }) : undefined;
        var skillActions: React.ReactNode[] = [
          h(SourceSelect, { action: true, icon: moreIcon(), label: t("btn.more"), disabled: busy, options: menu, onChange: function (action) {
          if (action === "detail") openDetail(root, skill, workspacePath);
          if (action.indexOf("category:") === 0) {
            var categoryId = action.slice("category:".length);
            var category = categories.find(function (item) { return item.id === categoryId; });
            post("/category-assign", scoped({ root: root.key, name: skill.name, category: categoryId }), "category.assigned", { name: skill.name, category: category ? category.name : t("category.uncategorized") });
          }
          if (action === "update") { repositoryUI.focusSource(skill.installSource!, skill.name); setScope("repositories"); }
          if (action === "trash") setModal({ type: "trash-confirm", root: root.key, name: skill.name, workspace: workspacePath });
        } }),
        ];
        skillActions.push(h("div", { className: "dssm-row-state" }, showStatus ? renderSkillStatusIcon(statusKey, statusTitle, cls) : null, showSwitch ? enableSwitch(enabled, t("skill.toggle") + " " + skill.name, busy || root.enabled === false || skill.loadable === false, function () { post(enabled ? "/disable" : "/enable", scoped({ root: root.key, name: skill.name })); }) : null));
        var skillName = skill.declaredName || skill.name;
        var description = skill.description || t("note.missing");
        var canDrag = root.mutable === true || !!(root.categories && root.categories.length);
        return h("div", {
          key: root.key + ":" + skill.name,
          className: "dssm-skill-row",
          draggable: canDrag,
          onDragStart: function (e: React.DragEvent) {
            if (!canDrag) return;
            var dragInfo = { root: root.key, name: skill.name, currentCategoryId: skill.categoryId || "" };
            draggingRef.current = dragInfo;
            e.dataTransfer.setData("text/plain", JSON.stringify(dragInfo));
            e.dataTransfer.effectAllowed = "move";
            (e.currentTarget as HTMLElement).classList.add("dragging");
          },
          onDragEnd: function (e: React.DragEvent) {
            draggingRef.current = null;
            (e.currentTarget as HTMLElement).classList.remove("dragging");
            clearDragHighlights(e.currentTarget as HTMLElement);
          },
          onDragOver: function (e: React.DragEvent) {
            if (!draggingRef.current || draggingRef.current.root !== root.key || draggingRef.current.name === skill.name) return;
            e.preventDefault();
            e.stopPropagation();
            var rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            (e.currentTarget as HTMLElement).classList.toggle("drop-before", e.clientY < rect.top + rect.height / 2);
            (e.currentTarget as HTMLElement).classList.toggle("drop-after", e.clientY >= rect.top + rect.height / 2);
          },
          onDragLeave: function (e: React.DragEvent) {
            (e.currentTarget as HTMLElement).classList.remove("drop-before", "drop-after");
          },
          onDrop: function (e: React.DragEvent) {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLElement).classList.remove("drop-before", "drop-after");
            var dragInfo = draggingRef.current;
            draggingRef.current = null;
            clearDragHighlights(e.currentTarget as HTMLElement);
            if (!dragInfo || dragInfo.root !== root.key || dragInfo.name === skill.name) return;
            var rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            post("/category-move", scoped({ root: root.key, name: dragInfo.name, category: skill.categoryId || "", targetName: skill.name, position: e.clientY < rect.top + rect.height / 2 ? "before" : "after" }), "category.moved", { name: dragInfo.name });
          }
        },
        canDrag ? h("div", { className: "dssm-drag-handle", title: t("category.dragTip") }, "⋮⋮") : null,
        h("div", { className: "dssm-skill-copy" }, h("div", { className: "dssm-name" }, skillName), h("div", { className: "dssm-skill-desc", title: skill.description || undefined }, description), renderFallback(skill)), h("div", { className: "dssm-skill-actions" }, skillActions));
      }
      var rows = roots.flatMap(function (root) { return (root.skills || []).map(function (skill) { return { root: root, skill: skill }; }); });
      var filteredRows = rows.filter(function (row) { return (!activeSource || row.root.key === activeSource) && (!filters.status || skillStatus(row.skill) === filters.status) && matchSkillQuery(Object.assign({}, row.skill, { rootLabel: rootDisplayName(t, row.root) }), query); });
      var summary = countSkillStatuses(rows);
      function sourceExtra(root: RootView, workspacePath: string | undefined, displayName: string) {
        var scoped = workspacePath ? { root: root.key, workspace: workspacePath } : { root: root.key };
        var actions: React.ReactNode[] = [];
        actions.push(iconButton(t("category.create"), strokeIcon("M8 2.5v11M2.5 8h11"), function () { setCategoryName(""); setModal({ type: "category-create", root: root.key, workspace: workspacePath }); }, false, busy));
        if (canToggleSource(root)) actions.push(h(SkillSwitch, { on: root.enabled, disabled: busy, label: t("source.toggle") + " " + displayName, onClick: function () { post(root.enabled ? "/source-disable" : "/source-enable", scoped); } }));
        return h("span", { className: "dssm-source-actions", onClick: function (event: React.MouseEvent) { event.stopPropagation(); } }, actions);
      }
      function AntdFolderClosed() {
        return h("svg", { viewBox: "0 0 1024 1024", width: 16, height: 16, "aria-hidden": true, focusable: "false", style: { display: "inline-block", verticalAlign: "-2px", flexShrink: 0, marginRight: 6 } },
          h("path", { fill: "#f59e0b", d: "M880 298.4H521L403.7 186.2a8.15 8.15 0 0 0-5.5-2.2H144c-17.7 0-32 14.3-32 32v592c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V330.4c0-17.7-14.3-32-32-32z" }));
      }
      function AntdFolderOpen() {
        return h("svg", { viewBox: "0 0 1024 1024", width: 16, height: 16, "aria-hidden": true, focusable: "false", style: { display: "inline-block", verticalAlign: "-2px", flexShrink: 0, marginRight: 6 } },
          h("path", { fill: "#fde68a", opacity: 0.85, d: "M159 768h612.3l103.4-256H262.3z" }),
          h("path", { fill: "#f59e0b", d: "M928 444H820V330.4c0-17.7-14.3-32-32-32H473L355.7 186.2a8.15 8.15 0 0 0-5.5-2.2H96c-17.7 0-32 14.3-32 32v592c0 17.7 14.3 32 32 32h698c13 0 24.8-7.9 29.7-20l134-332c1.5-3.8 2.3-7.9 2.3-12 0-17.7-14.3-32-32-32zM136 256h188.5l119.6 114.4H748V444H238c-13 0-24.8 7.9-29.7 20L136 643.2V256zm635.3 512H159l103.3-256h612.4L771.3 768z" }));
      }
      function clearDragHighlights(element: HTMLElement) {
        var section = element.closest(".dssm-section");
        if (!section) return;
        Array.prototype.forEach.call(section.querySelectorAll(".dssm-cat.drag-over, .dssm-skill-row.drop-before, .dssm-skill-row.drop-after"), function (target: HTMLElement) {
          target.classList.remove("drag-over", "drop-before", "drop-after");
        });
      }
      function renderCategory(root: RootView, bucket: { id: string; name: string; locked: boolean; skills: { root: RootView; skill: SkillView }[]; scope?: { root: RootView; skill: SkillView }[] }, workspacePath?: string, keyPrefix?: string, allRootRows?: { root: RootView; skill: SkillView }[]) {
        var expansionKey = JSON.stringify(["category", keyPrefix || "", root.key, bucket.id || "none"]);
        var open = expanded[expansionKey] === undefined ? !!(query || filters.status) : expanded[expansionKey];
        var counted = bucket.scope || bucket.skills;
        var usable = counted.filter(function (row) { return row.skill.loadable !== false; });
        var enabledCount = usable.filter(function (row) { return isSkillEnabled(row.skill); }).length;
        var allOn = usable.length > 0 && enabledCount === usable.length;
        var scoped = function (extra: Record<string, unknown>) { return workspacePath ? Object.assign({}, extra, { workspace: workspacePath }) : extra; };
        return h("section", {
          key: root.key + ":" + (bucket.id || "none"),
          className: "dssm-cat",
          "aria-label": bucket.name,
          onDragOver: function (e: React.DragEvent) {
            e.preventDefault();
            if (draggingRef.current && draggingRef.current.root === root.key && draggingRef.current.currentCategoryId !== bucket.id) {
              (e.currentTarget as HTMLElement).classList.add("drag-over");
            } else {
              (e.currentTarget as HTMLElement).classList.remove("drag-over");
            }
          },
          onDragLeave: function (e: React.DragEvent) {
            var related = e.relatedTarget as Node | null;
            if (related && (e.currentTarget as HTMLElement).contains(related)) return;
            (e.currentTarget as HTMLElement).classList.remove("drag-over");
          },
          onDrop: function (e: React.DragEvent) {
            e.preventDefault();
            draggingRef.current = null;
            (e.currentTarget as HTMLElement).classList.remove("drag-over");
            clearDragHighlights(e.currentTarget as HTMLElement);
            try {
              var dragData = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
              if (dragData && dragData.name && dragData.root === root.key) {
                if (dragData.currentCategoryId !== bucket.id) {
                  post("/category-assign", scoped({ root: root.key, name: dragData.name, category: bucket.id }), "category.assigned", { name: dragData.name, category: bucket.name });
                }
              }
            } catch (_err) {
              // 忽略非法的外部或非本插件拖拽载荷
            }
          }
        },
          h("div", { className: "dssm-cat-head" },
            h("button", { type: "button", className: "dssm-cat-main", "aria-expanded": open, onClick: function () { setExpanded(function (previous) { var next: Record<string, boolean> = {}; next[expansionKey] = !open; return Object.assign({}, previous, next); }); } },
              h("span", { className: "dssm-cat-title" }, open ? h(AntdFolderOpen) : h(AntdFolderClosed), bucket.name),
              h("span", { className: "dssm-count" }, t("category.progress", { count: counted.length, enabled: enabledCount, usable: usable.length }))),
            h("span", { className: "dssm-source-actions", onClick: function (event: React.MouseEvent) { event.stopPropagation(); } },
              bucket.locked ? null : iconButton(t("category.addSkills"), strokeIcon("M8 2.5v11M2.5 8h11"), function () {
                var catMap: Record<string, string> = {};
                (root.categories || []).forEach(function (c) { catMap[c.id] = c.name; });
                var sourceList = allRootRows || bucket.scope || bucket.skills;
                var candidates = sourceList.filter(function (row) { return row.skill.categoryId !== bucket.id; }).map(function (row) {
                  return {
                    name: row.skill.name,
                    declaredName: row.skill.declaredName,
                    description: row.skill.description,
                    currentCatName: row.skill.categoryId && catMap[row.skill.categoryId] || t("category.uncategorized")
                  };
                });
                setAddSelection({}); setAddSearch("");
                setModal({ type: "category-add", root: root.key, id: bucket.id, name: bucket.name, workspace: workspacePath, skills: candidates });
              }, false, busy),
              bucket.locked ? null : iconButton(t("category.rename"), strokeIcon("M9.2 2.8l4 4L6.2 13.8H2.2v-4z"), function () { setCategoryName(bucket.name); setModal({ type: "category-rename", root: root.key, id: bucket.id, name: bucket.name, workspace: workspacePath }); }, false, busy),
              bucket.locked ? null : iconButton(t("category.delete"), strokeIcon("M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.7 8.5h4.6L11 4.5"), function () { setModal({ type: "category-delete", root: root.key, id: bucket.id, name: bucket.name, workspace: workspacePath }); }, true, busy),
              enableSwitch(allOn, t("category.toggle") + " " + bucket.name, busy || root.enabled === false || usable.length === 0, function () {
                post(allOn ? "/category-disable" : "/category-enable", scoped({ root: root.key, category: bucket.id }));
              }))),
          open ? (bucket.skills.length ? h("div", { className: "dssm-skill-list" }, bucket.skills.map(function (row) { return renderSkill(root, row.skill, workspacePath); })) : h("div", { className: "dssm-empty" }, t("category.empty"))) : null);
      }
      function renderSourceBody(root: RootView, filtered: { root: RootView; skill: SkillView }[], workspacePath?: string, keyPrefix?: string, scopeRows?: { root: RootView; skill: SkillView }[]) {
        var categories = root.categories || [];
        var orderRows = function (list: { root: RootView; skill: SkillView }[], id: string) {
          var savedOrder = root.categoryOrder && root.categoryOrder[id] || [];
          var ranks: Record<string, number> = Object.create(null);
          savedOrder.forEach(function (name, index) { ranks[name] = index; });
          return list.map(function (row, index) { return { row: row, index: index, rank: ranks[row.skill.name] }; }).sort(function (a, b) {
            if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
            if (a.rank !== undefined) return -1;
            if (b.rank !== undefined) return 1;
            return a.index - b.index;
          }).map(function (item) { return item.row; });
        };
        if (!categories.length) return filtered.length ? h("div", { className: "dssm-skill-list" }, orderRows(filtered, "").map(function (row) { return renderSkill(root, row.skill, workspacePath); })) : h("div", { className: "dssm-empty" }, t("empty.source"));
        var known: Record<string, boolean> = {};
        var allRows = scopeRows || filtered;
        categories.forEach(function (item) { known[item.id] = true; });
        var inCategory = function (list: { root: RootView; skill: SkillView }[], id: string) {
          return orderRows(list.filter(function (row) { return id ? row.skill.categoryId === id : !row.skill.categoryId || !known[row.skill.categoryId]; }), id);
        };
        var buckets = categories.map(function (item) { return { id: item.id, name: item.name, locked: false, skills: inCategory(filtered, item.id), scope: inCategory(allRows, item.id) }; });
        buckets.push({ id: "", name: t("category.uncategorized"), locked: true, skills: inCategory(filtered, ""), scope: inCategory(allRows, "") });
        var searching = !!(query || filters.status);
        return h("div", null, h("p", { className: "dssm-note dssm-cat-note" }, t("category.note")), buckets.filter(function (bucket) { return !searching || bucket.skills.length; }).map(function (bucket) { return renderCategory(root, bucket, workspacePath, keyPrefix, allRows); }));
      }
      function renderRoot(root: RootView, workspacePath?: string, rowsForRoot?: { root: RootView; skill: SkillView }[], keyPrefix?: string) {
        var scopeRows = (rowsForRoot || rows).filter(function (row) { return row.root.key === root.key; });
        var filtered = (rowsForRoot || filteredRows).filter(function (row) { return row.root.key === root.key; });
        if (activeSource && root.key !== activeSource || (query || filters.status) && !filtered.length) return null;
        var expansionKey = JSON.stringify([filterKey, keyPrefix || "", root.key, query, activeSource, filters.status]);
        // 选中工作区的来源默认展开，直接显示技能；全局来源默认行为保持不变。
        var open = expanded[expansionKey] === undefined ? (workspacePath ? true : !!(query || activeSource || filters.status)) : expanded[expansionKey];
        var displayName = workspacePath ? rootDisplayName(t, Object.assign({}, root, { projectName: undefined })) : rootDisplayName(t, root);
        return h("section", { key: (keyPrefix || "") + root.key, className: "dssm-source", "data-source-key": root.key },
          h("div", { className: "dssm-source-head" },
            h("button", { type: "button", className: "dssm-source-toggle", "aria-expanded": open, onClick: function () { setExpanded(function (previous) { var next: Record<string, boolean> = {}; next[expansionKey] = !open; return Object.assign({}, previous, next); }); } }, foldChevron(h, open), h("div", { className: "dssm-source-label" }, renderRootIcon(root.key), h("span", { className: "dssm-source-title" }, displayName), h("span", { className: "dssm-count" }, t(countKey("summary.group", filtered.length), { count: filtered.length })), h("span", { className: "dssm-source-path", title: root.path }, root.path))),
            sourceExtra(root, workspacePath, displayName)),
          open ? h("div", { className: "dssm-source-body", role: "region" }, renderSourceBody(root, filtered, workspacePath, keyPrefix, scopeRows)) : null);
      }
      function renderList() {
        var project = scope === "project", path = project ? selectedWorkspace : undefined;
        var groups = roots.map(function (root) { return renderRoot(root, path, undefined, path ? path + "|" : undefined); }).filter(Boolean);
        var body: React.ReactNode = groups.length ? groups : h("div", { className: "dssm-empty" }, query || filters.status ? t("empty.search") : t("empty.source"));
        if (project) {
          if (workspaceList.error) body = h("div", { className: "dssm-feedback dssm-error", role: "alert" }, t("workspace.listFailed", { error: workspaceList.error }));
          else if (workspaceList.loading || selectedWorkspace && (!selectedDetail || selectedDetail.loading)) body = h("div", { className: "dssm-empty" }, t("workspace.loading"));
          else if (!selectedWorkspace) body = h("div", { className: "dssm-empty" }, t(workspaceRows.length ? "workspace.unavailable" : "project.empty"));
          else if (selectedDetail?.error) body = h("div", { className: "dssm-feedback dssm-error", role: "alert" }, t("workspace.loadFailed", { error: selectedDetail.error }));
          else if (!rows.length && !query && !filters.status) body = h("div", { className: "dssm-empty" }, t("workspace.noSkills"));
        }
        return h("div", { key: "sources", id: "dssm-scope-panel", role: "tabpanel", "aria-labelledby": "dssm-tab-" + scope, className: "dssm-sources" }, body);
      }
      function renderTrash() {
        return h("div", { key: "trash", id: "dssm-scope-panel", role: "tabpanel", "aria-labelledby": "dssm-tab-trash", className: "dssm-trash-panel" },
          data.trash.length ? data.trash.map(function (item) {
            return h("div", { key: item.id, className: "dssm-trash-item", role: "group", "aria-label": item.name },
              h("div", { className: "dssm-trash-main" },
                h("div", { className: "dssm-name" }, item.name),
                h("div", { className: "dssm-trash-meta" },
                  h("time", { dateTime: item.deletedAt }, t("trash.deletedAt", { time: formatTrashTime(t, item.deletedAt) })),
                  h("span", { className: "dssm-trash-source" }, t("trash.source", { source: trashRootLabel(item) })))),
              h("div", { className: "dssm-trash-actions" },
                iconButton(t("btn.restore"), strokeIcon("M3.5 6.5A4.5 4.5 0 1 1 5 11.5M3.5 3.5v3h3"), function () { post("/trash-restore", trashRestoreBody(item), "result.restored", { name: item.name }).catch(function () {}); }, false, busy),
                iconButton(t("btn.delete.forever"), strokeIcon("M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.7 8.5h4.6L11 4.5"), function () { setModal({ type: "delete-confirm", id: item.id, name: item.name }); }, true, busy)));
          }) : h("div", { className: "dssm-empty" }, t("trash.empty")));
      }
      var repositoryUI = useRepositoryUI({ active: scope === "repositories", t: t, onInstalled: function () { return Promise.all([refresh(false), refreshWorkspaceDetails()]); } });
      function getTabIcon(tabVal: string) {
        var d = tabVal === "user" ? "M8 0a8 8 0 100 16A8 8 0 008 0zm6.5 8a6.5 6.5 0 01-.65 2.82L10.3 8.35a.75.75 0 00-1.06 0L8.2 9.4V6.5a.75.75 0 00-.75-.75h-1V4.25a.75.75 0 00-.75-.75h-1a6.47 6.47 0 013.3-1.95v1.2a.75.75 0 00.75.75h1.5a.75.75 0 00.75-.75V2.3A6.52 6.52 0 0114.5 8z" :
                tabVal === "project" ? "M1.75 2.5h3.44l1.5 1.5h7.56c.966 0 1.75.784 1.75 1.75v7.5a1.75 1.75 0 01-1.75 1.75H1.75A1.75 1.75 0 010 13.25V4.25C0 3.284.784 2.5 1.75 2.5z" :
                tabVal === "repositories" ? "M8 0a8 8 0 100 16A8 8 0 008 0zm2.93 5.07l-1.5 4.5a.75.75 0 01-.43.43l-4.5 1.5a.375.375 0 01-.47-.47l1.5-4.5a.75.75 0 01.43-.43l4.5-1.5a.375.375 0 01.47.47z" :
                "M5.5 1.25h5c.4 0 .75.35.75.7V3h2.5c.5 0 .9.4.9.9s-.4.9-.9.9h-.35l-.65 8.1a1.6 1.6 0 0 1-1.6 1.5H4.85a1.6 1.6 0 0 1-1.6-1.5L2.6 4.8H2.25c-.5 0-.9-.4-.9-.9s.4-.9.9-.9H4.75V1.95c0-.4.35-.7.75-.7z";
        return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "currentColor", style: { marginRight: 6, display: "inline-block", verticalAlign: "-2px" }, "aria-hidden": true },
          h("path", { d: d })
        );
      }
      var tabItems = ["user", "project", "repositories", "trash"].map(function (value) {
        var text = t("scope." + value);
        var count = value === "trash" ? (data.trash || []).length : 0;
        var icon = getTabIcon(value);
        return {
          value: value,
          id: "dssm-tab-" + value,
          panelId: "dssm-scope-panel",
          label: count > 0 ? [icon, text, h("span", { className: "dssm-trash-count" }, count)] : [icon, text]
        };
      });
      var tabs = h(SegmentedTabs, { key: "tabs", className: "dssm-scope-tabs", label: t("scope.label"), value: scope, onChange: function (next: string) { setScope(next); if (next === "project" || next === "trash") loadWorkspaces(next === "project"); if (next === "trash") refresh(true); }, items: tabItems });
      var skillControls = [ scope === "project" ? null : h("div", { key: "summary", className: "dssm-summary" }, [["total", "summary.total"], ["enabled", "summary.enabled"], ["disabled", "summary.disabled"], ["invalid", "summary.invalid"]].map(function (item) { return h("div", { key: item[1], className: "dssm-stat" }, h("strong", null, summary[item[0]]), t(countKey(item[1], summary[item[0]]), { count: summary[item[0]] }).replace(String(summary[item[0]]), "")); })), h("div", { key: "filters", className: "dssm-filters" }, scope === "project" ? null : h("div", { className: "dssm-source-filter" }, h(SourceSelect, { value: activeSource, label: t("filter.source"), options: options, onChange: setSource })), h("div", { className: "dssm-status-filter" }, h(SourceSelect, { value: filters.status, label: t("filter.status"), options: [{ value: "", label: t("filter.statusAll") }].concat(["enabled", "disabled", "shadowed", "invalid"].map(function (value) { return { value: value, label: t("status." + value) }; })), onChange: function (value) { updateFilter("status", value); } })), scope === "project" ? h("div", { className: "dssm-project-filter" }, h(SourceSelect, { value: selectedWorkspace, label: t("filter.workspace"), disabled: workspaceList.loading || !workspaceRows.length, options: workspaceRows.map(function (row) { return { value: workspacePath(row), label: row.name + (!row.available ? " · " + t("workspace.unavailable") : "") + (workspaceRows.filter(function (other) { return other.name === row.name; }).length > 1 ? " · " + workspacePath(row) : ""), disabled: !row.available || !workspacePath(row) }; }), onChange: selectWorkspace })) : null, h(Input, { className: "dssm-search", allowClear: true, value: query, "aria-label": t("search"), placeholder: t("search.placeholder"), onChange: function (e) { setQuery(e.target.value); } }),
        scope !== "trash" ? h("div", { className: "dssm-filter-actions" },
          filterActionButton(t("btn.refresh"), strokeIcon("M13.5 8A5.5 5.5 0 118 2.5c2.3 0 4.3 1.4 5.1 3.5m.4-3.5v3.5H10"), function () { refresh(false); if (scope === "project") refreshWorkspaceDetails(); }, busy || snapshot.loading),
          filterActionButton(t("btn.create"), strokeIcon("M8 2.5v11M2.5 8h11"), openCreate, busy, t("btn.create") + "…"),
          filterActionButton(t("import.global"), strokeIcon("M2.5 10.5v2a1 1 0 001 1h9a1 1 0 001-1v-2M8 2.5v7M5 5.5l3-3 3 3"), openImport, busy)
        ) : null)];
      var content: React.ReactNode[] = ([h("style", { key: "css" }, CSS), h("div", { key: "head", className: "dssm-head" }, h("div", { className: "dssm-title-block" }, h("div", { className: "dssm-title-row" }, h("h2", { className: "dssm-title" }, t("title")), h("div", { className: "dssm-feedback-links" }, h(PrimitiveButton, { variant: "outline", size: "sm", "aria-label": t("link.project"), icon: h(GithubMark16), onClick: function () { window.open("https://github.com/MichengAI/dsh-skills-manager", "_blank", "noreferrer"); } }, t("link.project")), h(PrimitiveButton, { variant: "outline", size: "sm", "aria-label": t("link.feedback"), icon: h(FeedbackIcon), onClick: function () { window.open("https://github.com/MichengAI/dsh-skills-manager/issues", "_blank", "noreferrer"); } }, t("link.feedback")))), h("p", { className: "dssm-desc" }, t("desc")))), tabs] as React.ReactNode[]).concat(scope === "trash" || scope === "repositories" ? [] : skillControls, [result && modal !== "import" ? h("div", { key: "result", className: "dssm-feedback" + (result.warning ? " dssm-warning" : result.ok ? "" : " dssm-error") }, result.text) : null], (data.warnings || []).map(function (warning, index) { return h("div", { key: "warning-" + index, className: "dssm-feedback dssm-warning", role: "alert" }, translateError(t, warning)); }), [snapshot.error ? h("div", { key: "error", className: "dssm-feedback dssm-error" }, snapshot.error) : null, snapshot.loading && !snapshot.data ? h("div", { key: "loading", className: "dssm-empty" }, t("loading")) : scope === "repositories" ? repositoryUI.content : scope === "trash" ? renderTrash() : renderList()]);

      if (modal === "create") content.push(h(Modal, { key: "create", title: t("create.title"), closeLabel: t("btn.close"), onClose: function () { setModal(null); } }, h("div", { className: "dssm-form" }, h(DestinationPicker, { t: t, value: createDestination, disabled: busy, allowAgents: true, workspaces: workspaceRows, userDestinations: userDestinations, onChange: function (next: Partial<DestinationValue>) { setCreateDestination(Object.assign({}, createDestination, next)); } }), [["name", "create.name", "create.name.placeholder"], ["description", "create.description", "create.description.placeholder"]].map(function (field) {        return h("label", { key: field[0], className: "dssm-field" }, h("span", { className: "dssm-label" }, t(field[1])), h(Input, { value: form[field[0]], placeholder: t(field[2]), onChange: function (e: React.ChangeEvent<HTMLInputElement>) { updateForm(field[0], e.target.value); } })); }), h("label", { className: "dssm-field" }, h("span", { className: "dssm-label" }, t("create.body")), h(Input.TextArea, { rows: 8, value: form.body, placeholder: t("create.body.placeholder"), onChange: function (e: React.ChangeEvent<HTMLTextAreaElement>) { updateForm("body", e.target.value); } })), h("p", { className: "dssm-help" }, t("create.chat.note"))), h("div", { className: "dssm-modal-actions" }, hostButton(t("btn.cancel"), function () { setModal(null); }, "outline"), hostButton(t("btn.create.now"), submitCreate, "primary", busy || !form.name.trim() || !form.description.trim() || !form.body.trim() || !destinationReady(createDestination, workspaceRows, userDestinations)))));
      if (modal === "import") content.push(h(Modal, { key: "import", className: "dssm-modal-import", title: t("import.title"), closeLabel: t("btn.close"), onClose: function () { pickerOpenRef.current = false; setUpload(null); setResult(null); setModal(null); } },
        h("input", { ref: importInputRef, className: "dssm-hidden-input", type: "file", accept: ".zip,.md", onChange: function (event) { selectUploadFiles(event.target.files); event.target.value = ""; } }),
        h("input", { ref: folderInputRef, className: "dssm-hidden-input", type: "file", multiple: true, webkitdirectory: "", directory: "", onChange: function (event) { selectUploadFiles(event.target.files); event.target.value = ""; } }),
        h("div", { className: "dssm-dropzone", onDragOver: function (event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); event.currentTarget.classList.add("dssm-dropzone-active"); }, onDragLeave: function (event: React.DragEvent<HTMLDivElement>) { event.currentTarget.classList.remove("dssm-dropzone-active"); }, onDrop: function (event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); event.currentTarget.classList.remove("dssm-dropzone-active"); droppedFiles(event.dataTransfer).then(selectUploadFiles).catch(function (error) { setResult({ ok: false, text: translateError(t, error) }); }); } },
          h("span", { className: "dssm-dropzone-title" }, t("upload.drop.title")),
          h("span", { className: "dssm-dropzone-copy" }, t("upload.drop.copy")),
          h("div", { className: "dssm-upload-choices" }, h("button", { type: "button", className: "dssm-upload-link", disabled: busy, onClick: function (event: React.MouseEvent<HTMLButtonElement>) { event.stopPropagation(); openNativePicker(folderInputRef); } }, t("btn.folder.pick")), h("span", { className: "dssm-upload-divider" }, "/"), h("button", { type: "button", className: "dssm-upload-link", disabled: busy, onClick: function (event: React.MouseEvent<HTMLButtonElement>) { event.stopPropagation(); openNativePicker(importInputRef); } }, t("btn.file.pick")))
        ),
        upload ? h("div", { className: "dssm-file", title: upload.name }, h("span", { className: "dssm-file-kind", "aria-hidden": "true" }, upload.kind === "zip" ? "ZIP" : upload.kind === "folder" ? "DIR" : "MD"), h("span", { className: "dssm-file-name" }, upload.name), h("span", { className: "dssm-file-meta" }, t(countKey("upload.selected", upload.count), { count: upload.count, size: upload.size < 1024 ? upload.size + " B" : Math.ceil(upload.size / 1024) + " KB" })), h("button", { type: "button", className: "dssm-file-remove", "aria-label": t("upload.remove"), onClick: function () { setUpload(null); } }, "×")) : null,
        h(DestinationPicker, { t: t, value: importDestination, disabled: busy, allowAgents: true, workspaces: workspaceRows, userDestinations: userDestinations, onChange: function (next: Partial<DestinationValue>) { setImportDestination(Object.assign({}, importDestination, next)); } }),
        result ? h("div", { className: "dssm-feedback" + (result.warning ? " dssm-warning" : result.ok ? "" : " dssm-error"), role: "alert" }, result.text) : null,
        h("div", { className: "dssm-upload-requirements" }, h("div", { className: "dssm-label" }, t("upload.requirements")), h("ul", null, h("li", null, t("upload.requirement.skill")), h("li", null, t("upload.requirement.frontmatter")), h("li", null, t("upload.requirement.copy")))),
        h("div", { className: "dssm-modal-actions" }, hostButton(t("btn.cancel"), function () { pickerOpenRef.current = false; setUpload(null); setResult(null); setModal(null); }, "outline"), hostButton(busy ? t("upload.importing") : t("btn.import.now"), submitImport, "primary", busy || !upload || !destinationReady(importDestination, workspaceRows, userDestinations)))
      ));      if (modal === "detail") content.push(h(Modal, { key: "detail", wide: true, title: t("detail.title"), closeLabel: t("btn.close"), onClose: function () { setModal(null); } }, detail ? h("div", { className: "dssm-detail" }, h("div", { className: "dssm-name" }, detail.declaredName || detail.name), detail.description ? h("p", { className: "dssm-desc" }, detail.description) : null, h("div", { className: "dssm-detail-path" }, detail.path), detail.diagnostics.length ? detail.diagnostics.map(function (item, index) { return h("div", { key: index, className: "dssm-diag" }, t(item.code!, item.params || {})); }) : null, h(Input.TextArea, { readOnly: true, value: detail.body || "", autoSize: { minRows: 6, maxRows: 16 } })) : h("div", { className: "dssm-empty" }, t("loading"))));
      if (modal && typeof modal === "object" && modal.type === "trash-confirm") content.push(h(Modal, { key: "trash-confirm", title: t("confirm.trash.title"), description: t("confirm.trash.desc", { name: modal.name }), closeLabel: t("btn.close"), onClose: function () { setModal(null); }, footer: h(React.Fragment, null, hostButton(t("btn.cancel"), function () { setModal(null); }, "outline"), hostButton(t("btn.trash"), function () { post("/delete", Object.assign({ root: (modal as Extract<ConfirmModal, {type: "trash-confirm"}>).root, name: (modal as Extract<ConfirmModal, {name: string}>).name }, (modal as { workspace?: string }).workspace ? { workspace: (modal as { workspace?: string }).workspace } : {}), "result.trashed", { name: (modal as Extract<ConfirmModal, {name: string}>).name }).then(function () { setModal(null); }).catch(function () {}); }, "primary", busy)) }));
      if (modal && typeof modal === "object" && modal.type === "delete-confirm") content.push(h(Modal, { key: "delete-confirm", title: t("confirm.delete.title"), description: t("confirm.delete.desc", { name: modal.name }), closeLabel: t("btn.close"), onClose: function () { setModal(null); }, footer: h(React.Fragment, null, hostButton(t("btn.cancel"), function () { setModal(null); }, "outline"), hostButton(t("btn.delete.forever"), function () { post("/trash-delete", { id: (modal as Extract<ConfirmModal, {type: "delete-confirm"}>).id }, "result.deleted", { name: (modal as Extract<ConfirmModal, {name: string}>).name }).then(function () { setModal(null); }).catch(function () {}); }, "primary", busy)) }));
      if (modal && typeof modal === "object" && (modal.type === "category-create" || modal.type === "category-rename")) {
        var renaming = modal.type === "category-rename";
        var categoryModal = modal;
        var nameTrimmed = categoryName.trim();
        var canSubmit = !!nameTrimmed && (!renaming || nameTrimmed !== (categoryModal as Extract<ConfirmModal, {type: "category-rename"}>).name);
        var submitCategory = function () {
          if (busy || !canSubmit) return;
          var request = renaming
            ? post("/category-rename", { root: categoryModal.root, id: (categoryModal as Extract<ConfirmModal, {type: "category-rename"}>).id, name: nameTrimmed, workspace: categoryModal.workspace }, "category.renamed")
            : post("/category-create", { root: categoryModal.root, name: nameTrimmed, workspace: categoryModal.workspace }, "category.created", { name: nameTrimmed });
          request.then(function () { setModal(null); }).catch(function () {});
        };
        content.push(h(Modal, { key: modal.type, title: renaming ? t("category.rename") : t("category.create"), closeLabel: t("btn.close"), onClose: function () { setModal(null); } },
          h("div", { className: "dssm-form" },
            h("label", { className: "dssm-field" }, h("span", { className: "dssm-label" }, t("category.name")), h(Input, { value: categoryName, maxLength: 24, "aria-label": t("category.name"), onChange: function (event) { setCategoryName(event.target.value); }, onPressEnter: submitCategory })),
            h("p", { className: "dssm-help" }, t("category.note"))
          ),
          h("div", { className: "dssm-modal-actions" },
            hostButton(t("btn.cancel"), function () { setModal(null); }, "outline"),
            hostButton(renaming ? t("btn.confirm") : t("category.create"), submitCategory, "primary", busy || !canSubmit)
          )));
      }
      if (modal && typeof modal === "object" && modal.type === "category-add") {
        var addModal = modal as Extract<ConfirmModal, {type: "category-add"}>;
        var kw = addSearch.trim().toLowerCase();
        var availableList = addModal.skills.filter(function (s) {
          return !kw || s.name.toLowerCase().includes(kw) || (s.declaredName && s.declaredName.toLowerCase().includes(kw)) || (s.description && s.description.toLowerCase().includes(kw));
        });
        var candidateNames = new Set(addModal.skills.map(function (s) { return s.name; }));
        var chosenCount = Object.keys(addSelection).filter(function (k) { return addSelection[k] && candidateNames.has(k); }).length;
        content.push(h(Modal, { key: "category-add", title: t("category.selectSkills", { name: addModal.name }), closeLabel: t("btn.close"), onClose: function () { setAddSelection({}); setAddSearch(""); setModal(null); } },
          h(Input, { placeholder: t("search.placeholder"), value: addSearch, allowClear: true, onChange: function (e) { setAddSearch(e.target.value); } }),
          h("div", { className: "dssm-batch-list" },
            availableList.length ? availableList.map(function (item) {
              var isChecked = !!addSelection[item.name];
              return h("div", { key: item.name, className: "dssm-batch-item" + (isChecked ? " selected" : ""), onClick: function () { var next = Object.assign({}, addSelection); if (isChecked) delete next[item.name]; else next[item.name] = true; setAddSelection(next); } },
                h("input", { type: "checkbox", checked: isChecked, readOnly: true }),
                h("div", { className: "dssm-batch-info" },
                  h("div", { className: "dssm-batch-name-row" },
                    h("span", { className: "dssm-batch-name" }, item.declaredName || item.name),
                    item.currentCatName ? h("span", { className: "dssm-batch-cat-tag" }, item.currentCatName) : null
                  ),
                  item.description ? h("div", { className: "dssm-batch-desc", title: item.description }, item.description) : null)
              );
            }) : h("div", { className: "dssm-empty" }, t("category.noAvailableSkills"))
          ),
          h("div", { className: "dssm-modal-actions" },
            hostButton(t("btn.cancel"), function () { setAddSelection({}); setAddSearch(""); setModal(null); }, "outline"),
            hostButton(t("category.addSkills") + (chosenCount ? " (" + chosenCount + ")" : ""), function () {
              var names = Object.keys(addSelection).filter(function (k) { return addSelection[k] && candidateNames.has(k); });
              if (!names.length) { setAddSelection({}); setAddSearch(""); setModal(null); return; }
              if (inflightRef.current) return;
              var scoped = function (extra: Record<string, unknown>) { return addModal.workspace ? Object.assign({}, extra, { workspace: addModal.workspace }) : extra; };
              inflightRef.current = true;
              setBusy(true); setAddSelection({}); setAddSearch(""); setModal(null);
              names.reduce<Promise<unknown>>(function (p, name) {
                return p.then(function () { return sessionApi("/category-assign", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(scoped({ root: addModal.root, name: name, category: addModal.id })) }); });
              }, Promise.resolve()).then(function () {
                setResult({ ok: true, text: t("category.batchAssigned", { count: names.length, category: addModal.name }) });
              }).catch(function (err: unknown) {
                setResult({ ok: false, text: translateError(t, err) });
              }).finally(function () {
                inflightRef.current = false;
                setBusy(false);
                var ws = addModal.workspace;
                Promise.all([refresh(true), ws ? loadWorkspaceDetail(ws) : null]).catch(function () {});
              });
            }, "primary", busy || !chosenCount)
          )
        ));
      }
      if (modal && typeof modal === "object" && modal.type === "category-delete") content.push(h(Modal, { key: "category-delete", title: t("confirm.category.title"), description: t("confirm.category.desc", { name: modal.name }), closeLabel: t("btn.close"), onClose: function () { setModal(null); }, footer: h(React.Fragment, null, hostButton(t("btn.cancel"), function () { setModal(null); }, "outline"), hostButton(t("category.delete"), function () { post("/category-delete", { root: (modal as Extract<ConfirmModal, {type: "category-delete"}>).root, id: (modal as Extract<ConfirmModal, {type: "category-delete"}>).id, workspace: (modal as Extract<ConfirmModal, {type: "category-delete"}>).workspace }, "category.deleted", { name: (modal as Extract<ConfirmModal, {type: "category-delete"}>).name }).then(function () { setModal(null); }).catch(function () {}); }, "primary", busy)) }));
      return h("section", { className: "dssm-section" }, content);
    }

    var inject = ["slots", "locale"];
    function apply(ctx: ClientContext) { localeService = ctx.locale; ctx.effect(function () { return ctx.locale.register(NS, DICT); }); ctx.effect(function () { return observePluginUpdate({ endpoint: "/api/michengai/dsh-skills-manager/update", packageName: "@michengai/dsh-skills-manager", titleRowSelector: ".dssm-title-row", linksSelector: ".dssm-feedback-links", zhName: "技能", enName: "Skills", createIcon: createPluginUpdateIcon }); }, "skills-manager: plugin update ui"); installSettingsNavIcon(ctx, function () { return ctx.locale.bind(NS)("title"); }); ctx.slots.inject("settings.section", function () { return ctx.slots.register({ name: "settings.section", id: "skills-manager", order: 25, label: function () { return ctx.locale.bind(NS)("title"); }, icon: "skill", locale: NS }, SkillManagerSection); }); }
    module.exports.formatTrashTime = formatTrashTime; module.exports.DICT = DICT; module.exports.translateError = translateError; module.exports.parseApiResponse = parseApiResponse; module.exports.isSkillEnabled = isSkillEnabled; module.exports.countKey = countKey; module.exports.rootDisplayName = rootDisplayName; module.exports.summarizeImportResult = summarizeImportResult; module.exports.normalizeSkillQuery = normalizeSkillQuery; module.exports.matchSkillQuery = matchSkillQuery; module.exports.filterSkills = filterSkills; module.exports.visibleSkillRoots = visibleSkillRoots; module.exports.scopeSkillRoots = scopeSkillRoots; module.exports.skillStatus = skillStatus; module.exports.countSkillStatuses = countSkillStatuses; module.exports.currentSessionId = currentSessionId; module.exports.canToggleSource = canToggleSource; module.exports.recoverModalFocus = recoverModalFocus; module.exports.trapModalFocus = trapModalFocus; module.exports.inspectUploadSelection = inspectUploadSelection; module.exports.apply = apply; module.exports.inject = inject;
