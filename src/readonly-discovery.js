// 只读技能目录发现：允许目录链接，按发现路径过滤隐藏目录，用真实祖先路径终止循环。
import { promises as fs } from "node:fs";
import { resolve, join, relative, sep } from "node:path";

const MAX_DEPTH = 6;
const MAX_DIRECTORIES = 2000;
const MAX_ENTRIES = 20000;
const identity = path => process.platform === "win32" ? path.toLowerCase() : path;

/** 只读条目使用根下相对路径；点号表示根本身的 SKILL.md，不接受路径穿越。 */
export function validDiscoveryName(name) {
  return typeof name === "string" && (name === "." || (name.length <= 1024 && name.split("/").every(
    part => part.length > 0 && part.length <= 255 && !part.startsWith(".") && !/[\\:*?"<>|\0]/.test(part) && !/[. ]$/.test(part)
      && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part)
  )));
}

/** 只返回文件定位信息，不读取正文，供列表、详情及策略复用同一发现与去重规则。 */
export async function discoverReadonlyEntries(root) {
  const rootPath = resolve(root);
  const queue = [{ path: rootPath, depth: 0, ancestors: new Set() }];
  const byName = new Map();
  let directories = 0;
  let entries = 0;
  let exists = false;
  let truncated = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (directories >= MAX_DIRECTORIES || entries >= MAX_ENTRIES) { truncated = true; break; }
    const current = queue[cursor];
    let realDirectory;
    let items = [];
    try {
      realDirectory = await fs.realpath(current.path);
      const key = identity(realDirectory);
      if (current.ancestors.has(key)) continue;
      // 普通 bundle 是叶子，在枚举前识别，避免资源文件耗尽整根预算。
      // 根自身的 SKILL.md 可与其他技能并存，因此根目录继续发现。
      if (current.depth > 0) {
        const docPath = join(current.path, "SKILL.md");
        let docStat;
        try { docStat = await fs.lstat(docPath); } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (docStat?.isFile() && !docStat.isSymbolicLink()) {
          const name = relative(rootPath, current.path).split(sep).join("/");
          const realDocPath = await fs.realpath(docPath);
          directories++;
          byName.set(name, { name, kind: "bundle", docPath, entryPath: current.path, realDocPath, realEntryPath: realDirectory, linked: identity(resolve(current.path)) !== identity(realDirectory) });
          continue;
        }
      }
      const directory = await fs.opendir(current.path);
      if (current.depth === 0) exists = true;
      directories++;
      for await (const item of directory) {
        if (entries >= MAX_ENTRIES) { truncated = true; break; }
        entries++;
        items.push(item);
      }
    } catch { continue; } // 失效链接或不可读目录不阻断其他来源。
    items.sort((a, b) => a.name.localeCompare(b.name));
    const ancestors = new Set(current.ancestors).add(identity(realDirectory));
    for (const item of items) {
      const path = join(current.path, item.name);
      const name = relative(rootPath, path).split(sep).join("/");
      if (!validDiscoveryName(name)) continue;
      try {
        const stat = await fs.lstat(path);
        if (stat.isDirectory() || stat.isSymbolicLink()) {
          if (identity(item.name) === "node_modules") continue;
          if (stat.isSymbolicLink() && !(await fs.stat(path)).isDirectory()) continue;
          if (current.depth >= MAX_DEPTH) { truncated = true; continue; }
          // 待遍历队列也受目录预算约束，避免宽目录占用无界内存。
          if (queue.length >= MAX_DIRECTORIES) { truncated = true; continue; }
          queue.push({ path, depth: current.depth + 1, ancestors });
          continue;
        }
        if (!stat.isFile()) continue;
        const bundle = item.name === "SKILL.md";
        // 保留既有顶层单文件技能兼容，不把嵌套 README 或参考文档识别成技能。
        const flat = current.depth === 0 && item.name.toLowerCase().endsWith(".md") && item.name.toLowerCase() !== "skill.md";
        if (!bundle && !flat) continue;
        const entryName = bundle ? relative(rootPath, current.path).split(sep).join("/") || "." : item.name.slice(0, -3);
        if (!validDiscoveryName(entryName)) continue;
        const realDocPath = await fs.realpath(path);
        const entryPath = bundle ? current.path : path;
        const realEntryPath = bundle ? realDirectory : realDocPath;
        if (!bundle && byName.has(entryName)) continue;
        byName.set(entryName, { name: entryName, kind: bundle ? "bundle" : "flat", docPath: path, entryPath, realDocPath, realEntryPath, linked: identity(resolve(entryPath)) !== identity(realEntryPath) });
      } catch { /* 来源在扫描期间失效时跳过；加载前仍复验真实路径。 */ }
    }
  }
  return { exists, entries: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), truncated };
}
