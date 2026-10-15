import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { managerHomePath, resolveWorkspaceTarget, repositoryDestinations, trashRootPath, listTrash, restoreTrash as restoreSkillTrash, permanentlyDeleteTrash, parseSkillDoc, importUploadedSkill, deleteSkill, setSkillEnabled, readManagerState, state, createWorkspaceIndex } from "./core.js";
import { createRepositoryUpdater, fileIndex, signature, readSkillTree, repositoryInstallRoot, recordInstallRoot, selectInstallRecord } from "./repository-updates.js";
const LIMIT = 32 << 20;
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
    const source = parseRepositoryInput({ url: `${repo.owner}/${repo.name}`, ref: repo.ref, subdirectory: repo.subdirectory });
    if (hash(JSON.stringify(source)).slice(0, 24) !== repo.id || repo.commit !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(repo.commit)) throw failure("\u4ED3\u5E93\u72B6\u6001\u6765\u6E90\u65E0\u6548");
    for (const skill of repo.skills) {
      if (!skill || typeof skill.name !== "string" || typeof skill.description !== "string" || typeof skill.body !== "string" || typeof skill.valid !== "boolean" || !/^[a-f0-9]{64}$/.test(skill.documentHash)) throw failure("\u4ED3\u5E93\u6280\u80FD\u72B6\u6001\u65E0\u6548");
      safePath(skill.path, true);
    }
  }
  for (const record of value.installs) {
    if (!record || typeof record.id !== "string" || typeof record.complete !== "boolean" || !Array.isArray(record.files) || !record.files.length || record.files.length > 1e3 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.commit || "")) throw failure("\u4ED3\u5E93\u5B89\u88C5\u8BB0\u5F55\u65E0\u6548");
    repositoryInstallRoot(record.root);
    if (record.workspace !== void 0 && (typeof record.workspace !== "string" || !record.workspace || record.workspace.length > 1024 || record.root === "agents")) throw failure("\u4ED3\u5E93\u5B89\u88C5\u5DE5\u4F5C\u533A\u65E0\u6548");
    if (record.trashId !== void 0 && (typeof record.trashId !== "string" || !/^\d+-[a-f0-9-]{36}$/.test(record.trashId))) throw failure("\u4ED3\u5E93\u56DE\u6536\u8BB0\u5F55\u65E0\u6548");
    if (record.restoreFingerprint !== void 0 && (typeof record.restoreFingerprint !== "string" || !record.trashId || !/^[a-f0-9]{64}$/.test(record.restoreFingerprint))) throw failure("\u4ED3\u5E93\u6062\u590D\u8BB0\u5F55\u65E0\u6548");
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
        if (item.root !== void 0) repositoryInstallRoot(item.root);
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
}
function parseRepositoryInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw failure("\u4ED3\u5E93\u53C2\u6570\u5FC5\u987B\u662F\u5BF9\u8C61");
  if (["ref", "subdirectory"].some((key) => input[key] !== void 0 && typeof input[key] !== "string")) throw failure("\u4ED3\u5E93\u5206\u652F\u548C\u5B50\u76EE\u5F55\u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
  let raw = typeof input.url === "string" ? input.url.trim() : "";
  if (raw.length > 2048 || /[%?#\\\s]/.test(raw)) throw failure("\u4ED3\u5E93\u5730\u5740\u65E0\u6548");
  if (raw.startsWith("https://github.com/")) raw = raw.slice(19);
  const parts = raw.replace(/\/$/, "").split("/");
  const owner = (parts[0] || "").toLowerCase();
  const name = (parts[1] || "").replace(/\.git$/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner) || !/^[a-z0-9_.-]{1,100}$/.test(name) || name === "." || name === ".." || parts.length > 2 && (parts[2] !== "tree" || !parts[3])) throw failure("\u8BF7\u8F93\u5165\u516C\u5F00 GitHub \u4ED3\u5E93\u5730\u5740\u6216 owner/repo");
  const ref = input.ref || parts[3] || "";
  if (typeof ref !== "string" || ref.length > 200 || ref && !/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) throw failure("\u4ED3\u5E93\u5206\u652F\u65E0\u6548");
  const subdirectory = safePath(input.subdirectory || parts.slice(4).join("/"), true);
  return { owner, name, ref, subdirectory };
}
function decodeRepositoryArchive(bytes) {
  if (bytes.byteLength > LIMIT) throw failure("\u4ED3\u5E93\u5F52\u6863\u8D85\u8FC7 32 MiB", "error.repo.tooLarge");
  let total = 0, count = 0;
  const seen = /* @__PURE__ */ new Set();
  const archive = unzipSync(new Uint8Array(bytes), { filter(entry) {
    safePath(entry.name.replace(/\/$/, ""));
    const key = entry.name.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) throw failure("\u4ED3\u5E93\u5B58\u5728\u91CD\u590D\u8DEF\u5F84");
    seen.add(key);
    total += entry.originalSize;
    if (++count > 1e4 || entry.originalSize > LIMIT || total > 64 << 20) throw failure("\u4ED3\u5E93\u89E3\u538B\u5927\u5C0F\u6216\u6587\u4EF6\u6570\u91CF\u8D85\u9650");
    return !entry.name.endsWith("/");
  } });
  const result = /* @__PURE__ */ Object.create(null);
  let root;
  for (const [path, data] of Object.entries(archive)) {
    const slash = path.indexOf("/");
    if (slash < 1) throw failure("\u4ED3\u5E93\u5F52\u6863\u8DEF\u5F84\u65E0\u6548");
    const prefix = path.slice(0, slash);
    if (root && root !== prefix) throw failure("\u4ED3\u5E93\u5F52\u6863\u6839\u76EE\u5F55\u4E0D\u552F\u4E00");
    root = prefix;
    const relative = safePath(path.slice(slash + 1));
    if (data.byteLength > LIMIT) throw failure("\u4ED3\u5E93\u6587\u4EF6\u8FC7\u5927");
    result[relative] = data;
  }
  return result;
}
async function readResponse(response, limit) {
  if (!response.ok) throw Object.assign(failure(`\u4ED3\u5E93\u8BBF\u95EE\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5`, "error.repo.network"), { httpStatus: response.status });
  if (Number(response.headers.get("content-length")) > limit) throw failure("\u4ED3\u5E93\u5F52\u6863\u8D85\u8FC7 32 MiB", "error.repo.tooLarge");
  const reader = response.body?.getReader();
  if (!reader) throw failure("\u4ED3\u5E93\u54CD\u5E94\u4E3A\u7A7A", "error.repo.network");
  const chunks = [];
  let length = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw failure("\u4ED3\u5E93\u5F52\u6863\u8D85\u8FC7 32 MiB", "error.repo.tooLarge");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks, length);
}
function createRepositoryManager({ fetchImpl = globalThis.fetch, log, registeredWorkspaces, onWorkspaceIndexBuild } = {}) {
  const file = join(managerHomePath(), "repositories.json");
  let queue = Promise.resolve();
  let catalogWarnings = [];
  let activeIndex;
  const serialize = (task, recover = true) => {
    const run = async () => {
      const index = createWorkspaceIndex(registeredWorkspaces?.(), { onBuild: onWorkspaceIndexBuild });
      const previous = activeIndex;
      activeIndex = index;
      try {
        if (recover) await recoverPending();
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
  async function read() {
    try {
      const homeInfo = await fs.lstat(managerHomePath());
      if (homeInfo.isSymbolicLink() || !homeInfo.isDirectory()) throw failure("\u4ED3\u5E93\u72B6\u6001\u76EE\u5F55\u4E0D\u5B89\u5168");
      const info = await fs.lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.size > STATE_READ_LIMIT) throw failure("\u4ED3\u5E93\u72B6\u6001\u6587\u4EF6\u4E0D\u5B89\u5168");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      validateStoredState(value);
      return value;
    } catch (caught) {
      const error = caught;
      if (error.code === "ENOENT") return { version: 1, repositories: [], installs: [] };
      throw failure("\u4ED3\u5E93\u72B6\u6001\u6587\u4EF6\u635F\u574F\u6216\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u4FDD\u7559\u6587\u4EF6\u5E76\u4FEE\u590D\u540E\u91CD\u8BD5", "error.repo.state");
    }
  }
  async function write(value, allowShrink = false) {
    validateStoredState(value);
    const text = JSON.stringify(value, null, 2);
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > STATE_READ_LIMIT || bytes > STATE_LIMIT && !(allowShrink && bytes < await currentStateBytes())) throw failure("\u5B89\u88C5\u6765\u6E90\u72B6\u6001\u8D85\u8FC7 16 MiB\u3002\u8BF7\u5148\u6E05\u7406\u4E0D\u9700\u8981\u7684\u56DE\u6536\u8BB0\u5F55\u6216\u65E7\u8EAB\u4EFD\uFF0C\u4ECD\u6709\u6548\u7684\u5B89\u88C5\u526F\u672C\u4F1A\u4FDD\u7559\u3002", "error.repo.capacity");
    await fs.mkdir(managerHomePath(), { recursive: true });
    if ((await fs.lstat(managerHomePath())).isSymbolicLink()) throw failure("\u4ED3\u5E93\u72B6\u6001\u76EE\u5F55\u4E0D\u80FD\u662F\u94FE\u63A5");
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
      await fs.rename(temporary, file);
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
  function repository(data, id) {
    const repo = data.repositories.find((r) => r.id === id);
    if (!repo) throw failure("\u4ED3\u5E93\u4E0D\u5B58\u5728");
    parseRepositoryInput({ url: `${repo.owner}/${repo.name}`, ref: repo.ref, subdirectory: repo.subdirectory });
    return repo;
  }
  async function request(url) {
    try {
      const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(6e4), headers: { Accept: "application/zip", "User-Agent": "dsh-skills-manager" } });
      return await readResponse(response, LIMIT);
    } catch (caught) {
      const error = caught;
      if (typeof error.code === "string" && error.code.startsWith("error.repo.")) throw error;
      throw failure("\u4ED3\u5E93\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5", "error.repo.network");
    }
  }
  async function cacheDirectory() {
    const dir = join(managerHomePath(), "repository-cache");
    if ((await fs.lstat(managerHomePath())).isSymbolicLink()) throw failure("\u7F13\u5B58\u76EE\u5F55\u4E0D\u80FD\u662F\u94FE\u63A5");
    await fs.mkdir(dir, { recursive: true });
    if ((await fs.lstat(dir)).isSymbolicLink()) throw failure("\u7F13\u5B58\u76EE\u5F55\u4E0D\u80FD\u662F\u94FE\u63A5");
    return dir;
  }
  async function cacheArchive(repo, bytes) {
    const version = hash(bytes), dir = await cacheDirectory();
    const target = join(dir, `${repo.id}-${version}.zip`), temporary = join(dir, randomUUID() + ".tmp");
    try {
      await fs.writeFile(temporary, bytes, { flag: "wx" });
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return version;
  }
  async function pruneCache(repo) {
    const dir = await cacheDirectory(), keep = `${repo.id}-${repo.commit}.zip`;
    for (const name of await fs.readdir(dir)) {
      if (name !== keep && name.startsWith(repo.id + "-") && /^[a-f0-9]{24}-[a-f0-9]{64}\.zip$/.test(name)) await fs.unlink(join(dir, name));
    }
  }
  async function download(repo) {
    if (/^[a-f0-9]{40}$/.test(repo.commit || "")) return decodeRepositoryArchive(await request(`https://codeload.github.com/${repo.owner}/${repo.name}/zip/${repo.commit}`));
    if (!/^[a-f0-9]{64}$/.test(repo.commit || "")) throw failure("\u8BF7\u5148\u5237\u65B0\u4ED3\u5E93");
    try {
      const target = join(await cacheDirectory(), `${repo.id}-${repo.commit}.zip`);
      const info = await fs.lstat(target);
      if (info.isSymbolicLink() || !info.isFile() || info.size > LIMIT) throw failure("\u7F13\u5B58\u65E0\u6548");
      const bytes = await fs.readFile(target);
      if (hash(bytes) !== repo.commit) throw failure("\u7F13\u5B58\u5185\u5BB9\u53D8\u5316");
      return decodeRepositoryArchive(bytes);
    } catch {
      throw failure("\u626B\u63CF\u7F13\u5B58\u7F3A\u5931\u6216\u635F\u574F\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u66F4\u65B0\u540E\u64CD\u4F5C");
    }
  }
  async function fetchBranch(repo) {
    const refs = repo.ref && repo.ref !== "HEAD" ? [`refs/heads/${repo.ref}`, `refs/tags/${repo.ref}`] : ["HEAD", "refs/heads/main", "refs/heads/master"];
    for (let i = 0; i < refs.length; i++) {
      try {
        return await request(`https://codeload.github.com/${repo.owner}/${repo.name}/zip/${refs[i].split("/").map(encodeURIComponent).join("/")}`);
      } catch (caught) {
        const error = caught;
        if (error.httpStatus !== 404 || i === refs.length - 1) throw error;
      }
    }
    throw failure("\u4ED3\u5E93\u5206\u652F\u4E0D\u5B58\u5728");
  }
  async function matches(record, fingerprint = signature(record.files), registered = registeredWorkspaces?.(), indexed) {
    try {
      safePath(record.name);
      const rootPath = (await recordInstallRoot(record, registered, indexed)).path;
      return signature(fileIndex(await readSkillTree(join(rootPath, record.name)))) === fingerprint;
    } catch {
      return false;
    }
  }
  async function hasRestoreReceipt(record) {
    try {
      const receipt = join(trashRootPath(), `.restored-${record.trashId}`);
      const directory = await fs.lstat(receipt), file2 = await fs.lstat(join(receipt, "metadata.json"));
      if (!directory.isDirectory() || directory.isSymbolicLink() || !file2.isFile() || file2.isSymbolicLink() || file2.size > 32 << 10) return false;
      const metadata = JSON.parse(await fs.readFile(join(receipt, "metadata.json"), "utf8"));
      return metadata.id === record.trashId && metadata.name === record.name && (record.workspace ? metadata.root?.scope === "project" && metadata.root.projectRoot === record.workspace : metadata.root?.scope === "user" && metadata.root.key === (record.root || "dsh")) && ("path" in record ? metadata.repository?.id === record.id && metadata.repository.path === record.path : Array.isArray(metadata.catalog) && metadata.catalog.includes(record.id)) && metadata.entries?.length === 1 && metadata.entries[0] === record.name;
    } catch {
      return false;
    }
  }
  async function recoverPending() {
    catalogWarnings = [];
    const data = await read();
    let recovered = false;
    const recoveredCatalogIds = [];
    const recoveredInstallIds = [];
    const restoredIds = [];
    const registered = requestIndex().registered;
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
        recovered = true;
      }
    }
    for (const record of catalogRecords(data)) {
      if (record.complete === false && !record.trashId && record.files?.length && record.root) {
        if (await catalogMatches(record, signature(record.files))) {
          try {
            const root = await recordInstallRoot(record, registered, await indexedFor(record));
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
    const local = await state();
    const skills = local.roots.flatMap((r) => r.skills || []);
    const matched = /* @__PURE__ */ new Map();
    const present = /* @__PURE__ */ new Set();
    const registered = requestIndex().registered;
    for (const record of data.installs.filter((record2) => record2.complete && !record2.trashId)) {
      try {
        const files = fileIndex(await readSkillTree(join((await recordInstallRoot(record, registered, await indexedFor(record))).path, record.name)));
        present.add(record);
        matched.set(record, signature(files) === signature(record.files));
      } catch {
      }
    }
    const activeCatalogIds = [];
    const catalogCopies2 = [];
    for (const record of catalogRecords(data).filter((record2) => record2.root && record2.complete !== false && !record2.trashId)) {
      try {
        const root = await recordInstallRoot(record, registered, await indexedFor(record));
        const files = await readSkillTree(join(root.path, record.name));
        if (files["SKILL.md"]) {
          if (!activeCatalogIds.includes(record.id)) activeCatalogIds.push(record.id);
          catalogCopies2.push({ id: record.id, name: record.name, installedRoot: record.root || "dsh", ...record.workspace !== void 0 ? { installedWorkspace: record.workspace } : {}, canUninstall: true });
        }
      } catch {
      }
    }
    return {
      installRoots: await repositoryDestinations(),
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
    return { root: repositoryInstallRoot(input.root).key };
  }
  async function enableCatalog(root, name, respectDisabled = false) {
    try {
      if (respectDisabled) {
        const current = await readManagerState();
        if (!current.writable) throw new Error("\u542F\u7528\u7B56\u7565\u4E0D\u53EF\u5199");
        if (current.state.disabledSkills[root.key]?.includes(name)) return;
      }
      const result = await setSkillEnabled(root, name, true, log);
      if (result && "ok" in result && result.ok === false) throw new Error(result.error);
    } catch {
      throw Object.assign(failure("\u6280\u80FD\u6587\u4EF6\u548C\u5B89\u88C5\u610F\u56FE\u5DF2\u4FDD\u7559\uFF0C\u542F\u7528\u72B6\u6001\u65E0\u6CD5\u5199\u5165\uFF1B\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u65B0\u6253\u5F00\u53D1\u73B0\u9875", "error.repo.installState"), { statusCode: 500 });
    }
  }
  async function catalogMatches(record, fingerprint) {
    try {
      const root = await recordInstallRoot(record, requestIndex().registered, await indexedFor(record));
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
    return serialize(async () => {
      const metadata = (await listTrash()).find((item) => item.id === id);
      const data = await read();
      const records = catalogRecords(data).filter((record) => record.trashId === id && metadata?.catalog?.includes(record.id));
      if (!records.length) return restoreSkillTrash(id, log, options);
      for (const record of records) {
        if (metadata.name !== record.name || (record.workspace ? metadata.root?.projectRoot !== record.workspace || metadata.root.scope !== "project" : metadata.root?.scope !== "user" || metadata.root.key !== record.root)) throw failure("\u56DE\u6536\u7AD9\u6765\u6E90\u4E0E\u76EE\u5F55\u8EAB\u4EFD\u4E0D\u4E00\u81F4");
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
    }, false);
  }
  const refreshVersions = /* @__PURE__ */ new Map();
  return {
    installCatalog: (id, pack, target = {}) => serialize(async () => {
      const location = await catalogLocation(target);
      const root = await recordInstallRoot(location, requestIndex().registered, await indexedFor(location));
      const data = await read();
      const previousCatalog = data.catalogInstalls;
      let intent;
      let reusedLegacy = false;
      await recordInstallRoot(location, requestIndex().registered);
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
      const before = data.catalogInstalls || [];
      const next = before.filter((record) => typeof record === "string" || record.trashId !== id);
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
    ...createRepositoryUpdater({ read, write, repository, download, serialize, parseRepositoryInput, registeredWorkspaces, onWorkspaceIndexBuild }),
    add: (input) => serialize(async () => {
      const source = parseRepositoryInput(input), data = await read();
      const id = createHash("sha256").update(JSON.stringify(source)).digest("hex").slice(0, 24);
      if (data.repositories.some((r) => r.id === id)) throw failure("\u8BE5\u4ED3\u5E93\u5DF2\u6DFB\u52A0");
      if (data.repositories.length >= 30) throw failure("\u6700\u591A\u6DFB\u52A0 30 \u4E2A\u4ED3\u5E93");
      const repo = { ...source, id, skills: [], commit: null, refreshedAt: null, error: null };
      data.repositories.push(repo);
      await write(data);
      return repo;
    }, false),
    remove: ({ id }) => serialize(async () => {
      const data = await read();
      const repo = repository(data, id);
      for (const record of data.installs.filter((i) => i.id === id)) record.source ||= { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory };
      data.repositories = data.repositories.filter((r) => r.id !== id);
      await write(data);
      refreshVersions.set(id, (refreshVersions.get(id) || 0) + 1);
      return { id };
    }, false),
    refresh: async ({ id }) => {
      const { repo, version } = await serialize(async () => {
        const repo2 = { ...repository(await read(), id) };
        const version2 = (refreshVersions.get(id) || 0) + 1;
        refreshVersions.set(id, version2);
        return { repo: repo2, version: version2 };
      }, false);
      let bytes;
      let skills = [];
      let scanError = null;
      try {
        bytes = await fetchBranch(repo);
        const entries = decodeRepositoryArchive(bytes);
        for (const [path, bytes2] of Object.entries(entries)) {
          if (path !== "SKILL.md" && !path.endsWith("/SKILL.md")) continue;
          const directory = path === "SKILL.md" ? "" : path.slice(0, -9);
          if (repo.subdirectory && directory !== repo.subdirectory && !directory.startsWith(`${repo.subdirectory}/`)) continue;
          if (bytes2.length > 256 << 10 || skills.length >= 500 || skills.reduce((n, s) => n + Buffer.byteLength(s.body, "utf8"), 0) + bytes2.length > 4 << 20) throw failure("\u4ED3\u5E93\u6280\u80FD\u6570\u91CF\u6216\u8BF4\u660E\u957F\u5EA6\u8D85\u9650");
          const parsed = parseSkillDoc(Buffer.from(bytes2).toString("utf8"));
          const name = String(parsed.map.name || "");
          const description = String(parsed.map.description || "");
          const prefix = directory ? directory + "/" : "";
          const files = fileIndex(Object.fromEntries(Object.entries(entries).filter(([p]) => p.startsWith(prefix)).map(([p, bytes3]) => [p.slice(prefix.length), bytes3])));
          if (files.length > 1e3) throw failure("\u6280\u80FD\u6587\u4EF6\u6570\u91CF\u8D85\u9650");
          skills.push({ path: directory, files, name: name || directory.split("/").pop() || repo.name, description, body: parsed.body.trim(), documentHash: hash(bytes2), valid: parsed.hasFrontmatter && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name) && name.length <= 100 && !!description });
        }
      } catch (caught) {
        const error = caught;
        scanError = { code: error.code || "error.repo.invalid", error: error.message };
      }
      return serialize(async () => {
        const data = await read(), current = repository(data, id);
        if (refreshVersions.get(id) !== version) return current;
        if (["owner", "name", "ref", "subdirectory"].some((key) => current[key] !== repo[key])) throw failure("\u4ED3\u5E93\u6765\u6E90\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u5237\u65B0");
        if (scanError) current.error = scanError;
        else {
          const snapshot = await cacheArchive(current, bytes);
          Object.assign(current, { skills, commit: snapshot, refreshedAt: (/* @__PURE__ */ new Date()).toISOString(), error: null });
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
      return { ...skill, commit: repo.commit };
    },
    restoreTrash: async (id, options = {}) => {
      const metadata = (await listTrash()).find((item) => item.id === id);
      if (metadata?.catalog?.length && !metadata.repository) return restoreCatalogTrash(id, options);
      if (!metadata?.repository) return restoreSkillTrash(id, log, options);
      return serialize(async () => {
        const metadata2 = (await listTrash()).find((item) => item.id === id);
        if (!metadata2?.repository) return restoreSkillTrash(id, log, options);
        const data = await read();
        const record = data.installs.find((item) => item.trashId === id && item.id === metadata2.repository.id && item.path === metadata2.repository.path);
        if (!record) return restoreSkillTrash(id, log, options);
        if (metadata2.name !== record.name || (record.workspace ? metadata2.root?.scope !== "project" || metadata2.root.projectRoot !== record.workspace : metadata2.root?.scope !== "user" || metadata2.root.key !== (record.root || "dsh")) || metadata2.entries.length !== 1 || metadata2.entries[0] !== record.name) throw failure("\u56DE\u6536\u7AD9\u6765\u6E90\u4E0E\u5B89\u88C5\u8BB0\u5F55\u4E0D\u4E00\u81F4");
        record.restoreFingerprint = signature(fileIndex(await readSkillTree(join(trashRootPath(), id, record.name))));
        const catalog = catalogRecords(data).filter((item) => item.trashId === id && metadata2.catalog?.includes(item.id));
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
      }, false);
    },
    uninstall: (input) => serialize(async () => {
      const { id, path } = input;
      const data = await read();
      const index = requestIndex();
      const record = await selectInstallRecord(data.installs, input, index.registered, "\u6CA1\u6709\u53EF\u8FFD\u6EAF\u7684\u5B89\u88C5\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u5378\u8F7D");
      const root = await recordInstallRoot(record, index.registered, await indexedFor(record));
      const fingerprint = signature(fileIndex(await readSkillTree(join(root.path, record.name))));
      const trashId = `${Date.now()}-${randomUUID()}`;
      record.trashId = trashId;
      const catalog = catalogCopies(data, root, record.name);
      for (const item of catalog) item.trashId = trashId;
      await write(data);
      try {
        await recordInstallRoot(record, index.registered, await indexedFor(record));
        const result = await deleteSkill(root, record.name, log, { repositoryEntryOnly: true, repositoryTrash: { id: trashId, repository: { id, path } }, ...catalog.length ? { catalogTrash: { id: trashId, ids: catalog.map((item) => item.id) } } : {} });
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
    install: ({ id, path, root: requestedRoot, workspace }, registered) => serialize(async () => {
      let root, workspaceRoot;
      if (workspace !== void 0) {
        if (requestedRoot !== void 0 && requestedRoot !== "dsh") throw failure("\u5DE5\u4F5C\u533A\u53EA\u80FD\u5B89\u88C5\u5230\u9879\u76EE DSH skills");
        const target = await resolveWorkspaceTarget(workspace, registered);
        if ("ok" in target && target.ok === false) throw failure(target.error, target.code, target.params);
        root = target.root;
        workspaceRoot = root.projectRoot;
      } else root = await recordInstallRoot({ root: requestedRoot });
      const data = await read(), repo = repository(data, id);
      const skill = repo.skills.find((s) => s.path === path);
      if (!skill || !skill.valid) throw failure("\u6280\u80FD\u4E0D\u5B58\u5728\u6216\u683C\u5F0F\u65E0\u6548");
      const lowered = skill.name.toLowerCase();
      const sameTarget = (await state({ projectCwds: workspaceRoot ? [workspaceRoot] : [] })).roots.filter((item) => workspaceRoot ? item.projectRoot === workspaceRoot && item.kind === "project-dsh" : item.scope !== "project");
      if (sameTarget.some((item) => (item.skills || []).some((entry) => entry.name.toLowerCase() === lowered || entry.declaredName?.toLowerCase() === lowered))) throw failure("\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728\uFF0C\u4E0D\u4F1A\u8986\u76D6\u672C\u5730\u6587\u4EF6", "error.repo.conflict");
      const archive = await download(repo), prefix = path ? `${path}/` : "";
      const document = archive[prefix + "SKILL.md"];
      if (!document || hash(document) !== skill.documentHash) throw failure("\u4ED3\u5E93\u6280\u80FD\u5185\u5BB9\u4E0E\u626B\u63CF\u7248\u672C\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u91CD\u65B0\u5237\u65B0");
      const entries = Object.entries(archive).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => ({ path: p.slice(prefix.length), data: Buffer.from(bytes).toString("base64") }));
      if (!entries.some((e) => e.path === "SKILL.md")) throw failure("\u4ED3\u5E93\u6280\u80FD\u5185\u5BB9\u5DF2\u5931\u6548");
      data.installs = data.installs.filter((i) => !(i.name === skill.name && (i.workspace ?? null) === (workspaceRoot ?? null) && (i.root || "dsh") === (workspaceRoot ? "dsh" : root.key)));
      const record = { id, path, root: workspaceRoot ? "dsh" : root.key, ...workspaceRoot ? { workspace: workspaceRoot } : {}, source: { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory }, name: skill.name, commit: repo.commit, complete: false, files: entries.map((e) => ({ path: e.path, hash: hash(Buffer.from(e.data, "base64")) })) };
      data.installs.push(record);
      await write(data);
      let copied = false;
      try {
        await recordInstallRoot({ root: requestedRoot, workspace: workspaceRoot }, registered);
        const result = await importUploadedSkill({ name: skill.name, entries }, log, { conflict: "skip", root });
        if (result.ok === false || !result.imported?.length) throw failure(result.error || "\u6280\u80FD\u5B89\u88C5\u5931\u8D25\u6216\u9047\u5230\u540C\u540D\u51B2\u7A81", typeof result.code === "string" ? result.code : "error.repo.conflict", result.params);
        copied = true;
        const enabled = await setSkillEnabled(root, skill.name, true, log);
        if (enabled && typeof enabled === "object" && "ok" in enabled && enabled.ok === false) throw failure(enabled.error || "\u6280\u80FD\u542F\u7528\u72B6\u6001\u65E0\u6CD5\u5199\u5165", typeof enabled.code === "string" ? enabled.code : "error.repo.enableState", enabled.params);
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
  decodeRepositoryArchive,
  parseRepositoryInput
};
