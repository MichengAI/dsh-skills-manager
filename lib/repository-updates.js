import { promises as fs } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { managerHomePath, userRoots, checkedRepositoryRootDefinition, projectRootForRecord, resolveWorkspaceTarget, createWorkspaceIndex, renameWithRetry } from "./core.js";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repositoryInstallKeys = /* @__PURE__ */ new Set(["dsh", "agents"]);
function isRepositoryRootKey(key) {
  const normalized = key === void 0 ? "dsh" : key;
  if (typeof normalized !== "string") return false;
  if (normalized.startsWith("preset-") || normalized === "preset") return true;
  return repositoryInstallKeys.has(normalized);
}
function repositoryInstallRoot(key = "dsh", presetRoots) {
  const normalized = key === void 0 ? "dsh" : key;
  if (typeof normalized !== "string") throw failure("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548");
  if (normalized.startsWith("preset-") || normalized === "preset") {
    if (presetRoots) {
      const preset = presetRoots.find((item) => item.key === normalized);
      if (preset && preset.mutable && preset.native === false) {
        return { ...preset, key: preset.key };
      }
    }
    throw failure("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548");
  }
  if (!repositoryInstallKeys.has(normalized)) throw failure("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548");
  const root = userRoots().find((item) => item.key === normalized);
  if (!root) throw failure("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u65E0\u6548");
  return { ...root, key: root.key };
}
async function recordInstallRoot(record, registered, indexed, presetRoots) {
  if (record.workspace === void 0) {
    const root = repositoryInstallRoot(record.root, presetRoots);
    const checked = await checkedRepositoryRootDefinition(root);
    if (!checked) throw failure("\u6280\u80FD\u5B89\u88C5\u4F4D\u7F6E\u4E0D\u53EF\u7528", "error.root.unsafe");
    if (checked.ok === false) throw Object.assign(failure(checked.error, checked.code || "error.root.unsafe"), { params: checked.params });
    return root;
  }
  const resolved = await projectRootForRecord(record.workspace, registered, indexed);
  if ("ok" in resolved && resolved.ok === false) throw Object.assign(failure(resolved.error, resolved.code || "error.workspace.unavailable"), { params: resolved.params });
  return resolved.root;
}
const targetIdentity = (path) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
const installationSourceKey = (rootPath, name) => JSON.stringify([targetIdentity(rootPath), name]);
async function selectInstallRecord(records, input, registered, missing, presetRoots) {
  let workspace;
  if (input.workspace !== void 0) {
    if (input.root !== void 0 && input.root !== "dsh") throw failure("\u5DE5\u4F5C\u533A\u53EA\u80FD\u7BA1\u7406\u9879\u76EE DSH skills");
    const target = await resolveWorkspaceTarget(input.workspace, registered);
    if ("ok" in target && target.ok === false) throw Object.assign(failure(target.error, target.code), { params: target.params });
    workspace = target.root.projectRoot;
  } else if (input.root !== void 0) repositoryInstallRoot(input.root, presetRoots);
  const matches = records.filter((record) => record.id === input.id && record.path === input.path && record.complete && !record.trashId && (workspace !== void 0 ? record.workspace !== void 0 && targetIdentity(record.workspace) === targetIdentity(workspace) : record.workspace === void 0 && (input.root === void 0 || (record.root || "dsh") === input.root)));
  if (matches.length !== 1) throw failure(matches.length ? "\u5B89\u88C5\u8BB0\u5F55\u4E0D\u552F\u4E00\uFF0C\u8BF7\u660E\u786E\u9009\u62E9\u5B89\u88C5\u4F4D\u7F6E" : missing);
  return matches[0];
}
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
function createRepositoryUpdater({ read, write, repository, download, serialize, parseRepositoryInput, registeredWorkspaces, onWorkspaceIndexBuild, getPresetRoots }) {
  const fetchPresetRoots = async () => getPresetRoots ? await getPresetRoots() || [] : [];
  async function prepare(input, includeArchive = false, sharedData) {
    const { id, path } = input, data = sharedData ?? await read();
    const registered = registeredWorkspaces?.();
    const presetRoots = await fetchPresetRoots();
    const record = await selectInstallRecord(data.installs, input, registered, "\u6CA1\u6709\u53EF\u8FFD\u6EAF\u7684\u5B89\u88C5\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u5728\u7EBF\u66F4\u65B0", presetRoots);
    const target = join((await recordInstallRoot(record, registered, void 0, presetRoots)).path, record.name);
    const current = fileIndex(await readSkillTree(target));
    let entries, next, commit;
    if (input.rollback === true) {
      const backup = record.backup;
      if (!/^[a-f0-9-]{36}$/.test(backup?.key || "") || backup.record?.name !== record.name || backup.record?.id !== id || backup.record?.path !== path || (backup.record.root || "dsh") !== (record.root || "dsh") || (backup.record.workspace ?? "") !== (record.workspace ?? "") || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(backup.record?.commit || "") || !Array.isArray(backup.record?.files)) throw failure("\u6CA1\u6709\u6709\u6548\u7684\u4E0A\u4E00\u7248\u5907\u4EFD");
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
        const archive = await download(repo, path), prefix = path ? path + "/" : "";
        entries = Object.fromEntries(Object.entries(archive).filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => [p.slice(prefix.length), bytes]));
        if (signature(fileIndex(entries)) !== signature(next)) throw failure("\u4E0B\u8F7D\u5185\u5BB9\u4E0E\u9884\u89C8\u7248\u672C\u4E0D\u540C\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u66F4\u65B0");
      }
    }
    const token = hash(JSON.stringify({ id, path, root: record.root || "dsh", workspace: record.workspace ?? null, commit, current, next, rollback: input.rollback === true }));
    return { data, record, target, entries, next, current, token, commit, localModified: signature(current) !== signature(record.files), changes: changesBetween(current, next) };
  }
  async function replace(input, rollback = false, sharedData) {
    const plan = await prepare({ ...input, rollback }, true, sharedData);
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
      await renameWithRetry(target, backup);
      moved = true;
      await renameWithRetry(stage, target);
      replaced = true;
      data.installs[data.installs.indexOf(record)] = nextRecord;
      await write(data);
    } catch (caught) {
      const error = caught;
      const index = data.installs.findIndex((item) => item === record || item.id === record.id && item.path === record.path && item.name === record.name && item.root === record.root && item.workspace === record.workspace);
      if (index !== -1) data.installs[index] = record;
      if (moved) {
        try {
          if (replaced) await renameWithRetry(target, stage);
          await renameWithRetry(backup, target);
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
    const index = createWorkspaceIndex(registeredWorkspaces?.(), { onBuild: onWorkspaceIndexBuild });
    for (const record of data.installs.filter((i) => i.complete && !i.trashId)) {
      const source = record.source || data.repositories.find((r) => r.id === record.id);
      if (!source) continue;
      const parsed = parseRepositoryInput({ url: source.url || `${source.owner}/${source.name}`, ref: source.ref, subdirectory: source.subdirectory });
      try {
        const presetRoots = await fetchPresetRoots();
        const root = await recordInstallRoot(record, index.registered, record.workspace === void 0 ? void 0 : await index.load(), presetRoots);
        const realRoot = await fs.realpath(root.path);
        result[installationSourceKey(realRoot, record.name)] = { ...parsed, id: record.id, path: record.path, commit: record.commit, root: record.root || "dsh", ...record.workspace ? { workspace: record.workspace } : {} };
      } catch {
      }
    }
    return result;
  }
  function bulkItems(input, emptyLabel) {
    const rawItems = Array.isArray(input?.items) ? input.items : [];
    if (!rawItems.length) throw failure(`${emptyLabel}\u9879\u4E3A\u7A7A`, "error.repo.empty");
    if (rawItems.length > 1e3) throw failure(`${emptyLabel}\u9879\u8D85\u8FC7\u4E0A\u9650\uFF08\u6700\u591A 1000 \u9879\uFF09`, "error.repo.tooMany");
    return rawItems;
  }
  return {
    sources,
    preview: (input) => serialize(async () => {
      const p = await prepare(input);
      return { token: p.token, commit: p.commit, localModified: p.localModified, changes: p.changes, rollback: input.rollback === true };
    }),
    update: (input) => serialize(() => replace(input)),
    rollback: (input) => serialize(() => replace(input, true)),
    // 批量预览：一次状态读取、一次返回全部 token；结果按请求顺序（结果[slot] 对应 items[slot]）。
    previewMany: (input) => serialize(async () => {
      const rawItems = bulkItems(input, "\u6279\u91CF\u9884\u89C8");
      const data = await read();
      const results = new Array(rawItems.length);
      const seen = /* @__PURE__ */ new Set();
      for (const [slot, raw] of rawItems.entries()) {
        const id = typeof raw.id === "string" ? raw.id : "";
        const path = typeof raw.path === "string" ? raw.path : "";
        const rollback = raw.rollback === true;
        const duplicate = JSON.stringify([id, path, raw.root ?? null, typeof raw.workspace === "string" ? raw.workspace : null, rollback]);
        if (seen.has(duplicate)) {
          results[slot] = { id, path, rollback, ok: false, error: "\u91CD\u590D\u7684\u66F4\u65B0\u9879", code: "error.repo.duplicate" };
          continue;
        }
        seen.add(duplicate);
        try {
          const plan = await prepare({ ...raw, rollback }, false, data);
          results[slot] = { id, path, rollback, ok: true, token: plan.token, commit: plan.commit, localModified: plan.localModified, changes: plan.changes };
        } catch (caught) {
          const error = caught;
          results[slot] = { id, path, rollback, ok: false, error: error.message, code: String(error.code || "error.repo.invalid"), params: error.params };
        }
      }
      return { results };
    }),
    // 批量替换：共享同一份状态数据（单项互不重叠，见去重键），逐项复用单技能 replace 的备份/回滚事务并各自写盘。
    updateMany: (input) => serialize(async () => {
      const rawItems = bulkItems(input, "\u6279\u91CF\u66F4\u65B0");
      const data = await read();
      const results = new Array(rawItems.length);
      const seen = /* @__PURE__ */ new Set();
      for (const [slot, raw] of rawItems.entries()) {
        const id = typeof raw.id === "string" ? raw.id : "";
        const path = typeof raw.path === "string" ? raw.path : "";
        const rollback = raw.rollback === true;
        const duplicate = JSON.stringify([id, path, raw.root ?? null, typeof raw.workspace === "string" ? raw.workspace : null, rollback]);
        if (seen.has(duplicate)) {
          results[slot] = { id, path, rollback, ok: false, error: "\u91CD\u590D\u7684\u66F4\u65B0\u9879", code: "error.repo.duplicate" };
          continue;
        }
        seen.add(duplicate);
        try {
          const outcome = await replace({ ...raw, rollback }, rollback, data);
          results[slot] = { id, path, rollback, ok: true, name: outcome.name, commit: outcome.commit };
        } catch (caught) {
          const error = caught;
          results[slot] = { id, path, rollback, ok: false, error: error.message, code: String(error.code || "error.repo.invalid"), params: error.params };
        }
      }
      return { results };
    })
  };
}
export {
  createRepositoryUpdater,
  fileIndex,
  installationSourceKey,
  isRepositoryRootKey,
  readSkillTree,
  recordInstallRoot,
  repositoryInstallRoot,
  selectInstallRecord,
  signature
};
