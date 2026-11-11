import { stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
import type { SkillRoot } from "./types.js";

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

async function isExistingDir(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 从宿主 AgentPresetRegistry 中动态提取内置模式与自定义模式的专属技能根目录。
 * 只有真正包含独立技能目录且物理目录存在的预设，才会生成对应的只读 SkillRoot。
 */
export async function collectPresetRoots(ctx: unknown): Promise<SkillRoot[]> {
  if (!ctx || typeof ctx !== "object") return [];
  const hostCtx = ctx as { get?: (name: string) => unknown; agentPresets?: unknown };
  const agentPresets = typeof hostCtx.get === "function"
    ? (hostCtx.get("agentPresets") as any)
    : (hostCtx.agentPresets as any);
  if (!agentPresets) return [];

  const roots: SkillRoot[] = [];
  const seenPaths = new Set<string>();

  // 1. 尝试从 definitions (Map) 中枚举所有注册的预设配置
  const definitions: Map<string, { config?: unknown }> | undefined = agentPresets.definitions;
  const presetConfigs: Array<{ id: string; name?: string; description?: string; plugins?: unknown[] }> = [];

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
            presetConfigs.push({
              id: item.id.trim(),
              name: typeof item.name === "string" ? item.name : undefined,
              description: typeof item.description === "string" ? item.description : undefined,
            });
          }
        }
      }
    } catch {
      // 容错降级
    }
  }

  // 解析 @deepseek-ai/dsh-agent-preset 随包内置的 skills 路径（创造模式）
  let cordisBundledSkillsDir: string | undefined;
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve("@deepseek-ai/dsh-agent-preset/package.json");
    const candidate = join(dirname(pkgPath), "skills");
    if (await isExistingDir(candidate)) {
      cordisBundledSkillsDir = candidate;
    }
  } catch {
    // 宿主未安装此包时忽略
  }

  const BUILTIN_IDS = new Set(["standard", "ptc", "minimal", "cordis"]);

  for (const preset of presetConfigs) {
    const isBuiltin = BUILTIN_IDS.has(preset.id);
    const declaredDirs = preset.plugins ? extractCustomSkillDirs(preset.plugins) : [];

    // 内置 cordis 预设的 YAML 包含 !!js 表达式，未求值时补充解析包内置 skills 路径
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
      const presetName = preset.name || preset.id;
      const label = `预设: ${presetName}`;

      roots.push({
        key: rootKey,
        path: resolved,
        label,
        rank: 300,
        mutable: false,
        native: isBuiltin,
        toggleable: true,
        kind: "preset",
        group: presetName,
      });
    }
  }

  return roots;
}
