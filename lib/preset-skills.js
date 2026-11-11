import { stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
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
function extractDirsFromYaml(yamlText) {
  const dirs = [];
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
async function isExistingDir(path) {
  if (!path) return false;
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
async function findCordisSkillsDir() {
  const physicalCandidates = [
    "D:/Tools/nodejs/node_global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills",
    join(homedir(), "AppData/Roaming/DSH Codex Desktop/dsh-runtime/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills")
  ];
  for (const c of physicalCandidates) {
    if (await isExistingDir(c)) return resolve(c);
  }
  try {
    const req = createRequire(import.meta.url);
    const p = req.resolve("@deepseek-ai/dsh-agent-preset/package.json");
    const candidate = join(dirname(p), "skills");
    if (!candidate.includes(".asar") && await isExistingDir(candidate)) return resolve(candidate);
  } catch {
  }
  try {
    const req = createRequire(import.meta.url);
    const dshPkg = req.resolve("@deepseek-ai/dsh/package.json");
    const candidate = join(dirname(dshPkg), "node_modules", "@deepseek-ai", "dsh-agent-preset", "skills");
    if (!candidate.includes(".asar") && await isExistingDir(candidate)) return resolve(candidate);
  } catch {
  }
  return void 0;
}
async function collectPresetRoots(ctx) {
  const roots = [];
  const seenPaths = /* @__PURE__ */ new Set();
  const hostCtx = ctx && typeof ctx === "object" ? ctx : void 0;
  const agentPresets = hostCtx ? typeof hostCtx.get === "function" ? hostCtx.get("agentPresets") : hostCtx.agentPresets : void 0;
  if (!agentPresets) return [];
  const presetConfigs = [];
  if (agentPresets) {
    const definitions = agentPresets.definitions;
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
              let rawYaml;
              if (typeof agentPresets.readDocument === "function") {
                try {
                  const doc = await agentPresets.readDocument(item.id);
                  if (doc && typeof doc.content === "string") rawYaml = doc.content;
                } catch {
                }
              }
              presetConfigs.push({
                id: item.id.trim(),
                name: typeof item.name === "string" ? item.name : void 0,
                description: typeof item.description === "string" ? item.description : void 0,
                rawYaml
              });
            }
          }
        }
      } catch {
      }
    }
  }
  const cordisBundledSkillsDir = await findCordisSkillsDir();
  if (!presetConfigs.some((p) => p.id === "cordis") && cordisBundledSkillsDir) {
    presetConfigs.unshift({
      id: "cordis",
      name: "\u521B\u9020\u6A21\u5F0F",
      description: "\u901A\u8FC7\u5BF9\u8BDD\u6269\u5C55 DSH \u529F\u80FD\u6216\u7F16\u5199\u63D2\u4EF6"
    });
  }
  const BUILTIN_IDS = /* @__PURE__ */ new Set(["standard", "ptc", "minimal", "cordis"]);
  const BUILTIN_PRESET_NAMES = {
    cordis: "\u521B\u9020\u6A21\u5F0F",
    standard: "\u6807\u51C6\u6A21\u5F0F",
    ptc: "PTC \u6A21\u5F0F",
    minimal: "\u6781\u7B80\u6A21\u5F0F"
  };
  for (const preset of presetConfigs) {
    const isBuiltin = BUILTIN_IDS.has(preset.id);
    const declaredDirs = preset.plugins ? extractCustomSkillDirs(preset.plugins) : preset.rawYaml ? extractDirsFromYaml(preset.rawYaml) : [];
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
      const presetName = preset.name || BUILTIN_PRESET_NAMES[preset.id] || preset.id;
      const label = `\u9884\u8BBE: ${presetName}`;
      roots.push({
        key: rootKey,
        path: resolved,
        label,
        rank: 700,
        mutable: false,
        native: isBuiltin,
        toggleable: true,
        kind: "preset",
        group: presetName,
        presetId: preset.id,
        localeKey: `preset.${preset.id}`
      });
    }
  }
  return roots;
}
export {
  collectPresetRoots,
  extractCustomSkillDirs
};
