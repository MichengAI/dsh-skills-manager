import { stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
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

function extractDirsFromYaml(yamlText: string): string[] {
  const dirs: string[] = [];
  if (!yamlText) return dirs;
  const blockMatch = yamlText.match(/customSkillDirs:\s*\n((?:\s*-\s*[^\n]+\n?)+)/);
  if (blockMatch && blockMatch[1]) {
    const lines = blockMatch[1].split("\n");
    for (const line of lines) {
      const m = line.match(/^\s*-\s*["']?([^"'\r\n]+)["']?\s*$/);
      if (m && m[1]) {
        const val = m[1].trim();
        if (val && !val.startsWith("!!js")) dirs.push(val);
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
 * 多层探测官方内置创造模式（Cordis）随包出货的技能目录：
 * 1. 尝试直接模块 resolve；
 * 2. 尝试从 @deepseek-ai/dsh 内部 resolve；
 * 3. 探测本机全局 node_modules 物理路径；
 * 4. 探测常见 Codex / DSH 运行时路径；
 * 5. 探测 Electron 宿主 resourcesPath / execPath。
 */
async function findCordisSkillsDir(): Promise<string | undefined> {
  // 1. 优先使用真实的物理文件系统路径（非 asar 虚拟归档），确保 fs.realpath 与扫描完全通畅
  const physicalCandidates = [
    "D:/Tools/nodejs/node_global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills",
    join(homedir(), "AppData/Roaming/DSH Codex Desktop/dsh-runtime/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills"),
  ];
  for (const c of physicalCandidates) {
    if (await isExistingDir(c)) return resolve(c);
  }

  // 2. 本地直接 resolve
  try {
    const req = createRequire(import.meta.url);
    const p = req.resolve("@deepseek-ai/dsh-agent-preset/package.json");
    const candidate = join(dirname(p), "skills");
    if (!candidate.includes(".asar") && (await isExistingDir(candidate))) return resolve(candidate);
  } catch {}

  // 3. 从 @deepseek-ai/dsh 依赖内部 resolve
  try {
    const req = createRequire(import.meta.url);
    const dshPkg = req.resolve("@deepseek-ai/dsh/package.json");
    const candidate = join(dirname(dshPkg), "node_modules", "@deepseek-ai", "dsh-agent-preset", "skills");
    if (!candidate.includes(".asar") && (await isExistingDir(candidate))) return resolve(candidate);
  } catch {}

  return undefined;
}

/**
 * 从宿主 AgentPresetRegistry 中动态提取内置模式与自定义模式的专属技能根目录。
 * 只有真正包含独立技能目录且物理目录存在的预设，才会生成对应的只读 SkillRoot。
 */
export async function collectPresetRoots(ctx: unknown): Promise<SkillRoot[]> {
  const roots: SkillRoot[] = [];
  const seenPaths = new Set<string>();

  const hostCtx = ctx && typeof ctx === "object"
    ? (ctx as { get?: (name: string) => unknown; agentPresets?: unknown })
    : undefined;
  const agentPresets = hostCtx
    ? (typeof hostCtx.get === "function" ? (hostCtx.get("agentPresets") as any) : (hostCtx.agentPresets as any))
    : undefined;

  if (!agentPresets) return [];

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

  // 探测内置创造模式随包技能物理路径
  const cordisBundledSkillsDir = await findCordisSkillsDir();

  // 如果未能从 agentPresets 中枚举到 cordis 预设（或 agentPresets 尚未就绪），但本地存在创造模式技能目录，作为内置预设保底提供
  if (!presetConfigs.some((p) => p.id === "cordis") && cordisBundledSkillsDir) {
    presetConfigs.unshift({
      id: "cordis",
      name: "创造模式",
      description: "通过对话扩展 DSH 功能或编写插件",
    });
  }

  const BUILTIN_IDS = new Set(["standard", "ptc", "minimal", "cordis"]);

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
