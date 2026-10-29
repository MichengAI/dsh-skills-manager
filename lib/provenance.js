import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
const LOCK_CACHE_LIMIT = 64;
const lockCache = /* @__PURE__ */ new Map();
async function readLockIndex(rootPath) {
  const file = join(rootPath, ".skills-lock.json");
  let info;
  try {
    info = await stat(file);
  } catch {
    return null;
  }
  const cached = lockCache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.index;
  let index = null;
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    const skills = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.skills ?? parsed : null;
    if (skills && typeof skills === "object" && !Array.isArray(skills)) {
      index = { entries: skills };
    }
  } catch {
    index = null;
  }
  if (lockCache.size >= LOCK_CACHE_LIMIT) lockCache.clear();
  lockCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, index });
  return index;
}
function segments(path) {
  return path.split(/[\\/]+/).filter(Boolean);
}
function categoryOfRepoPath(skillPath, subdirectory) {
  if (!skillPath) return null;
  const parts = segments(String(skillPath));
  if (parts.length && /^skill\.md$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts[0] === "skills") parts.shift();
  const sub = subdirectory ? segments(String(subdirectory)) : [];
  while (sub.length && parts.length && parts[0] === sub[0]) {
    parts.shift();
    sub.shift();
  }
  if (parts.length < 2) return null;
  return parts[0] || null;
}
function fromInstallSource(source) {
  const repo = source.owner && source.name ? `${source.owner}/${source.name}` : null;
  const skillPath = typeof source.path === "string" && source.path ? source.path : null;
  return {
    kind: "install",
    repo,
    category: categoryOfRepoPath(skillPath, source.subdirectory),
    path: skillPath,
    ref: source.ref || null
  };
}
function fromLockEntry(entry) {
  const repo = typeof entry.source === "string" && entry.source.trim() ? entry.source.trim() : null;
  if (!repo) return null;
  const skillPath = typeof entry.skillPath === "string" && entry.skillPath ? entry.skillPath : null;
  return { kind: "lock", repo, category: categoryOfRepoPath(skillPath), path: skillPath, ref: null };
}
async function fromMarketMeta(skillDir) {
  for (const name of ["_skillhub_meta.json", "_meta.json"]) {
    let raw;
    try {
      raw = await readFile(join(skillDir, name), "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      const source = parsed && typeof parsed === "object" ? parsed.source : void 0;
      if (typeof source === "string" && source.trim()) {
        return { kind: "meta", repo: source.trim(), category: null, path: null, ref: null };
      }
    } catch {
    }
  }
  return null;
}
function fromDirectorySuffix(skillDir) {
  const name = segments(skillDir).pop() || "";
  const marker = name.indexOf("__");
  if (marker <= 0) return null;
  const channel = name.slice(marker + 2).replace(/^[-_]+|[-_]+$/g, "");
  if (!channel) return null;
  return { kind: "suffix", repo: channel, category: null, path: null, ref: null };
}
async function resolveProvenance(input, lock) {
  if (input.installSource) return fromInstallSource(input.installSource);
  const skillDir = dirname(input.skillPath);
  if (lock) {
    const entry = lock.entries[input.name] ?? (input.declaredName ? lock.entries[input.declaredName] : void 0);
    const resolved = entry ? fromLockEntry(entry) : null;
    if (resolved) return resolved;
  }
  const market = await fromMarketMeta(skillDir);
  if (market) return market;
  const suffix = fromDirectorySuffix(skillDir);
  if (suffix) return suffix;
  return { kind: "root", repo: null, category: null, path: null, ref: null };
}
async function attachProvenance(snapshot) {
  const lockByRoot = /* @__PURE__ */ new Map();
  for (const root of snapshot.roots) {
    let lock;
    if (lockByRoot.has(root.path)) {
      lock = lockByRoot.get(root.path) ?? null;
    } else {
      lock = await readLockIndex(root.path);
      lockByRoot.set(root.path, lock);
    }
    for (const skill of root.skills || []) {
      skill.provenance = await resolveProvenance(
        {
          rootPath: root.path,
          skillPath: skill.path,
          name: skill.name,
          declaredName: skill.declaredName,
          installSource: skill.installSource ?? null
        },
        lock
      );
    }
  }
  return snapshot;
}
export {
  attachProvenance,
  categoryOfRepoPath,
  resolveProvenance
};
