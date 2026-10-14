type RepositoryAction = "add" | "remove" | "refresh" | "detail" | "install" | "uninstall" | "preview" | "update" | "rollback";
import type * as React from 'react';
import type { ApiCall, ApiRoutes, Translate, ModalProps, SourceSelectProps } from './client-types.js';
import type { DestinationKit, DestinationValue } from './destination-types.js';
import type { WorkspaceRow } from './core.js';
import type { InstallSource, Diagnostic, RepositoryRoot, RepositoryDestination } from './types.js';
type RepoView = ApiRoutes['/repositories']['repositories'][number];
type RepoCopy = { installedRoot: RepositoryRoot | null; installedWorkspace?: string; tracked?: boolean; status: string; updateAvailable?: boolean; canRollback?: boolean; canUninstall?: boolean };
type RepoSkill = RepoView['skills'][number] & { installations?: RepoCopy[] };
type CopyTarget = { root?: RepositoryRoot; workspace?: string };
type Feedback = {error?: boolean; payload?: unknown; key?: string; name?: string; text?: string};
type InstallRoot = RepositoryRoot;
type Installation = Feedback & CopyTarget & {id: string; path: string; pending?: boolean; action?: 'install' | 'uninstall'};
type CatalogCopy = { id: string; name: string; installedRoot: RepositoryRoot; installedWorkspace?: string; canUninstall?: boolean };
type RepoModal = {type: 'add' | 'manage'} | {type: 'remove'; repo: RepoView} | {type: 'install' | 'uninstall'; repo: RepoView; skill: RepoSkill; copy?: RepoCopy} | {type: 'detail'; repo: RepoView; detail?: ApiRoutes['/repositories/detail']; loading?: boolean; failed?: boolean} | {type: 'catalog-detail'; detail?: ApiRoutes['/catalog/detail']; loading?: boolean; failed?: boolean} | {type: 'catalog-install'; target: CatalogTarget} | {type: 'catalog-uninstall'; copy: CatalogCopy} | {type: 'review' | 'rollback'; repo: RepoView; skill: RepoSkill; copy: RepoCopy; detail: ApiRoutes['/repositories/preview']};
interface Dependencies {react: typeof React; Modal: React.ComponentType<ModalProps>; Input: React.ComponentType<any> & { TextArea: React.ComponentType<any> }; Button: React.ComponentType<any>; Collapse: React.ComponentType<any>; SourceSelect: React.ComponentType<SourceSelectProps>; destination: DestinationKit; api: ApiCall; headers: Record<string, string>; translateError: (t: Translate, error: unknown) => string; getLocale?: () => string | undefined}
import type { CodedError } from "./types.js";
// 仓库页复用宿主技能面板组件；只在进入页签时读取本地目录缓存。
export const repositoryLocales = {
  zh: {
    "repo.catalog.unknownLocation": "位置未知",
    "repo.catalog.reassociate": "选择位置并重关联安装",
    "repo.catalog.unknownHint": "有旧目录安装记录位置未知；找到对应技能后可选择位置重关联安装。",
    "repo.catalog.loadMore": "再加载 10 条",
    "repo.catalog.installRefreshWarning": "技能已安装并启用，但列表刷新失败。请重新打开发现页；不要重复安装。",
    "repo.catalog.uninstallRefreshWarning": "技能已移入回收站，但列表刷新失败。请刷新技能列表或重新打开设置页；不要重复卸载。",
    "repo.installElsewhere": "安装到其他位置", "repo.destinationUnavailable": "原项目未登记或目录不可用，无法管理此副本。请在侧栏重新登记原项目后刷新。", "repo.projectDestination": "项目 DSH · {path}",
    "repo.refreshing": "正在检查更新…", "repo.refreshed": "刷新与更新检查完成", "repo.detailLoading": "正在读取技能说明…",
    "repo.local": "本机", "repo.source": "安装来源", "repo.update": "可更新", "repo.review": "查看更新", "repo.rollback": "恢复上一版", "repo.confirmUpdate": "备份并更新", "repo.confirmRollback": "备份并恢复", "repo.overwrite": "备份本地修改并替换", "repo.modified": "检测到本地修改。替换会覆盖当前文件，原文件将完整备份，可恢复。", "repo.noChanges": "文件内容没有变化。", "repo.added": "新增", "repo.removed": "删除", "repo.modifiedFile": "修改", "repo.updating": "更新中…", "repo.updateProgress": "正在校验、备份并替换，请稍候…", "repo.updateSuccess": "更新完成，已保留上一版备份。", "repo.rollbackSuccess": "已恢复上一版。", "repo.manageUpdate": "管理更新", "error.repo.modified": "存在本地修改，请预览并确认备份后替换。",
    "scope.repositories": "发现技能", "repo.add": "添加仓库", "repo.manage": "管理仓库", "repo.refresh": "刷新并检查更新", "repo.save": "添加并扫描",
    "repo.subsource.github": "GitHub 仓库", "repo.subsource.skillsh": "skills.sh", "repo.subsource.clawhub": "ClawHub", "repo.subsource.popular": "热门下载 Top 100", "repo.catalog.states": "全部状态", "repo.catalog.uninstalled": "未安装", "repo.catalog.searchClawhub": "搜索 ClawHub 技能", "repo.catalog.searchLoading": "正在搜索 ClawHub…", "repo.catalog.searchEmpty": "没有找到匹配的 ClawHub 技能。", "repo.catalog.searchError": "ClawHub 搜索失败，请重试。", "repo.catalog.searchSkillsh": "搜索 skills.sh 技能", "repo.catalog.skillshLoading": "正在搜索 skills.sh…", "repo.catalog.skillshEmpty": "没有找到匹配的 skills.sh 技能。", "repo.catalog.skillshError": "skills.sh 搜索失败，请重试。", "repo.sort.installs": "安装量从高到低", "repo.sort.name": "名称 A-Z", "repo.subsource.catalogNote": "ClawHub 下载量榜 · 最多 100 条，仅对当前显示条目排序", "repo.catalog.empty": "ClawHub 当前没有匹配的技能。", "repo.catalog.loading": "正在加载 ClawHub 榜单…", "repo.catalog.loadError": "ClawHub 榜单加载失败。请检查网络后重试。", "repo.catalog.retry": "重试", "repo.catalog.loadingMore": "正在加载更多…", "repo.catalog.downloads": "下载", "repo.catalog.installs": "安装", "repo.catalog.stars": "星标",
    "repo.hint": "从已订阅的 GitHub 仓库或第三方目录发现技能，安装到用户目录的 DSH skills 或 Shared Agent，或已登记项目的 .dsh/skills。", "repo.footer": "刷新会检查仓库与技能更新，不会自动替换本地文件。历史备份不会自动清理，占用空间会随更新增加。",
    "repo.search": "搜索仓库技能", "repo.all": "全部仓库", "repo.states": "全部状态", "repo.available": "可安装", "repo.installed": "已安装", "repo.conflict": "同名冲突", "repo.invalid": "格式无效", "repo.install": "安装", "repo.detail": "详情",
    "repo.installing": "安装中…", "repo.installProgress": "正在读取并校验技能文件，请稍候…", "repo.installSuccess": "安装成功并已启用，可在对话中用斜杠调用。",
    "repo.installDestination": "安装位置", "repo.rootDsh": "DSH skills", "repo.rootAgents": "Shared Agent", "repo.rootDshHint": "仅供 DSH 使用，路径以当前 DSH_HOME 为准。", "repo.rootExternalHint": "使用该目录的其他 Agent 也能读取此技能。", "repo.installLocationsHint": "用户目录可选 DSH skills 或 Shared Agent；已登记项目仅写入 .dsh/skills。选择器显示实际路径。缺少的目录会在确认安装后创建。不安全的路径不可选。",
    "repo.uninstall": "卸载", "repo.confirmUninstall": "移至回收站", "repo.uninstallHint": "仅将此仓库已跟踪的安装副本移至回收站，包括本地修改。之后可在回收站恢复。", "repo.uninstallExternalWarning": "卸载该技能也会影响使用所选目录的其他 Agent。", "repo.uninstalling": "卸载中…", "repo.uninstallProgress": "正在将已安装的技能移至回收站，请稍候…", "repo.uninstallSuccess": "技能已移至回收站，可在回收站恢复。",
    "repo.empty": "还没有技能仓库，添加一个公开 GitHub 仓库开始。", "repo.noSkills": "没有匹配的技能。可刷新仓库或调整筛选。",
    "repo.url": "仓库地址", "repo.ref": "分支或标签（可选）", "repo.directory": "技能子目录（可选）", "repo.defaultBranch": "留空使用默认分支", "repo.defaultBranchLabel": "默认分支", "repo.directoryHint": "例如 skills，留空扫描整个仓库",
    "repo.remove": "移除仓库", "repo.removeHint": "仅移除仓库订阅，已安装的技能会保留。", "repo.removeConfirm": "确认移除", "repo.cancel": "取消", "repo.close": "关闭", "repo.loading": "处理中…", "repo.success": "操作完成", "repo.installHint": "技能可能包含脚本，请先查看说明并确认信任来源。安装会保留资源文件，不会执行脚本。", "repo.commit": "扫描版本", "repo.notScanned": "尚未扫描", "repo.updated": "上次刷新",
    "error.repo.tooLarge": "仓库归档超过 32 MiB，请选择较小的技能仓库；子目录筛选不会缩小下载量。", "error.repo.installState": "技能文件已保留，但来源状态未确认。请恢复磁盘写入后重新打开仓库页，系统会校验文件并恢复记录。", "error.repo.capacity": "安装来源状态超过 16 MiB。请先清理不需要的回收记录或旧身份，仍有效的安装副本会保留。",
    "error.repo.invalid": "仓库地址、路径或内容无效，请检查输入及仓库大小。", "error.repo.network": "仓库访问失败，请检查网络或稍后重试。上次列表已保留。", "error.repo.state": "仓库状态文件损坏或无法读取，请保留文件并修复后重试。", "error.repo.conflict": "同名技能已存在或安装失败，本地文件未被覆盖。", "error.repo.enableState": "技能文件已撤销，但启用状态无法写入。请恢复磁盘写入后重试安装。",
  },
  en: {
    "repo.catalog.unknownLocation": "Location unknown",
    "repo.catalog.reassociate": "Choose destination and reinstall to reassociate",
    "repo.catalog.unknownHint": "Some legacy catalog installs have unknown locations. Find the skill and choose a destination to reinstall and reassociate.",
    "repo.catalog.loadMore": "Load 10 more",
    "repo.catalog.installRefreshWarning": "Installed and enabled, but the list could not refresh. Reopen Discover Skills; do not install again.",
    "repo.catalog.uninstallRefreshWarning": "Moved to trash, but the list could not refresh. Refresh the skill list or reopen Settings; do not uninstall again.",
    "repo.installElsewhere": "Install elsewhere", "repo.destinationUnavailable": "The original project is unregistered or unavailable. Re-register it in the sidebar and refresh to manage this copy.", "repo.projectDestination": "Project DSH · {path}",
    "repo.refreshing": "Checking updates…", "repo.refreshed": "Refresh and update check completed", "repo.detailLoading": "Loading skill instructions…",
    "repo.local": "Local", "repo.source": "Installed from", "repo.update": "Update available", "repo.review": "Review update", "repo.rollback": "Restore previous version", "repo.confirmUpdate": "Back up and update", "repo.confirmRollback": "Back up and restore", "repo.overwrite": "Back up local edits and replace", "repo.modified": "Local edits detected. Replacement overwrites current files and keeps a complete backup for restoration.", "repo.noChanges": "No file changes.", "repo.added": "Added", "repo.removed": "Removed", "repo.modifiedFile": "Modified", "repo.updating": "Updating…", "repo.updateProgress": "Verifying, backing up and replacing files. Please wait…", "repo.updateSuccess": "Updated. Previous version backed up.", "repo.rollbackSuccess": "Previous version restored.", "repo.manageUpdate": "Manage updates", "error.repo.modified": "Local edits detected. Review and confirm replacement with a backup.",
    "scope.repositories": "Discover Skills", "repo.add": "Add repository", "repo.manage": "Manage repositories", "repo.refresh": "Refresh & check updates", "repo.save": "Add and scan",
    "repo.subsource.github": "GitHub Repos", "repo.subsource.skillsh": "skills.sh", "repo.subsource.clawhub": "ClawHub", "repo.subsource.popular": "Top 100 by downloads", "repo.catalog.states": "All statuses", "repo.catalog.uninstalled": "Not installed", "repo.catalog.searchClawhub": "Search ClawHub skills", "repo.catalog.searchLoading": "Searching ClawHub…", "repo.catalog.searchEmpty": "No matching ClawHub skills were found.", "repo.catalog.searchError": "ClawHub search failed. Please retry.", "repo.catalog.searchSkillsh": "Search skills.sh", "repo.catalog.skillshLoading": "Searching skills.sh…", "repo.catalog.skillshEmpty": "No matching skills.sh skills were found.", "repo.catalog.skillshError": "skills.sh search failed. Please retry.", "repo.sort.installs": "Installs: high to low", "repo.sort.name": "Name A–Z", "repo.subsource.catalogNote": "ClawHub download ranking · Up to 100; sort only displayed items", "repo.catalog.empty": "No matching skills were returned by ClawHub.", "repo.catalog.loading": "Loading ClawHub ranking…", "repo.catalog.loadError": "Failed to load the ClawHub ranking. Check your connection and retry.", "repo.catalog.retry": "Retry", "repo.catalog.loadingMore": "Loading more…", "repo.catalog.downloads": "downloads", "repo.catalog.installs": "installs", "repo.catalog.stars": "stars",
    "repo.hint": "Discover skills from subscribed GitHub repositories or community registries, and install them to user DSH skills or Shared Agent, or a registered project's .dsh/skills.", "repo.footer": "Refresh checks repositories and skill updates without replacing local files. Historical backups are not cleaned automatically and use additional disk space.",
    "repo.search": "Search repository skills", "repo.all": "All repositories", "repo.states": "All statuses", "repo.available": "Available", "repo.installed": "Installed", "repo.conflict": "Name conflict", "repo.invalid": "Invalid format", "repo.install": "Install", "repo.detail": "Details",
    "repo.installing": "Installing…", "repo.installProgress": "Reading and verifying skill files. Please wait…", "repo.installSuccess": "Installed and enabled. Invoke it from the slash menu.",
    "repo.installDestination": "Installation destination", "repo.rootDsh": "DSH skills", "repo.rootAgents": "Shared Agent", "repo.rootDshHint": "For DSH only. The path uses your current DSH_HOME.", "repo.rootExternalHint": "Other agents using this directory can read this skill too.", "repo.installLocationsHint": "User directories offer DSH skills or Shared Agent; registered projects write only to .dsh/skills. The chooser shows actual paths. Missing directories are created after confirmation. Unsafe paths cannot be selected.",
    "repo.uninstall": "Uninstall", "repo.confirmUninstall": "Move to Trash", "repo.uninstallHint": "Move only this repository’s tracked installed copy, including local edits, to Trash. You can restore it from Trash later.", "repo.uninstallExternalWarning": "Uninstalling this skill also affects other agents that use the selected directory.", "repo.uninstalling": "Uninstalling…", "repo.uninstallProgress": "Moving the installed skill to Trash. Please wait…", "repo.uninstallSuccess": "Skill moved to Trash. You can restore it from Trash.",
    "repo.empty": "No repositories yet. Add a public GitHub repository to get started.", "repo.noSkills": "No matching skills. Refresh the repository or adjust your filters.",
    "repo.url": "Repository URL", "repo.ref": "Branch or tag (optional)", "repo.directory": "Skill subdirectory (optional)", "repo.defaultBranch": "Leave empty for the default branch", "repo.defaultBranchLabel": "default branch", "repo.directoryHint": "For example: skills. Leave empty to scan the repository.",
    "repo.remove": "Remove repository", "repo.removeHint": "This removes the subscription only. Installed skills are kept.", "repo.removeConfirm": "Confirm removal", "repo.cancel": "Cancel", "repo.close": "Close", "repo.loading": "Working…", "repo.success": "Completed", "repo.installHint": "Skills may include scripts. Read the instructions and trust the source before installing. Resources are copied; scripts are not executed.", "repo.commit": "Snapshot version", "repo.notScanned": "Not scanned yet", "repo.updated": "Last refreshed",
    "error.repo.tooLarge": "Repository archive exceeds 32 MiB. Choose a smaller repository; a subdirectory filter does not reduce the download size.", "error.repo.installState": "Skill files were preserved but source tracking could not be saved. Restore disk write access and reopen Repositories to verify files and recover the record.", "error.repo.capacity": "Source tracking exceeds 16 MiB. Remove unneeded Trash records or legacy identities first. Active installation copies are kept.",
    "error.repo.invalid": "Invalid repository URL, path or contents. Check the input and repository size.", "error.repo.network": "Repository request failed. Check your connection or retry later. The previous catalog was kept.", "error.repo.state": "Repository state is corrupt or unreadable. Preserve the file and repair it before retrying.", "error.repo.conflict": "A skill with this name exists or installation failed. Local files were not overwritten.", "error.repo.enableState": "The copied skill was removed because its enabled state could not be saved. Restore disk write access and install again.",
  },
};

