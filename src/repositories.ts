import type { Archive, Repository, RepositoryInput, RepositorySkill, RepositoryState, InstallRecord, Serialize, SkillRequest, Log, CodedError } from "./types.js";
// 公开 GitHub 仓库目录：直连归档下载服务、固定内容快照安装，不执行仓库代码。
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { managerHomePath, parseSkillDoc, importUploadedSkill, setSkillEnabled, state, userRoots } from "./core.js";
import { createRepositoryUpdater, fileIndex, signature, readSkillTree } from "./repository-updates.js";

const LIMIT = 32 << 20;
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function failure(message: string, code = "error.repo.invalid") {
  return Object.assign(new Error(message), { code, statusCode: 400 });
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
    safePath(record.path, true);
    safePath(record.name);
    if (record.name.includes("/")) throw failure("仓库安装名称无效");
    for (const entry of record.files) {
      if (!entry || !/^[a-f0-9]{64}$/.test(entry.hash)) throw failure("仓库安装摘要无效");
      safePath(entry.path);
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

export function createRepositoryManager({ fetchImpl = globalThis.fetch, log }: {fetchImpl?: typeof fetch; log?: Log} = {}) {
  const file = join(managerHomePath(), "repositories.json");
  let queue: Promise<unknown> = Promise.resolve();
  const serialize: Serialize = (task, recover = true) => { const run = async () => { if (recover) await recoverPending(); return task(); }; const next = queue.then(run, run); queue = next.catch(() => {}); return next; };
  async function read(): Promise<RepositoryState> {
    try {
      const homeInfo = await fs.lstat(managerHomePath());
      if (homeInfo.isSymbolicLink() || !homeInfo.isDirectory()) throw failure("仓库状态目录不安全");
      const info = await fs.lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.size > 16 << 20) throw failure("仓库状态文件不安全");
      const value: unknown = JSON.parse(await fs.readFile(file, "utf8"));
      validateStoredState(value);
      return value;
    } catch (caught) { const error = caught as CodedError;
      if (error.code === "ENOENT") return { version: 1, repositories: [], installs: [] };
      throw failure("仓库状态文件损坏或无法读取，请保留文件并修复后重试", "error.repo.state");
    }
  }
  async function write(value: RepositoryState) {
    validateStoredState(value);
    const text = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(text, "utf8") > 16 << 20) throw failure("仓库状态超过容量限制，请减少来源");
    await fs.mkdir(managerHomePath(), { recursive: true });
    if ((await fs.lstat(managerHomePath())).isSymbolicLink()) throw failure("仓库状态目录不能是链接");
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
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
  async function matches(record: InstallRecord) {
    try {
      safePath(record.name);
      const dshPath = userRoots().find(root => root.key === "dsh")!.path;
      // 一次完整遍历同时检查链接、额外文件和内容变化，不能只检查已知文件。
      return signature(fileIndex(await readSkillTree(join(dshPath, record.name)))) === signature(record.files);
    } catch { return false; }
  }
  async function recoverPending() {
    const data = await read(); let recovered = false;
    for (const record of data.installs.filter(record => !record.complete)) {
      if (await matches(record)) { record.complete = true; recovered = true; }
    }
    // 仅恢复与安装意图完全相同的目录；保留任何本地修改，不删除或覆盖文件。
    if (recovered) {
      try { await write(data); }
      catch { throw failure("技能文件已保留，但安装来源状态仍无法写入，请恢复磁盘写入后重试", "error.repo.installState"); }
    }
  }
  async function list() {
    const data = await read();
    const local = await state();
    const skills = local.roots.flatMap((r) => r.skills || []);
    // 每次只读取一个目录，避免多个大技能并行读取使内存随安装数量增长。
    const matched = new Map<InstallRecord, boolean>();
    for (const record of data.installs) matched.set(record, record.complete && await matches(record));
    return { repositories: data.repositories.map((repo) => ({ ...repo, skills: repo.skills.map((skill) => {
      const found = skills.some((s) => s.name.toLowerCase() === skill.name.toLowerCase() || s.declaredName?.toLowerCase() === skill.name.toLowerCase());
      const own = data.installs.some((i) => i.id === repo.id && i.path === skill.path && i.name === skill.name && matched.get(i));
      const dsh = local.roots.find((r) => r.key === "dsh");
      const inDsh = dsh?.skills.some((s) => s.name === skill.name);
      const { body, ...summary } = skill;
      const record = data.installs.find(i => i.id === repo.id && i.path === skill.path && i.name === skill.name && i.complete);
      const updateAvailable = !!record && !!skill.files && signature(record.files) !== signature(skill.files);
      return { ...summary, updateAvailable, canRollback: !!record?.backup, tracked: !!record && !!inDsh, status: !skill.valid ? "invalid" : found ? own && inDsh ? updateAvailable ? "update" : "installed" : "conflict" : "available" };
    }) })) };
  }
  return {
    list: () => serialize(list),
    ...createRepositoryUpdater({ read, write, repository, download, serialize, parseRepositoryInput }),
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
      await write(data); return { id };
    }, false),
    refresh: ({ id }: {id: string}) => serialize(async () => {
      const data = await read(), repo = repository(data, id);
      try {
        const bytes = await fetchBranch(repo);
        const entries = decodeRepositoryArchive(bytes);
        const skills: RepositorySkill[] = [];
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
        const snapshot = await cacheArchive(repo, bytes);
        Object.assign(repo, { skills, commit: snapshot, refreshedAt: new Date().toISOString(), error: null });
      } catch (caught) { const error = caught as CodedError; repo.error = { code: error.code || "error.repo.invalid", error: error.message }; }
      await write(data);
      if (!repo.error) {
        try { await pruneCache(repo); }
        catch (caught) { const error = caught as CodedError; if (log) await log("repository.cache.cleanup.failed", { repository: repo.id, error: error.message }); else console.warn("仓库旧缓存未清理：" + error.message); }
      }
      return repo;
    }, false),
    detail: async ({ id, path }: SkillRequest) => {
      const repo = repository(await read(), id), skill = repo.skills.find((s) => s.path === path);
      if (!skill) throw failure("技能不在仓库列表中");
      return { ...skill, commit: repo.commit };
    },
    install: ({ id, path }: SkillRequest) => serialize(async () => {
      const data = await read(), repo = repository(data, id);
      const skill = repo.skills.find((s) => s.path === path);
      if (!skill || !skill.valid) throw failure("技能不存在或格式无效");
      const local = await state();
      if (local.roots.some(root => (root.skills || []).some(item => item.name.toLowerCase() === skill.name.toLowerCase() || item.declaredName?.toLowerCase() === skill.name.toLowerCase()))) throw failure("同名技能已存在，不会覆盖本地文件", "error.repo.conflict");
      const archive = await download(repo), prefix = path ? `${path}/` : "";
      const document = archive[prefix + "SKILL.md"];
      if (!document || hash(document) !== skill.documentHash) throw failure("仓库技能内容与扫描版本不一致，请重新刷新");
      const entries = Object.entries(archive).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => ({ path: p.slice(prefix.length), data: Buffer.from(bytes).toString("base64") }));
      if (!entries.some((e) => e.path === "SKILL.md")) throw failure("仓库技能内容已失效");
      // 先持久化来源意图；即使安装后进程退出，也能追溯安装的仓库和提交。
      data.installs = data.installs.filter((i) => i.name !== skill.name);
      const record = { id, path, source: { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory }, name: skill.name, commit: repo.commit, complete: false, files: entries.map((e) => ({ path: e.path, hash: hash(Buffer.from(e.data, "base64")) })) };
      data.installs.push(record);
      await write(data);
      let copied = false;
      try {
        const result = await importUploadedSkill({ name: skill.name, entries }, log, { conflict: "skip" });
        if (result.ok === false || !result.imported?.length) throw failure(result.error || "技能安装失败或遇到同名冲突", "error.repo.conflict");
        copied = true;
        // 界面默认显示已启用，但斜杠菜单只会收到显式启用覆盖项。安装完成后走与手动开启相同的策略写入。
        const dsh = userRoots().find((root) => root.key === "dsh");
        const enabled = await setSkillEnabled(dsh, skill.name, true, log);
        if (enabled && typeof enabled === "object" && "ok" in enabled && enabled.ok === false) throw failure(enabled.error || "技能启用状态无法写入", enabled.code || "error.repo.enableState");
      } catch (caught) { const error = caught as CodedError;
        data.installs = data.installs.filter(item => item !== record);
        try { await write(data); }
        catch { throw failure("安装未完成且来源记录无法撤销，请恢复磁盘写入后检查技能目录", "error.repo.installState"); }
        if (copied) await fs.rm(join(userRoots().find((root) => root.key === "dsh")!.path, skill.name), { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      record.complete = true;
      try { await write(data); }
      catch { throw failure("技能文件已安装但来源状态未确认，请恢复磁盘写入后重新打开仓库页", "error.repo.installState"); }
      return { name: skill.name, commit: repo.commit, root: userRoots().find((r) => r.key === "dsh")!.path };
    }),
  };
}
