import type { CodedError } from "./types.js";
import type { Archive, FileDigest, RepositoryDependencies, SkillRequest, InstallSource, RepositoryRoot, InstallRecord } from "./types.js";
// 仓库更新使用完整文件摘要预览和目录切换，保留备份，不执行下载内容。
import { promises as fs } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { managerHomePath, userRoots, checkedRepositoryRootDefinition, projectRootForRecord, resolveWorkspaceTarget, createWorkspaceIndex, type indexRegisteredWorkspaces } from "./core.js";

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const repositoryInstallKeys = new Set(["dsh", "agents"]);
/** 只解析 DSH 与公共 Agent。缺省和旧记录都属于 DSH。 */
export function repositoryInstallRoot(key: unknown = "dsh") {
  const normalized = key === undefined ? "dsh" : key;
  if (typeof normalized !== "string" || !repositoryInstallKeys.has(normalized)) throw failure("技能安装位置无效");
  const root = userRoots().find(item => item.key === normalized);
  if (!root) throw failure("技能安装位置无效");
  return { ...root, key: root.key as RepositoryRoot };
}
/**
 * 解析安装记录所在的可写根：工作区记录按保存的项目根重新校验，其余走用户目录。
 * 返回值的 path 即技能所在目录；工作区路径失效时抛出明确错误，不回退到全局。
 */