const CSS = `
.dssm-subsources{display:flex;align-items:center;gap:6px;margin:0;border-bottom:1px solid var(--dsw-alias-border-l1,#3a3a3a);padding-bottom:6px}
.dssm-subsource-btn{padding:5px 12px;border:1px solid var(--dsw-alias-border-l2,#494949);background:var(--dsw-alias-bg-layer-1,#1f1f1f);color:var(--dsw-alias-label-secondary,#b9b9b9);border-radius:6px;font-size:12px;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.dssm-subsource-btn:hover{background:var(--dsw-alias-bg-layer-2,#2c2c2c);color:var(--dsw-alias-label-primary,#eee)}
.dssm-subsource-btn.on{background:var(--dsw-alias-bg-layer-2,#2c2c2c);color:var(--dsw-alias-label-primary,#eee);border-color:var(--dsw-alias-border-l3,#555);font-weight:600}
.dssm-subsource-btn:focus-visible{outline:2px solid var(--dsw-alias-border-l3,#555);outline-offset:2px}
.dssm-catalog-list{border:1px solid var(--dsw-alias-border-l2,#494949);border-radius:10px;overflow:hidden;background:transparent;margin-bottom:12px}.dssm-filters.dssm-catalog-filters .dssm-search{flex:1 1 160px;min-width:0;max-width:none}.dssm-catalog-installed{color:var(--dsw-alias-state-success-primary,#51b976);font-size:12px;white-space:nowrap}
.dssm-catalog-list .dssm-repo-row{border-top:1px solid var(--dsw-alias-border-l1,#3a3a3a)}
.dssm-catalog-list > div:first-child{border-top:0}
.dssm-catalog-sentinel{height:1px}.dssm-catalog-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 13px;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;border-top:1px solid var(--dsw-alias-border-l1,#3a3a3a)}.dssm-catalog-loading .dssm-repo-spinner{margin-right:0}
.dssm-meta-origin{color:var(--dsw-alias-label-secondary,#8e8e8e);font-size:11px;margin-top:2px}
.dssm-status-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px}
.dssm-repo-row .dssm-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary,#eeeeee)}.dssm-repo-row{display:flex;flex-direction:column;gap:6px;padding:11px 13px;border-top:1px solid var(--dsw-alias-border-l1,#3a3a3a);background:transparent}.dssm-repo-head{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:nowrap}.dssm-repo-actions{display:flex;align-items:center;gap:8px;flex:none;flex-wrap:nowrap}.dssm-repo-actions button{flex:none}.dssm-repo-actions .dssm-repo-copy-actions{gap:8px;margin-left:0}.dssm-repo-main{flex:1;min-width:0}.dssm-repo-main>.dssm-repo-metadata{margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dssm-repo-description{margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:12px;line-height:18px}.dssm-repo-copies{display:flex;flex-direction:column;gap:2px;min-width:0}.dssm-repo-copy{display:flex;align-items:center;gap:8px;min-width:0;padding:0;border:0;background:transparent}.dssm-repo-copy .dssm-repo-metadata{font-size:12px;line-height:18px}.dssm-repo-copy-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none}.dssm-repo-spinner{display:inline-block;width:12px;height:12px;margin-right:6px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:dssm-repo-spin .8s linear infinite}@keyframes dssm-repo-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.dssm-repo-spinner{animation:none}}.dssm-repo-commit-badge{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace;font-size:11px;line-height:16px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:var(--dsw-alias-label-secondary,#b9b9b9);border:1px solid var(--dsw-alias-border-l1,#3a3a3a);margin-left:12px;white-space:nowrap;user-select:all}.dssm-repo-panel{display:flex;flex-direction:column;gap:12px;min-width:0}.dssm-repo-panel .dssm-desc{margin:0}.dssm-repo-metadata{font-size:11px;color:var(--dsw-alias-label-tertiary,#a0a0a0);overflow-wrap:anywhere}.dssm-repo-panel .dssm-source{flex-shrink:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2,#494949);border-radius:10px;background:transparent}.dssm-repo-panel .dssm-source .ant-collapse-header{align-items:center}.dssm-repo-panel .dssm-source-title{font-size:14px;font-weight:650;overflow-wrap:anywhere;display:inline-flex;align-items:center;gap:7px}.dssm-repo-panel .dssm-source-brand{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex-shrink:0;color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-repo-panel .dssm-source-brand svg{width:16px;height:16px;display:block}.dssm-repo-panel .dssm-source-path{min-width:0;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-size:11px}.dssm-repo-panel .dssm-count{padding:1px 6px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,0.08));font-size:11px;color:var(--dsw-alias-label-secondary,#b9b9b9)}.dssm-repo-manage-row{flex-direction:row;align-items:center;justify-content:space-between;gap:12px}.dssm-repo-manage-row .dssm-repo-main{flex:1}.dssm-repo-manage-row .dssm-repo-actions{margin-left:auto}.dssm-repo-manage-row .dssm-repo-actions button{width:auto;flex:none}.dssm-repo-head .dssm-repo-actions{gap:8px}.dssm-repo-actions>.dssm-repo-copy-actions{display:contents}.dssm-row-icon.ant-btn{width:22px;min-width:22px;height:22px;padding:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#b9b9b9);border-color:var(--dsw-alias-border-l2,#494949)}.dssm-row-icon.ant-btn:not(:disabled):not(.dssm-icon-danger):hover{--ant-btn-text-color:var(--dsw-alias-link,#4176e6);--ant-btn-border-color:var(--dsw-alias-link,#4176e6);color:var(--dsw-alias-link,#4176e6)!important;border-color:var(--dsw-alias-link,#4176e6)!important}.dssm-row-icon.dssm-icon-danger,.dssm-row-icon.ant-btn-dangerous{color:var(--dsw-alias-state-error-primary,#ef7272);border-color:var(--dsw-alias-state-error-primary,#ef7272)}.dssm-repo-copies{display:flex;flex-direction:column;gap:4px;width:100%;margin-top:2px}.dssm-repo-copy{display:flex;align-items:center;gap:8px;width:100%;min-width:0;box-sizing:border-box;padding:4px 4px 4px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,0.04))}.dssm-repo-copy .dssm-repo-metadata{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dssm-repo-copy .dssm-repo-copy-actions{margin-left:0}.dssm-repo-copy .dssm-row-icon.dssm-icon-danger{border-color:var(--dsw-alias-border-l2,#494949)}.dssm-repo-copy .dssm-row-icon.dssm-icon-danger:not(:disabled):hover{--ant-btn-text-color:var(--dsw-alias-state-error-primary,#ef7272);--ant-btn-border-color:var(--dsw-alias-state-error-primary,#ef7272);color:var(--dsw-alias-state-error-primary,#ef7272)!important;border-color:var(--dsw-alias-state-error-primary,#ef7272)!important}`;

