import type * as React from 'react';
import type { createRepositoryManager } from './repositories.js';
import type { state, skillDetail, createSkill, listTrash } from './core.js';
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
    [K in keyof Manager as K extends 'sources' | 'list' | 'restoreTrash' ? never : `/repositories/${K}`]: Awaited<ReturnType<Manager[K]>>;
};
export type ApiRoutes = RepositoryRoutes & {
    '/repositories': Awaited<ReturnType<Manager['list']>>;
    '/state': ManagerSnapshot;
    '/detail': Detail;
    '/create': Success<Awaited<ReturnType<typeof createSkill>>>;
    '/upload': ImportResult;
    '/delete': unknown;
    '/trash-restore': unknown;
    '/trash-delete': unknown;
    '/enable': unknown;
    '/disable': unknown;
    '/source-enable': unknown;
    '/source-disable': unknown;
};
export type ApiCall = <K extends keyof ApiRoutes>(path: K, options?: RequestInit) => Promise<ApiRoutes[K]>;
export interface ModalProps {
    title: string;
    closeLabel: string;
    onClose: () => void;
    children?: React.ReactNode;
    wide?: boolean;
    className?: string;
}
export interface SourceSelectProps {
    value?: string;
    label: string;
    disabled?: boolean;
    action?: boolean;
    options: {
        value: string;
        label: string;
        disabled?: boolean;
        danger?: boolean;
    }[];
    onChange: (value: string) => void;
}
export interface SessionSnapshot {
    current?: string;
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
export interface ClientContext {
    effect: (effect: () => void | (() => void), label?: string) => unknown;
    locale: {
        register: (namespace: string, dictionary: Record<string, Record<string, string>>) => () => void;
        bind: (namespace: string) => Translate;
    };
    slots: {
        inject: (name: string, factory: () => unknown) => unknown;
        register: (options: {
            name: string;
            id: string;
            order: number;
            label: () => string;
            icon: string;
            locale: string;
        }, component: React.ComponentType<SectionProps>) => unknown;
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
