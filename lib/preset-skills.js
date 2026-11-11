import { stat } from "node:fs/promises";
import { resolve, join, dirname, isAbsolute } from "node:path";
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
      const m = line.match(/^\s*-\s*["']?([^"'#\r\n]+)["']?\s*$/);
      if (m && m[1]) {
        const val = m[1].trim();
        if (val && !val.startsWith("!!js")) dirs.push(val);
      }
    }
  }
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
async function isExistingDir(path) {
  if (!path) return false;
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
function isHostBuiltinLocation(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return false;
  const normalized = pathOrUrl.replace(/\\/g, "/").toLowerCase();
  if (!normalized) return false;
  if (normalized.includes(".asar")) return true;
  if (/\/node_modules\/@deepseek-ai(?:\/|$)/.test(normalized)) return true;
  if (/\/dsh-runtime(?:\/|$)/.test(normalized)) return true;
  if (/(?:^|\/)resources(?:\/|$)/.test(normalized)) return true;
  const resourcesPath = process.resourcesPath;
  if (typeof resourcesPath === "string" && resourcesPath.trim()) {
    const resPrefix = resourcesPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    if (resPrefix && (normalized === resPrefix || normalized.startsWith(`${resPrefix}/`))) return true;
  }
  return false;
}
async function findCordisSkillsDir(explicitDir, hostBaseUrls) {
  if (explicitDir && await isExistingDir(explicitDir)) {
    return resolve(explicitDir);
  }
  if (Array.isArray(hostBaseUrls)) {
    for (const base of hostBaseUrls) {
      if (!base || typeof base !== "string") continue;
      try {
        const req = createRequire(base);
        const p = req.resolve("@deepseek-ai/dsh-agent-preset/package.json");
        const candidate = join(dirname(p), "skills");
        if (!candidate.includes(".asar") && await isExistingDir(candidate)) {
          return resolve(candidate);
        }
      } catch {
      }
    }
  }
  try {
    const req = createRequire(import.meta.url);
    const p = req.resolve("@deepseek-ai/dsh-agent-preset/package.json");
    const candidate = join(dirname(p), "skills");
    if (!candidate.includes(".asar") && await isExistingDir(candidate)) {
      return resolve(candidate);
    }
  } catch {
  }
  try {
    const req = createRequire(import.meta.url);
    const dshPkg = req.resolve("@deepseek-ai/dsh/package.json");
    const candidate = join(dirname(dshPkg), "node_modules", "@deepseek-ai", "dsh-agent-preset", "skills");
    if (!candidate.includes(".asar") && await isExistingDir(candidate)) {
      return resolve(candidate);
    }
  } catch {
  }
  return void 0;
}
async function collectPresetRoots(ctx, options = {}) {
  const roots = [];
  const seenPaths = /* @__PURE__ */ new Set();
  const hostCtx = ctx && typeof ctx === "object" ? ctx : void 0;
  const agentPresets = hostCtx ? typeof hostCtx.get === "function" ? hostCtx.get("agentPresets") : hostCtx.agentPresets : void 0;
  const hostBaseUrls = [];
  if (agentPresets) {
    if (typeof agentPresets.inspectCompositions === "function") {
      try {
        const comps = await agentPresets.inspectCompositions();
        const list = Array.isArray(comps) ? comps : Array.isArray(comps?.modules) ? comps.modules : [comps];
        for (const item of list) {
          if (item?.baseUrl && typeof item.baseUrl === "string") hostBaseUrls.push(item.baseUrl);
          if (Array.isArray(item?.modules)) {
            for (const m of item.modules) {
              if (m?.baseUrl && typeof m.baseUrl === "string") hostBaseUrls.push(m.baseUrl);
            }
          }
        }
      } catch {
      }
    }
    if (typeof agentPresets.baseUrl === "string") hostBaseUrls.push(agentPresets.baseUrl);
  }
  if (hostCtx && typeof hostCtx.baseUrl === "string") {
    hostBaseUrls.push(hostCtx.baseUrl);
  }
  const cordisBundledSkillsDir = await findCordisSkillsDir(options.cordisSkillsDir, hostBaseUrls);
  if (!agentPresets && !cordisBundledSkillsDir) return [];
  const presetConfigs = [];
  if (agentPresets) {
    const definitions = agentPresets.definitions;
    if (definitions instanceof Map) {
      for (const record of definitions.values()) {
        const cfg = record?.config;
        if (cfg && typeof cfg.id === "string" && cfg.id.trim()) {
          const baseUrl = typeof record?.context?.baseUrl === "string" ? record.context.baseUrl : void 0;
          presetConfigs.push({
            id: cfg.id.trim(),
            name: typeof cfg.name === "string" ? cfg.name : void 0,
            description: typeof cfg.description === "string" ? cfg.description : void 0,
            plugins: Array.isArray(cfg.plugins) ? cfg.plugins : void 0,
            explicitBuiltin: isHostBuiltinLocation(baseUrl)
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
  if (!presetConfigs.some((p) => p.id === "cordis") && cordisBundledSkillsDir) {
    presetConfigs.unshift({
      id: "cordis",
      name: "\u521B\u9020\u6A21\u5F0F",
      description: "\u901A\u8FC7\u5BF9\u8BDD\u6269\u5C55 DSH \u529F\u80FD\u6216\u7F16\u5199\u63D2\u4EF6",
      explicitBuiltin: true
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
    const presetBuiltin = BUILTIN_IDS.has(preset.id) || preset.explicitBuiltin === true;
    const declaredDirs = preset.plugins ? extractCustomSkillDirs(preset.plugins) : preset.rawYaml ? extractDirsFromYaml(preset.rawYaml) : [];
    if (preset.id === "cordis" && declaredDirs.length === 0 && cordisBundledSkillsDir) {
      declaredDirs.push(cordisBundledSkillsDir);
    }
    for (let i = 0; i < declaredDirs.length; i++) {
      let dir = declaredDirs[i];
      if (dir === "@deepseek-ai/dsh-agent-preset/skills" && cordisBundledSkillsDir) {
        dir = cordisBundledSkillsDir;
      }
      const trimmedDir = dir.trim();
      const resolved = resolve(trimmedDir);
      if (seenPaths.has(resolved)) continue;
      if (!await isExistingDir(resolved)) continue;
      seenPaths.add(resolved);
      const isBuiltin = presetBuiltin || isHostBuiltinLocation(resolved) || Boolean(cordisBundledSkillsDir) && resolved === cordisBundledSkillsDir;
      const rootKey = declaredDirs.length === 1 ? `preset-${preset.id}` : `preset-${preset.id}-${i + 1}`;
      const presetName = preset.name || BUILTIN_PRESET_NAMES[preset.id] || preset.id;
      const suffix = declaredDirs.length === 1 ? "" : ` (${i + 1})`;
      const label = `\u9884\u8BBE: ${presetName}${suffix}`;
      const mutable = !isBuiltin && isAbsolute(trimmedDir);
      roots.push({
        key: rootKey,
        path: resolved,
        label,
        rank: 1e4 + roots.length * 10,
        mutable,
        native: isBuiltin,
        // 自定义绝对路径预设依托 agent-scoped provider 实现真开关拦截；内置、宿主包内目录或相对路径预设保持只读不可开关。
        toggleable: mutable,
        kind: "preset",
        group: `${presetName}${suffix}`,
        presetId: preset.id,
        localeKey: `preset.${preset.id}`
      });
    }
  }
  return roots;
}
export {
  collectPresetRoots,
  extractCustomSkillDirs,
  extractDirsFromYaml,
  isHostBuiltinLocation
};