export async function recordInstallRoot(record: { root?: unknown; workspace?: string }, registered?: string[], indexed?: Awaited<ReturnType<typeof indexRegisteredWorkspaces>>) {
  if (record.workspace === undefined) {
    const root = repositoryInstallRoot(record.root);
    const checked = await checkedRepositoryRootDefinition(root);
    if (!checked) throw failure("技能安装位置不可用", "error.root.unsafe");
    if (checked.ok === false) throw Object.assign(failure(checked.error, checked.code || "error.root.unsafe"), { params: checked.params });
    return root;
  }
  const resolved = await projectRootForRecord(record.workspace, registered, indexed);
  if ("ok" in resolved && resolved.ok === false) throw Object.assign(failure(resolved.error, resolved.code || "error.workspace.unavailable"), { params: resolved.params });
  return (resolved as { root: any }).root;
}
const targetIdentity = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
export const installationSourceKey = (rootPath: string, name: string) => JSON.stringify([targetIdentity(rootPath), name]);
/** 请求明确选择副本；旧请求只可命中唯一用户级记录，不猜第一条。 */
export async function selectInstallRecord(records: InstallRecord[], input: SkillRequest, registered: string[] | undefined, missing: string) {
  let workspace: string | undefined;
  if (input.workspace !== undefined) {
    if (input.root !== undefined && input.root !== "dsh") throw failure("工作区只能管理项目 DSH skills");
    const target = await resolveWorkspaceTarget(input.workspace, registered);
    if ("ok" in target && target.ok === false) throw Object.assign(failure(target.error, target.code), { params: target.params });
    workspace = (target as { root: { projectRoot: string } }).root.projectRoot;
  } else if (input.root !== undefined) repositoryInstallRoot(input.root);
  const matches = records.filter(record => record.id === input.id && record.path === input.path && record.complete && !record.trashId &&
    (workspace !== undefined ? record.workspace !== undefined && targetIdentity(record.workspace) === targetIdentity(workspace) : record.workspace === undefined && (input.root === undefined || (record.root || "dsh") === input.root)));
  if (matches.length !== 1) throw failure(matches.length ? "安装记录不唯一，请明确选择安装位置" : missing);
  return matches[0];
}
export const fileIndex = (entries: Archive) => Object.entries(entries!).map(([path, bytes]) => ({ path, hash: hash(bytes) })).sort((a, b) => a.path.localeCompare(b.path, "en"));
export const signature = (files: FileDigest[]) => hash(JSON.stringify([...files].map(({ path, hash }) => ({ path, hash })).sort((a, b) => a.path.localeCompare(b.path, "en"))));
function failure(message: string, code = "error.repo.invalid") { return Object.assign(new Error(message), { code, statusCode: 400 }); }
function safePath(path: string) {
  if (typeof path !== "string" || !path || path.length > 512 || path.split("/").length > 64 || path.split("/").some(p => !p || p === "." || p === ".." || /[\\:<>"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw failure("技能文件路径无效");
}
async function safeDirectory(root: string) {
  for (let p = root; ; p = dirname(p)) {
    const info = await fs.lstat(p);
    if (info.isSymbolicLink() || !info.isDirectory()) throw failure("技能或备份目录包含链接");
    if (dirname(p) === p) break;
  }
}
/** 完整读取目录，新增文件参与冲突检测，禁止跟随链接。 */
export async function readSkillTree(root: string) {
  await safeDirectory(root);
  const result: Archive = Object.create(null); let size = 0, count = 0;
  async function walk(dir: string, prefix = "") {
    for (const entry of await fs.readdir(dir)) {
      const path = prefix + entry; safePath(path);
      if (++count > 2000) throw failure("技能目录数量超限");
      const target = join(dir, entry), info = await fs.lstat(target);
      if (info.isSymbolicLink()) throw failure("技能包含链接，拒绝更新");
      if (info.isDirectory()) await walk(target, path + "/");
      else {
        if (!info.isFile() || info.size > 32 << 20 || (size += info.size) > 64 << 20 || Object.keys(result).length >= 1000) throw failure("技能文件数量或大小超限");
        result[path] = await fs.readFile(target);
      }
    }
  }
  await walk(root); return result;
}
function changesBetween(before: FileDigest[], after: FileDigest[]) {
  const a = new Map(before.map(f => [f.path, f.hash])), b = new Map(after.map(f => [f.path, f.hash]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().filter(p => a.get(p) !== b.get(p)).map(path => ({ path, kind: !a.has(path) ? "added" : !b.has(path) ? "removed" : "modified" }));
}

/** 注入现有仓库存储与串行队列，避免更新和安装互相覆盖状态。 */
export function createRepositoryUpdater({ read, write, repository, download, serialize, parseRepositoryInput, registeredWorkspaces, onWorkspaceIndexBuild }: RepositoryDependencies) {
  async function prepare(input: SkillRequest, includeArchive = false) {
    const { id, path } = input, data = await read();
    const registered = registeredWorkspaces?.();
    const record = await selectInstallRecord(data.installs, input, registered, "没有可追溯的安装记录，不能在线更新");
    const target = join((await recordInstallRoot(record, registered)).path, record.name);
    const current = fileIndex(await readSkillTree(target));
    let entries: Archive | undefined, next: FileDigest[], commit: string | null;
    if (input.rollback === true) {
      const backup = record.backup!;
      if (!/^[a-f0-9-]{36}$/.test(backup?.key || "") || backup.record?.name !== record.name || backup.record?.id !== id || backup.record?.path !== path || (backup.record.root || "dsh") !== (record.root || "dsh") || (backup.record.workspace ?? "") !== (record.workspace ?? "") || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(backup.record?.commit || "") || !Array.isArray(backup.record?.files)) throw failure("没有有效的上一版备份");
      entries = await readSkillTree(join(managerHomePath(), "repository-backups", backup.key)); next = fileIndex(entries);
      if (signature(next) !== backup.fingerprint) throw failure("备份内容已变化，拒绝回退");
      commit = backup.record.commit;
    } else {
      const repo = repository(data, id), skill = repo.skills.find(s => s.path === path);
      if (repo.error || !skill?.valid || skill.name !== record.name || !skill.files) throw failure("请先成功检查更新；技能改名或已移除时不能直接替换");
      next = skill.files; commit = repo.commit;
      if (includeArchive) {
        const archive = await download(repo), prefix = path ? path + "/" : "";
        entries = Object.fromEntries(Object.entries(archive).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => [p.slice(prefix.length), bytes]));
        if (signature(fileIndex(entries)) !== signature(next)) throw failure("下载内容与预览版本不同，请重新检查更新");
      }
    }
    const token = hash(JSON.stringify({ id, path, root: record.root || "dsh", workspace: record.workspace ?? null, commit, current, next, rollback: input.rollback === true }));
    return { data, record, target, entries, next, current, token, commit, localModified: signature(current) !== signature(record.files), changes: changesBetween(current, next) };
  }
  async function replace(input: SkillRequest, rollback = false) {
    const plan = await prepare({ ...input, rollback }, true);
    if (typeof input.token !== "string" || input.token !== plan.token) throw failure("文件或版本已变化，请重新预览");
    if (plan.localModified && input.overwrite !== true) throw failure("存在本地修改，请确认备份后替换", "error.repo.modified");
    const { data, record, target, entries } = plan;
    const backupRoot = join(managerHomePath(), "repository-backups");
    await fs.mkdir(backupRoot, { recursive: true }); await safeDirectory(backupRoot);
    const key = randomUUID(), backup = join(backupRoot, key), stage = join(backupRoot, randomUUID());
    await fs.mkdir(stage);
    let moved = false, replaced = false, recoveryFailed = false;
    try {
      for (const [path, bytes] of Object.entries(entries!)) {
        safePath(path); const file = join(stage, ...path.split("/"));
        await fs.mkdir(dirname(file), { recursive: true }); await fs.writeFile(file, bytes, { flag: "wx" });
      }
      // 下载期间仍可能编辑文件，替换前复验，避免覆盖预览之后的修改。
      if (signature(fileIndex(await readSkillTree(target))) !== signature(plan.current)) throw failure("本地文件已变化，请重新预览");
      const previous = { ...record }; delete previous.backup;
      const nextRecord = rollback ? { ...record.backup!.record } : { ...previous, commit: plan.commit, files: plan.next };
      nextRecord.backup = { key, fingerprint: signature(plan.current), record: previous };
      // 跨卷或文件锁导致重命名失败时直接终止，不降级为覆盖复制。
      await fs.rename(target, backup); moved = true;
      await fs.rename(stage, target); replaced = true;
      data.installs[data.installs.indexOf(record)] = nextRecord;
      await write(data);
    } catch (caught) { const error = caught as CodedError;
      if (moved) {
        try {
          if (replaced) await fs.rename(target, stage);
          await fs.rename(backup, target);
        } catch { recoveryFailed = true; throw failure("自动恢复失败，原文件保留在备份目录，请勿重复操作", "error.repo.state"); }
      }
      throw error;
    } finally { if (!recoveryFailed) await fs.rm(stage, { recursive: true, force: true }); }
    return { name: record.name, commit: plan.commit };
  }
  async function sources() {
    const data = await read(), result: Record<string, InstallSource> = Object.create(null);
    const index = createWorkspaceIndex(registeredWorkspaces?.(), { onBuild: onWorkspaceIndexBuild });
    for (const record of data.installs.filter(i => i.complete && !i.trashId)) {
      const source = record.source || data.repositories.find(r => r.id === record.id);
      if (!source) continue;
      const parsed = parseRepositoryInput({ url: `${source.owner}/${source.name}`, ref: source.ref, subdirectory: source.subdirectory });
      try {
        const root = await recordInstallRoot(record, index.registered, record.workspace === undefined ? undefined : await index.load());
        const realRoot = await fs.realpath(root.path);
        result[installationSourceKey(realRoot, record.name)] = { ...parsed, id: record.id, path: record.path, commit: record.commit, root: record.root || "dsh", ...(record.workspace ? { workspace: record.workspace } : {}) };
      } catch { /* 失效或未登记项目的记录不能挂到任何同名技能上。 */ }
    }
    return result;
  }
  return {
    sources,
    preview: (input: SkillRequest) => serialize(async () => { const p = await prepare(input); return { token: p.token, commit: p.commit, localModified: p.localModified, changes: p.changes, rollback: input.rollback === true }; }),
    update: (input: SkillRequest) => serialize(() => replace(input)),
    rollback: (input: SkillRequest) => serialize(() => replace(input, true)),
  };
}
