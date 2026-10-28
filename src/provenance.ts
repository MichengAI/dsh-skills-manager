/**
 * 技能来源（provenance）解析：把「这个技能从哪个仓库来、在仓库的哪个类别目录下」变成可核查的事实。
 *
 * 优先级逐级下降，全部基于磁盘上能核对的文件，绝不按名称前缀聚类（见参考实现 ADR 0001）：
 *   1. 安装记录（repositories.json 的 installs → owner/name + skillPath）
 *   2. 来源目录里的 `.skills-lock.json`（同目录锁文件，记录 source + skillPath）
 *   3. 技能目录里的 `_skillhub_meta.json` / `_meta.json` 的 `source`
 *   4. 目录名里的 `__<渠道>` 后缀
 *   5. 目录落点（用户级/项目级来源目录本身）——不是仓库，只是兜底
 *
 * 只有 1~4 才能给出仓库分组；5 用来保证每个技能都有归属，并在界面上明确标成「目录落点」。
 */
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InstallSource, RootView, SkillProvenance, SkillView } from "./types.js";

/** 证据种类，顺序即优先级。 */
export type ProvenanceKind = "install" | "lock" | "meta" | "suffix" | "root";

interface LockEntry {
  source?: unknown;
  sourceType?: unknown;
  skillPath?: unknown;
}

interface LockIndex {
  /** 技能目录名 → 锁文件条目。 */
  entries: Record<string, LockEntry>;
}

const LOCK_CACHE_LIMIT = 64;
const lockCache = new Map<string, { mtimeMs: number; size: number; index: LockIndex | null }>();

/** 锁文件只读一次：按 mtime + size 判断是否变化，最多缓存 LOCK_CACHE_LIMIT 个来源目录。 */
async function readLockIndex(rootPath: string): Promise<LockIndex | null> {
  const file = join(rootPath, ".skills-lock.json");
  let info;
  try {
    info = await stat(file);
  } catch {
    return null;
  }
  const cached = lockCache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.index;
  let index: LockIndex | null = null;
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    const skills = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { skills?: unknown }).skills ?? parsed
      : null;
    if (skills && typeof skills === "object" && !Array.isArray(skills)) {
      index = { entries: skills as Record<string, LockEntry> };
    }
  } catch {
    // 锁文件损坏时按「没有证据」处理，不猜测。
    index = null;
  }
  if (lockCache.size >= LOCK_CACHE_LIMIT) lockCache.clear();
  lockCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, index });
  return index;
}

function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

/**
 * 从仓库内路径推出「类别目录」。
 * `skills/engineering/code-review` → `engineering`；`skills/code-review` → null（仓库根下直接安装）。
 * 传入的 skillPath 可以是目录，也可以是 SKILL.md 文件。
 */
export function categoryOfRepoPath(skillPath: string | null | undefined, subdirectory?: string | null): string | null {
  if (!skillPath) return null;
  const parts = segments(String(skillPath));
  if (parts.length && /^skill\.md$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts[0] === "skills") parts.shift();
  // 仓库订阅时可能带子目录（如 `skills/engineering`）；路径里已经包含时去重，避免把子目录当成类别。
  const sub = subdirectory ? segments(String(subdirectory)) : [];
  while (sub.length && parts.length && parts[0] === sub[0]) {
    parts.shift();
    sub.shift();
  }
  if (parts.length < 2) return null;
  return parts[0] || null;
}

/** 安装记录里解析过的来源：owner/name、ref、subdirectory 都可核查。 */
function fromInstallSource(source: InstallSource): SkillProvenance {
  const repo = source.owner && source.name ? `${source.owner}/${source.name}` : null;
  const skillPath = typeof source.path === "string" && source.path ? source.path : null;
  return {
    kind: "install",
    repo,
    category: categoryOfRepoPath(skillPath, source.subdirectory),
    path: skillPath,
    ref: source.ref || null,
  };
}

function fromLockEntry(entry: LockEntry): SkillProvenance | null {
  const repo = typeof entry.source === "string" && entry.source.trim() ? entry.source.trim() : null;
  if (!repo) return null;
  const skillPath = typeof entry.skillPath === "string" && entry.skillPath ? entry.skillPath : null;
  return { kind: "lock", repo, category: categoryOfRepoPath(skillPath), path: skillPath, ref: null };
}

/** 技能目录里的市场安装元数据（`_skillhub_meta.json` / `_meta.json`）。 */
async function fromMarketMeta(skillDir: string): Promise<SkillProvenance | null> {
  for (const name of ["_skillhub_meta.json", "_meta.json"]) {
    let raw: string;
    try {
      raw = await readFile(join(skillDir, name), "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const source = parsed && typeof parsed === "object" ? (parsed as { source?: unknown }).source : undefined;
      if (typeof source === "string" && source.trim()) {
        return { kind: "meta", repo: source.trim(), category: null, path: null, ref: null };
      }
    } catch {
      // 损坏的元数据不是证据。
    }
  }
  return null;
}

/** 目录名后缀 `find-skills__skillhub` → 渠道 `skillhub`。 */
function fromDirectorySuffix(skillDir: string): SkillProvenance | null {
  const name = segments(skillDir).pop() || "";
  const marker = name.indexOf("__");
  if (marker <= 0) return null;
  const channel = name.slice(marker + 2).replace(/^[-_]+|[-_]+$/g, "");
  if (!channel) return null;
  return { kind: "suffix", repo: channel, category: null, path: null, ref: null };
}

export interface ProvenanceInput {
  /** 来源根目录（如 `~/.dsh/skills`）。 */
  rootPath: string;
  /** 技能的 SKILL.md 绝对路径。 */
  skillPath: string;
  /** 技能标识（目录名），锁文件按它索引。 */
  name: string;
  /** frontmatter 里声明的名字，锁文件按目录名索引时作为兜底。 */
  declaredName?: string;
  /** `/state` 已经挂上的安装记录。 */
  installSource?: InstallSource | null;
}

/** 按优先级解析一个技能的来源。任何一步失败都降级到下一级，最后落到目录落点。 */
export async function resolveProvenance(input: ProvenanceInput, lock: LockIndex | null): Promise<SkillProvenance> {
  if (input.installSource) return fromInstallSource(input.installSource);
  const skillDir = dirname(input.skillPath);
  if (lock) {
    const entry = lock.entries[input.name] ?? (input.declaredName ? lock.entries[input.declaredName] : undefined);
    const resolved = entry ? fromLockEntry(entry) : null;
    if (resolved) return resolved;
  }
  const market = await fromMarketMeta(skillDir);
  if (market) return market;
  const suffix = fromDirectorySuffix(skillDir);
  if (suffix) return suffix;
  return { kind: "root", repo: null, category: null, path: null, ref: null };
}

/**
 * 给一份快照里的所有技能挂上 `provenance`。
 * 必须在 `installSource` 已经挂好之后调用；只读磁盘，不修改任何状态文件。
 */
export async function attachProvenance<T extends { roots: RootView[] }>(snapshot: T): Promise<T> {
  const lockByRoot = new Map<string, LockIndex | null>();
  for (const root of snapshot.roots) {
    let lock: LockIndex | null;
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
          declaredName: (skill as SkillView).declaredName,
          installSource: skill.installSource ?? null,
        },
        lock,
      );
    }
  }
  return snapshot;
}
