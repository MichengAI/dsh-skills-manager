import { stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
import type { SkillRoot } from "./types.js";

export interface PresetRootsOptions {
  cordisSkillsDir?: string;
}

/**
 * 递归从预设的 plugins 配置列表中提取 customSkillDirs
 */
export function extractCustomSkillDirs(plugins: unknown[]): string[] {
  const dirs: string[] = [];
  if (!Array.isArray(plugins)) return dirs;
  for (const plugin of plugins) {
    if (!plugin || typeof plugin !== "object") continue;
    const item = plugin as { name?: unknown; id?: unknown; config?: unknown; group?: unknown };
    const name = String(item.name || "");
    const id = String(item.id || "");
    if (name.includes("skill-filesystem") || id === "skill-filesystem") {
      const cfg = item.config as { customSkillDirs?: unknown } | undefined;
      const custom = cfg?.customSkillDirs;
      if (Array.isArray(custom)) {
        for (const d of custom) {
          if (typeof d === "string" && d.trim()) {
            dirs.push(d.trim());
          }
        }
      }
    }
    if (item.group === true && Array.isArray(item.config)) {
      dirs.push(...extractCustomSkillDirs(item.config));
    }
  }
  return dirs;
}

export function extractDirsFromYaml(yamlText: string): string[] {
  const dirs: string[] = [];
  if (!yamlText) return dirs;
  // 1. 匹配块状列表 customSkillDirs:\n  - dir1\n  - dir2
  const blockMatch = yamlText.match(/customSkillDirs:\s*\n((?:\s*-\s*[^\n]+\n?)+)/);
  if (blockMatch && blockMatch[1]) {
    const lines = blockMatch[1].split("\n");
    for (const line of lines) {
      const m = line.match(/^\s*-\s*["']?([^"'#\r\n]+)["']?\s*$/);
      if (m && m[1]) {
        const val = m[1].trim();
        if (val && !val.startsWith("!!js")) dirs.push(val);
      }
    }
  }
  // 2. 匹配行内数组 customSkillDirs: ["dir1", "dir2"]
  const inlineMatch = yamlText.match(/customSkillDirs:\s*\[([^\]]+)\]/);
  if (inlineMatch && inlineMatch[1]) {
    const items = inlineMatch[1].split(",");
    for (const item of items) {
      const val = item.trim().replace(/^["']|["']$/g, "").trim();
      if (val && !val.startsWith("!!js") && !dirs.includes(val)) {
        dirs.push(val);
      }
    }
  }
  return dirs;
}

async function isExistingDir(path: string): Promise<boolean> {
  if (!path) return false;
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 探测官方内置创造模式（Cordis）随包出货的技能目录。
 * 遵循跨平台安全原则，优先使用宿主运行时模块基址及标准模块解析，绝不写死任何盘符或产品专有绝对路径。
 */
async function findCordisSkillsDir(explicitDir?: string, hostBaseUrls?: string[]): Promise<string | undefined> {
  if (explicitDir && (await isExistingDir(explicitDir))) {
    return resolve(explicitDir);
  }

  // 1. 优先从宿主当前环境的基准路径 baseUrl 解析（对齐宿主 YAML 原生行为）
  if (Array.isArray(hostBaseUrls)) {
    for (const base of hostBaseUrls) {
      if (!base || typeof base !== "string") continue;
      try {
        const req = createRequire(base);
        const p = req.resolve("@deepseek-ai/dsh-agent-preset/package.json");
        const candidate = join(dirname(p), "skills");
        if (!candidate.includes(".asar") && (await isExistingDir(candidate))) {
          return resolve(candidate);
        }
      } catch {}
    }
  }

  // 2. 本地动态模块解析：从 @deepseek-ai/dsh-agent-preset 直接解析
  try {
    const req = createRequire(import.meta.url);
    const p = req.resolve("@deepseek-ai/dsh-agent-preset/package.json");
    const candidate = join(dirname(p), "skills");
    if (!candidate.includes(".asar") && (await isExistingDir(candidate))) {
      return resolve(candidate);
    }
  } catch {}

  // 3. 从 @deepseek-ai/dsh 依赖内部解析
  try {
    const req = createRequire(import.meta.url);
    const dshPkg = req.resolve("@deepseek-ai/dsh/package.json");
    const candidate = join(dirname(dshPkg), "node_modules", "@deepseek-ai", "dsh-agent-preset", "skills");
    if (!candidate.includes(".asar") && (await isExistingDir(candidate))) {
      return resolve(candidate);
    }
  } catch {}

  return undefined;
}

/**
 * 从宿主 AgentPresetRegistry 中动态提取内置模式与自定义模式的专属技能根目录。
 * 只有真正包含独立技能目录且物理目录存在的预设，才会生成对应的只读 SkillRoot。
 * 遵循 B方案：预设模式专属技能作为模式绑定的只读资产，不提供假开关（toggleable: false）。
 */
export async function collectPresetRoots(ctx: unknown, options: PresetRootsOptions = {}): Promise<SkillRoot[]> {
  const roots: SkillRoot[] = [];
  const seenPaths = new Set<string>();

  const hostCtx = ctx && typeof ctx === "object"
    ? (ctx as { get?: (name: string) => unknown; agentPresets?: unknown })
    : undefined;
  const agentPresets = hostCtx
    ? (typeof hostCtx.get === "function" ? (hostCtx.get("agentPresets") as any) : (hostCtx.agentPresets as any))
    : undefined;

  const hostBaseUrls: string[] = [];
  if (agentPresets) {
    if (typeof agentPresets.inspectCompositions === "function") {
      try {
        const comps = await agentPresets.inspectCompositions();
        if (Array.isArray(comps?.modules)) {
          for (const m of comps.modules) {
            if (m?.baseUrl && typeof m.baseUrl === "string") hostBaseUrls.push(m.baseUrl);
          }
        }
      } catch {}
    }
    if (typeof agentPresets.baseUrl === "string") hostBaseUrls.push(agentPresets.baseUrl);
  }
  if (hostCtx && typeof (hostCtx as any).baseUrl === "string") {
    hostBaseUrls.push((hostCtx as any).baseUrl);
  }

  // 探测内置创造模式随包技能物理路径（支持 options.cordisSkillsDir 与宿主 baseUrl 动态解析）
  const cordisBundledSkillsDir = await findCordisSkillsDir(options.cordisSkillsDir, hostBaseUrls);

  if (!agentPresets && !cordisBundledSkillsDir) return [];

  const presetConfigs: Array<{ id: string; name?: string; description?: string; plugins?: unknown[]; rawYaml?: string }> = [];

  if (agentPresets) {
    const definitions: Map<string, { config?: unknown }> | undefined = agentPresets.definitions;
    if (definitions instanceof Map) {
      for (const record of definitions.values()) {
        const cfg = record?.config as { id?: unknown; name?: unknown; description?: unknown; plugins?: unknown[] } | undefined;
        if (cfg && typeof cfg.id === "string" && cfg.id.trim()) {
          presetConfigs.push({
            id: cfg.id.trim(),
            name: typeof cfg.name === "string" ? cfg.name : undefined,
            description: typeof cfg.description === "string" ? cfg.description : undefined,
            plugins: Array.isArray(cfg.plugins) ? cfg.plugins : undefined,
          });
        }
      }
    } else if (typeof agentPresets.list === "function") {
      try {
        const list = await agentPresets.list();
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && typeof item.id === "string" && item.id.trim()) {
              let rawYaml: string | undefined;
              if (typeof agentPresets.readDocument === "function") {
                try {
                  const doc = await agentPresets.readDocument(item.id);
                  if (doc && typeof doc.content === "string") rawYaml = doc.content;
                } catch {}
              }
              presetConfigs.push({
                id: item.id.trim(),
                name: typeof item.name === "string" ? item.name : undefined,
                description: typeof item.description === "string" ? item.description : undefined,
                rawYaml,
              });
            }
          }
        }
      } catch {}
    }
  }

  // 如果未能从 agentPresets 中枚举到 cordis 预设（或 agentPresets 尚未就绪），但本地存在创造模式技能目录，作为内置预设保底提供
  if (!presetConfigs.some((p) => p.id === "cordis") && cordisBundledSkillsDir) {
    presetConfigs.unshift({
      id: "cordis",
      name: "创造模式",
      description: "通过对话扩展 DSH 功能或编写插件",
    });
  }

  const BUILTIN_IDS = new Set(["standard", "ptc", "minimal", "cordis"]);
  const BUILTIN_PRESET_NAMES: Record<string, string> = {
    cordis: "创造模式",
    standard: "标准模式",
    ptc: "PTC 模式",
    minimal: "极简模式",
  };

  for (const preset of presetConfigs) {
    const isBuiltin = BUILTIN_IDS.has(preset.id);
    const declaredDirs = preset.plugins
      ? extractCustomSkillDirs(preset.plugins)
      : (preset.rawYaml ? extractDirsFromYaml(preset.rawYaml) : []);

    if (preset.id === "cordis" && declaredDirs.length === 0 && cordisBundledSkillsDir) {
      declaredDirs.push(cordisBundledSkillsDir);
    }

    for (let i = 0; i < declaredDirs.length; i++) {
      let dir = declaredDirs[i];
      if (dir === "@deepseek-ai/dsh-agent-preset/skills" && cordisBundledSkillsDir) {
        dir = cordisBundledSkillsDir;
      }
      const resolved = resolve(dir);
      if (seenPaths.has(resolved)) continue;
      if (!(await isExistingDir(resolved))) continue;
      seenPaths.add(resolved);

      const rootKey = declaredDirs.length === 1 ? `preset-${preset.id}` : `preset-${preset.id}-${i + 1}`;
      const presetName = preset.name || BUILTIN_PRESET_NAMES[preset.id] || preset.id;
      const label = `预设: ${presetName}`;

      roots.push({
        key: rootKey,
        path: resolved,
        label,
        rank: 10000,
        mutable: !isBuiltin,
        native: isBuiltin,
        toggleable: false,
        kind: "preset",
        group: presetName,
        presetId: preset.id,
        localeKey: `preset.${preset.id}`,
      });
    }
  }

  return roots;
}
