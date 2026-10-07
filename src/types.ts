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
export interface ManagerState {
    version: number;
    sources: Record<string, boolean>;
    disabledSkills: Record<string, string[]>;
    enabledSkills: Record<string, string[]>;
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
}
export interface RootView extends SkillRoot {
    exists: boolean;
    truncated: boolean;
    enabled: boolean;
    skills: SkillView[];
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
    id: string;
    path: string;
    commit: string | null;
}
export interface InstallRecord {
    /** Missing in legacy records: defaults to DSH. */
    root?: RepositoryRoot;
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
export interface RepositoryState {
    version: number;
    repositories: Repository[];
    installs: InstallRecord[];
}
export interface RepositoryInput {
    url?: string;
    ref?: string;
    subdirectory?: string;
}
export interface SkillRequest {
    root?: RepositoryRoot;
    id: string;
    path: string;
    rollback?: boolean;
    token?: string;
    overwrite?: boolean;
}
export type Serialize = <T>(task: () => T | Promise<T>, recover?: boolean) => Promise<T>;
export interface RepositoryDependencies {
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
    /** Internal repository operations only; never taken from HTTP request bodies. */
    allowRepositoryRoot?: boolean;
    repositoryEntryOnly?: boolean;
    repositoryTrash?: { id: string; repository: { id: string; path: string } };
    repositoryRestore?: boolean;
    root?: RootInput;
    renameOptions?: RenameOptions;
    conflict?: string;
    dryRun?: boolean;
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
