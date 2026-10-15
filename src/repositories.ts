import type { Archive, Repository, RepositoryInput, RepositorySkill, RepositoryState, InstallRecord, CatalogInstallRecord, Serialize, SkillRequest, Log, CodedError, MutationOptions, SkillRoot } from "./types.js";
// 公开 GitHub 仓库目录：直连归档下载服务、固定内容快照安装，不执行仓库代码。
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { managerHomePath, resolveWorkspaceTarget, repositoryDestinations, trashRootPath, listTrash, restoreTrash as restoreSkillTrash, permanentlyDeleteTrash, parseSkillDoc, importUploadedSkill, deleteSkill, setSkillEnabled, readManagerState, state, createWorkspaceIndex, type indexRegisteredWorkspaces } from "./core.js";
import { createRepositoryUpdater, fileIndex, signature, readSkillTree, repositoryInstallRoot, recordInstallRoot, selectInstallRecord } from "./repository-updates.js";

const LIMIT = 32 << 20;
const STATE_LIMIT = 16 << 20;
const STATE_READ_LIMIT = 64 << 20;
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function failure(message: string, code = "error.repo.invalid", params?: unknown) {
  return Object.assign(new Error(message), { code, statusCode: 400, ...(params && typeof params === "object" && !Array.isArray(params) ? { params } : {}) });
}
function safePath(value: string, allowEmpty = false) {
  if (typeof value !== "string" || value.length > 512 || (!value && !allowEmpty)) throw failure("仓库路径无效");
  if (!value) return value;
  const parts = value.split("/");
  if (parts.length > 64 || parts.some((p) => !p || p === "." || p === ".." || /[\\:<>"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw failure("仓库路径不安全");
  return value;
}

function validateStoredState(input: unknown): asserts input is RepositoryState {
  // 所有字段仍逐项运行时验证；断言仅在全部检查通过后生效。
  const value = input as RepositoryState;
  if (!value || value.version !== 1 || !Array.isArray(value.repositories) || value.repositories.length > 30 || !Array.isArray(value.installs)) throw failure("仓库状态格式无效");
  for (const repo of value.repositories) {
    if (!repo || typeof repo.id !== "string" || !Array.isArray(repo.skills) || repo.skills.length > 500) throw failure("仓库状态格式无效");
    const source = parseRepositoryInput({ url: `${repo.owner}/${repo.name}`, ref: repo.ref, subdirectory: repo.subdirectory });
    if (hash(JSON.stringify(source)).slice(0, 24) !== repo.id || (repo.commit !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(repo.commit))) throw failure("仓库状态来源无效");
    for (const skill of repo.skills) {
      if (!skill || typeof skill.name !== "string" || typeof skill.description !== "string" || typeof skill.body !== "string" || typeof skill.valid !== "boolean" || !/^[a-f0-9]{64}$/.test(skill.documentHash)) throw failure("仓库技能状态无效");
      safePath(skill.path, true);
    }
  }
  for (const record of value.installs) {
    if (!record || typeof record.id !== "string" || typeof record.complete !== "boolean" || !Array.isArray(record.files) || !record.files.length || record.files.length > 1000 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.commit || "")) throw failure("仓库安装记录无效");
    repositoryInstallRoot(record.root);
    if (record.workspace !== undefined && (typeof record.workspace !== "string" || !record.workspace || record.workspace.length > 1024 || record.root === "agents")) throw failure("仓库安装工作区无效");
    if (record.trashId !== undefined && (typeof record.trashId !== "string" || !/^\d+-[a-f0-9-]{36}$/.test(record.trashId))) throw failure("仓库回收记录无效");
    if (record.restoreFingerprint !== undefined && (typeof record.restoreFingerprint !== "string" || !record.trashId || !/^[a-f0-9]{64}$/.test(record.restoreFingerprint))) throw failure("仓库恢复记录无效");
    safePath(record.path, true);
    safePath(record.name);
    if (record.name.includes("/")) throw failure("仓库安装名称无效");
    for (const entry of record.files) {
      if (!entry || !/^[a-f0-9]{64}$/.test(entry.hash)) throw failure("仓库安装摘要无效");
      safePath(entry.path);
    }
  }
  if (value.catalogInstalls !== undefined) {
    if (!Array.isArray(value.catalogInstalls)) throw failure("目录安装状态格式无效");
    for (const item of value.catalogInstalls) {
      if (typeof item === "string") {
        if (!/^(?:clawhub|skillsh):[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){1,2}$/.test(item)) throw failure("目录安装记录格式无效");
      } else if (item && typeof item === "object") {
        if (typeof item.id !== "string" || !/^(?:clawhub|skillsh):[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){1,2}$/.test(item.id)) throw failure("目录安装记录格式无效");
        if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 128) throw failure("目录安装技能名称无效");
        safePath(item.name);
        if (item.name.includes("/")) throw failure("目录安装技能名称无效");
        if (item.root !== undefined) repositoryInstallRoot(item.root);
        if (item.workspace !== undefined && (item.root !== "dsh" || typeof item.workspace !== "string" || !item.workspace || item.workspace.length > 1024)) throw failure("目录安装工作区无效");
        if (item.trashId !== undefined && (typeof item.trashId !== "string" || !/^\d+-[a-f0-9-]{36}$/.test(item.trashId))) throw failure("目录回收记录无效");
        if (item.restoreFingerprint !== undefined && (!item.trashId || !/^[a-f0-9]{64}$/.test(item.restoreFingerprint))) throw failure("目录恢复记录无效");
        if (item.complete !== undefined && typeof item.complete !== "boolean") throw failure("目录安装确认状态无效");
        if (item.complete === false && (!item.root || !item.files?.length)) throw failure("目录安装意图无效");
        if (item.files !== undefined) {
          if (!Array.isArray(item.files) || !item.files.length || item.files.length > 1000) throw failure("目录安装摘要无效");
          for (const file of item.files) {
            if (!file || !/^[a-f0-9]{64}$/.test(file.hash)) throw failure("目录安装摘要无效");
            safePath(file.path);
          }
        }
      } else {
        throw failure("目录安装记录格式无效");
      }
    }
  }
}

/** 解析公开仓库地址；含斜杠的分支通过独立 ref 字段提供。 */
export function parseRepositoryInput(input: RepositoryInput = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw failure("仓库参数必须是对象");
  if ((["ref", "subdirectory"] as const).some((key) => input[key] !== undefined && typeof input[key] !== "string")) throw failure("仓库分支和子目录必须是字符串");
  let raw = typeof input.url === "string" ? input.url.trim() : "";
  if (raw.length > 2048 || /[%?#\\\s]/.test(raw)) throw failure("仓库地址无效");
  if (raw.startsWith("https://github.com/")) raw = raw.slice(19);
  const parts = raw.replace(/\/$/, "").split("/");
  const owner = (parts[0] || "").toLowerCase();
  const name = (parts[1] || "").replace(/\.git$/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner) || !/^[a-z0-9_.-]{1,100}$/.test(name) || name === "." || name === ".." || (parts.length > 2 && (parts[2] !== "tree" || !parts[3]))) throw failure("请输入公开 GitHub 仓库地址或 owner/repo");
  const ref = input.ref || parts[3] || "";
  if (typeof ref !== "string" || ref.length > 200 || (ref && !/^[a-zA-Z0-9_./-]+$/.test(ref)) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) throw failure("仓库分支无效");
  const subdirectory = safePath(input.subdirectory || parts.slice(4).join("/"), true);
  return { owner, name, ref, subdirectory };
}

/** 解压前检查声明大小，解压后再检查实际大小和大小写路径冲突。 */
export function decodeRepositoryArchive(bytes: Uint8Array) {
  if (bytes.byteLength > LIMIT) throw failure("仓库归档超过 32 MiB", "error.repo.tooLarge");
  let total = 0, count = 0;
  const seen = new Set();
  const archive = unzipSync(new Uint8Array(bytes), { filter(entry) {
    safePath(entry.name.replace(/\/$/, ""));
    const key = entry.name.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) throw failure("仓库存在重复路径");
    seen.add(key);
    total += entry.originalSize;
    if (++count > 10000 || entry.originalSize > LIMIT || total > 64 << 20) throw failure("仓库解压大小或文件数量超限");
    return !entry.name.endsWith("/");
  } });
  const result: Archive = Object.create(null);
  let root;
  for (const [path, data] of Object.entries(archive)) {
    const slash = path.indexOf("/");
    if (slash < 1) throw failure("仓库归档路径无效");
    const prefix = path.slice(0, slash);
    if (root && root !== prefix) throw failure("仓库归档根目录不唯一");
    root = prefix;
    const relative = safePath(path.slice(slash + 1));
    if (data.byteLength > LIMIT) throw failure("仓库文件过大");
    result[relative] = data;
  }
  return result;
}

async function readResponse(response: Response, limit: number) {
  if (!response.ok) throw Object.assign(failure(`仓库访问失败（HTTP ${response.status}），请稍后重试`, "error.repo.network"), { httpStatus: response.status });
  if (Number(response.headers.get("content-length")) > limit) throw failure("仓库归档超过 32 MiB", "error.repo.tooLarge");
  const reader = response.body?.getReader();
  if (!reader) throw failure("仓库响应为空", "error.repo.network");
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw failure("仓库归档超过 32 MiB", "error.repo.tooLarge");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks, length);
}