/** 返回动作区与内容区，使现有标题、页签顺序保持不变。 */

interface CatalogSkillItem {
  id: string;
  owner: string;
  slug: string;
  name: string;
  source: string;
  description: string;
  downloads?: number;
  installs?: number;
  stars?: number;
}
type CatalogTarget = { catalog: "clawhub"; owner: string; slug: string; name: string } | { catalog: "skillsh"; source: string; skillId: string; name: string };


type SkillsShCatalogItem = { id: string; source: string; skillId: string; name: string; installs?: number };

type ClawHubApiPage = {
  items?: Array<{
    ownerHandle?: unknown;
    slug?: unknown;
    displayName?: unknown;
    summary?: unknown;
    stats?: { downloads?: unknown; installs?: unknown; stars?: unknown };
  }>;
  nextCursor?: unknown;
};

type ClawHubApiSearchResult = {
  source?: unknown;
  id?: unknown;
  slug?: unknown;
  displayName?: unknown;
  ownerHandle?: unknown;
  owner?: { handle?: unknown };
  summary?: unknown;
  downloads?: unknown;
  stats?: { downloads?: unknown; installs?: unknown; stars?: unknown };
};
type ClawHubApiSearchResponse = { results?: ClawHubApiSearchResult[] };

export function createRepositoryUI({ react, Modal, Input, Button, Collapse, SourceSelect, destination, api, headers, translateError, getLocale }: Dependencies) {
  const h = react.createElement;
  const { DestinationPicker, defaultDestination, destinationPayload, destinationReady } = destination;
  return function useRepositoryUI({ active, t, onInstalled }: {active: boolean; t: Translate; onInstalled?: () => unknown}) {
    const [repos, setRepos] = react.useState<RepoView[]>([]);
    const [installRoots, setInstallRoots] = react.useState<RepositoryDestination[]>([]);
    const [busy, setBusy] = react.useState(false);
    const [refreshing, setRefreshing] = react.useState<{id: string; name: string; index: number; total: number} | null>(null);
    const [feedback, setFeedback] = react.useState<Feedback | null>(null);
    const [installation, setInstallation] = react.useState<Installation | null>(null);
    const [query, setQuery] = react.useState("");
    const [source, setSource] = react.useState("");
    const [status, setStatus] = react.useState("");
    const [expanded, setExpanded] = react.useState<Record<string, boolean>>({});
    const [modal, setModal] = react.useState<RepoModal | null>(null);
    const [destination, setDestination] = react.useState<DestinationValue>(defaultDestination());
    const [workspaces, setWorkspaces] = react.useState<WorkspaceRow[]>([]);
    const [subsource, setSubsource] = react.useState<'github' | 'skillsh' | 'clawhub'>('github');
    const [catalogQuery, setCatalogQuery] = react.useState("");
    const [catalogSort, setCatalogSort] = react.useState("");
    const [catalogStatus, setCatalogStatus] = react.useState("");
    const [catalogItems, setCatalogItems] = react.useState<CatalogSkillItem[]>([]);
    const [catalogInstallIds, setCatalogInstallIds] = react.useState<string[]>([]);
    const [catalogCopies, setCatalogCopies] = react.useState<CatalogCopy[]>([]);
    const [catalogUnknownIds, setCatalogUnknownIds] = react.useState<string[]>([]);
    const [catalogWarnings, setCatalogWarnings] = react.useState<Array<{id: string; code: string; error: string}>>([]);
    const [catalogHasMore, setCatalogHasMore] = react.useState(true);
    const [catalogLoading, setCatalogLoading] = react.useState(false);
    const [catalogError, setCatalogError] = react.useState(false);
    const [clawhubSearchItems, setClawhubSearchItems] = react.useState<CatalogSkillItem[]>([]);
    const [clawhubSearchLoading, setClawhubSearchLoading] = react.useState(false);
    const [clawhubSearchError, setClawhubSearchError] = react.useState(false);
    const clawhubSearchRequest = react.useRef(0);
    const clawhubSearchAbort = react.useRef<AbortController | null>(null);
    const clawhubSearchTimer = react.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [skillshQuery, setSkillshQuery] = react.useState("");
    const [skillshStatus, setSkillshStatus] = react.useState("");
    const [skillshItems, setSkillshItems] = react.useState<SkillsShCatalogItem[]>([]);
    const [skillshLoading, setSkillshLoading] = react.useState(false);
    const [skillshError, setSkillshError] = react.useState(false);
    const skillshRequest = react.useRef(0);
    const skillshAbort = react.useRef<AbortController | null>(null);
    const skillshTimer = react.useRef<ReturnType<typeof setTimeout> | null>(null);
    const catalogPager = react.useRef<{cursor: string | null; count: number; hasMore: boolean}>({ cursor: null, count: 0, hasMore: true });
    const catalogRequest = react.useRef<AbortController | null>(null);
    const catalogSentinel = react.useRef<HTMLDivElement | null>(null);
    const [form, setForm] = react.useState<Record<string, string>>({ url: "", ref: "", subdirectory: "" });
    const locked = react.useRef(false);
    const mounted = react.useRef(true);
    react.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    async function load() {
      const data = await api("/repositories");
      if (mounted.current) {
        const roots = (data.installRoots || []).filter(root => root.key === "dsh" || root.key === "agents");
        setRepos(data.repositories || []); setInstallRoots(roots); setCatalogInstallIds(data.catalogInstalls || []); setCatalogCopies(data.catalogCopies || []);
        setCatalogUnknownIds(data.catalogUnknownIds || []); setCatalogWarnings(data.catalogWarnings || []);
        if (destination.scope === 'user' && !roots.some(root => root.key === destination.location && root.available))
          setDestination({ ...destination, location: roots.find(root => root.available)?.key || 'dsh' });
        // 工作区列表只读登记信息，失败不影响仓库列表本身。
        api('/workspaces').then(listed => { if (mounted.current) setWorkspaces(listed.items || []); }).catch(() => undefined);
      }
    }
    function destinationName(root: Pick<RepositoryDestination, 'key' | 'label' | 'localeKey'>) {
      if (root.key === 'dsh' || root.key === 'agents') return t(root.key === 'dsh' ? 'repo.rootDsh' : 'repo.rootAgents');
      const key = 'root.' + (root.localeKey || root.key), name = t(key);
      return name === key ? root.label : name;
    }
    function installedDestination(key: RepositoryRoot) {
      const root = installRoots.find(root => root.key === key);
      return root ? destinationName(root) : t('root.' + key);
    }
    function copyTarget(copy: RepoCopy): CopyTarget | null {
      if (copy.installedWorkspace) {
        const identity = (path: string) => { const value = path.replace(/\\/g, '/').replace(/\/+$/, ''); return /^(?:[a-z]:\/|\/\/)/i.test(value) ? value.toLowerCase() : value; };
        const row = workspaces.find(row => row.projectRoot && identity(row.projectRoot) === identity(copy.installedWorkspace!));
        return row?.available && row.registeredPaths[0] ? { workspace: row.registeredPaths[0] } : null;
      }
      return copy.installedRoot === 'dsh' || copy.installedRoot === 'agents' ? { root: copy.installedRoot } : null;
    }
    function copyName(copy: RepoCopy) { return copy.installedWorkspace ? t('repo.projectDestination', { path: copy.installedWorkspace }) : copy.installedRoot ? installedDestination(copy.installedRoot) : ''; }
    function copiesOf(skill: RepoSkill): RepoCopy[] { return (skill.installations ?? (skill.installedRoot ? [skill] : [])).filter(copy => copy.tracked === true); }
    function message(error: unknown) {
      const item = error as Diagnostic & {message?: string};
      const translated = translateError(t, error) || item.message || String(error);
      const path = item?.params?.path;
      return typeof path === 'string' && path && !translated.includes(path) ? translated + ' · ' + path : translated;
    }
    function feedbackText(value: Feedback) { return value.payload ? message(value.payload) : (value.key ? t(value.key) : value.text || "") + (value.name ? " · " + value.name : ""); }
    async function perform(task: () => Promise<unknown>, reload = true, quiet = false) {
      if (locked.current) return;
      locked.current = true; if (!quiet) { setBusy(true); setFeedback(null); }
      try { await task(); if (reload) await load(); }
      catch (caught) { const error = caught as CodedError; if (mounted.current) setFeedback({ error: true, payload: error }); }
      finally { locked.current = false; if (mounted.current) setBusy(false); }
    }
    function post<K extends RepositoryAction>(action: K, body: unknown) { return api(`/repositories/${action}` as `/repositories/${K}`, { method: "POST", headers, body: JSON.stringify(body) }); }
    const catalogScrollGate = react.useRef(false);
    async function loadClawHubPage(reset = false, fromScroll = false, query = catalogQuery) {
      if (!active || query.trim() || catalogRequest.current) return;
      if (fromScroll && catalogScrollGate.current) return;
      const current = catalogPager.current;
      if (!reset && (!current.hasMore || current.count >= 100)) return;
      if (fromScroll) catalogScrollGate.current = true;
      const offset = reset ? 0 : current.count;
      const controller = new AbortController();
      catalogRequest.current = controller;
      setCatalogLoading(true);
      setCatalogError(false);
      if (reset) {
        catalogPager.current = { cursor: null, count: 0, hasMore: true };
        setCatalogItems([]);
      }
      try {
        const params = new URLSearchParams({ sort: "downloads", limit: String(Math.min(10, 100 - offset)) });
        const cursor = reset ? null : current.cursor;
        if (cursor) params.set("cursor", cursor);
        const page = await api(`/clawhub/list?${params.toString()}`, { signal: controller.signal }) as ClawHubApiPage;
        if (catalogRequest.current !== controller || controller.signal.aborted || !mounted.current) return;
        if (!Array.isArray(page.items)) throw new Error("ClawHub response has no items array");
        const items = page.items.flatMap((item): CatalogSkillItem[] => {
          if (typeof item.ownerHandle !== "string" || !item.ownerHandle || typeof item.slug !== "string" || !item.slug) return [];
          const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
          return [{
            id: item.ownerHandle + "/" + item.slug,
            owner: item.ownerHandle,
            slug: item.slug,
            name: typeof item.displayName === "string" && item.displayName ? item.displayName : item.slug,
            source: item.ownerHandle + "/" + item.slug,
            description: typeof item.summary === "string" ? item.summary : "",
            downloads: count(item.stats?.downloads),
            installs: count(item.stats?.installs),
            stars: count(item.stats?.stars),
          }];
        }).slice(0, Math.max(0, 100 - offset));
        const nextCursor = typeof page.nextCursor === "string" && page.nextCursor ? page.nextCursor : null;
        const count = offset + items.length;
        catalogPager.current = { cursor: nextCursor, count, hasMore: !!nextCursor && count < 100 };
        if (!mounted.current) return;
        setCatalogItems(previous => [...(reset ? [] : previous), ...items].slice(0, 100));
        setCatalogHasMore(catalogPager.current.hasMore);
      } catch {
        if (catalogRequest.current === controller && !controller.signal.aborted && mounted.current) setCatalogError(true);
      } finally {
        if (catalogRequest.current === controller) {
          catalogRequest.current = null;
          catalogScrollGate.current = false;
          if (mounted.current) setCatalogLoading(false);
        }
      }
    }
    function cancelClawHubSearch() {
      if (clawhubSearchTimer.current) clearTimeout(clawhubSearchTimer.current);
      clawhubSearchTimer.current = null;
      clawhubSearchRequest.current++;
      clawhubSearchAbort.current?.abort();
      clawhubSearchAbort.current = null;
      if (mounted.current) setClawhubSearchLoading(false);
    }
    async function fetchClawHubSearch(query: string) {
      const request = ++clawhubSearchRequest.current;
      const controller = new AbortController();
      clawhubSearchAbort.current?.abort();
      clawhubSearchAbort.current = controller;
      setClawhubSearchItems([]);
      setClawhubSearchLoading(true);
      setClawhubSearchError(false);
      try {
        const params = new URLSearchParams({ q: query, limit: "100" });
        const result = await api(`/clawhub/search?${params.toString()}`, { signal: controller.signal }) as ClawHubApiSearchResponse;
        if (!Array.isArray(result.results)) throw new Error("ClawHub search response has no results array");
        const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
        const items = result.results.flatMap((item): CatalogSkillItem[] => {
          if (typeof item.source === "string" && item.source !== "clawhub") return [];
          const owner = typeof item.ownerHandle === "string" ? item.ownerHandle : item.owner?.handle;
          if (typeof owner !== "string" || !owner || typeof item.slug !== "string" || !item.slug) return [];
          return [{
            id: typeof item.id === "string" ? item.id : owner + "/" + item.slug,
            owner,
            slug: item.slug,
            name: typeof item.displayName === "string" && item.displayName ? item.displayName : item.slug,
            source: owner + "/" + item.slug,
            description: typeof item.summary === "string" ? item.summary : "",
            downloads: count(item.downloads) ?? count(item.stats?.downloads),
            installs: count(item.stats?.installs),
            stars: count(item.stats?.stars),
          }];
        });
        if (request === clawhubSearchRequest.current && mounted.current) setClawhubSearchItems(items);
      } catch (error) {
        const aborted = (error as { name?: string })?.name === "AbortError";
        if (request === clawhubSearchRequest.current && mounted.current && !aborted) setClawhubSearchError(true);
      } finally {
        if (request === clawhubSearchRequest.current) {
          clawhubSearchAbort.current = null;
          if (mounted.current) setClawhubSearchLoading(false);
        }
      }
    }
    function updateClawHubQuery(value: string) {
      setCatalogQuery(value);
      cancelClawHubSearch();
      setClawhubSearchItems([]);
      setClawhubSearchError(false);
      const normalized = value.trim().slice(0, 100);
      if (!normalized) {
        // setState 尚未提交时仍在旧闭包内，显式传入已清空的查询值。
        if (subsource === "clawhub" && !catalogItems.length && !catalogLoading) void loadClawHubPage(true, false, normalized);
        return;
      }
      setClawhubSearchLoading(true);
      clawhubSearchTimer.current = setTimeout(() => {
        clawhubSearchTimer.current = null;
        void fetchClawHubSearch(normalized);
      }, 300);
    }
    function cancelSkillshSearch() {
      if (skillshTimer.current) clearTimeout(skillshTimer.current);
      skillshTimer.current = null;
      skillshRequest.current++;
      skillshAbort.current?.abort();
      skillshAbort.current = null;
      if (mounted.current) setSkillshLoading(false);
    }
    async function fetchSkillshResults(query: string) {
      const request = ++skillshRequest.current;
      const controller = new AbortController();
      skillshAbort.current?.abort();
      skillshAbort.current = controller;
      setSkillshItems([]);
      setSkillshLoading(true);
      setSkillshError(false);
      try {
        const result = await api(`/skills-sh/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (request === skillshRequest.current && mounted.current) setSkillshItems(result.skills);
      } catch (error) {
        const aborted = (error as { name?: string })?.name === "AbortError";
        if (request === skillshRequest.current && mounted.current && !aborted) setSkillshError(true);
      } finally {
        if (request === skillshRequest.current) {
          skillshAbort.current = null;
          if (mounted.current) setSkillshLoading(false);
        }
      }
    }
    function updateSkillshQuery(value: string) {
      setSkillshQuery(value);
      if (skillshTimer.current) clearTimeout(skillshTimer.current);
      skillshTimer.current = null;
      skillshRequest.current++;
      skillshAbort.current?.abort();
      skillshAbort.current = null;
      setSkillshItems([]);
      setSkillshLoading(false);
      setSkillshError(false);
      const normalized = value.trim();
      if (!normalized) return;
      skillshTimer.current = setTimeout(() => {
        skillshTimer.current = null;
        void fetchSkillshResults(normalized);
      }, 300);
    }
    function selectSubsource(next: 'github' | 'skillsh' | 'clawhub') {
      setModal(null);
      setSubsource(next);

    }
    function catalogNearBottom(node: HTMLElement) {
      const rect = node.getBoundingClientRect();
      let parent = node.parentElement;
      while (parent) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`) && parent.scrollHeight > parent.clientHeight + 1) {
          const bounds = parent.getBoundingClientRect();
          return rect.top <= bounds.bottom + 80 && rect.bottom >= bounds.top;
        }
        parent = parent.parentElement;
      }
      return rect.top <= window.innerHeight + 80;
    }
    function onCatalogWheel(event: React.WheelEvent<HTMLDivElement>) {
      if (modal || event.defaultPrevented || event.deltaY <= 0 || subsource !== "clawhub" || catalogQuery.trim() || !catalogHasMore || catalogError) return;
      // React portal 的事件也会沿组件树冒泡，必须排除列表外的真实 DOM 目标。
      if (!event.target || !event.currentTarget.contains(event.target as Node)) return;
      const node = catalogSentinel.current;
      if (!node || typeof node.getBoundingClientRect !== "function" || !catalogNearBottom(node)) return;
      void loadClawHubPage(false, true);
    }
    async function refreshRepo(id: string) { const result = await post("refresh", { id }); if (result.error) setFeedback({ error: true, payload: result.error }); }
    function refresh(selected: RepoView[]) {
      return perform(async () => {
        let failed = false;
        try {
          for (let i = 0; i < selected.length; i++) {
            const repo = selected[i];
            setRefreshing({ id: repo.id, name: repo.owner + "/" + repo.name, index: i + 1, total: selected.length });
            const result = await post("refresh", { id: repo.id });
            if (result.error) { failed = true; setFeedback({ error: true, payload: result.error }); }
          }
          await load();
          if (!failed && mounted.current) setFeedback({ key: "repo.refreshed" });
        } finally { if (mounted.current) setRefreshing(null); }
      }, false);
    }
    function openDetail(repo: RepoView, skill: RepoSkill) {
      return perform(async () => {
        setModal({ type: "detail", repo, loading: true });
        try {
          const detail = await post("detail", { id: repo.id, path: skill.path });
          if (mounted.current) setModal({ type: "detail", detail, repo });
        } catch (caught) { const error = caught as CodedError; if (mounted.current) setModal({ type: "detail", repo, failed: true }); throw error; }
      }, false, true);
    }
    function openCatalogDetail(target: CatalogTarget) {
      return perform(async () => {
        setModal({ type: "catalog-detail", loading: true });
        try {
          const detail = await api("/catalog/detail", { method: "POST", headers, body: JSON.stringify(target) });
          if (mounted.current) setModal({ type: "catalog-detail", detail });
        } catch (caught) { const error = caught as CodedError; if (mounted.current) setModal({ type: "catalog-detail", failed: true }); throw error; }
      }, false, true);
    }
    function openCatalogInstall(target: CatalogTarget) {
      if (locked.current) return;
      setFeedback(null);
      setModal({ type: "catalog-install", target });
    }
    function confirmCatalogInstall() {
      if (!modal || modal.type !== "catalog-install" || !destinationReady(destination, workspaces, installRoots)) return;
      const target = modal.target;
      const scope = destinationPayload(destination);
      return perform(async () => {
        const installed = await api("/catalog/install", { method: "POST", headers, body: JSON.stringify({ ...target, ...scope }) });
        if (!mounted.current) return;
        const catalogId = target.catalog === "skillsh" ? `skillsh:${target.source}/${target.skillId}` : `clawhub:${target.owner}/${target.slug}`;
        setCatalogInstallIds(prev => prev.includes(catalogId) ? prev : [...prev, catalogId]);
        const installedRoot = scope.root || "dsh";
        setCatalogCopies(prev => prev.some(copy => copy.id === catalogId && copy.installedRoot === installedRoot && copy.installedWorkspace === scope.workspace) ? prev : [...prev, { id: catalogId, name: installed.name, installedRoot, ...(scope.workspace ? { installedWorkspace: scope.workspace } : {}), canUninstall: true }]);
        setFeedback({ key: "repo.installSuccess", name: target.name });
        setModal(null);
        const refreshed = await Promise.allSettled([load(), Promise.resolve().then(() => onInstalled?.())]);
        if (mounted.current && refreshed.some(result => result.status === "rejected")) setFeedback({ key: "repo.catalog.installRefreshWarning", name: target.name });
      }, false);
    }
    react.useEffect(() => { if (active) perform(load, false); }, [active]);
    react.useEffect(() => {
      if (active) {
        if (subsource === "clawhub") {
          if (catalogQuery.trim()) void fetchClawHubSearch(catalogQuery.trim());
          else if (!catalogItems.length) void loadClawHubPage(true);
        } else if (subsource === "skillsh" && skillshQuery.trim()) void fetchSkillshResults(skillshQuery.trim());
      }
      return () => {
        cancelClawHubSearch();
        cancelSkillshSearch();
        catalogRequest.current?.abort();
        catalogRequest.current = null;
        catalogScrollGate.current = false;
        if (mounted.current) setCatalogLoading(false);
      };
    }, [active, subsource]);
    function button(key: string, action: () => unknown, secondary = true, disabled = false, danger = false) { return h(Button, { type: secondary ? "default" : "primary", danger, disabled: busy || disabled, onClick: action }, t(key)); }
    function rowGlyph(d: string) {
      return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: "false" }, h("path", { d: d, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }));
    }
    function rowIcon(key: string, action: () => unknown, disabled = false) {
      var danger = key === "repo.uninstall" || key === "repo.uninstalling";
      var isSuccess = key === "repo.installed" || key === "repo.installedSuccess";
      var isWarn = key === "repo.conflict";
      var icon = key === "repo.detail" ? "M4 2.5h5.2L12.5 5.8V13.5H4zM9.2 2.8V6h3.2" : key === "repo.installElsewhere" ? "M8 3v10M3 8h10" : key === "repo.installed" ? "M3.5 8.2 6.5 11.2 12.5 4.8" : key === "repo.review" ? "M2.5 8s2.2-3.5 5.5-3.5S13.5 8 13.5 8s-2.2 3.5-5.5 3.5S2.5 8 2.5 8M8 6.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4" : key === "repo.rollback" ? "M3.5 6.5A4.5 4.5 0 1 1 5 11.5M3.5 3.5v3h3" : danger ? "M3.5 4.5h9M6.2 4.5V3.2h3.6v1.3M4.4 4.5l.6 8h6l.6-8" : isWarn ? "M8 2.5l5.5 10.5H2.5L8 2.5zm0 3.5v3.5m0 2v.5" : "M8 2.5v7M5.2 7.2 8 10l2.8-2.8M3.5 13.5h9";
            return h(Button, Object.assign({ size: "small", className: "dssm-row-icon" + (danger ? " dssm-icon-danger" : isSuccess ? " dssm-icon-success" : isWarn ? " dssm-icon-warn" : ""), "aria-label": t(key), title: t(key), icon: rowGlyph(icon), disabled: busy || disabled, onClick: action, style: Object.assign({ width: 22, minWidth: 22, height: 22, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }, danger ? { color: "var(--dsw-alias-state-error-primary, #ef7272)" } : {}) }, danger ? { danger: true } : {}));
    }
    function refreshButton(selected: RepoView[], row = false) {
      const pending = refreshing && (!row || refreshing.id === selected[0]?.id);
      return h(Button, { type: "default", disabled: busy || !selected.length, "aria-busy": !!pending, onClick: () => refresh(selected) },
        pending ? h("span", { className: "dssm-repo-spinner", "aria-hidden": true }) : null, t(pending ? "repo.refreshing" : "repo.refresh"));
    }
    function close() { if (!locked.current) setModal(null); }
    function openInstallation(type: 'install' | 'uninstall', repo: RepoView, skill: RepoSkill, copy?: RepoCopy) {
      if (locked.current || type === 'uninstall' && (!copy || !copy.canUninstall || !copyTarget(copy))) return;
      setFeedback(null); setModal({ type, repo, skill, copy });
    }
    function changeInstallation() {
      if (!modal || (modal.type !== 'install' && modal.type !== 'uninstall')) return;
      const selected = modal, action = selected.type, chosen = destination;
      if (action === 'install' && !destinationReady(chosen, workspaces, installRoots)) return;
      const scope = action === 'install' ? destinationPayload(chosen) : selected.copy && copyTarget(selected.copy);
      if (!scope) return;
      return perform(async () => {
        const target = { id: selected.repo.id, path: selected.skill.path, ...scope };
        setInstallation({ ...target, action, pending: true, key: 'repo.' + action + 'Progress' });
        try {
          await post(action, target);
        } catch (caught) { const error = caught as CodedError;
          if (mounted.current) setInstallation({ ...target, action, error: true, payload: error });
          throw error;
        }
        if (!mounted.current) return;
        const key = 'repo.' + action + 'Success';
        setInstallation({ ...target, action, key });
        setFeedback({ key, name: selected.skill.name }); setModal(null);
        // 独立刷新仓库与宿主列表；刷新失败不改变已经完成的安装/卸载结果。
        const results = await Promise.allSettled([load(), Promise.resolve().then(() => onInstalled?.())]);
        for (const result of results) if (result.status === 'rejected') throw result.reason;
      }, false);
    }
    function preview(repo: RepoView, skill: RepoSkill, copy: RepoCopy, rollback = false) {
      const scope = copyTarget(copy);
      if (!scope || (rollback ? !copy.canRollback : !copy.tracked)) return;
      return perform(async () => {
        const detail = await post("preview", { id: repo.id, path: skill.path, ...scope, rollback });
        setModal({ type: rollback ? "rollback" : "review", repo, skill, copy, detail });
      });
    }
    function update() {
      if (!modal || (modal.type !== "review" && modal.type !== "rollback")) return;
      const selected = modal, rollback = selected.type === "rollback";
      const scope = copyTarget(selected.copy);
      if (!scope) return;
      return perform(async () => {
        const target = { id: selected.repo.id, path: selected.skill.path, ...scope };
        setInstallation({ ...target, pending: true, key: "repo.updateProgress" });
        try {
          await post(rollback ? "rollback" : "update", { ...target, token: selected.detail.token, overwrite: selected.detail.localModified });
        } catch (caught) { const error = caught as CodedError;
          if (mounted.current) setInstallation({ ...target, error: true, payload: error });
          throw error;
        }
        if (!mounted.current) return;
        const key = rollback ? "repo.rollbackSuccess" : "repo.updateSuccess";
        setInstallation({ ...target, key }); setFeedback({ key }); setModal(null);
        if (onInstalled) await onInstalled();
      });
    }
    function toolbarIconButton(key: string, iconD: string, action: () => unknown) {
      return h(Button, {
        className: "dssm-icon-btn",
        type: "text",
        size: "small",
        disabled: busy,
        "aria-label": t(key),
        title: t(key),
        icon: rowGlyph(iconD),
        style: {
          width: 28,
          minWidth: 28,
          height: 28,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          color: "var(--dsw-alias-label-secondary, #b9b9b9)"
        },
        onClick: action
      });
    }
    function refreshIconButton(selected: RepoView[]) {
      const pending = refreshing && refreshing.id === selected[0]?.id;
      return h(Button, {
        className: "dssm-icon-btn",
        type: "text",
        size: "small",
        disabled: busy || !selected.length,
        "aria-busy": !!pending,
        "aria-label": t(pending ? "repo.refreshing" : "repo.refresh"),
        title: t(pending ? "repo.refreshing" : "repo.refresh"),
        icon: pending ? h("span", { className: "dssm-repo-spinner", "aria-hidden": true }) : rowGlyph("M13.5 8A5.5 5.5 0 118 2.5c2.3 0 4.3 1.4 5.1 3.5m.4-3.5v3.5H10"),
        style: {
          width: 28,
          minWidth: 28,
          height: 28,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--dsw-alias-label-secondary, #b9b9b9)"
        },
        onClick: () => refresh(selected)
      });
    }
    function repositoryFilterActions() {
      return h("div", { className: "dssm-filter-actions" },
        refreshIconButton(repos),
        toolbarIconButton("repo.add", "M8 2.5v11M2.5 8h11", () => { setFeedback(null); setForm({ url: "", ref: "", subdirectory: "" }); setModal({ type: "add" }); }),
        toolbarIconButton("repo.manage", "M2.5 4.5h11M2.5 8h11M2.5 11.5h11", () => { setFeedback(null); setModal({ type: "manage" }); })
      );
    }
    const actions = h("div", { key: "repository-actions", className: "dssm-actions" },
      refreshButton(repos),
      button("repo.add", () => { setFeedback(null); setForm({ url: "", ref: "", subdirectory: "" }); setModal({ type: "add" }); }, false),
      button("repo.manage", () => { setFeedback(null); setModal({ type: "manage" }); }));
    const visibleRepos = repos.filter((r) => !source || r.id === source);
    function renderCopyActions(repo: RepoView, skill: RepoSkill, copy: RepoCopy) {
      const target = copyTarget(copy);
      const pending = installation?.id === repo.id && installation.path === skill.path && installation.pending && target && installation.root === target.root && installation.workspace === target.workspace;
      return h('div', { className: 'dssm-repo-copy-actions' },
          copy.tracked && (copy.updateAvailable || copy.status === 'conflict') ? rowIcon('repo.review', () => preview(repo, skill, copy), !target) : null,
          copy.canRollback ? rowIcon('repo.rollback', () => preview(repo, skill, copy, true), !target) : null,
          copy.canUninstall ? rowIcon(pending && installation.action === 'uninstall' ? 'repo.uninstalling' : 'repo.uninstall', () => openInstallation('uninstall', repo, skill, copy), !target) : null);
    }
    function renderCopy(repo: RepoView, skill: RepoSkill, copy: RepoCopy) {
      const target = copyTarget(copy);
      return h('div', { className: 'dssm-repo-copy', key: JSON.stringify([copy.installedRoot, copy.installedWorkspace || '']) },
        h('div', { className: 'dssm-repo-metadata' }, copyName(copy)),
        renderCopyActions(repo, skill, copy),
        !target ? h('div', { className: 'dssm-note', role: 'status' }, t('repo.destinationUnavailable')) : null);
    }
    const groups = visibleRepos.map((repo) => {
      const search = query.trim().toLowerCase();
      const skills = repo.skills.filter((s) => (!status || s.status === status) && (!search || `${s.name} ${s.description} ${repo.owner}/${repo.name}`.toLowerCase().includes(search)));
      const open = expanded[repo.id] === undefined ? !!search || !!status : expanded[repo.id];
      const body = open ? (skills.length ? skills.map((skill) => {
        const copies = copiesOf(skill);
        const singleCopy = copies.length === 1 ? copies[0] : undefined;
        return h("div", { key: skill.path, className: "dssm-repo-row" },
          h("div", { className: "dssm-repo-head" },
            h("div", { className: "dssm-repo-main" }, h("div", { className: "dssm-name" }, skill.name), h("div", { className: "dssm-repo-description", title: skill.description }, skill.description),
                          singleCopy && !copyTarget(singleCopy) ? h("div", { className: "dssm-note", role: "status" }, t("repo.destinationUnavailable")) : null,
                          installation?.id === repo.id && installation.path === skill.path ? h("div", { className: "dssm-note" + (installation.error ? " dssm-error" : ""), role: installation.error ? "alert" : "status", "aria-live": "polite" }, feedbackText(installation)) : null),
                        h("div", { className: "dssm-repo-actions" },
                          rowIcon("repo.detail", () => openDetail(repo, skill)),
                          rowIcon(installation?.id === repo.id && installation.path === skill.path && installation.pending && installation.action === "install" ? "repo.installing" : copies.length ? "repo.installElsewhere" : "repo." + (skill.status === "available" ? "install" : skill.status), () => openInstallation("install", repo, skill), !copies.length && skill.status !== "available"))),
                      copies.length ? h("div", { className: "dssm-repo-copies" }, copies.map(copy => renderCopy(repo, skill, copy))) : null);
      }) : h("div", { className: "dssm-empty" }, t("repo.noSkills"))) : null;
      return h("div", { key: repo.id },
        h(Collapse, {
          className: "dssm-source", bordered: false, styles: { body: { padding: 0 } }, activeKey: open ? [repo.id] : [],
          onChange: (keys: string | string[]) => { const list = Array.isArray(keys) ? keys : [keys]; setExpanded({ ...expanded, [repo.id]: list.includes(repo.id) }); },
          items: [{
            key: repo.id,
            label: h("div", { className: "dssm-source-label" },
              h("span", { className: "dssm-source-brand", title: "GitHub Repository" },
                h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, fill: "currentColor" },
                  h("path", { d: "M8 0a8 8 0 0 0-2.53 15.59c.4.074.547-.173.547-.385 0-.19-.007-.693-.01-1.36-2.226.484-2.695-1.073-2.695-1.073-.364-.924-.89-1.17-.89-1.17-.726-.496.055-.486.055-.486.803.056 1.225.824 1.225.824.714 1.223 1.872.87 2.328.665.072-.517.28-.87.508-1.07-1.777-.202-3.645-.888-3.645-3.956 0-.874.31-1.588.823-2.148-.083-.202-.357-1.017.078-2.12 0 0 .672-.215 2.2.82A7.65 7.65 0 0 1 8 4.8c.68.003 1.365.092 2.004.27 1.527-1.035 2.197-.82 2.197-.82.437 1.103.162 1.918.08 2.12.513.56.822 1.274.822 2.148 0 3.076-1.872 3.752-3.654 3.95.288.248.544.735.544 1.482 0 1.07-.01 1.932-.01 2.195 0 .214.144.463.55.384A8.001 8.001 0 0 0 8 0Z" })
                )
              ),
              h("span", { className: "dssm-source-title" }, repo.owner + "/" + repo.name),
              h("span", { className: "dssm-count" }, skills.length),
              h("span", { className: "dssm-source-path", title: repo.owner + "/" + repo.name }, [repo.ref || t("repo.defaultBranchLabel"), repo.subdirectory].filter(Boolean).join(" · ") || (repo.owner + "/" + repo.name))
            ),
            extra: h("span", { className: "dssm-repo-commit-badge", title: repo.commit || t("repo.notScanned") }, repo.commit ? repo.commit.slice(0, 7) : t("repo.notScanned")),
            children: body
          }],
        }),
        repo.error ? h("div", { className: "dssm-feedback dssm-error", role: "alert" }, message(repo.error)) : null);
    });
    function select(label: string, value: string, change: (value: string) => void, options: string[][]) {
      return h(SourceSelect, { label: t(label), value, onChange: change, options: [{ value: "", label: t(label) }, ...options.map(([id, text]) => ({ value: id, label: text }))] });
    }
    const feedbackNode = feedback ? h("div", { className: "dssm-feedback" + (feedback.error ? " dssm-error" : ""), role: feedback.error ? "alert" : "status" }, feedbackText(feedback)) : null;
    const refreshProgress = refreshing ? h("div", { className: "dssm-note", role: "status", "aria-live": "polite" }, t("repo.refreshing") + " " + refreshing.index + "/" + refreshing.total + " · " + refreshing.name) : null;
    let dialog;
    if (modal) {
      let body;
      if (modal.type === 'install') body = h('div', { className: 'dssm-repo-panel', 'aria-busy': busy },
        h('div', { className: 'dssm-name' }, modal.skill.name),
        h(DestinationPicker, { t, value: destination, disabled: busy, allowAgents: true, workspaces, userDestinations: installRoots,
          onChange: (next: Partial<DestinationValue>) => { if (!locked.current) setDestination({ ...destination, ...next }); } }),
        h('p', { className: 'dssm-note' }, t('repo.installLocationsHint')),
        h('p', { className: 'dssm-note' }, t('repo.installHint')),
        busy ? h('div', { role: 'status', 'aria-live': 'polite' }, t('repo.installProgress')) : null, feedbackNode,
        h('div', { className: 'dssm-modal-actions' }, button('repo.cancel', close), button(busy ? 'repo.installing' : 'repo.install', changeInstallation, false, !destinationReady(destination, workspaces, installRoots))));
      if (modal.type === 'uninstall') body = h('div', { className: 'dssm-repo-panel', 'aria-busy': busy },
        h('div', { className: 'dssm-name' }, modal.skill.name),
        modal.copy ? h('div', { className: 'dssm-repo-metadata' }, copyName(modal.copy)) : null,
        h('p', { className: 'dssm-desc' }, t('repo.uninstallHint')),
        modal.copy?.installedRoot === 'agents' && !modal.copy.installedWorkspace ? h('p', { className: 'dssm-feedback dssm-warning', role: 'alert' }, t('repo.uninstallExternalWarning')) : null,
        busy ? h('div', { role: 'status', 'aria-live': 'polite' }, t('repo.uninstallProgress')) : null, feedbackNode,
        h('div', { className: 'dssm-modal-actions' }, button('repo.cancel', close), button(busy ? 'repo.uninstalling' : 'repo.confirmUninstall', changeInstallation, false, !modal.copy || !copyTarget(modal.copy), true)));
      if (modal.type === "review" || modal.type === "rollback") body = h("div", { className: "dssm-repo-panel" },
        h("div", { className: "dssm-name" }, modal.skill.name),
        h('div', { className: 'dssm-repo-metadata' }, copyName(modal.copy)),
        h("div", { className: "dssm-repo-metadata" }, modal.repo.owner + "/" + modal.repo.name + " · " + modal.detail.commit?.slice(0, 7)),
        modal.detail.localModified ? h("p", { className: "dssm-feedback dssm-warning", role: "alert" }, t("repo.modified")) : null,
        modal.detail.changes.length ? h("ul", { style: { maxHeight: "240px", overflow: "auto", overflowWrap: "anywhere", paddingLeft: "20px" } }, modal.detail.changes.map(change => h("li", { key: change.path }, t("repo." + (change.kind === "modified" ? "modifiedFile" : change.kind)) + " · " + change.path))) : h("p", null, t("repo.noChanges")),
        busy ? h("div", { role: "status" }, t("repo.updateProgress")) : null, feedbackNode,
        h("div", { className: "dssm-modal-actions" }, button("repo.cancel", close), button(modal.detail.localModified ? "repo.overwrite" : modal.type === "rollback" ? "repo.confirmRollback" : "repo.confirmUpdate", update, false, !modal.detail.changes.length || !copyTarget(modal.copy))));
      if (modal.type === "add") body = h("form", { className: "dssm-form", onSubmit: (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!form.url.trim()) return; perform(async () => { const repo = await post("add", form); await refreshRepo(repo.id); setModal(null); }); } },
        [["url", "repo.url", "https://github.com/owner/repo"], ["ref", "repo.ref", t("repo.defaultBranch")], ["subdirectory", "repo.directory", t("repo.directoryHint")]].map(([key, label, placeholder]) => h("label", { className: "dssm-field", key }, h("span", { className: "dssm-label" }, t(label)), h(Input, { "aria-label": t(label), value: form[key], placeholder, maxLength: key === "url" ? 2048 : 512, required: key === "url", disabled: busy, onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) }))),
        feedbackNode, h("div", { className: "dssm-modal-actions" }, button("repo.cancel", close), button("repo.save", () => { if (form.url.trim()) perform(async () => { const repo = await post("add", form); await refreshRepo(repo.id); setModal(null); }); }, false, !form.url.trim())));
      if (modal.type === "manage") body = h("div", { className: "dssm-repo-panel" }, h("p", { className: "dssm-desc" }, t("repo.removeHint")), refreshProgress, feedbackNode, repos.length ? repos.map((repo) => h("div", { key: repo.id, className: "dssm-repo-row dssm-repo-manage-row" },
              h("div", { className: "dssm-repo-main" }, h("div", { className: "dssm-name" }, repo.owner + "/" + repo.name), h("div", { className: "dssm-note" }, [repo.ref || t("repo.defaultBranch"), repo.subdirectory].filter(Boolean).join(" · ")), h("div", { className: "dssm-repo-metadata" }, repo.refreshedAt ? t("repo.updated") + " · " + new Date(repo.refreshedAt).toLocaleString(getLocale?.() || t("format.locale")) : t("repo.notScanned"))),
              h("div", { className: "dssm-repo-actions" }, refreshButton([repo], true), button("repo.remove", () => setModal({ type: "remove", repo }), false, false, true)))) : h("div", { className: "dssm-empty" }, t("repo.empty")));
      if (modal.type === "remove") body = h("div", null, h("p", { className: "dssm-desc" }, modal.repo.owner + "/" + modal.repo.name), h("p", { className: "dssm-desc" }, t("repo.removeHint")), feedbackNode,
        h("div", { className: "dssm-modal-actions" }, button("repo.cancel", () => setModal({ type: "manage" })), button("repo.removeConfirm", () => perform(async () => { await post("remove", { id: (modal as Extract<RepoModal, {type: "remove"}>).repo.id }); if (source === (modal as Extract<RepoModal, {type: "remove"}>).repo.id) setSource(""); setModal({ type: "manage" }); }), false)));
      if (modal.type === "catalog-detail" && modal.detail) body = h("div", { className: "dssm-repo-panel" }, h("div", { className: "dssm-name" }, modal.detail.name), h("p", { className: "dssm-desc" }, modal.detail.description), h("div", { className: "dssm-detail-path" }, modal.detail.origin), h("p", { className: "dssm-note" }, t("repo.installHint")), h(Input.TextArea, { readOnly: true, value: modal.detail.body || "", autoSize: { minRows: 6, maxRows: 16 } }));
      if (modal.type === "catalog-detail" && !modal.detail) body = h("div", { role: "status", className: "dssm-repo-panel" }, modal.loading ? t("repo.detailLoading") : null, modal.failed ? feedbackNode : null);
      if (modal.type === "catalog-install") body = h("div", { className: "dssm-repo-panel", "aria-busy": busy },
        h("div", { className: "dssm-name" }, modal.target.name),
        h(DestinationPicker, { t, value: destination, disabled: busy, allowAgents: true, workspaces, userDestinations: installRoots, onChange: (next: Partial<DestinationValue>) => { if (!locked.current) setDestination({ ...destination, ...next }); } }),
        h("p", { className: "dssm-note" }, t("repo.installLocationsHint")),
        h("p", { className: "dssm-note" }, t("repo.installHint")),
        busy ? h("div", { role: "status", "aria-live": "polite" }, t("repo.installProgress")) : null, feedbackNode,
        h("div", { className: "dssm-modal-actions" }, button("repo.cancel", close), button(busy ? "repo.installing" : "repo.install", confirmCatalogInstall, false, !destinationReady(destination, workspaces, installRoots))));
      if (modal.type === "catalog-uninstall") body = h("div", { className: "dssm-repo-panel", "aria-busy": busy },
        h("div", { className: "dssm-name" }, modal.copy.name),
        h("div", { className: "dssm-repo-metadata" }, catalogCopyName(modal.copy)),
        h("p", { className: "dssm-desc" }, t("repo.uninstallHint")),
        modal.copy.installedRoot === "agents" && !modal.copy.installedWorkspace ? h("p", { className: "dssm-feedback dssm-warning", role: "alert" }, t("repo.uninstallExternalWarning")) : null,
        busy ? h("div", { role: "status", "aria-live": "polite" }, t("repo.uninstallProgress")) : null, feedbackNode,
        h("div", { className: "dssm-modal-actions" }, button("repo.cancel", close), button(busy ? "repo.uninstalling" : "repo.confirmUninstall", confirmCatalogUninstall, false, false, true)));
      if (modal.type === "detail" && modal.detail) body = h("div", { className: "dssm-repo-panel" }, h("div", { className: "dssm-name" }, modal.detail.name), h("p", { className: "dssm-desc" }, modal.detail.description), h("div", { className: "dssm-detail-path" }, modal.repo.owner + "/" + modal.repo.name + " · " + modal.detail.path), h("div", { className: "dssm-repo-metadata" }, t("repo.commit") + " · " + modal.detail.commit), h("p", { className: "dssm-note" }, t("repo.installHint")), h(Input.TextArea, { readOnly: true, value: modal.detail.body || "", autoSize: { minRows: 6, maxRows: 16 } }));
      if (modal.type === "detail" && !modal.detail) body = h("div", { role: "status", className: "dssm-repo-panel" }, modal.loading ? t("repo.detailLoading") : null, modal.failed ? feedbackNode : null);
      dialog = h(Modal, { title: t("repo." + (modal.type === "catalog-detail" ? "detail" : modal.type === "catalog-install" ? "install" : modal.type === "catalog-uninstall" ? "uninstall" : modal.type === "remove" ? "remove" : modal.type)), closeLabel: t("repo.close"), onClose: close }, body);
    }

    function catalogInstalled(id: string) { return catalogInstallIds.includes(id) || catalogCopiesOf(id).length > 0; }
    function catalogCopiesOf(id: string) { return catalogCopies.filter(copy => copy.id === id); }
        function catalogCopyName(copy: CatalogCopy) { return copy.installedWorkspace ? t("repo.projectDestination", { path: copy.installedWorkspace }) : t(copy.installedRoot === "agents" ? "repo.rootAgents" : "repo.rootDsh"); }
        function openCatalogUninstall(copy: CatalogCopy) { if (!locked.current && copy.canUninstall) { setFeedback(null); setModal({ type: "catalog-uninstall", copy }); } }
        function confirmCatalogUninstall() {
          if (!modal || modal.type !== "catalog-uninstall") return;
          const copy = modal.copy;
          return perform(async () => {
            await api("/delete", { method: "POST", headers, body: JSON.stringify({ name: copy.name, root: copy.installedRoot, ...(copy.installedWorkspace ? { workspace: copy.installedWorkspace } : {}) }) });
            if (!mounted.current) return;
            setCatalogCopies(prev => prev.filter(item => item !== copy && !(item.id === copy.id && item.installedRoot === copy.installedRoot && item.installedWorkspace === copy.installedWorkspace)));
            setFeedback({ key: "repo.uninstallSuccess", name: copy.name });
                        setModal(null);
                        const refreshed = await Promise.allSettled([load(), Promise.resolve().then(() => onInstalled?.())]);
                        if (mounted.current && refreshed.some(result => result.status === "rejected")) setFeedback({ key: "repo.catalog.uninstallRefreshWarning", name: copy.name });
          }, false);
        }
        function renderCatalogActions(id: string, unknown: boolean, openDetail: () => void, openInstall: () => void) {
          const copies = catalogCopiesOf(id);
          return h("div", { className: "dssm-repo-actions" },
            rowIcon("repo.detail", openDetail),
            unknown && !copies.length ? h("span", { className: "dssm-note", role: "status" }, t("repo.catalog.unknownLocation")) : null,
            copies.length ? rowIcon("repo.installElsewhere", openInstall) : catalogInstalled(id) ? h("span", { className: "dssm-catalog-installed", role: "status" }, t("repo.installed")) : rowIcon(unknown ? "repo.catalog.reassociate" : "repo.install", openInstall));
        }
        function renderCatalogLocations(id: string) {
          const copies = catalogCopiesOf(id);
          if (!copies.length) return null;
          return h("div", { className: "dssm-repo-copies" }, copies.map(copy => h("div", { className: "dssm-repo-copy", key: JSON.stringify([copy.id, copy.installedRoot, copy.installedWorkspace || ""]) },
            h("div", { className: "dssm-repo-metadata" }, catalogCopyName(copy)),
            copy.canUninstall ? rowIcon("repo.uninstall", () => openCatalogUninstall(copy)) : null)));
        }
    const filteredCatalogItems = catalogItems.filter(item => {
      const installed = catalogInstalled(`clawhub:${item.owner}/${item.slug}`);
      const matchesStatus = !catalogStatus || (catalogStatus === "installed" ? installed : !installed);
      return matchesStatus;
    });
    const catalogList = catalogSort === "installs" ? filteredCatalogItems.slice().sort((left, right) => (right.installs || 0) - (left.installs || 0)) :
      catalogSort === "name" ? filteredCatalogItems.slice().sort((left, right) => left.name.localeCompare(right.name)) : filteredCatalogItems;
    const renderCatalogItem = (item: CatalogSkillItem) => {
      const unknown = catalogUnknownIds.includes(`clawhub:${item.owner}/${item.slug}`);
      const metadata = [
        item.source,
        item.downloads === undefined ? null : item.downloads.toLocaleString() + " " + t("repo.catalog.downloads"),
        item.installs === undefined ? null : item.installs.toLocaleString() + " " + t("repo.catalog.installs"),
        item.stars === undefined ? null : item.stars.toLocaleString() + " " + t("repo.catalog.stars"),
      ].filter(Boolean).join(" · ");
      return h("div", { key: item.id, className: "dssm-repo-row" },
              h("div", { className: "dssm-repo-head" },
                h("div", { className: "dssm-repo-main" },
                  h("div", { className: "dssm-name" }, item.name),
                  item.description ? h("div", { className: "dssm-repo-description", title: item.description }, item.description) : null,
                  h("div", { className: "dssm-meta-origin" }, metadata)
                ),
                renderCatalogActions(`clawhub:${item.owner}/${item.slug}`, unknown, () => openCatalogDetail({ catalog: "clawhub", owner: item.owner, slug: item.slug, name: item.name }), () => openCatalogInstall({ catalog: "clawhub", owner: item.owner, slug: item.slug, name: item.name }))
              ),
              renderCatalogLocations(`clawhub:${item.owner}/${item.slug}`)
            );
    };
    const catalogView = h("div", { className: "dssm-catalog-list", onWheel: onCatalogWheel },
      catalogList.map(renderCatalogItem),
      !catalogList.length && !catalogLoading && !catalogError ? h("div", { className: "dssm-empty" }, t("repo.catalog.empty")) : null,
      catalogLoading ? h("div", { className: "dssm-catalog-loading", role: "status", "aria-live": "polite" }, h("span", { className: "dssm-repo-spinner", "aria-hidden": true }), catalogItems.length ? t("repo.catalog.loadingMore") : t("repo.catalog.loading")) : null,
      catalogError ? h("div", { className: "dssm-feedback dssm-error", role: "alert" }, t("repo.catalog.loadError"), h(Button, { type: "text", onClick: () => { void loadClawHubPage(); } }, t("repo.catalog.retry"))) : null,
      subsource === "clawhub" && !catalogQuery.trim() && catalogHasMore && !catalogError ? h("div", { className: "dssm-catalog-sentinel", ref: catalogSentinel, "aria-hidden": true }) : null,
      subsource === "clawhub" && !catalogQuery.trim() && catalogHasMore && !catalogError && !catalogLoading ? h("div", { className: "dssm-catalog-loading" }, h(Button, { type: "text", onClick: () => { void loadClawHubPage(false, true); } }, t("repo.catalog.loadMore"))) : null
    );
    const clawhubSearchView = h("div", { className: "dssm-catalog-list" },
      clawhubSearchItems.map(renderCatalogItem),
      catalogQuery.trim() && !clawhubSearchItems.length && !clawhubSearchLoading && !clawhubSearchError ? h("div", { className: "dssm-empty" }, t("repo.catalog.searchEmpty")) : null,
      clawhubSearchLoading ? h("div", { className: "dssm-note", role: "status", "aria-live": "polite" }, t("repo.catalog.searchLoading")) : null,
      clawhubSearchError ? h("div", { className: "dssm-feedback dssm-error", role: "alert" }, t("repo.catalog.searchError"), h(Button, { type: "text", onClick: () => { void fetchClawHubSearch(catalogQuery.trim()); } }, t("repo.catalog.retry"))) : null
    );

    const skillshVisible = skillshItems.filter(item => {
          if (!skillshStatus) return true;
          const installed = catalogInstalled(`skillsh:${item.source}/${item.skillId}`);
          return skillshStatus === "installed" ? installed : !installed;
        });
        const skillshView = h("div", { className: "dssm-catalog-list" },
          skillshVisible.map(item => {
        const skillshId = `skillsh:${item.source}/${item.skillId}`;
                const unknown = catalogUnknownIds.includes(skillshId);
                const metadata = [item.source, item.installs === undefined ? null : item.installs.toLocaleString() + " " + t("repo.catalog.installs")].filter(Boolean).join(" · ");
                return h("div", { key: item.id, className: "dssm-repo-row" },
                  h("div", { className: "dssm-repo-head" },
                    h("div", { className: "dssm-repo-main" },
                      h("div", { className: "dssm-name" }, item.name),
                      h("div", { className: "dssm-meta-origin" }, metadata)
                    ),
                    renderCatalogActions(skillshId, unknown, () => openCatalogDetail({ catalog: "skillsh", source: item.source, skillId: item.skillId, name: item.name }), () => openCatalogInstall({ catalog: "skillsh", source: item.source, skillId: item.skillId, name: item.name }))
                  ),
                  renderCatalogLocations(skillshId)
                );
      }),
      skillshQuery.trim() && !skillshVisible.length && !skillshLoading && !skillshError ? h("div", { className: "dssm-empty" }, t("repo.catalog.skillshEmpty")) : null,
      skillshLoading ? h("div", { className: "dssm-note", role: "status", "aria-live": "polite" }, t("repo.catalog.skillshLoading")) : null,
      skillshError ? h("div", { className: "dssm-feedback dssm-error", role: "alert" }, t("repo.catalog.skillshError"), h(Button, { type: "text", onClick: () => { void fetchSkillshResults(skillshQuery.trim()); } }, t("repo.catalog.retry"))) : null
    );

    const subsourceToolbar = h("div", { className: "dssm-subsources" },
      h("button", { type: "button", className: "dssm-subsource-btn" + (subsource === "github" ? " on" : ""), "aria-pressed": subsource === "github", onClick: () => selectSubsource("github") }, t("repo.subsource.github") + " (" + repos.length + ")"),
      h("button", { type: "button", className: "dssm-subsource-btn" + (subsource === "clawhub" ? " on" : ""), "aria-pressed": subsource === "clawhub", onClick: () => selectSubsource("clawhub") }, t("repo.subsource.clawhub")),
      h("button", { type: "button", className: "dssm-subsource-btn" + (subsource === "skillsh" ? " on" : ""), "aria-pressed": subsource === "skillsh", onClick: () => selectSubsource("skillsh") }, t("repo.subsource.skillsh"))
    );

    const filtersRow = subsource === "github" ? h("div", { className: "dssm-filters" },
        h("div", { className: "dssm-source-filter" }, select("repo.all", source, setSource, repos.map((r) => [r.id, r.owner + "/" + r.name]))),
        h("div", { className: "dssm-status-filter" }, select("repo.states", status, (value) => { setStatus(value); setExpanded({}); }, ["available", "installed", "update", "conflict", "invalid"].map((s) => [s, t("repo." + s)]))),
        h(Input, { className: "dssm-search", allowClear: true, "aria-label": t("repo.search"), placeholder: t("repo.search"), value: query, onChange: (e: { target: { value: string } }) => { setQuery(e.target.value); setExpanded({}); } }),
        repositoryFilterActions()
      ) : subsource === "clawhub" ? h("div", { className: "dssm-filters dssm-catalog-filters" },
              !catalogQuery.trim() ? h("div", { className: "dssm-catalog-sort-filter" }, select("repo.subsource.popular", catalogSort, setCatalogSort, [["installs", t("repo.sort.installs")], ["name", t("repo.sort.name")]])) : null,
              !catalogQuery.trim() ? h("div", { className: "dssm-catalog-status-filter" }, select("repo.catalog.states", catalogStatus, setCatalogStatus, [["available", t("repo.available")], ["installed", t("repo.installed")]])) : null,
              h(Input, { className: "dssm-search", allowClear: true, maxLength: 100, "aria-label": t("repo.catalog.searchClawhub"), placeholder: t("repo.catalog.searchClawhub"), value: catalogQuery, onChange: (e: { target: { value: string } }) => updateClawHubQuery(e.target.value) })
            ) : subsource === "skillsh" ? h("div", { className: "dssm-filters dssm-catalog-filters dssm-skillsh-filters" },
              h("div", { className: "dssm-catalog-status-filter" }, select("repo.catalog.states", skillshStatus, setSkillshStatus, [["available", t("repo.catalog.uninstalled")], ["installed", t("repo.installed")]])),
              h(Input, { className: "dssm-search", allowClear: true, maxLength: 100, "aria-label": t("repo.catalog.searchSkillsh"), placeholder: t("repo.catalog.searchSkillsh"), value: skillshQuery, onChange: (e: { target: { value: string } }) => updateSkillshQuery(e.target.value) })
            ) : null;

    const content = h("div", { key: "repositories", id: "dssm-scope-panel", role: "tabpanel", "aria-labelledby": "dssm-tab-repositories", className: "dssm-repo-panel", "aria-busy": busy }, h("style", null, CSS),
      subsourceToolbar,
      subsource === "github" ? h("p", { className: "dssm-desc" }, t("repo.hint")) : subsource === "clawhub" && !catalogQuery.trim() ? h("p", { className: "dssm-desc" }, t("repo.subsource.catalogNote")) : null,
      filtersRow,
      catalogUnknownIds.length ? h("div", { className: "dssm-note", role: "status" }, t("repo.catalog.unknownHint")) : null,
      catalogWarnings.map(warning => h("div", { key: warning.id, className: "dssm-feedback dssm-error", role: "alert" }, warning.id + " · " + message(warning))),
      feedbackNode, !modal ? refreshProgress : null, busy && !refreshing ? h("div", { className: "dssm-note", role: "status" }, t("repo.loading")) : null,
      subsource === "github" ? (repos.length ? groups : h("div", { className: "dssm-empty" }, t("repo.empty"))) :
        subsource === "skillsh" ? skillshView : catalogQuery.trim() ? clawhubSearchView : catalogView,
      h("p", { className: "dssm-note" }, t("repo.footer")), dialog);
    return { actions, content, focusSource: (origin: InstallSource, name: string) => { setSource(origin.id); setQuery(name); setStatus(""); setExpanded({ [origin.id]: true }); } };
  };
}
