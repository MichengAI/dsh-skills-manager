/** 来源仅取自安装记录、锁文件及元数据，不按目录名称猜测。 */
import { open, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InstallSource, RootView, SkillProvenance } from "./types.js";
export type ProvenanceKind = "install" | "lock" | "meta" | "root";
interface LockIndex { entries: Record<string, unknown> }
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_CACHE_ENTRIES = 2048;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
type Fingerprint = { size: number; mtimeMs: number; ctimeMs: number; ino: number; dev: number };
type CachedJson = { fingerprint: Fingerprint; value: unknown; bytes: number };
const jsonCache = new Map<string, CachedJson>();
let cacheBytes = 0;
function sameFile(a: Fingerprint, b: Fingerprint): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.ino === b.ino && a.dev === b.dev;
}
function evict(file: string): void {
  const cached = jsonCache.get(file);
  if (cached) { cacheBytes -= cached.bytes; jsonCache.delete(file); }
}
async function readJson(file: string): Promise<unknown> {
  let info;
  try { info = await stat(file); } catch (error) { evict(file); throw error; }
  if (!info.isFile() || info.size > MAX_JSON_BYTES) { evict(file); return null; }
  const cached = jsonCache.get(file);
  if (cached && sameFile(cached.fingerprint, info)) {
    jsonCache.delete(file); jsonCache.set(file, cached);
    return cached.value;
  }
  evict(file);
  const handle = await open(file, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_JSON_BYTES) return null;
    const buffer = Buffer.alloc(opened.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > opened.size) return null;
    let value: unknown;
    try { value = JSON.parse(buffer.subarray(0, length).toString("utf8")); } catch { value = null; }
    const after = await handle.stat();
    const current = await stat(file).catch(() => null);
    if (current && sameFile(opened, after) && sameFile(after, current)) {
      evict(file);
      while (jsonCache.size >= MAX_CACHE_ENTRIES || cacheBytes + length > MAX_CACHE_BYTES) {
        const oldest = jsonCache.keys().next().value;
        if (oldest === undefined) break;
        evict(oldest);
      }
      jsonCache.set(file, { fingerprint: after, value, bytes: length });
      cacheBytes += length;
    }
    return value;
  } finally { await handle.close(); }
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
async function readLockIndex(rootPath: string): Promise<LockIndex | null> {
  try {
    const parsed = object(await readJson(join(rootPath, ".skills-lock.json")));
    const entries = object(parsed?.skills ?? parsed);
    return entries ? { entries } : null;
  } catch { return null; }
}
function segments(path: string): string[] { return path.split(/[\/]+/).filter(Boolean); }
export function categoryOfRepoPath(skillPath: string | null | undefined, subdirectory?: string | null): string | null {
  if (!skillPath) return null;
  const parts = segments(skillPath);
  if (parts.length && /^skill\.md$/i.test(parts[parts.length - 1])) parts.pop();
  const sub = subdirectory ? segments(subdirectory) : [];
  if (sub.length && sub.every((part, i) => parts[i] === part)) parts.splice(0, sub.length);
  else if (parts[0] === "skills") parts.shift();
  return parts.length >= 2 ? parts[0] : null;
}
function sourceInfo(raw: unknown, githubShorthand: boolean): { repo: string; identity: string; url: string | null } | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 2048 || /[\x00-\x1f]/.test(value)) return null;
  if (/^[\w.-]+\/[\w.-]+$/.test(value) && githubShorthand) {
    const repo = value.replace(/\.git$/i, "");
    if (repo.split("/").some(x => x === "." || x === "..")) return null;
    const url = `https://github.com/${repo}`;
    return { repo, identity: url.toLowerCase(), url };
  }
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname === "/") return null;
    const normalized = parsed.href.replace(/\/$/, "").replace(/\.git$/i, "");
    const identity = parsed.hostname === "github.com" ? normalized.toLowerCase() : normalized;
    return { repo: `${parsed.hostname}${parsed.pathname.replace(/\/$/, "").replace(/\.git$/i, "")}`, identity, url: parsed.protocol === "https:" ? normalized : null };
  } catch { return null; }
}
function fromInstallSource(source: InstallSource): SkillProvenance | null {
  const info = sourceInfo(source.url || (source.owner && source.name ? `${source.owner}/${source.name}` : null), !source.url)
    ?? (typeof source.url === "string" && (/^[a-zA-Z]:[\\\\/]/.test(source.url) || source.url.startsWith("/")) && !/[\x00-\x1f]/.test(source.url)
      ? { repo: `${source.owner}/${source.name}`, identity: source.url, url: null } : null);
  if (!info) return null;
  const skillPath = typeof source.path === "string" && source.path ? source.path : null;
  return { kind: "install", ...info, repo: source.owner && source.name ? `${source.owner}/${source.name}` : info.repo,
    category: categoryOfRepoPath(skillPath, typeof source.subdirectory === "string" ? source.subdirectory : null), path: skillPath,
    ref: typeof source.ref === "string" && source.ref ? source.ref : null };
}
function fromLockEntry(value: unknown): SkillProvenance | null {
  const entry = object(value);
  if (!entry) return null;
  const info = sourceInfo(entry.source, entry.sourceType === "github");
  if (!info) return null;
  const path = typeof entry.skillPath === "string" && entry.skillPath ? entry.skillPath : null;
  return { kind: "lock", ...info, category: categoryOfRepoPath(path), path, ref: null };
}
async function fromMarketMeta(skillDir: string): Promise<SkillProvenance | null> {
  for (const name of ["_skillhub_meta.json", "_meta.json"]) {
    try {
      const metadata = object(await readJson(join(skillDir, name)));
      const info = sourceInfo(metadata?.source, metadata?.sourceType === "github");
      if (info) return { kind: "meta", ...info, category: null, path: null, ref: null };
    } catch { /* 尝试下一证据 */ }
  }
  return null;
}
export interface ProvenanceInput {
  rootPath: string; skillPath: string; name: string; declaredName?: string; installSource?: InstallSource | null;
}
const unknown = (): SkillProvenance => ({ kind: "root", repo: null, identity: null, url: null, category: null, path: null, ref: null });
export async function resolveProvenance(input: ProvenanceInput, lock: LockIndex | null): Promise<SkillProvenance> {
  if (input.installSource) {
    const installed = fromInstallSource(input.installSource);
    if (installed) return installed;
  }
  if (lock) {
    const entry = Object.hasOwn(lock.entries, input.name) ? lock.entries[input.name] : input.declaredName && Object.hasOwn(lock.entries, input.declaredName) ? lock.entries[input.declaredName] : undefined;
    const resolved = fromLockEntry(entry);
    if (resolved) return resolved;
  }
  const dir = dirname(input.skillPath);
  if (input.rootPath && dir === input.rootPath) return unknown();
  return await fromMarketMeta(dir) ?? unknown();
}
export async function attachProvenance<T extends { roots: RootView[] }>(snapshot: T): Promise<T> {
  const lockByRoot = new Map<string, LockIndex | null>();
  for (const root of snapshot.roots) {
    let lock = lockByRoot.get(root.path);
    if (lock === undefined) { lock = await readLockIndex(root.path); lockByRoot.set(root.path, lock); }
    const skills = root.skills || [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(16, skills.length) }, async () => {
      while (next < skills.length) {
        const skill = skills[next++];
        try {
          skill.provenance = await resolveProvenance({ rootPath: root.path, skillPath: skill.path, name: skill.name, declaredName: skill.declaredName, installSource: skill.installSource }, lock);
        } catch { skill.provenance = unknown(); }
      }
    }));
  }
  return snapshot;
}
