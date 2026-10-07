import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CreateInput, ScopeOptions } from './types.js';
import type { ProviderCandidate, createSkill, getProviderSkill } from './core.js';
/** 七版宿主实际使用的最小服务契约，兼容旧版可选服务与返回值。 */
export interface ProviderControl {
    invalidate: () => void;
    signal?: AbortSignal;
}
interface SkillProvider {
    name: string;
    list: (options?: ScopeOptions) => Promise<ProviderCandidate[]>;
    get: (candidate: ProviderCandidate, options?: ScopeOptions) => ReturnType<typeof getProviderSkill>;
}
interface Skills {
    invalidate?: () => void;
    registerProvider: (factory: (control: ProviderControl) => SkillProvider) => (() => void);
}
interface Session {
    id?: string;
    header?: {
        id?: string;
        cwd?: string;
        agentPreset?: string;
    };
}
interface Sessions {
    list: () => Session[];
    get?: (id: string) => Session | undefined;
}
export interface Agent {
    id: string;
    ctx: {
        skills?: Skills;
        get?: (key: 'skills') => Skills | undefined;
    };
}
interface Services {
    sessions: Sessions;
    agents: {
        list: () => Agent[];
    };
    desktopProfiles: {
        current?: {
            name: string;
            dir: string;
        };
    };
    desktopPnpm: {
        runPlugin: (args: string[], directory: string) => {
            done: Promise<{
                exitCode: number;
            }>;
        };
    };
}
export interface HostContext {
    get?: <K extends keyof Services>(key: K) => Services[K] | undefined;
    sessions?: Sessions;
    skills: Skills;
    webRuntime: {
        trustedHosts?: string[];
    };
    webServer: {
        register: (route: {
            kind: string;
            path: string;
            handler: (req: IncomingMessage, res: ServerResponse) => unknown;
        }) => () => void;
    };
    logger: {
        warn: (message: string) => void;
    };
    effect: (effect: () => (() => void) | void, label: string) => unknown;
    emit?: (event: string, ...args: unknown[]) => unknown;
    on?: {
        (event: 'agent/created' | 'agent/disposed', handler: (event: {
            agent: Agent;
        }) => void): (() => void) | void;
        (event: 'tools/pre-execute', handler: (execution: {
            name: string;
        }, next: () => unknown) => unknown): (() => void) | void;
    };
    tools?: {
        register: (tool: {
            name: string;
            description: string;
            parameters: unknown;
            output: {
                schema: unknown;
                render: (args: CreateInput, value: Awaited<ReturnType<typeof createSkill>>) => {
                    type: string;
                    text: string;
                }[];
            };
            execute: (args: CreateInput) => ReturnType<typeof createSkill>;
            presentCall: (args: CreateInput) => {
                card: string;
                title: string;
                kind: string;
                rawInput?: string;
            };
        }) => () => void;
    };
}
export interface UpdateOptions {
    endpoint: string;
    packageName: string;
    manifestUrl: URL;
}
export interface UpdateTarget {
    profileName: string;
    profileDir: string;
    cliEntry?: string;
    desktopPnpm?: Services['desktopPnpm'];
    packageManager?: { command: string; args: readonly string[]; env?: NodeJS.ProcessEnv };
    pluginManager?: { installBundle(spec: string): Promise<{ application?: string; error?: { message?: string }; packageResult?: { output?: string } }> };
    officialDesktop: boolean;
    canAutoUpdate: boolean;
}
