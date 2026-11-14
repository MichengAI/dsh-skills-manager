import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { managerHomePath, resolveWorkspaceTarget, repositoryDestinations, trashRootPath, listTrash, restoreTrash as restoreSkillTrash, permanentlyDeleteTrash, parseSkillDoc, importUploadedSkill, deleteSkill, isSafeDeleteFailure, setSkillEnabled, readManagerState, state, createWorkspaceIndex } from "./core.js";
import { createRepositoryUpdater, fileIndex, signature, readSkillTree, repositoryInstallRoot, recordInstallRoot, selectInstallRecord, isRepositoryRootKey } from "./repository-updates.js";
import { parseGitUrl, fetchGitRepository, probeGitRemote } from "./repository-git.js";
import { estimateTokens, truncateCatalogDescription } from "./token-count.js";
const STATE_LIMIT = 16 << 20;
const STATE_READ_LIMIT = 64 << 20;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function failure(message, code = "error.repo.invalid", params) {
  return Object.assign(new Error(message), { code, statusCode: 400, ...params && typeof params === "object" && !Array.isArray(params) ? { params } : {} });
}
function safePath(value, allowEmpty = false) {
  if (typeof value !== "string" || value.length > 512 || !value && !allowEmpty) throw failure("\u4ED3\u5E93\u8DEF\u5F84\u65E0\u6548");
  if (!value) return value;
  const parts = value.split("/");
  if (parts.length > 64 || parts.some((p) => !p || p === "." || p === ".." || /[\\:<>"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw failure("\u4ED3\u5E93\u8DEF\u5F84\u4E0D\u5B89\u5168");
  return value;
}
function validateStoredState(input) {
  const value = input;
  if (!value || value.version !== 1 || !Array.isArray(value.repositories) || value.repositories.length > 30 || !Array.isArray(value.installs)) throw failure("\u4ED3\u5E93\u72B6\u6001\u683C\u5F0F\u65E0\u6548");
  for (const repo of value.repositories) {
    if (!repo || typeof repo.id !== "string" || !Array.isArray(repo.skills) || repo.skills.length > 500) throw failure("\u4ED3\u5E93\u72B6\u6001\u683C\u5F0F\u65E0\u6548");
    const source = parseRepositoryInput({ url: repo.url || `${repo.owner}/${repo.name}`, ref: repo.ref, subdirectory: repo.subdirectory });
    const expectedId = hash(JSON.stringify(source)).slice(0, 24);
    if (expectedId !== repo.id || repo.commit !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(repo.commit)) throw failure("\u4ED3\u5E93\u72B6\u6001\u6765\u6E90\u65E0\u6548");
    for (const skill of repo.skills) {
      if (!skill || typeof skill.name !== "string" || typeof skill.description !== "string" || typeof skill.body !== "string" || typeof skill.valid !== "boolean" || !/^[a-f0-9]{64}$/.test(skill.documentHash)) throw failure("\u4ED3\u5E93\u6280\u80FD\u72B6\u6001\u65E0\u6548");
      safePath(skill.path, true);
    }
  }
  for (const record of value.installs) {
    if (!record || typeof record.id !== "string" || typeof record.complete !== "boolean" || !Array.isArray(record.files) || !record.files.length || record.files.length > 1e3 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.commit || "")) throw failure("\u4ED3\u5E93\u5B89\u88C5\u8BB0\u5F55\u65E0\u6548");
    if (!isRepositoryRootKey(record.root)) throw failure("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548");
    if (record.workspace !== void 0 && (typeof record.workspace !== "string" || !record.workspace || record.workspace.length > 1024 || record.root === "agents")) throw failure("\u4ED3\u5E93\u5B89\u88C5\u5DE5\u4F5C\u533A\u65E0\u6548");
    if (record.trashId !== void 0 && (typeof record.trashId !== "string" || !/^\d+-[a-f0-9-]{36}$/.test(record.trashId))) throw failure("\u4ED3\u5E93\u56DE\u6536\u8BB0\u5F55\u65E0\u6548");
    if (record.restoreFingerprint !== void 0 && (typeof record.restoreFingerprint !== "string" || !record.trashId || !/^[a-f0-9]{64}$/.test(record.restoreFingerprint))) throw failure("\u4ED3\u5E93\u6062\u590D\u8BB0\u5F55\u65E0\u6548");
    if (record.uninstallFingerprint !== void 0 && (!record.trashId || !/^[a-f0-9]{64}$/.test(record.uninstallFingerprint))) throw failure("\u4ED3\u5E93\u5378\u8F7D\u8BB0\u5F55\u65E0\u6548");
    safePath(record.path, true);
    safePath(record.name);
    if (record.name.includes("/")) throw failure("\u4ED3\u5E93\u5B89\u88C5\u540D\u79F0\u65E0\u6548");
    for (const entry of record.files) {
      if (!entry || !/^[a-f0-9]{64}$/.test(entry.hash)) throw failure("\u4ED3\u5E93\u5B89\u88C5\u6458\u8981\u65E0\u6548");
      safePath(entry.path);
    }
  }
  if (value.catalogInstalls !== void 0) {
    if (!Array.isArray(value.catalogInstalls)) throw failure("\u76EE\u5F55\u5B89\u88C5\u72B6\u6001\u683C\u5F0F\u65E0\u6548");
    for (const item of value.catalogInstalls) {
      if (typeof item === "string") {
        if (!/^(?:clawhub|skillsh):[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){1,2}$/.test(item)) throw failure("\u76EE\u5F55\u5B89\u88C5\u8BB0\u5F55\u683C\u5F0F\u65E0\u6548");
      } else if (item && typeof item === "object") {
        if (typeof item.id !== "string" || !/^(?:clawhub|skillsh):[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){1,2}$/.test(item.id)) throw failure("\u76EE\u5F55\u5B89\u88C5\u8BB0\u5F55\u683C\u5F0F\u65E0\u6548");
        if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 128) throw failure("\u76EE\u5F55\u5B89\u88C5\u6280\u80FD\u540D\u79F0\u65E0\u6548");
        safePath(item.name);
        if (item.name.includes("/")) throw failure("\u76EE\u5F55\u5B89\u88C5\u6280\u80FD\u540D\u79F0\u65E0\u6548");
        if (item.root !== void 0 && !isRepositoryRootKey(item.root)) throw failure("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548");
        if (item.workspace !== void 0 && (item.root !== "dsh" || typeof item.workspace !== "string" || !item.workspace || item.workspace.length > 1024)) throw failure("\u76EE\u5F55\u5B89\u88C5\u5DE5\u4F5C\u533A\u65E0\u6548");
        if (item.trashId !== void 0 && (typeof item.trashId !== "string" || !/^\d+-[a-f0-9-]{36}$/.test(item.trashId))) throw failure("\u76EE\u5F55\u56DE\u6536\u8BB0\u5F55\u65E0\u6548");
        if (item.restoreFingerprint !== void 0 && (!item.trashId || !/^[a-f0-9]{64}$/.test(item.restoreFingerprint))) throw failure("\u76EE\u5F55\u6062\u590D\u8BB0\u5F55\u65E0\u6548");
        if (item.complete !== void 0 && typeof item.complete !== "boolean") throw failure("\u76EE\u5F55\u5B89\u88C5\u786E\u8BA4\u72B6\u6001\u65E0\u6548");
        if (item.complete === false && (!item.root || !item.files?.length)) throw failure("\u76EE\u5F55\u5B89\u88C5\u610F\u56FE\u65E0\u6548");
        if (item.files !== void 0) {
          if (!Array.isArray(item.files) || !item.files.length || item.files.length > 1e3) throw failure("\u76EE\u5F55\u5B89\u88C5\u6458\u8981\u65E0\u6548");
          for (const file of item.files) {
            if (!file || !/^[a-f0-9]{64}$/.test(file.hash)) throw failure("\u76EE\u5F55\u5B89\u88C5\u6458\u8981\u65E0\u6548");
            safePath(file.path);
          }
        }
      } else {
        throw failure("\u76EE\u5F55\u5B89\u88C5\u8BB0\u5F55\u683C\u5F0F\u65E0\u6548");
      }
    }
  }
  if (value.pendingTrashDeletes !== void 0) {
    if (!Array.isArray(value.pendingTrashDeletes) || value.pendingTrashDeletes.length > 256) throw failure("\u6C38\u4E45\u5220\u9664\u4E8B\u52A1\u65E0\u6548");
    const ids = /* @__PURE__ */ new Set();
    for (const pending of value.pendingTrashDeletes) {
      if (!pending || typeof pending.id !== "string" || !/^\d+-[a-f0-9-]{36}$/.test(pending.id) || ids.has(pending.id) || !Array.isArray(pending.installs) || !Array.isArray(pending.catalogInstalls) || !pending.installs.length && !pending.catalogInstalls.length) throw failure("\u6C38\u4E45\u5220\u9664\u4E8B\u52A1\u65E0\u6548");
      ids.add(pending.id);
      if ([...pending.installs, ...pending.catalogInstalls].some((record) => !record || record.trashId !== pending.id) || value.installs.some((record) => record.trashId === pending.id) || value.catalogInstalls?.some((record) => typeof record !== "string" && record.trashId === pending.id)) throw failure("\u6C38\u4E45\u5220\u9664\u4E8B\u52A1\u8EAB\u4EFD\u65E0\u6548");
      validateStoredState({ version: 1, repositories: [], installs: pending.installs, catalogInstalls: pending.catalogInstalls });
    }
  }
}
function parseRepositoryInput(input = {}) {
  return parseGitUrl(input);
}
function createRepositoryManager({
  gitFetch,
  probeRemote,
  maxRepositoryBytes: rawMaxBytes = 2 * 1024 * 1024 * 1024,
  maxTransientBytes: rawMaxTransientBytes,
  gitTimeoutMs: rawTimeoutMs = 9e5,
  log,
  registeredWorkspaces,
  onWorkspaceIndexBuild,
  getPresetRoots
} = {}) {
  const fetchPresetRoots = async () => getPresetRoots ? await getPresetRoots() || [] : [];
  const maxRepositoryBytes = typeof rawMaxBytes === "number" && Number.isFinite(rawMaxBytes) && rawMaxBytes > 0 ? rawMaxBytes : 2 * 1024 * 1024 * 1024;
  const maxTransientBytes = typeof rawMaxTransientBytes === "number" && Number.isFinite(rawMaxTransientBytes) && rawMaxTransientBytes > 0 ? rawMaxTransientBytes : maxRepositoryBytes * 2.5;
  const gitTimeoutMs = typeof rawTimeoutMs === "number" && Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? rawTimeoutMs : 9e5;
  const defaultProbe = probeRemote ?? true;
  const file = join(managerHomePath(), "repositories.json");
  let queue = Promise.resolve();
  let catalogWarnings = [];
  let activeIndex;
  const serialize = (task, recover = true, recoverDeletes = true) => {
    const run = async () => {
      stateCache = void 0;
      const index = createWorkspaceIndex(registeredWorkspaces?.(), { onBuild: onWorkspaceIndexBuild });
      const previous = activeIndex;
      activeIndex = index;
      try {
        if (recoverDeletes) await recoverTrashDeletes(await preloadedState());
        if (recover) await recoverPending(await preloadedState());
        return await task();
      } finally {
        activeIndex = previous;
      }
    };
    const next = queue.then(run, run);
    queue = next.catch(() => {
    });
    return next;
  };
  function requestIndex() {
    return activeIndex ?? createWorkspaceIndex(registeredWorkspaces?.(), { onBuild: onWorkspaceIndexBuild });
  }
  async function indexedFor(record) {
    return record.workspace === void 0 ? void 0 : requestIndex().load();
  }
  const resolveInstallRoot = async (record, registered, indexed, presetRoots) => {
    const presets = presetRoots ?? await fetchPresetRoots();
    return recordInstallRoot(record, registered, indexed, presets);
  };
  const pickInstallRecord = async (records, input, registered, missing, presetRoots) => {
    const presets = presetRoots ?? await fetchPresetRoots();
    return selectInstallRecord(records, input, registered, missing, presets);
  };
  async function read() {
    try {
      const homeInfo = await fs.lstat(managerHomePath());
      if (homeInfo.isSymbolicLink() || !homeInfo.isDirectory()) throw failure("\u4ED3\u5E93\u72B6\u6001\u76EE\u5F55\u4E0D\u5B89\u5168");
      const info = await fs.lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.size > STATE_READ_LIMIT) throw failure("\u4ED3\u5E93\u72B6\u6001\u6587\u4EF6\u4E0D\u5B89\u5168");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      validateStoredState(value);
      for (const repo of value.repositories) {
        if (repo.url) {
          try {
            const fresh = parseRepositoryInput({ url: repo.url, ref: repo.ref, subdirectory: repo.subdirectory });
            repo.owner = fresh.owner;
            repo.name = fresh.name;
          } catch {
          }
        }
      }
      return value;
    } catch (caught) {
      const error = caught;
      if (error.code === "ENOENT") return { version: 1, repositories: [], installs: [] };
      throw failure("\u4ED3\u5E93\u72B6\u6001\u6587\u4EF6\u635F\u574F\u6216\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u4FDD\u7559\u6587\u4EF6\u5E76\u4FEE\u590D\u540E\u91CD\u8BD5", "error.repo.state");
    }
  }
  async function write(value, allowShrink = false, deleteCommit, compact = false) {
    validateStoredState(value);
    const indent = compact ? void 0 : 2;
    const text = JSON.stringify(value, null, indent);
    const bytes = Buffer.byteLength(text, "utf8");
    const currentBytes = allowShrink ? await currentStateBytes() : 0;
    const commitBytes = deleteCommit ? Buffer.byteLength(JSON.stringify(deleteCommit, null, indent), "utf8") : Infinity;
    if (bytes > STATE_READ_LIMIT || bytes > STATE_LIMIT && !(allowShrink && (bytes < currentBytes || deleteCommit && commitBytes < currentBytes))) throw failure("\u5B89\u88C5\u6765\u6E90\u72B6\u6001\u8D85\u8FC7 16 MiB\u3002\u8BF7\u5148\u6E05\u7406\u4E0D\u9700\u8981\u7684\u56DE\u6536\u8BB0\u5F55\u6216\u65E7\u8EAB\u4EFD\uFF0C\u4ECD\u6709\u6548\u7684\u5B89\u88C5\u526F\u672C\u4F1A\u4FDD\u7559\u3002", "error.repo.capacity");
    await fs.mkdir(managerHomePath(), { recursive: true });
    if ((await fs.lstat(managerHomePath())).isSymbolicLink()) throw failure("\u4ED3\u5E93\u72B6\u6001\u76EE\u5F55\u4E0D\u80FD\u662F\u94FE\u63A5");
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
      await fs.rename(temporary, file);
      stateGeneration += 1;
      stateCache = void 0;
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async function currentStateBytes() {
    try {
      return (await fs.lstat(file)).size;
    } catch {
      return 0;
    }
  }
  let stateGeneration = 0;
  let stateCache;
  async function preloadedState() {
    if (stateCache && stateCache.generation === stateGeneration) return stateCache.value;
    const value = await read();
    stateCache = { generation: stateGeneration, value };
    return value;
  }
  function repository(data, id) {
    const repo = data.repositories.find((r) => r.id === id);
    if (!repo) throw failure("\u4ED3\u5E93\u4E0D\u5B58\u5728");
    parseRepositoryInput({ url: repo.url || `${repo.owner}/${repo.name}`, ref: repo.ref, subdirectory: repo.subdirectory });
    return repo;
  }
  async function cacheDirectory() {
    const dir = join(managerHomePath(), "repository-cache");
    if ((await fs.lstat(managerHomePath())).isSymbolicLink()) throw failure("\u7F13\u5B58\u76EE\u5F55\u4E0D\u80FD\u662F\u94FE\u63A5");
    await fs.mkdir(dir, { recursive: true });
    if ((await fs.lstat(dir)).isSymbolicLink()) throw failure("\u7F13\u5B58\u76EE\u5F55\u4E0D\u80FD\u662F\u94FE\u63A5");
    return dir;
  }
  async function pruneCache(repo) {
    const dir = await cacheDirectory();
    const keepDir = `${repo.id}-${repo.commit}`;
    const now = Date.now();
    for (const name of await fs.readdir(dir)) {
      if (name.startsWith(".stage-" + repo.id + "-") || name.startsWith(repo.id + "-") && name !== keepDir) {
        await fs.rm(join(dir, name), { recursive: true, force: true }).catch(() => void 0);
      } else if (name.startsWith(".stage-")) {
        try {
          const st = await fs.stat(join(dir, name));
          if (now - st.mtimeMs > 36e5) {
            await fs.rm(join(dir, name), { recursive: true, force: true }).catch(() => void 0);
          }
        } catch {
        }
      }
    }
  }
  async function download(repo, path) {
    const dir = await cacheDirectory();
    const repoDir = join(dir, `${repo.id}-${repo.commit}`);
    const info = await fs.lstat(repoDir).catch(() => null);
    if (!info || !info.isDirectory() || info.isSymbolicLink()) throw failure("\u4ED3\u5E93\u7F13\u5B58\u7F3A\u5931\u6216\u5DF2\u5931\u6548\uFF0C\u8BF7\u5237\u65B0\u8BE5\u4ED3\u5E93\u540E\u91CD\u8BD5");
    const result = /* @__PURE__ */ Object.create(null);
    const targetBase = path ? join(repoDir, path) : repoDir;
    const prefix = path ? `${path}/` : "";
    async function readDir(curr, relPrefix = "") {
      const items = await fs.readdir(curr, { withFileTypes: true });
      for (const item of items) {
        safePath(item.name);
        const full = join(curr, item.name);
        const rel = relPrefix ? `${relPrefix}/${item.name}` : item.name;
        if (item.isDirectory()) {
          await readDir(full, rel);
        } else if (item.isFile()) {
          const fileInfo = await fs.lstat(full);
          if (fileInfo.isSymbolicLink() || fileInfo.size > 32 << 20) throw failure("\u4ED3\u5E93\u6587\u4EF6\u8FC7\u5927");
          result[prefix + rel] = await fs.readFile(full);
        }
      }
    }
    await readDir(targetBase);
    return result;
  }
  async function preparedEntries(repo, skill, path) {
    const archive = await download(repo, path), prefix = path ? `${path}/` : "";
    const document = archive[prefix + "SKILL.md"];
    if (!document || hash(document) !== skill.documentHash) throw failure("\u4ED3\u5E93\u6280\u80FD\u5185\u5BB9\u4E0E\u626B\u63CF\u7248\u672C\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u91CD\u65B0\u5237\u65B0");
    const entries = Object.entries(archive).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => ({ path: p.slice(prefix.length), data: Buffer.from(bytes).toString("base64") }));
    if (!entries.some((e) => e.path === "SKILL.md")) throw failure("\u4ED3\u5E93\u6280\u80FD\u5185\u5BB9\u5DF2\u5931\u6548");
    return entries;
  }
  async function scanSkillsFromDirectory(dir, subdirectory = "", repoName = "") {
    const skills = [];
    const entries = [];
    async function walk(current, prefix = "") {
      const list2 = await fs.readdir(current, { withFileTypes: true });
      for (const item of list2) {
        const rel = prefix ? `${prefix}/${item.name}` : item.name;
        safePath(item.name);
        if (item.isDirectory()) {
          entries.push({ relPath: rel, isDir: true });
          await walk(join(current, item.name), rel);
        } else if (item.isFile()) {
          entries.push({ relPath: rel, isDir: false });
        }
      }
    }
    await walk(dir);
    for (const entry of entries) {
      if (entry.isDir || entry.relPath !== "SKILL.md" && !entry.relPath.endsWith("/SKILL.md")) continue;
      const directory = entry.relPath === "SKILL.md" ? "" : entry.relPath.slice(0, -9);
      if (subdirectory && directory !== subdirectory && !directory.startsWith(`${subdirectory}/`)) continue;
      const skillMdPath = join(dir, entry.relPath);
      const bytes = await fs.readFile(skillMdPath);
      if (bytes.length > 256 << 10 || skills.length >= 500) throw failure("\u4ED3\u5E93\u6280\u80FD\u6570\u91CF\u6216\u8BF4\u660E\u957F\u5EA6\u8D85\u9650");
      const parsed = parseSkillDoc(bytes.toString("utf8"));
      const name = String(parsed.map.name || "");
      const description = String(parsed.map.description || "");
      const prefix = directory ? directory + "/" : "";
      const skillFiles = entries.filter((e) => !e.isDir && (directory ? e.relPath.startsWith(prefix) : true)).map((e) => e.relPath.slice(prefix.length));
      if (skillFiles.length > 1e3) throw failure("\u6280\u80FD\u6587\u4EF6\u6570\u91CF\u8D85\u9650");
      const digests = [];
      let skillTotalBytes = 0;
      for (const fileRel of skillFiles) {
        safePath(fileRel);
        const filePath = join(dir, prefix + fileRel);
        const st = await fs.lstat(filePath);
        if (st.isSymbolicLink() || !st.isFile()) continue;
        if (st.size > 32 << 20) throw failure("\u6280\u80FD\u6587\u4EF6\u8FC7\u5927");
        skillTotalBytes += st.size;
        if (skillTotalBytes > 64 << 20) throw failure("\u6280\u80FD\u5927\u5C0F\u8D85\u9650");
        const fileBytes = await fs.readFile(filePath);
        digests.push({ path: fileRel, hash: hash(fileBytes) });
      }
      digests.sort((a, b) => a.path.localeCompare(b.path, "en"));
      skills.push({
        path: directory,
        files: digests,
        name: name || directory.split("/").pop() || repoName,
        description,
        body: parsed.body.trim(),
        // 扫描时顺手给出简介/正文的近似 token 数；简介对齐宿主 500 字符硬截断规则。
        descriptionTokens: estimateTokens(truncateCatalogDescription(description)),
        bodyTokens: estimateTokens(parsed.body.trim()),
        documentHash: hash(bytes),
        valid: parsed.hasFrontmatter && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name) && name.length <= 100 && !!description
      });
    }
    return skills;
  }
  async function matches(record, fingerprint = signature(record.files), registered = registeredWorkspaces?.(), indexed) {
    try {
      safePath(record.name);
      const rootPath = (await resolveInstallRoot(record, registered, indexed)).path;
      return signature(fileIndex(await readSkillTree(join(rootPath, record.name)))) === fingerprint;
    } catch {
      return false;
    }
  }
  async function absentTrashPath(path) {
    try {
      await fs.lstat(path);
      return false;
    } catch (error) {
      return error.code === "ENOENT";
    }
  }
  async function deleteRolledBack(error, trashId, record, fingerprint, indexed) {
    if (!isSafeDeleteFailure(error)) return false;
    if (!await absentTrashPath(join(trashRootPath(), trashId))) return false;
    if (!await absentTrashPath(join(trashRootPath(), `.stage-${trashId}`))) return false;
    return matches(record, fingerprint, registeredWorkspaces?.(), indexed);
  }
  async function recoverTrashDeletes(loaded) {
    const data = loaded ?? await read();
    if (!data.pendingTrashDeletes?.length) return;
    for (const pending of data.pendingTrashDeletes) {
      let exists;
      try {
        await fs.lstat(join(trashRootPath(), pending.id));
        exists = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        exists = false;
      }
      if (exists) {
        data.installs.push(...pending.installs);
        (data.catalogInstalls ||= []).push(...pending.catalogInstalls);
      }
    }
    delete data.pendingTrashDeletes;
    await write(data, true, void 0, true);
  }
  async function hasRestoreReceipt(record) {
    try {
      const receipt = join(trashRootPath(), `.restored-${record.trashId}`);
      const directory = await fs.lstat(receipt), file2 = await fs.lstat(join(receipt, "metadata.json"));
      if (!directory.isDirectory() || directory.isSymbolicLink() || !file2.isFile() || file2.isSymbolicLink() || file2.size > 32 << 10) return false;
      const metadata = JSON.parse(await fs.readFile(join(receipt, "metadata.json"), "utf8"));
      return metadata.id === record.trashId && metadata.name === record.name && (record.workspace ? metadata.root?.scope === "project" && metadata.root.projectRoot === record.workspace : (metadata.root?.scope === "user" || metadata.root?.scope === "preset") && metadata.root.key === (record.root || "dsh")) && ("path" in record ? metadata.repository?.id === record.id && metadata.repository.path === record.path : Array.isArray(metadata.catalog) && metadata.catalog.includes(record.id)) && metadata.entries?.length === 1 && metadata.entries[0] === record.name;
    } catch {
      return false;
    }
  }
  async function recoverPending(loaded) {
    catalogWarnings = [];
    const data = loaded ?? await read();
    let recovered = false;
    const recoveredCatalogIds = [];
    const recoveredInstallIds = [];
    const restoredIds = [];
    const registered = requestIndex().registered;
    for (const record of data.installs.filter((item) => item.trashId && item.uninstallFingerprint && !item.restoreFingerprint)) {
      const id = record.trashId;
      const occupied = data.installs.some((other) => other !== record && !other.trashId && (other.root || "dsh") === (record.root || "dsh") && (other.workspace ?? null) === (record.workspace ?? null) && other.name.toLowerCase() === record.name.toLowerCase());
      if (!occupied && await absentTrashPath(join(trashRootPath(), id)) && await absentTrashPath(join(trashRootPath(), `.stage-${id}`)) && await matches(record, record.uninstallFingerprint, registered, await indexedFor(record))) {
        delete record.trashId;
        delete record.uninstallFingerprint;
        for (const item of catalogRecords(data).filter((item2) => item2.trashId === id)) delete item.trashId;
        recovered = true;
        recoveredInstallIds.push(`${record.id}:${record.path}`);
      }
    }
    for (const record of data.installs.filter((record2) => !record2.complete && !record2.trashId)) {
      if (await matches(record, signature(record.files), registered, await indexedFor(record))) {
        record.complete = true;
        recovered = true;
        recoveredInstallIds.push(`${record.id}:${record.path}`);
      }
    }
    for (const record of data.installs.filter((record2) => record2.trashId && record2.restoreFingerprint)) {
      if (await hasRestoreReceipt(record) && await matches(record, record.restoreFingerprint, registered, await indexedFor(record))) {
        restoredIds.push(record.trashId);
        delete record.trashId;
        delete record.restoreFingerprint;
        delete record.uninstallFingerprint;
        recovered = true;
      }
    }
    for (const record of catalogRecords(data)) {
      if (record.complete === false && !record.trashId && record.files?.length && record.root) {
        if (await catalogMatches(record, signature(record.files))) {
          try {
            const root = await resolveInstallRoot(record, registered, await indexedFor(record));
            await enableCatalog(root, record.name, true);
            record.complete = true;
            recovered = true;
            recoveredCatalogIds.push(record.id);
          } catch {
            catalogWarnings.push({ id: record.id, code: "error.repo.installState", error: "\u6280\u80FD\u6587\u4EF6\u548C\u5B89\u88C5\u610F\u56FE\u5DF2\u4FDD\u7559\uFF0C\u542F\u7528\u7B56\u7565\u6682\u65F6\u4E0D\u53EF\u5199\uFF1B\u4FEE\u590D\u7B56\u7565\u540E\u91CD\u8BD5" });
          }
        }
      }
    }
    for (const record of catalogRecords(data).filter((record2) => record2.root && record2.trashId && record2.restoreFingerprint)) {
      if (await hasRestoreReceipt(record) && await catalogMatches(record, record.restoreFingerprint)) {
        restoredIds.push(record.trashId);
        delete record.trashId;
        delete record.restoreFingerprint;
        recovered = true;
      }
    }
    if (recovered) {
      try {
        await write(data, true);
      } catch {
        for (const id of [.../* @__PURE__ */ new Set([...recoveredCatalogIds, ...restoredIds, ...recoveredInstallIds])]) catalogWarnings.push({ id, code: "error.repo.installState", error: "\u6280\u80FD\u6587\u4EF6\u5DF2\u4FDD\u7559\uFF0C\u6062\u590D\u786E\u8BA4\u6682\u65F6\u65E0\u6CD5\u5199\u5165\uFF1B\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u8BD5" });
        return;
      }
      for (const id of restoredIds) await fs.rm(join(trashRootPath(), `.restored-${id}`), { recursive: true, force: true }).catch(() => void 0);
    }
  }
  async function list() {
    const data = await read();
    const presetRoots = await fetchPresetRoots();
    const local = await state({ presetRoots });
    const skills = local.roots.filter((r) => !(r.kind === "preset" && r.mutable === false)).flatMap((r) => r.skills || []);
    const matched = /* @__PURE__ */ new Map();
    const present = /* @__PURE__ */ new Set();
    const registered = requestIndex().registered;
    for (const record of data.installs.filter((record2) => record2.complete && !record2.trashId)) {
      try {
        const files = fileIndex(await readSkillTree(join((await resolveInstallRoot(record, registered, await indexedFor(record), presetRoots)).path, record.name)));
        present.add(record);
        matched.set(record, signature(files) === signature(record.files));
      } catch {
      }
    }
    const activeCatalogIds = [];
    const catalogCopies2 = [];
    for (const record of catalogRecords(data).filter((record2) => record2.root && record2.complete !== false && !record2.trashId)) {
      try {
        const root = await resolveInstallRoot(record, registered, await indexedFor(record), presetRoots);
        const files = await readSkillTree(join(root.path, record.name));
        if (files["SKILL.md"]) {
          if (!activeCatalogIds.includes(record.id)) activeCatalogIds.push(record.id);
          catalogCopies2.push({ id: record.id, name: record.name, installedRoot: record.root || "dsh", ...record.workspace !== void 0 ? { installedWorkspace: record.workspace } : {}, canUninstall: true });
        }
      } catch {
      }
    }
    return {
      installRoots: await repositoryDestinations(presetRoots),
      catalogInstalls: activeCatalogIds,
      catalogCopies: catalogCopies2,
      catalogUnknownIds: [...new Set((data.catalogInstalls || []).flatMap((record) => typeof record === "string" ? [record] : !record.root && !record.trashId ? [record.id] : []))].filter((id) => !activeCatalogIds.includes(id)),
      catalogWarnings: [...catalogWarnings],
      repositories: data.repositories.map((repo) => ({ ...repo, skills: repo.skills.map((skill) => {
        const found = skills.some((s) => s.name.toLowerCase() === skill.name.toLowerCase() || s.declaredName?.toLowerCase() === skill.name.toLowerCase());
        const { body, ...summary } = skill;
        const installations = data.installs.filter((i) => i.id === repo.id && i.path === skill.path && i.name === skill.name && i.complete && !i.trashId).flatMap((record) => {
          const tracked = present.has(record);
          if (!tracked) return [];
          const updateAvailable = !!skill.files && signature(record.files) !== signature(skill.files);
          return [{
            installedRoot: record.root || "dsh",
            ...record.workspace !== void 0 ? { installedWorkspace: record.workspace } : {},
            tracked,
            updateAvailable,
            canRollback: !!record.backup,
            canUninstall: true,
            status: !skill.valid ? "invalid" : matched.get(record) ? updateAvailable ? "update" : "installed" : "conflict"
          }];
        });
        const legacy = installations.find((item) => item.tracked);
        return {
          ...summary,
          installations,
          updateAvailable: legacy?.updateAvailable ?? false,
          canRollback: legacy?.canRollback ?? false,
          tracked: !!legacy,
          installedRoot: legacy?.installedRoot ?? null,
          installedWorkspace: legacy?.installedWorkspace ?? null,
          canUninstall: !!legacy,
          status: !skill.valid ? "invalid" : legacy?.status ?? (found ? "conflict" : "available")
        };
      }) }))
    };
  }
  function catalogRecords(data) {
    return (data.catalogInstalls || []).filter((record) => typeof record !== "string");
  }
  const locationKey = (record) => JSON.stringify([
    record.root,
    record.workspace === void 0 ? null : process.platform === "win32" ? resolve(record.workspace).toLowerCase() : resolve(record.workspace),
    record.name
  ]);
  async function catalogLocation(input = {}) {
    if (input.workspace !== void 0) {
      if (input.root !== void 0 && input.root !== "dsh") throw failure("\u5DE5\u4F5C\u533A\u53EA\u80FD\u5B89\u88C5\u5230\u9879\u76EE DSH skills");
      const target = await resolveWorkspaceTarget(input.workspace, requestIndex().registered);
      if ("ok" in target && target.ok === false) throw failure(target.error, target.code, target.params);
      return { root: "dsh", workspace: target.root.projectRoot };
    }
    const presetRoots = await fetchPresetRoots();
    return { root: repositoryInstallRoot(input.root, presetRoots).key };
  }
  async function enableCatalog(root, name, respectDisabled = false) {
    try {
      if (respectDisabled) {
        const current = await readManagerState();
        if (!current.writable) throw new Error("\u542F\u7528\u7B56\u7565\u4E0D\u53EF\u5199");
        if (current.state.disabledSkills[root.key]?.includes(name)) return;
      }
      if (root.toggleable !== false && root.kind !== "preset") {
        const result = await setSkillEnabled(root, name, true, log);
        if (result && "ok" in result && result.ok === false) throw new Error(result.error);
      }
    } catch {
      throw Object.assign(failure("\u6280\u80FD\u6587\u4EF6\u548C\u5B89\u88C5\u610F\u56FE\u5DF2\u4FDD\u7559\uFF0C\u542F\u7528\u72B6\u6001\u65E0\u6CD5\u5199\u5165\uFF1B\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u65B0\u6253\u5F00\u53D1\u73B0\u9875", "error.repo.installState"), { statusCode: 500 });
    }
  }
  async function catalogMatches(record, fingerprint) {
    try {
      const presetRoots = await fetchPresetRoots();
      const root = await recordInstallRoot(record, requestIndex().registered, await indexedFor(record), presetRoots);
      return signature(fileIndex(await readSkillTree(join(root.path, record.name)))) === fingerprint;
    } catch {
      return false;
    }
  }
  function catalogCopies(data, root, name) {
    const target = { root: root.scope === "project" ? "dsh" : root.key, workspace: root.projectRoot, name };
    return catalogRecords(data).filter((record) => record.root && !record.trashId && locationKey(record) === locationKey(target));
  }
  async function restoreCatalogTrash(id, options) {
    const metadata = (await listTrash()).find((item) => item.id === id);
    const data = await read();
    const records = catalogRecords(data).filter((record) => record.trashId === id && metadata?.catalog?.includes(record.id));
    if (!records.length) return restoreSkillTrash(id, log, options);
    for (const record of records) {
      if (metadata.name !== record.name || (record.workspace ? metadata.root?.projectRoot !== record.workspace || metadata.root.scope !== "project" : metadata.root?.scope !== "user" && metadata.root?.scope !== "preset" || metadata.root.key !== record.root)) throw failure("\u56DE\u6536\u7AD9\u6765\u6E90\u4E0E\u76EE\u5F55\u8EAB\u4EFD\u4E0D\u4E00\u81F4");
      record.restoreFingerprint = signature(fileIndex(await readSkillTree(join(trashRootPath(), id, record.name))));
    }
    await write(data);
    const result = await restoreSkillTrash(id, log, { ...options, repositoryRestore: true });
    if ("ok" in result && result.ok === false) {
      for (const record of records) delete record.restoreFingerprint;
      await write(data);
      return result;
    }
    for (const record of records) {
      delete record.trashId;
      delete record.restoreFingerprint;
    }
    try {
      await write(data);
    } catch {
      throw failure("\u6280\u80FD\u5DF2\u6062\u590D\uFF0C\u76EE\u5F55\u8EAB\u4EFD\u7B49\u5F85\u6821\u9A8C\uFF1B\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u65B0\u6253\u5F00\u53D1\u73B0\u9875", "error.repo.installState");
    }
    await fs.rm(join(trashRootPath(), `.restored-${id}`), { recursive: true, force: true });
    return result;
  }
  const refreshVersions = /* @__PURE__ */ new Map();
  return {
    installCatalog: (id, pack, target = {}) => serialize(async () => {
      const presetRoots = await fetchPresetRoots();
      const location = await catalogLocation(target);
      const root = await recordInstallRoot(location, requestIndex().registered, await indexedFor(location), presetRoots);
      const data = await read();
      const previousCatalog = data.catalogInstalls;
      let intent;
      let reusedLegacy = false;
      await recordInstallRoot(location, requestIndex().registered, void 0, presetRoots);
      const imported = await importUploadedSkill(pack, log, {
        conflict: "skip",
        root,
        beforeImport: async (pending, conflicts, failed) => {
          const legacy = (data.catalogInstalls || []).some((record) => typeof record === "string" ? record === id : record.id === id && !record.root);
          const candidate = pending.length === 1 && !conflicts.length ? pending[0] : !pending.length && conflicts.length === 1 && legacy ? { ...conflicts[0], isDir: conflicts[0].isDir } : void 0;
          if (!candidate?.isDir || failed.length) throw failure("\u76EE\u5F55\u5B89\u88C5\u5FC5\u987B\u662F\u5355\u4E2A\u5B8C\u6574\u6280\u80FD\uFF0C\u4E14\u4E0D\u80FD\u8986\u76D6\u5DF2\u6709\u526F\u672C", "error.repo.conflict");
          const files = fileIndex(await readSkillTree(candidate.source));
          if (!files.some((file2) => file2.path === "SKILL.md")) throw failure("\u76EE\u5F55\u5B89\u88C5\u5305\u7F3A\u5C11 SKILL.md", "error.catalog.response");
          if (conflicts.length) {
            const local = fileIndex(await readSkillTree(join(root.path, candidate.name)));
            if (signature(local) !== signature(files)) throw failure("\u65E7\u5B89\u88C5\u5185\u5BB9\u4E0E\u76EE\u5F55\u5305\u4E0D\u4E00\u81F4\uFF0C\u4E0D\u4F1A\u8986\u76D6\u6216\u731C\u6D4B\u8EAB\u4EFD", "error.repo.conflict");
            reusedLegacy = true;
          }
          intent = { id, name: candidate.name, ...location, complete: false, files };
          data.catalogInstalls = (data.catalogInstalls || []).filter((record) => typeof record === "string" ? record !== id : record.trashId || (record.root ? locationKey(record) !== locationKey(intent) : record.id !== id));
          data.catalogInstalls.push(intent);
          try {
            await write(data);
          } catch (caught) {
            if (caught.code === "error.repo.capacity") throw caught;
            throw failure("\u5B89\u88C5\u610F\u56FE\u65E0\u6CD5\u5199\u5165\uFF0C\u672A\u590D\u5236\u6280\u80FD\u6587\u4EF6", "error.repo.installState");
          }
        }
      });
      const completedName = reusedLegacy ? imported.skipped?.length === 1 ? imported.skipped[0].name : void 0 : imported.imported?.length === 1 ? imported.imported[0].name : void 0;
      if (imported.ok === false || !intent || completedName !== intent.name) {
        if (intent) {
          data.catalogInstalls = previousCatalog;
          try {
            await write(data);
          } catch {
            throw failure("\u5B89\u88C5\u672A\u5B8C\u6210\u4E14\u8EAB\u4EFD\u610F\u56FE\u65E0\u6CD5\u64A4\u9500\uFF0C\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u8BD5", "error.repo.installState");
          }
        }
        throw Object.assign(failure(imported.error || "\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728\uFF0C\u4E0D\u4F1A\u8986\u76D6\u672C\u5730\u6587\u4EF6", imported.code || "error.repo.conflict", imported.params), { statusCode: imported.code === "error.repo.installState" ? 500 : imported.code === "error.repo.capacity" ? 413 : 409 });
      }
      await enableCatalog(root, intent.name);
      intent.complete = true;
      try {
        await write(data);
      } catch {
        throw Object.assign(failure("\u6280\u80FD\u6587\u4EF6\u5DF2\u5B89\u88C5\u4F46\u8EAB\u4EFD\u672A\u786E\u8BA4\uFF1B\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u65B0\u6253\u5F00\u53D1\u73B0\u9875", "error.repo.installState"), { statusCode: 500 });
      }
      return { name: intent.name, root: root.path };
    }),
    list: () => serialize(list),
    trashSkill: (root, name) => serialize(async () => {
      const data = await read();
      const records = root ? catalogCopies(data, root, name) : [];
      if (!records.length) return deleteSkill(root, name, log);
      const id = `${Date.now()}-${randomUUID()}`;
      for (const record of records) record.trashId = id;
      await write(data);
      try {
        const result = await deleteSkill(root, name, log, { catalogTrash: { id, ids: records.map((record) => record.id) } });
        if ("ok" in result && result.ok === false) {
          for (const record of records) delete record.trashId;
          await write(data);
        }
        return result;
      } catch (error) {
        if (!(await listTrash()).some((item) => item.id === id)) {
          for (const record of records) delete record.trashId;
          await write(data);
        }
        throw error;
      }
    }, false),
    permanentlyDeleteTrash: (id) => serialize(async () => {
      const data = await read();
      const installs = data.installs.filter((record) => record.trashId === id);
      const catalogInstalls = catalogRecords(data).filter((record) => record.trashId === id);
      const hasIdentity = installs.length > 0 || catalogInstalls.length > 0;
      if (hasIdentity) {
        data.pendingTrashDeletes = [...(data.pendingTrashDeletes || []).filter((pending) => pending.id !== id), { id, installs, catalogInstalls }];
        data.installs = data.installs.filter((record) => record.trashId !== id);
        data.catalogInstalls = (data.catalogInstalls || []).filter((record) => typeof record === "string" || record.trashId !== id);
        const afterCommit = data.pendingTrashDeletes.filter((pending) => pending.id !== id);
        const commit = { ...data, pendingTrashDeletes: afterCommit };
        if (!afterCommit.length) delete commit.pendingTrashDeletes;
        await write(data, true, commit, true);
      }
      const rollback = async (original) => {
        if (!hasIdentity) return;
        try {
          await recoverTrashDeletes();
        } catch (rollbackError) {
          throw new Error(`\u6C38\u4E45\u5220\u9664\u5931\u8D25\uFF0C\u4E14\u6765\u6E90\u8EAB\u4EFD\u56DE\u6EDA\u672A\u5B8C\u6210\uFF1B\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u8BD5\u3002\u539F\u59CB\u9519\u8BEF\uFF1A${original?.message ?? original}`, { cause: rollbackError });
        }
      };
      let result;
      try {
        result = await permanentlyDeleteTrash(id, log);
      } catch (error) {
        await rollback(error);
        throw error;
      }
      if ("ok" in result && result.ok === false) {
        await rollback(result.error);
        return result;
      }
      if (hasIdentity) {
        const remaining = data.pendingTrashDeletes.filter((pending) => pending.id !== id);
        if (remaining.length) data.pendingTrashDeletes = remaining;
        else delete data.pendingTrashDeletes;
        await write(data, true, void 0, true);
      }
      return result;
    }, false),
    rememberCatalogInstall: (id, name, target = {}) => serialize(async () => {
      const location = await catalogLocation(target);
      const record = { id, name, ...location };
      const data = await read();
      data.catalogInstalls = (data.catalogInstalls || []).filter((item) => typeof item === "string" || item.trashId || item.id !== id || locationKey(item) !== locationKey(record));
      data.catalogInstalls.push(record);
      await write(data);
      return { catalogInstalls: catalogRecords(data).map((record2) => record2.id) };
    }, false),
    forgetCatalogInstall: (target) => serialize(async () => {
      if (!target || typeof target !== "object") throw failure("\u6E05\u7406\u76EE\u5F55\u8EAB\u4EFD\u5FC5\u987B\u6307\u5B9A\u5B89\u88C5\u526F\u672C\u6216\u65E7\u8EAB\u4EFD ID");
      if ("legacyId" in target) {
        if (typeof target.legacyId !== "string" || !/^(?:clawhub|skillsh):[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){1,2}$/.test(target.legacyId)) throw failure("\u6E05\u7406\u65E7\u76EE\u5F55\u8EAB\u4EFD\u5FC5\u987B\u6307\u5B9A\u6709\u6548 ID");
        const data2 = await read();
        data2.catalogInstalls = (data2.catalogInstalls || []).filter((record) => typeof record === "string" ? record !== target.legacyId : record.root || record.trashId || record.id !== target.legacyId);
        await write(data2, true);
        return { catalogInstalls: catalogRecords(data2).map((record) => record.id) };
      }
      if (typeof target.name !== "string") throw failure("\u6E05\u7406\u76EE\u5F55\u8EAB\u4EFD\u5FC5\u987B\u6307\u5B9A\u5B89\u88C5\u526F\u672C");
      const location = await catalogLocation(target);
      const data = await read();
      data.catalogInstalls = (data.catalogInstalls || []).filter((record) => typeof record === "string" || record.trashId || !record.root || locationKey(record) !== locationKey({ ...location, name: target.name }) || target.id !== void 0 && record.id !== target.id);
      await write(data, true);
      return { catalogInstalls: catalogRecords(data).map((record) => record.id) };
    }, false),
    ...createRepositoryUpdater({ read, write, repository, download, serialize, parseRepositoryInput, registeredWorkspaces, onWorkspaceIndexBuild, getPresetRoots }),
    add: async (input) => {
      const source = parseRepositoryInput(input);
      const shouldProbe = !gitFetch && defaultProbe && input.skipProbe !== true && process.env.DSH_SKILLS_MANAGER_SKIP_PROBE !== "1";
      if (shouldProbe) {
        await probeGitRemote(source.url || `https://github.com/${source.owner}/${source.name}.git`);
      }
      return serialize(async () => {
        const data = await read();
        const id = createHash("sha256").update(JSON.stringify(source)).digest("hex").slice(0, 24);
        if (data.repositories.some((r) => r.id === id)) throw failure("\u8BE5\u4ED3\u5E93\u5DF2\u6DFB\u52A0");
        if (data.repositories.length >= 30) throw failure("\u6700\u591A\u6DFB\u52A0 30 \u4E2A\u4ED3\u5E93");
        const repo = { ...source, id, skills: [], commit: null, refreshedAt: null, error: null };
        data.repositories.push(repo);
        await write(data);
        return repo;
      }, false);
    },
    remove: ({ id }) => serialize(async () => {
      const data = await read();
      const repo = repository(data, id);
      for (const record of data.installs.filter((i) => i.id === id)) record.source ||= { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory, ...repo.url ? { url: repo.url } : {} };
      data.repositories = data.repositories.filter((r) => r.id !== id);
      await write(data);
      refreshVersions.set(id, (refreshVersions.get(id) || 0) + 1);
      try {
        const dir = await cacheDirectory();
        for (const name of await fs.readdir(dir)) {
          if (name.startsWith(id + "-") || name.startsWith(".stage-" + id + "-")) {
            await fs.rm(join(dir, name), { recursive: true, force: true }).catch(() => void 0);
          }
        }
      } catch {
      }
      return { id };
    }, false),
    refresh: async ({ id }) => {
      const { repo, version } = await serialize(async () => {
        const repo2 = { ...repository(await read(), id) };
        const version2 = (refreshVersions.get(id) || 0) + 1;
        refreshVersions.set(id, version2);
        return { repo: repo2, version: version2 };
      }, false);
      let commit = null;
      let skills = [];
      let scanError = null;
      const dir = await cacheDirectory();
      const stageDir = join(dir, `.stage-${repo.id}-${randomUUID()}`);
      try {
        if (gitFetch) {
          const res = await gitFetch(repo, stageDir, { maxBytes: maxRepositoryBytes, maxTransientBytes, timeoutMs: gitTimeoutMs });
          commit = res.commit;
          skills = await scanSkillsFromDirectory(stageDir, repo.subdirectory, repo.name);
        } else {
          const res = await fetchGitRepository(repo, stageDir, { maxBytes: maxRepositoryBytes, maxTransientBytes, timeoutMs: gitTimeoutMs });
          commit = res.commit;
          skills = await scanSkillsFromDirectory(stageDir, repo.subdirectory, repo.name);
        }
      } catch (caught) {
        const error = caught;
        scanError = { code: error.code || "error.repo.invalid", error: error.message };
      }
      return serialize(async () => {
        const data = await read(), current = repository(data, id);
        if (refreshVersions.get(id) !== version) {
          await fs.rm(stageDir, { recursive: true, force: true }).catch(() => void 0);
          return current;
        }
        if (["owner", "name", "ref", "subdirectory", "url"].some((key) => current[key] !== repo[key])) {
          await fs.rm(stageDir, { recursive: true, force: true }).catch(() => void 0);
          throw failure("\u4ED3\u5E93\u6765\u6E90\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u5237\u65B0");
        }
        if (scanError) {
          await fs.rm(stageDir, { recursive: true, force: true }).catch(() => void 0);
          current.error = scanError;
        } else {
          if (await fs.stat(stageDir).then(() => true, () => false)) {
            const targetDir = join(dir, `${current.id}-${commit}`);
            await fs.rm(targetDir, { recursive: true, force: true }).catch(() => void 0);
            await fs.rename(stageDir, targetDir);
          }
          Object.assign(current, { skills, commit, refreshedAt: (/* @__PURE__ */ new Date()).toISOString(), error: null });
        }
        await write(data);
        if (!current.error) {
          try {
            await pruneCache(current);
          } catch (caught) {
            const error = caught;
            if (log) await log("repository.cache.cleanup.failed", { repository: current.id, error: error.message });
            else console.warn("\u4ED3\u5E93\u65E7\u7F13\u5B58\u672A\u6E05\u7406\uFF1A" + error.message);
          }
        }
        return current;
      }, false);
    },
    detail: async ({ id, path }) => {
      const repo = repository(await read(), id), skill = repo.skills.find((s) => s.path === path);
      if (!skill) throw failure("\u6280\u80FD\u4E0D\u5728\u4ED3\u5E93\u5217\u8868\u4E2D");
      return {
        ...skill,
        descriptionTokens: skill.descriptionTokens ?? (skill.description ? estimateTokens(truncateCatalogDescription(skill.description)) : 0),
        bodyTokens: skill.bodyTokens ?? (skill.body ? estimateTokens(skill.body) : 0),
        commit: repo.commit
      };
    },
    restoreTrash: (id, options = {}) => serialize(async () => {
      const metadata = (await listTrash()).find((item) => item.id === id);
      if (!metadata?.repository && !metadata?.catalog?.length) return restoreSkillTrash(id, log, options);
      await recoverTrashDeletes();
      if (metadata?.catalog?.length && !metadata.repository) return restoreCatalogTrash(id, options);
      const data = await read();
      const record = data.installs.find((item) => item.trashId === id && item.id === metadata.repository.id && item.path === metadata.repository.path);
      if (!record) return restoreSkillTrash(id, log, options);
      if (metadata.name !== record.name || (record.workspace ? metadata.root?.scope !== "project" || metadata.root.projectRoot !== record.workspace : metadata.root?.scope !== "user" && metadata.root?.scope !== "preset" || metadata.root.key !== (record.root || "dsh")) || metadata.entries.length !== 1 || metadata.entries[0] !== record.name) throw failure("\u56DE\u6536\u7AD9\u6765\u6E90\u4E0E\u5B89\u88C5\u8BB0\u5F55\u4E0D\u4E00\u81F4");
      record.restoreFingerprint = signature(fileIndex(await readSkillTree(join(trashRootPath(), id, record.name))));
      const catalog = catalogRecords(data).filter((item) => item.trashId === id && metadata.catalog?.includes(item.id));
      for (const item of catalog) item.restoreFingerprint = record.restoreFingerprint;
      await write(data);
      const result = await restoreSkillTrash(id, log, { ...options, repositoryRestore: true });
      if ("ok" in result && result.ok === false) {
        delete record.restoreFingerprint;
        for (const item of catalog) delete item.restoreFingerprint;
        await write(data);
        return result;
      }
      delete record.trashId;
      delete record.restoreFingerprint;
      delete record.uninstallFingerprint;
      for (const item of catalog) {
        delete item.trashId;
        delete item.restoreFingerprint;
      }
      try {
        await write(data);
      } catch {
        throw failure("\u6280\u80FD\u5DF2\u6062\u590D\uFF0C\u6765\u6E90\u72B6\u6001\u7B49\u5F85\u6821\u9A8C\uFF1B\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u65B0\u6253\u5F00\u4ED3\u5E93\u9875", "error.repo.installState");
      }
      await fs.rm(join(trashRootPath(), `.restored-${id}`), { recursive: true, force: true }).catch(() => void 0);
      return result;
    }, false, false),
    uninstall: (input) => serialize(async () => {
      const { id, path } = input;
      const data = await read();
      const index = requestIndex();
      const presetRoots = await fetchPresetRoots();
      const record = await pickInstallRecord(data.installs, input, index.registered, "\u6CA1\u6709\u53EF\u8FFD\u6EAF\u7684\u5B89\u88C5\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u5378\u8F7D", presetRoots);
      const root = await resolveInstallRoot(record, index.registered, await indexedFor(record), presetRoots);
      const fingerprint = signature(fileIndex(await readSkillTree(join(root.path, record.name))));
      const trashId = `${Date.now()}-${randomUUID()}`;
      record.trashId = trashId;
      record.uninstallFingerprint = fingerprint;
      const catalog = catalogCopies(data, root, record.name);
      for (const item of catalog) item.trashId = trashId;
      await write(data);
      try {
        await resolveInstallRoot(record, index.registered, await indexedFor(record), presetRoots);
        const result = await deleteSkill(root, record.name, log, { repositoryEntryOnly: true, repositoryTrash: { id: trashId, repository: { id, path } }, ...catalog.length ? { catalogTrash: { id: trashId, ids: catalog.map((item) => item.id) } } : {} });
        if ("ok" in result && result.ok === false) throw failure(result.error, typeof result.code === "string" ? result.code : "error.repo.invalid", result.params);
        return result;
      } catch (error) {
        if (await deleteRolledBack(error, trashId, record, fingerprint, await indexedFor(record))) {
          delete record.trashId;
          delete record.uninstallFingerprint;
          for (const item of catalog) delete item.trashId;
          await write(data);
        }
        throw error;
      }
    }),
    // 批量安装：同一队列处理，并在复制前后分别持久化意图与结果。
    installMany: (input, registered) => serialize(async () => {
      const rawItems = Array.isArray(input?.items) ? input.items : [];
      if (!rawItems.length) throw failure("\u6279\u91CF\u5B89\u88C5\u9879\u4E3A\u7A7A", "error.repo.empty");
      if (rawItems.length > 1e3) throw failure("\u6279\u91CF\u5B89\u88C5\u9879\u8D85\u8FC7\u4E0A\u9650\uFF08\u6700\u591A 1000 \u9879\uFF09", "error.repo.tooMany");
      let root, workspaceRoot;
      let presetRoots;
      if (input.workspace !== void 0) {
        if (input.root !== void 0 && input.root !== "dsh") throw failure("\u5DE5\u4F5C\u533A\u53EA\u80FD\u5B89\u88C5\u5230\u9879\u76EE DSH skills");
        const target = await resolveWorkspaceTarget(input.workspace, registered);
        if ("ok" in target && target.ok === false) throw failure(target.error, target.code, target.params);
        root = target.root;
        workspaceRoot = root.projectRoot;
      } else {
        presetRoots = await fetchPresetRoots();
        root = await recordInstallRoot({ root: input.root }, registered, void 0, presetRoots);
      }
      const data = await read();
      const sameTarget = (await state({ projectCwds: workspaceRoot ? [workspaceRoot] : [], ...presetRoots ? { presetRoots } : {} })).roots.filter((item) => workspaceRoot ? item.projectRoot === workspaceRoot && item.kind === "project-dsh" : root.kind === "preset" ? item.key === root.key : item.scope !== "project");
      const taken = /* @__PURE__ */ new Set();
      for (const item of sameTarget) for (const entry of item.skills || []) {
        taken.add(entry.name.toLowerCase());
        if (entry.declaredName) taken.add(entry.declaredName.toLowerCase());
      }
      const results = new Array(rawItems.length);
      const prepared = [];
      const seen = /* @__PURE__ */ new Set();
      for (const [slot, raw] of rawItems.entries()) {
        const id = typeof raw?.id === "string" ? raw.id : "";
        const path = typeof raw?.path === "string" ? raw.path : "";
        const duplicate = JSON.stringify([id, path]);
        if (seen.has(duplicate)) {
          results[slot] = { id, path, ok: false, error: "\u91CD\u590D\u7684\u5B89\u88C5\u9879", code: "error.repo.duplicate" };
          continue;
        }
        seen.add(duplicate);
        try {
          const repo = repository(data, id);
          const skill = repo.skills.find((s) => s.path === path);
          if (!skill || !skill.valid) throw failure("\u6280\u80FD\u4E0D\u5B58\u5728\u6216\u683C\u5F0F\u65E0\u6548");
          const lowered = skill.name.toLowerCase();
          if (taken.has(lowered)) throw failure("\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728\uFF0C\u4E0D\u4F1A\u8986\u76D6\u672C\u5730\u6587\u4EF6", "error.repo.conflict");
          const entries = await preparedEntries(repo, skill, path);
          const record = { id, path, root: workspaceRoot ? "dsh" : root.key, ...workspaceRoot ? { workspace: workspaceRoot } : {}, source: { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory, ...repo.url ? { url: repo.url } : {} }, name: skill.name, commit: repo.commit, complete: false, files: entries.map((e) => ({ path: e.path, hash: hash(Buffer.from(e.data, "base64")) })) };
          data.installs = data.installs.filter((i) => i.trashId || !(i.name === skill.name && (i.workspace ?? null) === (workspaceRoot ?? null) && (i.root || "dsh") === (workspaceRoot ? "dsh" : root.key)));
          data.installs.push(record);
          prepared.push({ slot, id, path, name: skill.name, record, entries });
          taken.add(lowered);
        } catch (caught) {
          const error = caught;
          results[slot] = { id, path, ok: false, error: error.message, code: String(error.code || "error.repo.invalid"), params: error.params };
        }
      }
      if (prepared.length) await write(data);
      if (prepared.length) await resolveInstallRoot({ root: input.root, workspace: workspaceRoot }, registered, void 0, presetRoots);
      for (const item of prepared) {
        let copied = false;
        try {
          const result = await importUploadedSkill({ name: item.name, entries: item.entries }, log, { conflict: "skip", root });
          if (result.ok === false || !result.imported?.length) throw failure(result.error || "\u6280\u80FD\u5B89\u88C5\u5931\u8D25\u6216\u9047\u5230\u540C\u540D\u51B2\u7A81", typeof result.code === "string" ? result.code : "error.repo.conflict", result.params);
          copied = true;
          if (root.toggleable !== false && root.kind !== "preset") {
            const enabled = await setSkillEnabled(root, item.name, true, log);
            if (enabled && typeof enabled === "object" && "ok" in enabled && enabled.ok === false) throw failure(enabled.error || "\u6280\u80FD\u542F\u7528\u72B6\u6001\u65E0\u6CD5\u5199\u5165", typeof enabled.code === "string" ? enabled.code : "error.repo.enableState", enabled.params);
          }
          item.record.complete = true;
          results[item.slot] = { id: item.id, path: item.path, name: item.name, ok: true };
        } catch (caught) {
          const error = caught;
          data.installs = data.installs.filter((record) => record !== item.record);
          try {
            await write(data);
          } catch {
            throw failure("\u5B89\u88C5\u672A\u5B8C\u6210\u4E14\u6765\u6E90\u8BB0\u5F55\u65E0\u6CD5\u64A4\u9500\uFF0C\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u68C0\u67E5\u6280\u80FD\u76EE\u5F55", "error.repo.installState");
          }
          if (copied) await fs.rm(join(root.path, item.name), { recursive: true, force: true }).catch(() => void 0);
          results[item.slot] = { id: item.id, path: item.path, name: item.name, ok: false, error: error.message, code: String(error.code || "error.repo.invalid"), params: error.params };
        }
      }
      if (prepared.length) {
        try {
          await write(data);
        } catch {
          throw failure("\u6280\u80FD\u6587\u4EF6\u5DF2\u5B89\u88C5\u4F46\u6765\u6E90\u72B6\u6001\u672A\u786E\u8BA4\uFF0C\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u65B0\u6253\u5F00\u4ED3\u5E93\u9875", "error.repo.installState");
        }
      }
      return { results };
    }),
    // 批量卸载：同一队列逐项持久化意图并移入回收站。
    uninstallMany: (input, registered) => serialize(async () => {
      const rawItems = Array.isArray(input?.items) ? input.items : [];
      if (!rawItems.length) throw failure("\u6279\u91CF\u5378\u8F7D\u9879\u4E3A\u7A7A", "error.repo.empty");
      if (rawItems.length > 1e3) throw failure("\u6279\u91CF\u5378\u8F7D\u9879\u8D85\u8FC7\u4E0A\u9650\uFF08\u6700\u591A 1000 \u9879\uFF09", "error.repo.tooMany");
      const data = await read();
      const index = requestIndex();
      const presetRoots = await fetchPresetRoots();
      const results = new Array(rawItems.length);
      const prepared = [];
      const seen = /* @__PURE__ */ new Set();
      const selected = /* @__PURE__ */ new Set();
      for (const [slot, raw] of rawItems.entries()) {
        const id = typeof raw?.id === "string" ? raw.id : "";
        const entryPath = typeof raw?.path === "string" ? raw.path : "";
        let rootKey;
        let workspaceKey;
        const duplicate = JSON.stringify([id, entryPath, raw?.root ?? null, typeof raw?.workspace === "string" ? raw.workspace : null]);
        if (seen.has(duplicate)) {
          results[slot] = { id, path: entryPath, ok: false, error: "\u91CD\u590D\u7684\u5378\u8F7D\u9879", code: "error.repo.duplicate" };
          continue;
        }
        seen.add(duplicate);
        try {
          const request = { id, path: entryPath, ...raw?.root !== void 0 ? { root: raw.root } : {}, ...typeof raw?.workspace === "string" ? { workspace: raw.workspace } : {} };
          const record = await pickInstallRecord(data.installs, request, index.registered, "\u6CA1\u6709\u53EF\u8FFD\u6EAF\u7684\u5B89\u88C5\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u5378\u8F7D", presetRoots);
          if (selected.has(record)) throw failure("\u91CD\u590D\u7684\u5378\u8F7D\u9879", "error.repo.duplicate");
          selected.add(record);
          rootKey = record.root || "dsh";
          workspaceKey = record.workspace;
          const root = await resolveInstallRoot(record, index.registered, await indexedFor(record), presetRoots);
          const fingerprint = signature(fileIndex(await readSkillTree(join(root.path, record.name))));
          const trashId = `${Date.now()}-${randomUUID()}`;
          const catalog = catalogCopies(data, root, record.name);
          prepared.push({ slot, id, path: entryPath, record, root, fingerprint, trashId, catalog });
        } catch (caught) {
          const error = caught;
          results[slot] = { id, path: entryPath, ...rootKey ? { root: rootKey } : {}, ...workspaceKey ? { workspace: workspaceKey } : {}, ok: false, error: error.message, code: String(error.code || "error.repo.invalid"), params: error.params };
        }
      }
      for (const item of prepared) {
        try {
          item.record.trashId = item.trashId;
          item.record.uninstallFingerprint = item.fingerprint;
          for (const entry of item.catalog) entry.trashId = item.trashId;
          try {
            await write(data);
          } catch (error) {
            delete item.record.trashId;
            delete item.record.uninstallFingerprint;
            for (const entry of item.catalog) delete entry.trashId;
            throw error;
          }
          await resolveInstallRoot(item.record, index.registered, await indexedFor(item.record), presetRoots);
          const result = await deleteSkill(item.root, item.record.name, log, { repositoryEntryOnly: true, repositoryTrash: { id: item.trashId, repository: { id: item.id, path: item.path } }, ...item.catalog.length ? { catalogTrash: { id: item.trashId, ids: item.catalog.map((entry) => entry.id) } } : {} });
          if ("ok" in result && result.ok === false) throw result;
          results[item.slot] = { id: item.id, path: item.path, root: item.record.root || "dsh", ...item.record.workspace ? { workspace: item.record.workspace } : {}, ok: true };
        } catch (caught) {
          const error = caught;
          if (item.record.trashId && await deleteRolledBack(caught, item.record.trashId, item.record, item.fingerprint, await indexedFor(item.record))) {
            delete item.record.trashId;
            delete item.record.uninstallFingerprint;
            for (const entry of item.catalog) delete entry.trashId;
            await write(data);
          }
          results[item.slot] = { id: item.id, path: item.path, ...item.record.root ? { root: item.record.root } : {}, ...item.record.workspace ? { workspace: item.record.workspace } : {}, ok: false, error: error.message || caught?.error, code: String(error.code || "error.repo.invalid"), params: error.params };
        }
      }
      return { results };
    }),
    install: ({ id, path, root: requestedRoot, workspace }, registered) => serialize(async () => {
      let root, workspaceRoot;
      let presetRoots;
      if (workspace !== void 0) {
        if (requestedRoot !== void 0 && requestedRoot !== "dsh") throw failure("\u5DE5\u4F5C\u533A\u53EA\u80FD\u5B89\u88C5\u5230\u9879\u76EE DSH skills");
        const target = await resolveWorkspaceTarget(workspace, registered);
        if ("ok" in target && target.ok === false) throw failure(target.error, target.code, target.params);
        root = target.root;
        workspaceRoot = root.projectRoot;
      } else {
        presetRoots = await fetchPresetRoots();
        root = await resolveInstallRoot({ root: requestedRoot }, registered, void 0, presetRoots);
      }
      const data = await read(), repo = repository(data, id);
      const skill = repo.skills.find((s) => s.path === path);
      if (!skill || !skill.valid) throw failure("\u6280\u80FD\u4E0D\u5B58\u5728\u6216\u683C\u5F0F\u65E0\u6548");
      const lowered = skill.name.toLowerCase();
      const sameTarget = (await state({ projectCwds: workspaceRoot ? [workspaceRoot] : [], ...presetRoots ? { presetRoots } : {} })).roots.filter((item) => workspaceRoot ? item.projectRoot === workspaceRoot && item.kind === "project-dsh" : root.kind === "preset" ? item.key === root.key : item.scope !== "project");
      if (sameTarget.some((item) => (item.skills || []).some((entry) => entry.name.toLowerCase() === lowered || entry.declaredName?.toLowerCase() === lowered))) throw failure("\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728\uFF0C\u4E0D\u4F1A\u8986\u76D6\u672C\u5730\u6587\u4EF6", "error.repo.conflict");
      const entries = await preparedEntries(repo, skill, path);
      data.installs = data.installs.filter((i) => i.trashId || !(i.name === skill.name && (i.workspace ?? null) === (workspaceRoot ?? null) && (i.root || "dsh") === (workspaceRoot ? "dsh" : root.key)));
      const record = { id, path, root: workspaceRoot ? "dsh" : root.key, ...workspaceRoot ? { workspace: workspaceRoot } : {}, source: { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory, ...repo.url ? { url: repo.url } : {} }, name: skill.name, commit: repo.commit, complete: false, files: entries.map((e) => ({ path: e.path, hash: hash(Buffer.from(e.data, "base64")) })) };
      data.installs.push(record);
      await write(data);
      let copied = false;
      try {
        await resolveInstallRoot({ root: requestedRoot, workspace: workspaceRoot }, registered, void 0, presetRoots);
        const result = await importUploadedSkill({ name: skill.name, entries }, log, { conflict: "skip", root });
        if (result.ok === false || !result.imported?.length) throw failure(result.error || "\u6280\u80FD\u5B89\u88C5\u5931\u8D25\u6216\u9047\u5230\u540C\u540D\u51B2\u7A81", typeof result.code === "string" ? result.code : "error.repo.conflict", result.params);
        copied = true;
        if (root.toggleable !== false && root.kind !== "preset") {
          const enabled = await setSkillEnabled(root, skill.name, true, log);
          if (enabled && typeof enabled === "object" && "ok" in enabled && enabled.ok === false) throw failure(enabled.error || "\u6280\u80FD\u542F\u7528\u72B6\u6001\u65E0\u6CD5\u5199\u5165", typeof enabled.code === "string" ? enabled.code : "error.repo.enableState", enabled.params);
        }
      } catch (caught) {
        const error = caught;
        data.installs = data.installs.filter((item) => item !== record);
        try {
          await write(data);
        } catch {
          throw failure("\u5B89\u88C5\u672A\u5B8C\u6210\u4E14\u6765\u6E90\u8BB0\u5F55\u65E0\u6CD5\u64A4\u9500\uFF0C\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u68C0\u67E5\u6280\u80FD\u76EE\u5F55", "error.repo.installState");
        }
        if (copied) await fs.rm(join(root.path, skill.name), { recursive: true, force: true }).catch(() => void 0);
        throw error;
      }
      record.complete = true;
      try {
        await write(data);
      } catch {
        throw failure("\u6280\u80FD\u6587\u4EF6\u5DF2\u5B89\u88C5\u4F46\u6765\u6E90\u72B6\u6001\u672A\u786E\u8BA4\uFF0C\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u65B0\u6253\u5F00\u4ED3\u5E93\u9875", "error.repo.installState");
      }
      return { name: skill.name, commit: repo.commit, root: root.path };
    })
  };
}
export {
  createRepositoryManager,
  parseRepositoryInput
};
