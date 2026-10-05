import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { managerHomePath, parseSkillDoc, importUploadedSkill, setSkillEnabled, state, userRoots } from "./core.js";
import { createRepositoryUpdater, fileIndex, signature, readSkillTree } from "./repository-updates.js";
const LIMIT = 32 << 20;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function failure(message, code = "error.repo.invalid") {
  return Object.assign(new Error(message), { code, statusCode: 400 });
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
    safePath(record.path, true);
    safePath(record.name);
    if (record.name.includes("/")) throw failure("\u4ED3\u5E93\u5B89\u88C5\u540D\u79F0\u65E0\u6548");
    for (const entry of record.files) {
      if (!entry || !/^[a-f0-9]{64}$/.test(entry.hash)) throw failure("\u4ED3\u5E93\u5B89\u88C5\u6458\u8981\u65E0\u6548");
      safePath(entry.path);
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
function createRepositoryManager({ fetchImpl = globalThis.fetch, log } = {}) {
  const file = join(managerHomePath(), "repositories.json");
  let queue = Promise.resolve();
  const serialize = (task, recover = true) => {
    const run = async () => {
      if (recover) await recoverPending();
      return task();
    };
    const next = queue.then(run, run);
    queue = next.catch(() => {
    });
    return next;
  };
  async function read() {
    try {
      const homeInfo = await fs.lstat(managerHomePath());
      if (homeInfo.isSymbolicLink() || !homeInfo.isDirectory()) throw failure("\u4ED3\u5E93\u72B6\u6001\u76EE\u5F55\u4E0D\u5B89\u5168");
      const info = await fs.lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.size > 16 << 20) throw failure("\u4ED3\u5E93\u72B6\u6001\u6587\u4EF6\u4E0D\u5B89\u5168");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      validateStoredState(value);
      return value;
    } catch (caught) {
      const error = caught;
      if (error.code === "ENOENT") return { version: 1, repositories: [], installs: [] };
      throw failure("\u4ED3\u5E93\u72B6\u6001\u6587\u4EF6\u635F\u574F\u6216\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u4FDD\u7559\u6587\u4EF6\u5E76\u4FEE\u590D\u540E\u91CD\u8BD5", "error.repo.state");
    }
  }
  async function write(value) {
    validateStoredState(value);
    const text = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(text, "utf8") > 16 << 20) throw failure("\u4ED3\u5E93\u72B6\u6001\u8D85\u8FC7\u5BB9\u91CF\u9650\u5236\uFF0C\u8BF7\u51CF\u5C11\u6765\u6E90");
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
  async function matches(record) {
    try {
      safePath(record.name);
      const dshPath = userRoots().find((root) => root.key === "dsh").path;
      return signature(fileIndex(await readSkillTree(join(dshPath, record.name)))) === signature(record.files);
    } catch {
      return false;
    }
  }
  async function recoverPending() {
    const data = await read();
    let recovered = false;
    for (const record of data.installs.filter((record2) => !record2.complete)) {
      if (await matches(record)) {
        record.complete = true;
        recovered = true;
      }
    }
    if (recovered) {
      try {
        await write(data);
      } catch {
        throw failure("\u6280\u80FD\u6587\u4EF6\u5DF2\u4FDD\u7559\uFF0C\u4F46\u5B89\u88C5\u6765\u6E90\u72B6\u6001\u4ECD\u65E0\u6CD5\u5199\u5165\uFF0C\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u8BD5", "error.repo.installState");
      }
    }
  }
  async function list() {
    const data = await read();
    const local = await state();
    const skills = local.roots.flatMap((r) => r.skills || []);
    const matched = /* @__PURE__ */ new Map();
    for (const record of data.installs) matched.set(record, record.complete && await matches(record));
    return { repositories: data.repositories.map((repo) => ({ ...repo, skills: repo.skills.map((skill) => {
      const found = skills.some((s) => s.name.toLowerCase() === skill.name.toLowerCase() || s.declaredName?.toLowerCase() === skill.name.toLowerCase());
      const own = data.installs.some((i) => i.id === repo.id && i.path === skill.path && i.name === skill.name && matched.get(i));
      const dsh = local.roots.find((r) => r.key === "dsh");
      const inDsh = dsh?.skills.some((s) => s.name === skill.name);
      const { body, ...summary } = skill;
      const record = data.installs.find((i) => i.id === repo.id && i.path === skill.path && i.name === skill.name && i.complete);
      const updateAvailable = !!record && !!skill.files && signature(record.files) !== signature(skill.files);
      return { ...summary, updateAvailable, canRollback: !!record?.backup, tracked: !!record && !!inDsh, status: !skill.valid ? "invalid" : found ? own && inDsh ? updateAvailable ? "update" : "installed" : "conflict" : "available" };
    }) })) };
  }
  return {
    list: () => serialize(list),
    ...createRepositoryUpdater({ read, write, repository, download, serialize, parseRepositoryInput }),
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
      return { id };
    }, false),
    refresh: ({ id }) => serialize(async () => {
      const data = await read(), repo = repository(data, id);
      try {
        const bytes = await fetchBranch(repo);
        const entries = decodeRepositoryArchive(bytes);
        const skills = [];
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
        const snapshot = await cacheArchive(repo, bytes);
        Object.assign(repo, { skills, commit: snapshot, refreshedAt: (/* @__PURE__ */ new Date()).toISOString(), error: null });
      } catch (caught) {
        const error = caught;
        repo.error = { code: error.code || "error.repo.invalid", error: error.message };
      }
      await write(data);
      if (!repo.error) {
        try {
          await pruneCache(repo);
        } catch (caught) {
          const error = caught;
          if (log) await log("repository.cache.cleanup.failed", { repository: repo.id, error: error.message });
          else console.warn("\u4ED3\u5E93\u65E7\u7F13\u5B58\u672A\u6E05\u7406\uFF1A" + error.message);
        }
      }
      return repo;
    }, false),
    detail: async ({ id, path }) => {
      const repo = repository(await read(), id), skill = repo.skills.find((s) => s.path === path);
      if (!skill) throw failure("\u6280\u80FD\u4E0D\u5728\u4ED3\u5E93\u5217\u8868\u4E2D");
      return { ...skill, commit: repo.commit };
    },
    install: ({ id, path }) => serialize(async () => {
      const data = await read(), repo = repository(data, id);
      const skill = repo.skills.find((s) => s.path === path);
      if (!skill || !skill.valid) throw failure("\u6280\u80FD\u4E0D\u5B58\u5728\u6216\u683C\u5F0F\u65E0\u6548");
      const local = await state();
      if (local.roots.some((root) => (root.skills || []).some((item) => item.name.toLowerCase() === skill.name.toLowerCase() || item.declaredName?.toLowerCase() === skill.name.toLowerCase()))) throw failure("\u540C\u540D\u6280\u80FD\u5DF2\u5B58\u5728\uFF0C\u4E0D\u4F1A\u8986\u76D6\u672C\u5730\u6587\u4EF6", "error.repo.conflict");
      const archive = await download(repo), prefix = path ? `${path}/` : "";
      const document = archive[prefix + "SKILL.md"];
      if (!document || hash(document) !== skill.documentHash) throw failure("\u4ED3\u5E93\u6280\u80FD\u5185\u5BB9\u4E0E\u626B\u63CF\u7248\u672C\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u91CD\u65B0\u5237\u65B0");
      const entries = Object.entries(archive).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => ({ path: p.slice(prefix.length), data: Buffer.from(bytes).toString("base64") }));
      if (!entries.some((e) => e.path === "SKILL.md")) throw failure("\u4ED3\u5E93\u6280\u80FD\u5185\u5BB9\u5DF2\u5931\u6548");
      data.installs = data.installs.filter((i) => i.name !== skill.name);
      const record = { id, path, source: { owner: repo.owner, name: repo.name, ref: repo.ref, subdirectory: repo.subdirectory }, name: skill.name, commit: repo.commit, complete: false, files: entries.map((e) => ({ path: e.path, hash: hash(Buffer.from(e.data, "base64")) })) };
      data.installs.push(record);
      await write(data);
      let copied = false;
      try {
        const result = await importUploadedSkill({ name: skill.name, entries }, log, { conflict: "skip" });
        if (result.ok === false || !result.imported?.length) throw failure(result.error || "\u6280\u80FD\u5B89\u88C5\u5931\u8D25\u6216\u9047\u5230\u540C\u540D\u51B2\u7A81", "error.repo.conflict");
        copied = true;
        const dsh = userRoots().find((root) => root.key === "dsh");
        const enabled = await setSkillEnabled(dsh, skill.name, true, log);
        if (enabled && typeof enabled === "object" && "ok" in enabled && enabled.ok === false) throw failure(enabled.error || "\u6280\u80FD\u542F\u7528\u72B6\u6001\u65E0\u6CD5\u5199\u5165", enabled.code || "error.repo.enableState");
      } catch (caught) {
        const error = caught;
        data.installs = data.installs.filter((item) => item !== record);
        try {
          await write(data);
        } catch {
          throw failure("\u5B89\u88C5\u672A\u5B8C\u6210\u4E14\u6765\u6E90\u8BB0\u5F55\u65E0\u6CD5\u64A4\u9500\uFF0C\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u68C0\u67E5\u6280\u80FD\u76EE\u5F55", "error.repo.installState");
        }
        if (copied) await fs.rm(join(userRoots().find((root) => root.key === "dsh").path, skill.name), { recursive: true, force: true }).catch(() => void 0);
        throw error;
      }
      record.complete = true;
      try {
        await write(data);
      } catch {
        throw failure("\u6280\u80FD\u6587\u4EF6\u5DF2\u5B89\u88C5\u4F46\u6765\u6E90\u72B6\u6001\u672A\u786E\u8BA4\uFF0C\u8BF7\u6062\u590D\u78C1\u76D8\u5199\u5165\u540E\u91CD\u65B0\u6253\u5F00\u4ED3\u5E93\u9875", "error.repo.installState");
      }
      return { name: skill.name, commit: repo.commit, root: userRoots().find((r) => r.key === "dsh").path };
    })
  };
}
export {
  createRepositoryManager,
  decodeRepositoryArchive,
  parseRepositoryInput
};