export function createRepositoryManager({ fetchImpl = globalThis.fetch, log, registeredWorkspaces, onWorkspaceIndexBuild }: {fetchImpl?: typeof fetch; log?: Log; registeredWorkspaces?: () => string[] | undefined; onWorkspaceIndexBuild?: () => void} = {}) {
  const file = join(managerHomePath(), "repositories.json");
  let queue: Promise<unknown> = Promise.resolve();
  let catalogWarnings: Array<{ id: string; code: string; error: string }> = [];
  let activeIndex: ReturnType<typeof createWorkspaceIndex> | undefined;
  const serialize: Serialize = (task, recover = true) => { const run = async () => { const index = createWorkspaceIndex(registeredWorkspaces?.(), { onBuild: onWorkspaceIndexBuild }); const previous = activeIndex; activeIndex = index; try { if (recover) await recoverPending(); return await task(); } finally { activeIndex = previous; } }; const next = queue.then(run, run); queue = next.catch(() => {}); return next; };
  function requestIndex() { return activeIndex ?? createWorkspaceIndex(registeredWorkspaces?.(), { onBuild: onWorkspaceIndexBuild }); }
  async function indexedFor(record: { workspace?: string }) { return record.workspace === undefined ? undefined : requestIndex().load(); }
  async function read(): Promise<RepositoryState> {
    try {
      const homeInfo = await fs.lstat(managerHomePath());
      if (homeInfo.isSymbolicLink() || !homeInfo.isDirectory()) throw failure("仓库状态目录不安全");
      const info = await fs.lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.size > STATE_READ_LIMIT) throw failure("仓库状态文件不安全");
      const value: unknown = JSON.parse(await fs.readFile(file, "utf8"));
      validateStoredState(value);
      return value;
    } catch (caught) { const error = caught as CodedError;
      if (error.code === "ENOENT") return { version: 1, repositories: [], installs: [] };
      throw failure("仓库状态文件损坏或无法读取，请保留文件并修复后重试", "error.repo.state");
    }
  }
  async function write(value: RepositoryState, allowShrink = false) {
    validateStoredState(value);
    const text = JSON.stringify(value, null, 2);
    const bytes = Buffer.byteLength(text, "utf8");
    // 16 MiB 只阻止继续增大。已经超限时，删除旧身份或回收记录必须允许写回更小的文件。
    if (bytes > STATE_READ_LIMIT || bytes > STATE_LIMIT && !(allowShrink && bytes < await currentStateBytes())) throw failure("安装来源状态超过 16 MiB。请先清理不需要的回收记录或旧身份，仍有效的安装副本会保留。", "error.repo.capacity");
    await fs.mkdir(managerHomePath(), { recursive: true });
    if ((await fs.lstat(managerHomePath())).isSymbolicLink()) throw failure("仓库状态目录不能是链接");
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async function currentStateBytes() {
    try { return (await fs.lstat(file)).size; } catch { return 0; }
  }
  function repository(data: RepositoryState, id: string) {
    const repo = data.repositories.find((r) => r.id === id);
    if (!repo) throw failure("仓库不存在");
    // 持久化文件也不能绕过出站目标验证。
    parseRepositoryInput({ url: `${repo.owner}/${repo.name}`, ref: repo.ref, subdirectory: repo.subdirectory });
    return repo;
  }
  async function request(url: string) {
    try {
      const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(60000), headers: { Accept: "application/zip", "User-Agent": "dsh-skills-manager" } });
      return await readResponse(response, LIMIT);
    } catch (caught) { const error = caught as CodedError;
      if (typeof error.code === "string" && error.code.startsWith("error.repo.")) throw error;
      throw failure("仓库网络请求失败，请检查网络后重试", "error.repo.network");
    }
  }
  async function cacheDirectory() {
    const dir = join(managerHomePath(), "repository-cache");
    if ((await fs.lstat(managerHomePath())).isSymbolicLink()) throw failure("缓存目录不能是链接");
    await fs.mkdir(dir, { recursive: true });
    if ((await fs.lstat(dir)).isSymbolicLink()) throw failure("缓存目录不能是链接");
    return dir;
  }
  async function cacheArchive(repo: Repository, bytes: Uint8Array) {
    const version = hash(bytes), dir = await cacheDirectory();
    const target = join(dir, `${repo.id}-${version}.zip`), temporary = join(dir, randomUUID() + ".tmp");
    try { await fs.writeFile(temporary, bytes, { flag: "wx" }); await fs.rename(temporary, target); }
    finally { await fs.rm(temporary, { force: true }); }
    return version;
  }
  async function pruneCache(repo: Repository) {
    const dir = await cacheDirectory(), keep = `${repo.id}-${repo.commit}.zip`;
    for (const name of await fs.readdir(dir)) {
      if (name !== keep && name.startsWith(repo.id + "-") && /^[a-f0-9]{24}-[a-f0-9]{64}\.zip$/.test(name)) await fs.unlink(join(dir, name));
    }
  }
  async function download(repo: Repository) {
    // 兼容旧提交安装记录；新扫描只使用归档摘要缓存，不再访问REST接口。
    if (/^[a-f0-9]{40}$/.test(repo.commit || "")) return decodeRepositoryArchive(await request(`https://codeload.github.com/${repo.owner}/${repo.name}/zip/${repo.commit}`));
    if (!/^[a-f0-9]{64}$/.test(repo.commit || "")) throw failure("请先刷新仓库");
    try {
      const target = join(await cacheDirectory(), `${repo.id}-${repo.commit}.zip`);
      const info = await fs.lstat(target);
      if (info.isSymbolicLink() || !info.isFile() || info.size > LIMIT) throw failure("缓存无效");
      const bytes = await fs.readFile(target);
      if (hash(bytes) !== repo.commit) throw failure("缓存内容变化");
      return decodeRepositoryArchive(bytes);
    } catch { throw failure("扫描缓存缺失或损坏，请重新检查更新后操作"); }
  }
  async function fetchBranch(repo: Repository): Promise<Buffer> {
    const refs = repo.ref && repo.ref !== "HEAD" ? [`refs/heads/${repo.ref}`, `refs/tags/${repo.ref}`] : ["HEAD", "refs/heads/main", "refs/heads/master"];
    for (let i = 0; i < refs.length; i++) {
      try { return await request(`https://codeload.github.com/${repo.owner}/${repo.name}/zip/${refs[i].split("/").map(encodeURIComponent).join("/")}`); }
      catch (caught) { const error = caught as CodedError; if (error.httpStatus !== 404 || i === refs.length - 1) throw error; }
    }
    throw failure("仓库分支不存在");
  }
  async function matches(record: InstallRecord, fingerprint = signature(record.files), registered = registeredWorkspaces?.(), indexed?: Awaited<ReturnType<typeof indexRegisteredWorkspaces>>) {
    try {
      safePath(record.name);
      const rootPath = (await recordInstallRoot(record, registered, indexed)).path;
      // 一次完整遍历同时检查链接、额外文件和内容变化，不能只检查已知文件。
      return signature(fileIndex(await readSkillTree(join(rootPath, record.name)))) === fingerprint;
    } catch { return false; }
  }
  async function hasRestoreReceipt(record: InstallRecord | CatalogInstallRecord) {
    try {
      const receipt = join(trashRootPath(), `.restored-${record.trashId}`);
      const directory = await fs.lstat(receipt), file = await fs.lstat(join(receipt, "metadata.json"));
      if (!directory.isDirectory() || directory.isSymbolicLink() || !file.isFile() || file.isSymbolicLink() || file.size > 32 << 10) return false;
      const metadata = JSON.parse(await fs.readFile(join(receipt, "metadata.json"), "utf8"));
      return metadata.id === record.trashId && metadata.name === record.name && (record.workspace ? metadata.root?.scope === "project" && metadata.root.projectRoot === record.workspace : metadata.root?.scope === "user" && metadata.root.key === (record.root || "dsh")) && ("path" in record ? metadata.repository?.id === record.id && metadata.repository.path === record.path : Array.isArray(metadata.catalog) && metadata.catalog.includes(record.id)) && metadata.entries?.length === 1 && metadata.entries[0] === record.name;
    } catch { return false; }
  }
  async function recoverPending() {
    catalogWarnings = [];
    const data = await read(); let recovered = false;
    const recoveredCatalogIds: string[] = [];
    const recoveredInstallIds: string[] = [];
    const restoredIds: string[] = [];
    const registered = requestIndex().registered;
    for (const record of data.installs.filter(record => !record.complete && !record.trashId)) {
      if (await matches(record, signature(record.files), registered, await indexedFor(record))) { record.complete = true; recovered = true; recoveredInstallIds.push(`${record.id}:${record.path}`); }
    }
    for (const record of data.installs.filter(record => record.trashId && record.restoreFingerprint)) {
      // Intent or Trash absence alone cannot authorize a same-name replacement.
      // Require the atomic successful-restore receipt and exact restored files.
      if (await hasRestoreReceipt(record) && await matches(record, record.restoreFingerprint, registered, await indexedFor(record))) {
        restoredIds.push(record.trashId!);
        delete record.trashId; delete record.restoreFingerprint; recovered = true;
      }
    }
    for (const record of catalogRecords(data)) {
      if (record.complete === false && !record.trashId && record.files?.length && record.root) {
        if (await catalogMatches(record, signature(record.files))) {
          try {
            const root = await recordInstallRoot(record, registered, await indexedFor(record));
            await enableCatalog(root, record.name, true);
            record.complete = true; recovered = true; recoveredCatalogIds.push(record.id);
          } catch {
            // 单个副本恢复失败不能拦截列表或无关事务；持久意图仍保留未确认状态。
            catalogWarnings.push({ id: record.id, code: "error.repo.installState", error: "技能文件和安装意图已保留，启用策略暂时不可写；修复策略后重试" });
          }
        }
      }
    }
    for (const record of catalogRecords(data).filter(record => record.root && record.trashId && record.restoreFingerprint)) {
      if (await hasRestoreReceipt(record) && await catalogMatches(record, record.restoreFingerprint!)) {
        restoredIds.push(record.trashId!);
        delete record.trashId; delete record.restoreFingerprint; recovered = true;
      }
    }
    // 仅恢复与安装/恢复意图完全相同的目录；保留任何本地修改，不删除或覆盖文件。
    if (recovered) {
      try { await write(data, true); }
      catch {
        for (const id of [...new Set([...recoveredCatalogIds, ...restoredIds, ...recoveredInstallIds])]) catalogWarnings.push({ id, code: "error.repo.installState", error: "技能文件已保留，恢复确认暂时无法写入；恢复磁盘写入后重试" });
        return; // 不删除恢复凭据，让下一次读取仍可重试。
      }
      for (const id of restoredIds) await fs.rm(join(trashRootPath(), `.restored-${id}`), { recursive: true, force: true }).catch(() => undefined);
    }
  }
  async function list() {
    const data = await read();
    const local = await state();
    const skills = local.roots.flatMap((r) => r.skills || []);
    // 每次只读取一个目录，避免多个大技能并行读取使内存随安装数量增长。
    const matched = new Map<InstallRecord, boolean>();
    const present = new Set<InstallRecord>();
    const registered = requestIndex().registered;
    for (const record of data.installs.filter(record => record.complete && !record.trashId)) {
      try {
        const files = fileIndex(await readSkillTree(join((await recordInstallRoot(record, registered, await indexedFor(record))).path, record.name)));
        present.add(record);
        matched.set(record, signature(files) === signature(record.files));
      } catch { /* Missing or unsafe installed copies must not be deleted. */ }
    }
    const activeCatalogIds: string[] = [];
        const catalogCopies: { id: string; name: string; installedRoot: "dsh" | "agents"; installedWorkspace?: string; canUninstall: boolean }[] = [];
        for (const record of catalogRecords(data).filter(record => record.root && record.complete !== false && !record.trashId)) {
          try {
            const root = await recordInstallRoot(record, registered, await indexedFor(record));
            const files = await readSkillTree(join(root.path, record.name));
            if (files["SKILL.md"]) {
              if (!activeCatalogIds.includes(record.id)) activeCatalogIds.push(record.id);
              catalogCopies.push({ id: record.id, name: record.name, installedRoot: record.root || "dsh", ...(record.workspace !== undefined ? { installedWorkspace: record.workspace } : {}), canUninstall: true });
            }
          } catch { /* 缺失、未登记或不安全的位置不显示徽章，也不认领其他根的同名文件。 */ }
        }
        return { installRoots: await repositoryDestinations(), catalogInstalls: activeCatalogIds, catalogCopies,
      catalogUnknownIds: [...new Set((data.catalogInstalls || []).flatMap(record => typeof record === "string" ? [record] : !record.root && !record.trashId ? [record.id] : []))].filter(id => !activeCatalogIds.includes(id)),
      catalogWarnings: [...catalogWarnings], repositories: data.repositories.map((repo) => ({ ...repo, skills: repo.skills.map((skill) => {
      const found = skills.some((s) => s.name.toLowerCase() === skill.name.toLowerCase() || s.declaredName?.toLowerCase() === skill.name.toLowerCase());

      const { body, ...summary } = skill;
      const installations = data.installs.filter(i => i.id === repo.id && i.path === skill.path && i.name === skill.name && i.complete && !i.trashId).flatMap(record => {
              const tracked = present.has(record);
              if (!tracked) return [];
              const updateAvailable = !!skill.files && signature(record.files) !== signature(skill.files);
              return [{ installedRoot: record.root || "dsh", ...(record.workspace !== undefined ? { installedWorkspace: record.workspace } : {}), tracked, updateAvailable,
                canRollback: !!record.backup, canUninstall: true,
                status: !skill.valid ? "invalid" : matched.get(record) ? updateAvailable ? "update" : "installed" : "conflict" }];
            });
      // 技能级旧字段仅兼容展示；管理调用必须指定副本目标。
      const legacy = installations.find(item => item.tracked);
      return { ...summary, installations, updateAvailable: legacy?.updateAvailable ?? false, canRollback: legacy?.canRollback ?? false, tracked: !!legacy,
        installedRoot: legacy?.installedRoot ?? null, installedWorkspace: legacy?.installedWorkspace ?? null, canUninstall: !!legacy,
        status: !skill.valid ? "invalid" : legacy?.status ?? (found ? "conflict" : "available") };
    }) })) };
  }
  function catalogRecords(data: RepositoryState): CatalogInstallRecord[] {
    return (data.catalogInstalls || []).filter((record): record is CatalogInstallRecord => typeof record !== "string");
  }
  const locationKey = (record: { root?: string; workspace?: string; name: string }) => JSON.stringify([
    record.root, record.workspace === undefined ? null : process.platform === "win32" ? resolve(record.workspace).toLowerCase() : resolve(record.workspace), record.name,
  ]);
  async function catalogLocation(input: { root?: unknown; workspace?: string } = {}) {
    if (input.workspace !== undefined) {
      if (input.root !== undefined && input.root !== "dsh") throw failure("工作区只能安装到项目 DSH skills");
      const target = await resolveWorkspaceTarget(input.workspace, requestIndex().registered);
      if ("ok" in target && target.ok === false) throw failure(target.error, target.code, target.params);
      return { root: "dsh" as const, workspace: (target as { root: { projectRoot: string } }).root.projectRoot };
    }
    return { root: repositoryInstallRoot(input.root).key };
  }
  async function enableCatalog(root: SkillRoot, name: string, respectDisabled = false) {
    try {
      if (respectDisabled) {
        const current = await readManagerState();
        if (!current.writable) throw new Error("启用策略不可写");
        // 来源确认失败后，用户的新停用选择优先于原安装的启用意图。
        if (current.state.disabledSkills[root.key]?.includes(name)) return;
      }
      const result = await setSkillEnabled(root, name, true, log);
      if (result && "ok" in result && result.ok === false) throw new Error(result.error);
    } catch {
      throw Object.assign(failure("技能文件和安装意图已保留，启用状态无法写入；恢复磁盘写入后重新打开发现页", "error.repo.installState"), { statusCode: 500 });
    }
  }
  async function catalogMatches(record: CatalogInstallRecord, fingerprint: string) {
    try {
      const root = await recordInstallRoot(record, requestIndex().registered, await indexedFor(record));
      return signature(fileIndex(await readSkillTree(join(root.path, record.name)))) === fingerprint;
    } catch { return false; }
  }
  function catalogCopies(data: RepositoryState, root: SkillRoot, name: string) {
    const target = { root: root.scope === "project" ? "dsh" : root.key, workspace: root.projectRoot, name };
    return catalogRecords(data).filter(record => record.root && !record.trashId && locationKey(record) === locationKey(target));
  }
  async function restoreCatalogTrash(id: string, options: MutationOptions) {
    return serialize(async () => {
      const metadata = (await listTrash()).find(item => item.id === id);
      const data = await read();
      const records = catalogRecords(data).filter(record => record.trashId === id && metadata?.catalog?.includes(record.id));
      if (!records.length) return restoreSkillTrash(id, log, options);
      for (const record of records) {
        if (metadata!.name !== record.name || (record.workspace ? metadata!.root?.projectRoot !== record.workspace || metadata!.root.scope !== "project" : metadata!.root?.scope !== "user" || metadata!.root.key !== record.root)) throw failure("回收站来源与目录身份不一致");
        record.restoreFingerprint = signature(fileIndex(await readSkillTree(join(trashRootPath(), id, record.name))));
      }
      await write(data);
      const result = await restoreSkillTrash(id, log, { ...options, repositoryRestore: true });
      if ("ok" in result && result.ok === false) {
        for (const record of records) delete record.restoreFingerprint;
        await write(data); return result;
      }
      for (const record of records) { delete record.trashId; delete record.restoreFingerprint; }
      try { await write(data); }
      catch { throw failure("技能已恢复，目录身份等待校验；恢复磁盘写入后重新打开发现页", "error.repo.installState"); }
      await fs.rm(join(trashRootPath(), `.restored-${id}`), { recursive: true, force: true });
      return result;
    }, false);
  }
  const refreshVersions = new Map<string, number>();
  return {
    installCatalog: (id: string, pack: import("./types.js").UploadInput, target: { root?: unknown; workspace?: string } = {}) => serialize(async () => {
      const location = await catalogLocation(target);
      const root = await recordInstallRoot(location, requestIndex().registered, await indexedFor(location));
      const data = await read();
      const previousCatalog = data.catalogInstalls;
      let intent: CatalogInstallRecord | undefined;
      let reusedLegacy = false;
      // 下载或状态读写可能让出执行权；在实际写入前再次校验目标路径。
      await recordInstallRoot(location, requestIndex().registered);
      const imported = await importUploadedSkill(pack, log, {
        conflict: "skip", root,
        beforeImport: async (pending, conflicts, failed) => {
          const legacy = (data.catalogInstalls || []).some(record => typeof record === "string" ? record === id : record.id === id && !record.root);
          const candidate = pending.length === 1 && !conflicts.length ? pending[0] :
            !pending.length && conflicts.length === 1 && legacy ? { ...conflicts[0], isDir: conflicts[0].isDir } : undefined;
          if (!candidate?.isDir || failed.length) throw failure("目录安装必须是单个完整技能，且不能覆盖已有副本", "error.repo.conflict");
          const files = fileIndex(await readSkillTree(candidate.source));
          if (!files.some(file => file.path === "SKILL.md")) throw failure("目录安装包缺少 SKILL.md", "error.catalog.response");
          if (conflicts.length) {
            const local = fileIndex(await readSkillTree(join(root.path, candidate.name)));
            if (signature(local) !== signature(files)) throw failure("旧安装内容与目录包不一致，不会覆盖或猜测身份", "error.repo.conflict");
            reusedLegacy = true;
          }
          intent = { id, name: candidate.name, ...location, complete: false, files };
          data.catalogInstalls = (data.catalogInstalls || []).filter(record => typeof record === "string" ? record !== id :
            record.trashId || (record.root ? locationKey(record) !== locationKey(intent!) : record.id !== id));
          data.catalogInstalls.push(intent);
          try { await write(data); }
          catch (caught) {
            if ((caught as CodedError).code === "error.repo.capacity") throw caught;
            throw failure("安装意图无法写入，未复制技能文件", "error.repo.installState");
          }
        },
      });
      const completedName = reusedLegacy ? imported.skipped?.length === 1 ? imported.skipped[0].name : undefined : imported.imported?.length === 1 ? imported.imported[0].name : undefined;
      if (imported.ok === false || !intent || completedName !== intent.name) {
        if (intent) {
          data.catalogInstalls = previousCatalog;
          try { await write(data); }
          catch { throw failure("安装未完成且身份意图无法撤销，请恢复磁盘写入后重试", "error.repo.installState"); }
        }
        throw Object.assign(failure(imported.error || "同名技能已存在，不会覆盖本地文件", imported.code || "error.repo.conflict", imported.params), { statusCode: imported.code === "error.repo.installState" ? 500 : imported.code === "error.repo.capacity" ? 413 : 409 });
      }
      await enableCatalog(root, intent.name);
      intent.complete = true;
      try { await write(data); }
      catch { throw Object.assign(failure("技能文件已安装但身份未确认；恢复磁盘写入后重新打开发现页", "error.repo.installState"), { statusCode: 500 }); }
      return { name: intent.name, root: root.path };
    }),
    list: () => serialize(list),
    trashSkill: (root: SkillRoot | undefined, name: string) => serialize(async () => {
      const data = await read();
      const records = root ? catalogCopies(data, root, name) : [];
      if (!records.length) return deleteSkill(root, name, log);
      const id = `${Date.now()}-${randomUUID()}`;
      for (const record of records) record.trashId = id;
      await write(data);
      try {
        const result = await deleteSkill(root, name, log, { catalogTrash: { id, ids: records.map(record => record.id) } });
        if ("ok" in result && result.ok === false) {
          for (const record of records) delete record.trashId;
          await write(data);
        }
        return result;
      } catch (error) {
        if (!(await listTrash()).some(item => item.id === id)) {
          for (const record of records) delete record.trashId;
          await write(data);
        }
        throw error;
      }
    }, false),
    permanentlyDeleteTrash: (id: string) => serialize(async () => {
      const data = await read();
      const before = data.catalogInstalls || [];
      const next = before.filter(record => typeof record === "string" || record.trashId !== id);
      if (next.length !== before.length) {
        data.catalogInstalls = next;
        await write(data, true);
      }
      try {
        const result = await permanentlyDeleteTrash(id, log);
        if ("ok" in result && result.ok === false) {
          data.catalogInstalls = before;
          if (next.length !== before.length) await write(data, true);
          return result;
        }
        return result;
      } catch (error) {
        data.catalogInstalls = before;
        if (next.length !== before.length) await write(data, true);
        throw error;
      }
    }, false),
    rememberCatalogInstall: (id: string, name: string, target: { root?: unknown; workspace?: string } = {}) => serialize(async () => {
      const location = await catalogLocation(target);
      const record: CatalogInstallRecord = { id, name, ...location };
      const data = await read();
      // 同一条目录身份可以有多个安装位置；回收记录属于其 trashId，不被新副本替换。
      data.catalogInstalls = (data.catalogInstalls || []).filter(item => typeof item === "string" || item.trashId || item.id !== id || locationKey(item) !== locationKey(record));
      data.catalogInstalls.push(record);
      await write(data);
      return { catalogInstalls: catalogRecords(data).map(record => record.id) };
    }, false),
    forgetCatalogInstall: (target: { id?: string; name: string; root?: unknown; workspace?: string } | { legacyId: string }) => serialize(async () => {
      if (!target || typeof target !== "object") throw failure("清理目录身份必须指定安装副本或旧身份 ID");
      if ("legacyId" in target) {
        if (typeof target.legacyId !== "string" || !/^(?:clawhub|skillsh):[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){1,2}$/.test(target.legacyId)) throw failure("清理旧目录身份必须指定有效 ID");
        const data = await read();
        // 无位置旧记录只能显式按 ID 清理，不能顺带删除已定位副本或回收身份。
        data.catalogInstalls = (data.catalogInstalls || []).filter(record => typeof record === "string" ? record !== target.legacyId : record.root || record.trashId || record.id !== target.legacyId);
        await write(data, true);
        return { catalogInstalls: catalogRecords(data).map(record => record.id) };
      }
      if (typeof target.name !== "string") throw failure("清理目录身份必须指定安装副本");
      const location = await catalogLocation(target);
      const data = await read();
      data.catalogInstalls = (data.catalogInstalls || []).filter(record => typeof record === "string" || record.trashId || !record.root ||
        locationKey(record) !== locationKey({ ...location, name: target.name }) || (target.id !== undefined && record.id !== target.id));
      await write(data, true);
      return { catalogInstalls: catalogRecords(data).map(record => record.id) };
    }, false),
    ...createRepositoryUpdater({ read, write, repository, download, serialize, parseRepositoryInput, registeredWorkspaces, onWorkspaceIndexBuild }),
    add: (input: RepositoryInput) => serialize(async () => {
      const source = parseRepositoryInput(input), data = await read();
      const id = createHash("sha256").update(JSON.stringify(source)).digest("hex").slice(0, 24);
      if (data.repositories.some((r) => r.id === id)) throw failure("该仓库已添加");
      if (data.repositories.length >= 30) throw failure("最多添加 30 个仓库");
      const repo: Repository = { ...source, id, skills: [], commit: null, refreshedAt: null, error: null };
      data.repositories.push(repo); await write(data); return repo;
    }, false),
    remove: ({ id }: {id: string}) => serialize(async () => {
      const data = await read(); const repo = repository(data, id);
      for (const record of data.installs.filter(i => i.id === id)) record.source ||= { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory };
      data.repositories = data.repositories.filter((r) => r.id !== id);
      await write(data);
      refreshVersions.set(id, (refreshVersions.get(id) || 0) + 1);
      return { id };
    }, false),
    refresh: async ({ id }: {id: string}) => {
      const { repo, version } = await serialize(async () => {
        const repo = { ...repository(await read(), id) };
        const version = (refreshVersions.get(id) || 0) + 1;
        refreshVersions.set(id, version);
        return { repo, version };
      }, false);
      let bytes: Buffer | undefined;
      let skills: RepositorySkill[] = [];
      let scanError: Repository["error"] = null;
      try {
        bytes = await fetchBranch(repo);
        const entries = decodeRepositoryArchive(bytes);
        for (const [path, bytes] of Object.entries(entries)) {
          if (path !== "SKILL.md" && !path.endsWith("/SKILL.md")) continue;
          const directory = path === "SKILL.md" ? "" : path.slice(0, -9);
          if (repo.subdirectory && directory !== repo.subdirectory && !directory.startsWith(`${repo.subdirectory}/`)) continue;
          if (bytes.length > 256 << 10 || skills.length >= 500 || skills.reduce((n, s) => n + Buffer.byteLength(s.body, "utf8"), 0) + bytes.length > 4 << 20) throw failure("仓库技能数量或说明长度超限");
          const parsed = parseSkillDoc(Buffer.from(bytes).toString("utf8"));
          const name = String(parsed.map.name || "");
          const description = String(parsed.map.description || "");
          const prefix = directory ? directory + "/" : "";
          const files = fileIndex(Object.fromEntries(Object.entries(entries).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => [p.slice(prefix.length), bytes])));
          if (files.length > 1000) throw failure("技能文件数量超限");
          skills.push({ path: directory, files, name: name || directory.split("/").pop() || repo.name, description, body: parsed.body.trim(), documentHash: hash(bytes), valid: parsed.hasFrontmatter && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name) && name.length <= 100 && !!description });
        }
      } catch (caught) { const error = caught as CodedError; scanError = { code: error.code || "error.repo.invalid", error: error.message }; }
      // 网络阶段不持锁；提交时重读最新状态，旧快照不得覆盖安装和订阅变更。
      return serialize(async () => {
        const data = await read(), current = repository(data, id);
        if (refreshVersions.get(id) !== version) return current;
        if (["owner", "name", "ref", "subdirectory"].some(key => current[key as keyof Repository] !== repo[key as keyof Repository])) throw failure("仓库来源已变化，请重新刷新");
        if (scanError) current.error = scanError;
        else {
          const snapshot = await cacheArchive(current, bytes!);
          Object.assign(current, { skills, commit: snapshot, refreshedAt: new Date().toISOString(), error: null });
        }
        await write(data);
        if (!current.error) {
          try { await pruneCache(current); }
          catch (caught) { const error = caught as CodedError; if (log) await log("repository.cache.cleanup.failed", { repository: current.id, error: error.message }); else console.warn("仓库旧缓存未清理：" + error.message); }
        }
        return current;
      }, false);
    },
    detail: async ({ id, path }: SkillRequest) => {
      const repo = repository(await read(), id), skill = repo.skills.find((s) => s.path === path);
      if (!skill) throw failure("技能不在仓库列表中");
      return { ...skill, commit: repo.commit };
    },
    restoreTrash: async (id: string, options: MutationOptions = {}) => {
      const metadata = (await listTrash()).find(item => item.id === id);
      // 普通回收条目不依赖仓库状态；有目录身份时经统一事务恢复。
      if (metadata?.catalog?.length && !metadata.repository) return restoreCatalogTrash(id, options);
      if (!metadata?.repository) return restoreSkillTrash(id, log, options);
      return serialize(async () => {
        const metadata = (await listTrash()).find(item => item.id === id);
        if (!metadata?.repository) return restoreSkillTrash(id, log, options);
        const data = await read();
        const record = data.installs.find(item => item.trashId === id && item.id === metadata.repository!.id && item.path === metadata.repository!.path);
        if (!record) return restoreSkillTrash(id, log, options);
        if (metadata.name !== record.name || (record.workspace ? metadata.root?.scope !== "project" || metadata.root.projectRoot !== record.workspace : metadata.root?.scope !== "user" || metadata.root.key !== (record.root || "dsh")) || metadata.entries.length !== 1 || metadata.entries[0] !== record.name) throw failure("回收站来源与安装记录不一致");
        // Journal the exact local edits being restored before moving any files.
        record.restoreFingerprint = signature(fileIndex(await readSkillTree(join(trashRootPath(), id, record.name))));
        const catalog = catalogRecords(data).filter(item => item.trashId === id && metadata.catalog?.includes(item.id));
        for (const item of catalog) item.restoreFingerprint = record.restoreFingerprint;
        await write(data);
        const result = await restoreSkillTrash(id, log, { ...options, repositoryRestore: true });
        if ("ok" in result && result.ok === false) {
          delete record.restoreFingerprint;
          for (const item of catalog) delete item.restoreFingerprint;
          await write(data); return result;
        }
        delete record.trashId; delete record.restoreFingerprint;
        for (const item of catalog) { delete item.trashId; delete item.restoreFingerprint; }
        try { await write(data); }
        catch { throw failure("技能已恢复，来源状态等待校验；恢复磁盘写入后重新打开仓库页", "error.repo.installState"); }
        await fs.rm(join(trashRootPath(), `.restored-${id}`), { recursive: true, force: true }).catch(() => undefined);
        return result;
      }, false);
    },
    uninstall: (input: SkillRequest) => serialize(async () => {
      const { id, path } = input;
      const data = await read();
      const index = requestIndex();
      const record = await selectInstallRecord(data.installs, input, index.registered, "没有可追溯的安装记录，不能卸载");
      const root = await recordInstallRoot(record, index.registered, await indexedFor(record));
      const fingerprint = signature(fileIndex(await readSkillTree(join(root.path, record.name))));
      const trashId = `${Date.now()}-${randomUUID()}`;
      // Retire write authorization before moving the copy. History belongs to
      // this Trash id, never to a future same-name external installation.
      record.trashId = trashId;
      const catalog = catalogCopies(data, root, record.name);
      for (const item of catalog) item.trashId = trashId;
      await write(data);
      try {
        await recordInstallRoot(record, index.registered, await indexedFor(record));
        const result = await deleteSkill(root, record.name, log, { repositoryEntryOnly: true, repositoryTrash: { id: trashId, repository: { id, path } }, ...(catalog.length ? { catalogTrash: { id: trashId, ids: catalog.map(item => item.id) } } : {}) });
        if ("ok" in result && result.ok === false) throw failure(result.error, typeof result.code === "string" ? result.code : "error.repo.invalid", result.params);
        return result;
      } catch (error) {
        if (await matches(record, fingerprint)) {
          delete record.trashId;
          for (const item of catalog) delete item.trashId;
          await write(data);
        }
        throw error;
      }
    }),
    install: ({ id, path, root: requestedRoot, workspace }: SkillRequest, registered?: string[]) => serialize(async () => {
      // 工作区只开放项目 DSH，不能与 Shared Agent 组合；路径必须来自宿主登记列表。
      let root: any, workspaceRoot: string | undefined;
      if (workspace !== undefined) {
        if (requestedRoot !== undefined && requestedRoot !== "dsh") throw failure("工作区只能安装到项目 DSH skills");
        const target = await resolveWorkspaceTarget(workspace, registered);
        if ("ok" in target && target.ok === false) throw failure(target.error, target.code, target.params);
        // 保留真实的项目根 key（project-dsh:<hash>）：启用策略与回收站都按它认根。
        root = (target as { root: any }).root;
        workspaceRoot = root.projectRoot;
      } else root = await recordInstallRoot({ root: requestedRoot });
      const data = await read(), repo = repository(data, id);
      const skill = repo.skills.find((s) => s.path === path);
      if (!skill || !skill.valid) throw failure("技能不存在或格式无效");
      // 工作区安装只和该项目的 .dsh/skills 比较，全局或其他项目已有同名副本不阻止安装。
      // 用户级位置（DSH 与 Shared Agent）仍互相比较：同一技能只能有一份可追溯的用户级安装。
      const lowered = skill.name.toLowerCase();
      const sameTarget = (await state({ projectCwds: workspaceRoot ? [workspaceRoot] : [] })).roots.filter(item => workspaceRoot ? item.projectRoot === workspaceRoot && item.kind === "project-dsh" : item.scope !== "project");
      if (sameTarget.some(item => (item.skills || []).some(entry => entry.name.toLowerCase() === lowered || entry.declaredName?.toLowerCase() === lowered))) throw failure("同名技能已存在，不会覆盖本地文件", "error.repo.conflict");
      const archive = await download(repo), prefix = path ? `${path}/` : "";
      const document = archive[prefix + "SKILL.md"];
      if (!document || hash(document) !== skill.documentHash) throw failure("仓库技能内容与扫描版本不一致，请重新刷新");
      const entries = Object.entries(archive).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => ({ path: p.slice(prefix.length), data: Buffer.from(bytes).toString("base64") }));
      if (!entries.some((e) => e.path === "SKILL.md")) throw failure("仓库技能内容已失效");
      // 同名记录只替换同一位置：用户级按 root 区分 DSH 与 Shared Agent，工作区按项目根区分。
            // 另一处的安装或回收记录必须保留，否则恢复时会丢失仓库来源。
            data.installs = data.installs.filter((i) => !(i.name === skill.name && (i.workspace ?? null) === (workspaceRoot ?? null) && (i.root || "dsh") === (workspaceRoot ? "dsh" : root.key)));
      const record: InstallRecord = { id, path, root: workspaceRoot ? "dsh" : root.key, ...(workspaceRoot ? { workspace: workspaceRoot } : {}), source: { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory }, name: skill.name, commit: repo.commit, complete: false, files: entries.map((e) => ({ path: e.path, hash: hash(Buffer.from(e.data, "base64")) })) };
      data.installs.push(record);
      await write(data);
      let copied = false;
      try {
        await recordInstallRoot({ root: requestedRoot, workspace: workspaceRoot }, registered);
        const result = await importUploadedSkill({ name: skill.name, entries }, log, { conflict: "skip", root });
        if (result.ok === false || !result.imported?.length) throw failure(result.error || "技能安装失败或遇到同名冲突", typeof result.code === "string" ? result.code : "error.repo.conflict", result.params);
        copied = true;
        // 界面默认显示已启用，但斜杠菜单只会收到显式启用覆盖项。安装完成后走与手动开启相同的策略写入。
        const enabled = await setSkillEnabled(root, skill.name, true, log);
        if (enabled && typeof enabled === "object" && "ok" in enabled && enabled.ok === false) throw failure(enabled.error || "技能启用状态无法写入", typeof enabled.code === "string" ? enabled.code : "error.repo.enableState", enabled.params);
      } catch (caught) { const error = caught as CodedError;
        data.installs = data.installs.filter(item => item !== record);
        try { await write(data); }
        catch { throw failure("安装未完成且来源记录无法撤销，请恢复磁盘写入后检查技能目录", "error.repo.installState"); }
        if (copied) await fs.rm(join(root.path, skill.name), { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      record.complete = true;
      try { await write(data); }
      catch { throw failure("技能文件已安装但来源状态未确认，请恢复磁盘写入后重新打开仓库页", "error.repo.installState"); }
      return { name: skill.name, commit: repo.commit, root: root.path };
    }),
  };
}
