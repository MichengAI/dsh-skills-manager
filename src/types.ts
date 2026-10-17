/** 全局与项目来源共用的目录契约；项目字段只在项目来源存在。 */
export interface SkillRoot {
    key: string;
    path: string;
    label: string;
    rank: number;
    mutable: boolean;
    native: boolean;
    toggleable: boolean;
    scope?: string;
    kind?: string;
    localeKey?: string;
    projectRoot?: string;
    projectName?: string;
    workspaceCwds?: string[];
    ok?: true;
}
export type RootInput = SkillRoot | string | null | undefined;
export interface Diagnostic {
    code?: string;
    params?: Record<string, unknown>;
    error?: string;
    level?: string;
}
export interface OperationError extends Diagnostic {
    ok: false;
    error: string;
}
export interface CodedError extends Error {
    code?: string;
    params?: Record<string, unknown>;
    statusCode?: number;
    httpStatus?: number;
}
export type Log = (event: string, detail: unknown) => void | Promise<void>;
export interface DiscoveredEntry {
    name?: string;
    kind: string;
    docPath: string;
    entryPath: string;
    realDocPath: string;
    realEntryPath: string;
    linked: boolean;
}
export interface SkillEntry extends DiscoveredEntry {
    name: string;
    declaredName: string;
    description: string;
    modelInvocable: boolean;
    userInvocable: boolean;
    invocationPolicyValid: boolean;
    hasFrontmatter: boolean;
    loadable: boolean;
    diagnostics: Diagnostic[];
    providerRank?: number;
    policyAliases?: {
        rootKey: string;
        name: string;
    }[];
}
export interface ParsedSkill {
    fields: {
        key: string;
        raw: string;
    }[];
    map: Record<string, string>;
    body: string;
    hasFrontmatter: boolean;
}
export interface Scan {
    exists: boolean;
    entries: SkillEntry[];
    truncated?: boolean;
}
export interface SkillCategory {
    id: string;
    name: string;
}
export interface ManagerState {
    version: number;
    sources: Record<string, boolean>;
    disabledSkills: Record<string, string[]>;
    enabledSkills: Record<string, string[]>;
    /** 每个来源自己的列表分类。旧状态文件可以没有这两个字段。 */
    categories: Record<string, SkillCategory[]>;
    categoryMembers: Record<string, Record<string, string>>;
    /** 每个来源、分类（空字符串代表未分类）里的手动排序；旧状态文件可以缺省。 */
    categoryOrder: Record<string, Record<string, string[]>>;
}
export interface PolicyResult {
    state: ManagerState;
    writable: boolean;
    warning: Diagnostic | null;
}
export interface Policy {
    override?: boolean;
    sourceEnabled: boolean;
    modelInvocable: boolean;
    userInvocable: boolean;
    enabled: boolean;
}
export interface SkillView extends Omit<SkillEntry, 'docPath' | 'entryPath' | 'realDocPath' | 'realEntryPath' | 'linked'> {
    path: string;
    managerEnabled: boolean;
    managerOverride: boolean | null;
    effectiveModelInvocable: boolean;
    effectiveUserInvocable: boolean;
    enabled?: boolean;
    winner?: boolean;
    canonicalName?: string;
    shadowedBy?: {
        root: string;
        name: string;
    };
    fallbackTo?: {
        root: string;
        name: string;
        scope: string;
    };
    installSource?: InstallSource | null;
    categoryId?: string | null;
    /** 可写根里的顶层目录链接。详情和启停可用，删除与覆盖不可用。 */
    linked?: boolean;
}
export interface RootView extends SkillRoot {
    exists: boolean;
    truncated: boolean;
    enabled: boolean;
    skills: SkillView[];
    categories: SkillCategory[];
    categoryOrder?: Record<string, string[]>;
}
export interface SkillItem {
    root: SkillRoot;
    entry: SkillEntry;
    policy: Policy;
}
export interface ViewItem extends SkillItem {
    view: SkillView;
    managerEnabled: boolean;
}
export interface FileDigest {
    path: string;
    hash: string;
}
export type Archive = Record<string, Uint8Array>;
export interface RepositorySource {
    owner: string;
    name: string;
    ref: string;
    subdirectory: string;
}
export interface RepositorySkill {
    path: string;
    name: string;
    description: string;
    body: string;
    valid: boolean;
    documentHash: string;
    files?: FileDigest[];
}
export interface Repository extends RepositorySource {
    id: string;
    skills: RepositorySkill[];
    commit: string | null;
    refreshedAt: string | null;
    error: Diagnostic | null;
}
export type RepositoryRoot = 'dsh' | 'agents';
export interface RepositoryDestination {
    key: RepositoryRoot;
    path: string;
    label: string;
    localeKey?: string;
    available: boolean;
    error?: Diagnostic;
}
export interface InstallSource extends RepositorySource {
    root?: RepositoryRoot;
    workspace?: string;
    id: string;
    path: string;
    commit: string | null;
}
export interface InstallRecord {
    /** Missing in legacy records: defaults to DSH. */
    root?: RepositoryRoot;
    /** 安装到已登记工作区时保存的项目根；缺省表示用户目录。更新、回滚、卸载都按它定位。 */
    workspace?: string;
    id: string;
    path: string;
    name: string;
    commit: string | null;
    complete: boolean;
    /** Retired ownership: retained only for explicit Trash restore. */
    trashId?: string;
    restoreFingerprint?: string;
    files: FileDigest[];
    source?: RepositorySource;
    backup?: {
        key: string;
        fingerprint: string;
        record: InstallRecord;
    };
}
export interface CatalogInstallRecord {
    id: string;
    name: string;
    /** 旧记录缺少位置时保留，但不猜测其安装归属。 */
    root?: RepositoryRoot;
    workspace?: string;
    /** 回收站中的副本不会把后来创建的同名技能认作原安装。 */
    trashId?: string;
    restoreFingerprint?: string;
    /** 文件落盘前记录精确摘要，确认失败后只恢复完全匹配的副本。 */
    complete?: boolean;
    files?: FileDigest[];
}
export interface RepositoryState {
    version: number;
    repositories: Repository[];
    installs: InstallRecord[];
    catalogInstalls?: (CatalogInstallRecord | string)[];
}
export interface RepositoryInput {
    url?: string;
    ref?: string;
    subdirectory?: string;
}
export interface SkillRequest {
    root?: RepositoryRoot;
    /** 宿主实际登记路径；每次管理重新解析后与记录保存的项目根匹配。 */
    workspace?: string;
    id: string;
    path: string;
    rollback?: boolean;
    token?: string;
    overwrite?: boolean;
}
export type Serialize = <T>(task: () => T | Promise<T>, recover?: boolean) => Promise<T>;
export interface RepositoryDependencies {
    registeredWorkspaces?: () => string[] | undefined;
    /** 测试用来观察是否真的扫描了登记工作区；生产调用不传。 */
    onWorkspaceIndexBuild?: () => void;
    read: () => Promise<RepositoryState>;
    write: (state: RepositoryState) => Promise<void>;
    repository: (state: RepositoryState, id: string) => Repository;
    download: (repo: Repository) => Promise<Archive>;
    serialize: Serialize;
    parseRepositoryInput: (input?: RepositoryInput) => RepositorySource;
}
export interface ScopeOptions {
    projectCwds?: string[];
    cwd?: string;
    signal?: AbortSignal;
}
export interface RenameOptions {
    rename?: (source: string, destination: string) => Promise<void>;
    maxAttempts?: number;
    delayMs?: number;
}
export interface MutationOptions extends ScopeOptions {
    /** 宿主登记的工作区路径列表，由路由从 workspaceRegistry 读取；缺省表示不允许写项目。 */
    registeredWorkspaces?: string[];
    repositoryEntryOnly?: boolean;
    repositoryTrash?: { id: string; repository: { id: string; path: string } };
    /** 内部目录副本回收凭据，不从 HTTP 请求体读取。 */
    catalogTrash?: { id: string; ids: string[] };
    repositoryRestore?: boolean;
    root?: RootInput;
    renameOptions?: RenameOptions;
    conflict?: string;
    dryRun?: boolean;
    /** 内部安装事务在文件复制前持久化意图，不接受请求体回调。 */
    beforeImport?: (pending: ImportPending[], conflicts: ImportConflict[], failed: ImportFailure[]) => Promise<void>;
}
export interface UploadInput {
    name?: string;
    zip?: string;
    entries?: {
        path: string;
        data: string;
    }[];
}
export interface CreateInput {
    name?: string;
    description?: string;
    body?: string;
}
export interface ImportCandidate {
    source: string;
    kebab: string;
    rawName: string;
    isDir: boolean;
}
export interface ImportPending {
    name: string;
    source: string;
    isDir: boolean;
    dest: string;
}
export interface ImportConflict {
    name: string;
    source: string;
    isDir: boolean;
    paths: string[];
}
export interface ImportFailure extends Diagnostic {
    source: string;
    error: string;
}
export interface ImportResult extends Diagnostic {
    ok?: boolean;
    kind?: string;
    imported?: {
        name: string;
        overwritten: boolean;
        warnings: Diagnostic[];
    }[];
    skipped?: {
        name: string;
        source: string;
    }[];
    failed?: ImportFailure[];
    pending?: ImportPending[];
    conflicts?: ImportConflict[];
}
