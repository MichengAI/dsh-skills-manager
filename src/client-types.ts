import type { ClawHubPage, ClawHubSearchResponse } from './clawhub-catalog.js';
import type * as React from 'react';
import type { createRepositoryManager } from './repositories.js';
import type { state, skillDetail, createSkill, listTrash, listWorkspaces, workspaceSkills } from './core.js';
import type { ImportResult } from './types.js';
export type Translate = (key: string, params?: object) => string;
type Success<T> = T extends {
    error: string;
} ? never : T;
export type ManagerSnapshot = Awaited<ReturnType<typeof state>>;
export type Detail = Success<Awaited<ReturnType<typeof skillDetail>>>;
export type TrashItem = Awaited<ReturnType<typeof listTrash>>[number];
type Manager = ReturnType<typeof createRepositoryManager>;
export type RepositoryRoutes = {
    [K in keyof Manager as K extends 'sources' | 'list' | 'restoreTrash' | 'rememberCatalogInstall' | 'forgetCatalogInstall' | 'installCatalog' | 'trashSkill' | 'permanentlyDeleteTrash' ? never : `/repositories/${K}`]: Awaited<ReturnType<Manager[K]>>;
};
type SkillsShSearchPath = `/skills-sh/search?q=${string}`;
type SkillsShSearchResult = { skills: { id: string; source: string; skillId: string; name: string; installs?: number }[] };
export type ApiRoutes = RepositoryRoutes & Record<SkillsShSearchPath, SkillsShSearchResult> & Record<`/clawhub/list?${string}`, ClawHubPage> & Record<`/clawhub/search?${string}`, ClawHubSearchResponse> & {
    '/repositories': Awaited<ReturnType<Manager['list']>>;
    '/state': ManagerSnapshot;
    '/workspaces': { items: Awaited<ReturnType<typeof listWorkspaces>> };
    '/workspace-skills': Success<Awaited<ReturnType<typeof workspaceSkills>>>;
    '/import': ImportResult;
    '/catalog/detail': { name: string; description: string; body: string; origin: string };
    '/catalog/install': { name: string; root: string };
    '/detail': Detail;
    '/root-path': { ok: true; root: { key: string; path: string; defaultPath?: string } };
    '/create': Success<Awaited<ReturnType<typeof createSkill>>>;
    '/upload': ImportResult;
    '/delete': unknown;
    '/trash-restore': unknown;
    '/trash-delete': unknown;
    '/enable': unknown;
    '/disable': unknown;
    '/source-enable': unknown;
    '/source-disable': unknown;
    '/category-create': unknown;
    '/category-rename': unknown;
    '/category-delete': unknown;
    '/category-assign': unknown;
    '/category-move': unknown;
    '/category-enable': unknown;
    '/category-disable': unknown;
    '/sidebar-entry': { enabled: boolean };
    '/online-update': { enabled: boolean };
};
export type ApiCall = <K extends keyof ApiRoutes>(path: K, options?: RequestInit) => Promise<ApiRoutes[K]>;
export interface ModalProps {
    title: string;
    closeLabel: string;
    onClose: () => void;
    description?: string;
    footer?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    contentClassName?: string;
}
export interface SourceSelectProps {
    value?: string;
    label: string;
    disabled?: boolean;
    action?: boolean;
    icon?: React.ReactNode;
    options: {
        value: string;
        label: React.ReactNode;
        disabled?: boolean;
        danger?: boolean;
    }[];
    onChange: (value: string) => void;
}
export interface SessionSnapshot {
    ids?: string[];
    byId?: Record<string, {
        retainedBy?: {
            mainView?: unknown;
        };
    }>;
}
export interface SectionProps {
    t: Translate;
    useSessions?: (selector: (snapshot?: SessionSnapshot) => string | undefined) => string | undefined;
}
export interface Filters {
    query: string;
    source: string;
    status: string;
}
export interface ViewProps extends SectionProps {
    sessionId?: string;
    scope: string;
    setScope: React.Dispatch<React.SetStateAction<string>>;
    savedFilters: Record<string, Filters>;
    setSavedFilters: React.Dispatch<React.SetStateAction<Record<string, Filters>>>;
    expanded: Record<string, boolean>;
    setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}
export interface WorkspaceDirectoryPicker {
    pickDirectory: () => Promise<string | null>;
}
export interface ClientContext {
    effect: (effect: () => void | (() => void), label?: string) => unknown;
    /** Cordis 的可选服务注入：工作区 UI 缺席时插件照常加载，只保留手动输入路径。 */
    inject?: (deps: string[], callback: (ctx: ClientContext & { uiWorkspace?: WorkspaceDirectoryPicker }) => void) => unknown;
    uiWorkspace?: WorkspaceDirectoryPicker;
    locale: {
        register: (namespace: string, dictionary: Record<string, Record<string, string>>) => () => void;
        bind: (namespace: string) => Translate;
        /** Public LocaleRuntime snapshot: already resolves locale.preference. */
        getLocale?: () => { active: string };
    };
    slots: {
        inject: (name: string, factory: () => unknown) => unknown;
        register: (options: Record<string, unknown>, component: (...args: any[]) => any) => unknown;
    };
}
interface Require {
    (id: 'react'): typeof React;
    (id: 'react-dom'): unknown;
    (id: 'react-dom/client'): unknown;
    (id: 'react/jsx-runtime'): unknown;
}
declare global {
    interface Window {
        __ModuleLoader__: {
            load: (module: {
                id: string;
                factory: (require: Require) => Record<string, unknown>;
            }) => void;
        };
    }
}
/** 文件夹选择器的非标准属性由 Chromium/DSH 提供。 */
declare module 'react' {
    interface InputHTMLAttributes<T> {
        webkitdirectory?: string;
        directory?: string;
    }
}
