import { promises as fs } from "node:fs";
import { resolve, join, relative, sep } from "node:path";
const MAX_DEPTH = 6;
const MAX_DIRECTORIES = 2e3;
const MAX_ENTRIES = 2e4;
const identity = (path) => process.platform === "win32" ? path.toLowerCase() : path;
function validDiscoveryName(name) {
  return typeof name === "string" && (name === "." || name.length <= 1024 && name.split("/").every(
    (part) => part.length > 0 && part.length <= 255 && !part.startsWith(".") && !/[\\:*?"<>|\0]/.test(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part)
  ));
}
async function discoverReadonlyEntries(root) {
  const rootPath = resolve(root);
  const queue = [{ path: rootPath, depth: 0, ancestors: /* @__PURE__ */ new Set() }];
  const byName = /* @__PURE__ */ new Map();
  let directories = 0;
  let entries = 0;
  let exists = false;
  let truncated = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (directories >= MAX_DIRECTORIES || entries >= MAX_ENTRIES) {
      truncated = true;
      break;
    }
    const current = queue[cursor];
    let realDirectory;
    let items = [];
    try {
      realDirectory = await fs.realpath(current.path);
      const key = identity(realDirectory);
      if (current.ancestors.has(key)) continue;
      const directory = await fs.opendir(current.path);
      if (current.depth === 0) exists = true;
      directories++;
      for await (const item of directory) {
        if (entries >= MAX_ENTRIES) {
          truncated = true;
          break;
        }
        entries++;
        items.push(item);
      }
    } catch {
      continue;
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    const ancestors = new Set(current.ancestors).add(identity(realDirectory));
    for (const item of items) {
      const path = join(current.path, item.name);
      const name = relative(rootPath, path).split(sep).join("/");
      if (!validDiscoveryName(name)) continue;
      try {
        const stat = await fs.lstat(path);
        if (stat.isDirectory() || stat.isSymbolicLink()) {
          if (stat.isSymbolicLink() && !(await fs.stat(path)).isDirectory()) continue;
          if (current.depth >= MAX_DEPTH) {
            truncated = true;
            continue;
          }
          if (queue.length >= MAX_DIRECTORIES) {
            truncated = true;
            continue;
          }
          queue.push({ path, depth: current.depth + 1, ancestors });
          continue;
        }
        if (!stat.isFile()) continue;
        const bundle = item.name === "SKILL.md";
        const flat = current.depth === 0 && item.name.toLowerCase().endsWith(".md") && item.name.toLowerCase() !== "skill.md";
        if (!bundle && !flat) continue;
        const entryName = bundle ? relative(rootPath, current.path).split(sep).join("/") || "." : item.name.slice(0, -3);
        if (!validDiscoveryName(entryName)) continue;
        const realDocPath = await fs.realpath(path);
        const entryPath = bundle ? current.path : path;
        const realEntryPath = bundle ? realDirectory : realDocPath;
        if (!bundle && byName.has(entryName)) continue;
        byName.set(entryName, { name: entryName, kind: bundle ? "bundle" : "flat", docPath: path, entryPath, realDocPath, realEntryPath, linked: identity(resolve(entryPath)) !== identity(realEntryPath) });
      } catch {
      }
    }
  }
  return { exists, entries: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), truncated };
}
export {
  discoverReadonlyEntries,
  validDiscoveryName
};
