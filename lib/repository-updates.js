import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { managerHomePath, userRoots } from "./core.js";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileIndex = (entries) => Object.entries(entries).map(([path, bytes]) => ({ path, hash: hash(bytes) })).sort((a, b) => a.path.localeCompare(b.path, "en"));
const signature = (files) => hash(JSON.stringify([...files].map(({ path, hash: hash2 }) => ({ path, hash: hash2 })).sort((a, b) => a.path.localeCompare(b.path, "en"))));
function failure(message, code = "error.repo.invalid") {
  return Object.assign(new Error(message), { code, statusCode: 400 });
}
function safePath(path) {
  if (typeof path !== "string" || !path || path.length > 512 || path.split("/").length > 64 || path.split("/").some((p) => !p || p === "." || p === ".." || /[\\:<>"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw failure("\u6280\u80FD\u6587\u4EF6\u8DEF\u5F84\u65E0\u6548");
}
async function safeDirectory(root) {
  for (let p = root; ; p = dirname(p)) {
    const info = await fs.lstat(p);
    if (info.isSymbolicLink() || !info.isDirectory()) throw failure("\u6280\u80FD\u6216\u5907\u4EFD\u76EE\u5F55\u5305\u542B\u94FE\u63A5");
    if (dirname(p) === p) break;
  }
}
async function readSkillTree(root) {
  await safeDirectory(root);
  const result = /* @__PURE__ */ Object.create(null);
  let size = 0, count = 0;
  async function walk(dir, prefix = "") {
    for (const entry of await fs.readdir(dir)) {
      const path = prefix + entry;
      safePath(path);
      if (++count > 2e3) throw failure("\u6280\u80FD\u76EE\u5F55\u6570\u91CF\u8D85\u9650");
      const target = join(dir, entry), info = await fs.lstat(target);
      if (info.isSymbolicLink()) throw failure("\u6280\u80FD\u5305\u542B\u94FE\u63A5\uFF0C\u62D2\u7EDD\u66F4\u65B0");
      if (info.isDirectory()) await walk(target, path + "/");
      else {
        if (!info.isFile() || info.size > 32 << 20 || (size += info.size) > 64 << 20 || Object.keys(result).length >= 1e3) throw failure("\u6280\u80FD\u6587\u4EF6\u6570\u91CF\u6216\u5927\u5C0F\u8D85\u9650");
        result[path] = await fs.readFile(target);
      }
    }
  }
  await walk(root);
  return result;
}
function changesBetween(before, after) {
  const a = new Map(before.map((f) => [f.path, f.hash])), b = new Map(after.map((f) => [f.path, f.hash]));
  return [.../* @__PURE__ */ new Set([...a.keys(), ...b.keys()])].sort().filter((p) => a.get(p) !== b.get(p)).map((path) => ({ path, kind: !a.has(path) ? "added" : !b.has(path) ? "removed" : "modified" }));
}
function createRepositoryUpdater({ read, write, repository, download, serialize, parseRepositoryInput }) {
  async function prepare(input, includeArchive = false) {
    const { id, path } = input, data = await read();
    const record = data.installs.find((i) => i.id === id && i.path === path && i.complete);
    if (!record) throw failure("\u6CA1\u6709\u53EF\u8FFD\u6EAF\u7684\u5B89\u88C5\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u5728\u7EBF\u66F4\u65B0");
    const target = join(userRoots().find((r) => r.key === "dsh").path, record.name);
    const current = fileIndex(await readSkillTree(target));
    let entries, next, commit;
    if (input.rollback === true) {
      const backup = record.backup;
      if (!/^[a-f0-9-]{36}$/.test(backup?.key || "") || backup.record?.name !== record.name || backup.record?.id !== id || backup.record?.path !== path || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(backup.record?.commit || "") || !Array.isArray(backup.record?.files)) throw failure("\u6CA1\u6709\u6709\u6548\u7684\u4E0A\u4E00\u7248\u5907\u4EFD");
      entries = await readSkillTree(join(managerHomePath(), "repository-backups", backup.key));
      next = fileIndex(entries);
      if (signature(next) !== backup.fingerprint) throw failure("\u5907\u4EFD\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u62D2\u7EDD\u56DE\u9000");
      commit = backup.record.commit;
    } else {
      const repo = repository(data, id), skill = repo.skills.find((s) => s.path === path);
      if (repo.error || !skill?.valid || skill.name !== record.name || !skill.files) throw failure("\u8BF7\u5148\u6210\u529F\u68C0\u67E5\u66F4\u65B0\uFF1B\u6280\u80FD\u6539\u540D\u6216\u5DF2\u79FB\u9664\u65F6\u4E0D\u80FD\u76F4\u63A5\u66FF\u6362");
      next = skill.files;
      commit = repo.commit;
      if (includeArchive) {
        const archive = await download(repo), prefix = path ? path + "/" : "";
        entries = Object.fromEntries(Object.entries(archive).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => [p.slice(prefix.length), bytes]));
        if (signature(fileIndex(entries)) !== signature(next)) throw failure("\u4E0B\u8F7D\u5185\u5BB9\u4E0E\u9884\u89C8\u7248\u672C\u4E0D\u540C\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u66F4\u65B0");
      }
    }
    const token = hash(JSON.stringify({ id, path, commit, current, next, rollback: input.rollback === true }));
    return { data, record, target, entries, next, current, token, commit, localModified: signature(current) !== signature(record.files), changes: changesBetween(current, next) };
  }
  async function replace(input, rollback = false) {
    const plan = await prepare({ ...input, rollback }, true);
    if (typeof input.token !== "string" || input.token !== plan.token) throw failure("\u6587\u4EF6\u6216\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8");
    if (plan.localModified && input.overwrite !== true) throw failure("\u5B58\u5728\u672C\u5730\u4FEE\u6539\uFF0C\u8BF7\u786E\u8BA4\u5907\u4EFD\u540E\u66FF\u6362", "error.repo.modified");
    const { data, record, target, entries } = plan;
    const backupRoot = join(managerHomePath(), "repository-backups");
    await fs.mkdir(backupRoot, { recursive: true });
    await safeDirectory(backupRoot);
    const key = randomUUID(), backup = join(backupRoot, key), stage = join(backupRoot, randomUUID());
    await fs.mkdir(stage);
    let moved = false, replaced = false, recoveryFailed = false;
    try {
      for (const [path, bytes] of Object.entries(entries)) {
        safePath(path);
        const file = join(stage, ...path.split("/"));
        await fs.mkdir(dirname(file), { recursive: true });
        await fs.writeFile(file, bytes, { flag: "wx" });
      }
      if (signature(fileIndex(await readSkillTree(target))) !== signature(plan.current)) throw failure("\u672C\u5730\u6587\u4EF6\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8");
      const previous = { ...record };
      delete previous.backup;
      const nextRecord = rollback ? { ...record.backup.record } : { ...previous, commit: plan.commit, files: plan.next };
      nextRecord.backup = { key, fingerprint: signature(plan.current), record: previous };
      await fs.rename(target, backup);
      moved = true;
      await fs.rename(stage, target);
      replaced = true;
      data.installs[data.installs.indexOf(record)] = nextRecord;
      await write(data);
    } catch (caught) {
      const error = caught;
      if (moved) {
        try {
          if (replaced) await fs.rename(target, stage);
          await fs.rename(backup, target);
        } catch {
          recoveryFailed = true;
          throw failure("\u81EA\u52A8\u6062\u590D\u5931\u8D25\uFF0C\u539F\u6587\u4EF6\u4FDD\u7559\u5728\u5907\u4EFD\u76EE\u5F55\uFF0C\u8BF7\u52FF\u91CD\u590D\u64CD\u4F5C", "error.repo.state");
        }
      }
      throw error;
    } finally {
      if (!recoveryFailed) await fs.rm(stage, { recursive: true, force: true });
    }
    return { name: record.name, commit: plan.commit };
  }
  async function sources() {
    const data = await read(), result = /* @__PURE__ */ Object.create(null);
    for (const record of data.installs.filter((i) => i.complete)) {
      const source = record.source || data.repositories.find((r) => r.id === record.id);
      if (!source) continue;
      const parsed = parseRepositoryInput({ url: `${source.owner}/${source.name}`, ref: source.ref, subdirectory: source.subdirectory });
      result[record.name] = { ...parsed, id: record.id, path: record.path, commit: record.commit };
    }
    return result;
  }
  return {
    sources,
    preview: (input) => serialize(async () => {
      const p = await prepare(input);
      return { token: p.token, commit: p.commit, localModified: p.localModified, changes: p.changes, rollback: input.rollback === true };
    }),
    update: (input) => serialize(() => replace(input)),
    rollback: (input) => serialize(() => replace(input, true))
  };
}
export {
  createRepositoryUpdater,
  fileIndex,
  readSkillTree,
  signature
};
