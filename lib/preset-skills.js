import { stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
function extractCustomSkillDirs(plugins) {
  const dirs = [];
  if (!Array.isArray(plugins)) return dirs;
  for (const plugin of plugins) {
    if (!plugin || typeof plugin !== "object") continue;
    const item = plugin;
    const name = String(item.name || "");
    const id = String(item.id || "");
    if (name.includes("skill-filesystem") || id === "skill-filesystem") {
      const cfg = item.config;
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
async function isExistingDir(path) {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
async function collectPresetRoots(ctx) {
  if (!ctx || typeof ctx !== "object") return [];
  const hostCtx = ctx;
  const agentPresets = typeof hostCtx.get === "function" ? hostCtx.get("agentPresets") : hostCtx.agentPresets;
  if (!agentPresets) return [];
  const roots = [];
  const seenPaths = /* @__PURE__ */ new Set();
  const definitions = agentPresets.definitions;
  const presetConfigs = [];
  if (definitions instanceof Map) {
    for (const record of definitions.values()) {
      const cfg = record?.config;
      if (cfg && typeof cfg.id === "string" && cfg.id.trim()) {
        presetConfigs.push({
          id: cfg.id.trim(),
          name: typeof cfg.name === "string" ? cfg.name : void 0,
          description: typeof cfg.description === "string" ? cfg.description : void 0,
          plugins: Array.isArray(cfg.plugins) ? cfg.plugins : void 0
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
              name: typeof item.name === "string" ? item.name : void 0,
              description: typeof item.description === "string" ? item.description : void 0
            });
          }
        }
      }
    } catch {
    }
  }
  let cordisBundledSkillsDir;
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve("@deepseek-ai/dsh-agent-preset/package.json");
    const candidate = join(dirname(pkgPath), "skills");
    if (await isExistingDir(candidate)) {
      cordisBundledSkillsDir = candidate;
    }
  } catch {
  }
  const BUILTIN_IDS = /* @__PURE__ */ new Set(["standard", "ptc", "minimal", "cordis"]);
  for (const preset of presetConfigs) {
    const isBuiltin = BUILTIN_IDS.has(preset.id);
    const declaredDirs = preset.plugins ? extractCustomSkillDirs(preset.plugins) : [];
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
      if (!await isExistingDir(resolved)) continue;
      seenPaths.add(resolved);
      const rootKey = declaredDirs.length === 1 ? `preset-${preset.id}` : `preset-${preset.id}-${i + 1}`;
      const presetName = preset.name || preset.id;
      const label = `\u9884\u8BBE: ${presetName}`;
      roots.push({
        key: rootKey,
        path: resolved,
        label,
        rank: 300,
        mutable: false,
        native: isBuiltin,
        toggleable: true,
        kind: "preset",
        group: presetName
      });
    }
  }
  return roots;
}
export {
  collectPresetRoots,
  extractCustomSkillDirs
};
