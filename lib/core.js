// dsh-skills-manager core —— 纯 Node 技能文件管理核心（零第三方依赖，可独立单测）
//
// 覆盖 DSH 用户级技能根：
//   - 根目录：~/.dsh/skills
//   - 条目形态：<root>/<name>/SKILL.md（bundle）或 <root>/<name>.md（flat），只扫一层
//   - 前端展示 name、description 与启停状态，不做格式检查或自动修复
//
// 所有函数返回普通结果对象，失败时返回 { ok: false, error }；写文件/日志失败静默降级。

import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import { promises as fs } from "node:fs";

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── 路径解析 ────────────────────────────────────────────────────────────────

export function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

export function resolveAgentsHome() {
  return process.env.DSH_AGENTS_HOME || join(homedir(), ".agents");
}

/** DSH 可管理目录与仅允许启停的公共 Agent 目录。 */
export function userRoots() {
  return [
    { key: "dsh", path: join(resolveDshHome(), "skills"), label: "DSH 技能", mutable: true },
    { key: "agents", path: join(resolveAgentsHome(), "skills"), label: "公共 Agent 技能", mutable: false },
  ];
}

export function logPath() {
  return join(resolveDshHome(), "dsh-skills-manager.log");
}

// ── 命名规整 ────────────────────────────────────────────────────────────────

/** 尽量把任意名称规整为 kebab-case；无法生成合法名称时返回空串。 */
export function toKebab(s) {
  let t = String(s).trim();
  if (t === "") return "";
  t = t.replace(/([a-z0-9])([A-Z])/g, "$1-$2"); // camelCase 边界
  t = t.toLowerCase();
  t = t.replace(/[\s_.]+/g, "-");
  t = t.replace(/[^a-z0-9-]/g, "-");
  t = t.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return t;
}

// ── frontmatter 解析 / 序列化（宽松 YAML 对象，保留键序）────────────────────

/** 剥离 UTF-8 BOM（Windows 工具常写入，不剥离会导致开头 --- 失配）。 */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 解析 SKILL.md 的 frontmatter。返回 { fields, map, body }，map 保留键序。 */
export function parseSkillDoc(text) {
  const src = stripBom(String(text));
  const lines = src.split(/\r?\n/);
  const map = {};
  const fields = [];
  let body = src;
  if (lines.length > 0 && lines[0].trim() === "---") {
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        end = i;
        break;
      }
    }
    if (end >= 0) {
      for (let i = 1; i < end; i++) {
        const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
        if (m) {
          fields.push({ key: m[1], raw: m[2] });
          map[m[1]] = m[2];
        }
      }
      body = lines.slice(end + 1).join("\n");
    }
  }
  return { fields, map, body };
}

export function unquote(v) {
  const s = String(v == null ? "" : v).trim();
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 把 JS 值序列化为 YAML 标量；需要转义的字符串用 JSON 引号形式。 */
export function yamlScalar(v) {
  if (v === true) return "true";
  if (v === false) return "false";
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  const s = String(v);
  if (s === "") return '""';
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s) || /^[-+]?\d+(\.\d+)?$/.test(s)) return JSON.stringify(s);
  if (/[:#{}[\]&*,?|>%@`"'\s]/.test(s) || s !== s.trim()) return JSON.stringify(s);
  return s;
}

export function serializeSkillDoc(map, body) {
  let out = "---\n";
  for (const key of Object.keys(map)) {
    out += `${key}: ${yamlScalar(map[key])}\n`;
  }
  out += "---\n";
  out += body;
  return out;
}

/** 解析布尔字段值；合法布尔返回 true/false，非法返回 undefined。 */
export function parseBoolValue(raw) {
  const v = unquote(raw).trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "on" || v === "1") return true;
  if (v === "false" || v === "no" || v === "off" || v === "0") return false;
  return undefined;
}

// ── 条目定位 / 扫描 ─────────────────────────────────────────────────────────

/** 按名称解析条目（bundle 优先，其次 flat）。找不到返回 null。 */
export async function resolveEntry(root, name) {
  if (typeof name !== "string" || name === "" || basename(name) !== name) return null;
  const bundleDoc = join(root, name, "SKILL.md");
  try {
    const st = await fs.stat(bundleDoc);
    if (st.isFile()) return { kind: "bundle", docPath: bundleDoc };
  } catch {}
  const flatDoc = join(root, `${name}.md`);
  try {
    const st = await fs.stat(flatDoc);
    if (st.isFile()) return { kind: "flat", docPath: flatDoc };
  } catch {}
  return null;
}

function entryOf(name, kind, docPath, doc) {
  const description = doc.map.description !== undefined ? unquote(doc.map.description) : "";
  const modelDisabled = parseBoolValue(doc.map["disable-model-invocation"]) === true;
  const userDisabled = parseBoolValue(doc.map["user-invocable"]) === false;
  return {
    name,
    kind,
    docPath,
    description,
    modelInvocable: !modelDisabled,
    userInvocable: !userDisabled,
  };
}

/** 扫描一个技能根（只扫一层）。返回 { exists, entries }。 */
export async function scanEntries(root) {
  let items;
  try {
    items = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return { exists: false, entries: [] };
  }
  const entries = [];
  for (const it of items) {
    try {
      if (it.isDirectory()) {
        const docPath = join(root, it.name, "SKILL.md");
        const st = await fs.stat(docPath);
        if (!st.isFile()) continue;
        const doc = parseSkillDoc(await fs.readFile(docPath, "utf8"));
        entries.push(entryOf(it.name, "bundle", docPath, doc));
      } else if (it.isFile() && it.name.endsWith(".md") && it.name !== "SKILL.md") {
        const docPath = join(root, it.name);
        const doc = parseSkillDoc(await fs.readFile(docPath, "utf8"));
        entries.push(entryOf(it.name.slice(0, -3), "flat", docPath, doc));
      }
    } catch {
      /* 跳过不可读条目 */
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { exists: true, entries };
}

// ── 启用 / 停用（同时控制模型与 / 手动调用，非破坏）──────────────────────────

/** enabled=true 恢复模型与 / 手动调用；false 同时停用两种调用入口。 */
export async function setSkillEnabled(root, name, enabled) {
  const resolved = await resolveEntry(root, name);
  if (resolved === null) return { ok: false, error: `技能不存在: ${name}` };
  const doc = parseSkillDoc(await fs.readFile(resolved.docPath, "utf8"));
  if (enabled) {
    delete doc.map["disable-model-invocation"];
    delete doc.map["user-invocable"];
  } else {
    doc.map["disable-model-invocation"] = true;
    doc.map["user-invocable"] = false;
  }
  await fs.writeFile(resolved.docPath, serializeSkillDoc(doc.map, doc.body), "utf8");
  return { name, enabled };
}

/** 删除 DSH 根目录中的单个技能。调用方必须先向用户确认。 */
export async function deleteSkill(root, name, log) {
  if (root !== userRoots()[0].path) return { ok: false, error: "公共 Agent 技能目录不允许删除" };
  const resolved = await resolveEntry(root, name);
  if (resolved === null) return { ok: false, error: `技能不存在: ${name}` };
  const entryPath = resolved.kind === "bundle" ? join(root, name) : resolved.docPath;
  await fs.rm(entryPath, { recursive: resolved.kind === "bundle", force: true });
  if (log) log("delete", `删除 ${entryPath}`);
  return { name };
}

// ── 导入 ────────────────────────────────────────────────────────────────────

/** 分析来源：单 skill 目录 / 单 .md 文件 / 批量目录。 */
async function analyzeSource(source) {
  let st;
  try {
    st = await fs.stat(source);
  } catch {
    return { kind: "none", error: `路径不存在: ${source}` };
  }
  if (st.isDirectory()) {
    try {
      const sk = join(source, "SKILL.md");
      const skSt = await fs.stat(sk);
      if (skSt.isFile()) {
        return { kind: "single", rawName: basename(source), kebab: toKebab(basename(source)), source, isDir: true, skillFile: sk };
      }
    } catch {}
    return { kind: "batch", rawName: basename(source), source, isDir: true };
  }
  if (st.isFile() && source.toLowerCase().endsWith(".md")) {
    if (basename(source).toLowerCase() === "skill.md") {
      const parent = dirname(source);
      return { kind: "single", rawName: basename(parent), kebab: toKebab(basename(parent)), source: parent, isDir: true, skillFile: source };
    }
    const rawName = basename(source).slice(0, -3);
    return { kind: "single", rawName, kebab: toKebab(rawName), source, isDir: false, skillFile: source };
  }
  return { kind: "none", error: `无法识别的 skill 来源: ${source}` };
}

async function collectCandidates(dir) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const it of items) {
    try {
      if (it.isDirectory()) {
        const sk = join(dir, it.name, "SKILL.md");
        const st = await fs.stat(sk);
        if (st.isFile()) {
          out.push({ source: join(dir, it.name), kebab: toKebab(it.name), rawName: it.name, isDir: true });
        }
      } else if (it.isFile() && it.name.endsWith(".md") && it.name !== "SKILL.md") {
        out.push({ source: join(dir, it.name), kebab: toKebab(it.name.slice(0, -3)), rawName: it.name.slice(0, -3), isDir: false });
      }
    } catch {
      /* 跳过 */
    }
  }
  return out;
}

/**
 * 导入技能到目标根。
 * options: { conflict: 'skip'|'overwrite', dryRun: boolean }
 * 成功返回 { kind, imported, skipped, failed }；失败返回 { ok:false, error }。
 */
export async function importSkill(source, log, options = {}) {
  const targetRoot = userRoots()[0].path;
  const conflict = options.conflict === "overwrite" ? "overwrite" : "skip";
  const dryRun = options.dryRun === true;

  const analysis = await analyzeSource(source);
  if (analysis.kind === "none") return { ok: false, error: analysis.error || "无法识别的 skill 来源" };

  let candidates = [];
  if (analysis.kind === "single") {
    candidates = [{ source: analysis.source, kebab: analysis.kebab, rawName: analysis.rawName, isDir: analysis.isDir }];
  } else {
    candidates = await collectCandidates(source);
    if (candidates.length === 0) return { ok: false, error: `目录下未找到任何 skill 条目（需含 SKILL.md 的子目录或 .md 文件）: ${source}` };
  }

  const pending = [];
  const conflicts = [];
  const failed = [];
  const imported = [];
  const skipped = [];

  function failureResult() {
    return {
      ok: false,
      error: failed.map((item) => item.error).join("；"),
      kind: analysis.kind,
      imported,
      skipped,
      failed,
    };
  }

  for (const c of candidates) {
    if (!c.kebab || !KEBAB_RE.test(c.kebab)) {
      failed.push({ source: c.source, error: `无法生成合法 kebab-case 名称（原始名: ${c.rawName || basename(c.source)}）` });
      continue;
    }
    const dest = c.isDir ? join(targetRoot, c.kebab) : join(targetRoot, `${c.kebab}.md`);
    const paths = [join(targetRoot, c.kebab), join(targetRoot, `${c.kebab}.md`)];
    const existing = [];
    for (const path of paths) {
      try {
        await fs.stat(path);
        existing.push(path);
      } catch {}
    }
    if (existing.length) {
      conflicts.push({ name: c.kebab, source: c.source, isDir: c.isDir, paths: existing });
      continue;
    }
    pending.push({ name: c.kebab, source: c.source, isDir: c.isDir, dest });
  }

  if (dryRun) {
    if (failed.length && pending.length === 0 && conflicts.length === 0) return failureResult();
    return { kind: analysis.kind, pending, conflicts, failed };
  }

  await fs.mkdir(targetRoot, { recursive: true });

  for (const p of pending) {
    try {
      if (p.isDir) await fs.cp(p.source, p.dest, { recursive: true });
      else await fs.copyFile(p.source, p.dest);
      imported.push({ name: p.name, overwritten: false, warnings: [] });
      if (log) log("import", `导入 ${p.source} -> ${p.dest}`);
    } catch (e) {
      failed.push({ source: p.source, error: String(e && e.message ? e.message : e) });
    }
  }

  if (conflict === "overwrite") {
    for (const c of conflicts) {
      try {
        const dest = c.isDir ? join(targetRoot, c.name) : join(targetRoot, `${c.name}.md`);
        for (const path of c.paths) await fs.rm(path, { recursive: true, force: true });
        if (c.isDir) await fs.cp(c.source, dest, { recursive: true });
        else await fs.copyFile(c.source, dest);
        imported.push({ name: c.name, overwritten: true, warnings: [] });
        if (log) log("import-overwrite", `覆盖导入 ${c.source} -> ${dest}`);
      } catch (e) {
        failed.push({ source: c.source, error: String(e && e.message ? e.message : e) });
      }
    }
  } else {
    for (const c of conflicts) skipped.push({ name: c.name, source: c.source });
  }

  if (failed.length && imported.length === 0) return failureResult();
  return { kind: analysis.kind, imported, skipped, failed };
}

// ── 状态快照 ────────────────────────────────────────────────────────────────

/** DSH 与公共 Agent 根目录技能快照。 */
export async function state() {
  const roots = userRoots();
  const result = { roots: [] };
  for (const root of roots) {
    const { exists, entries } = await scanEntries(root.path);
    const skills = [];
    for (const e of entries) {
      skills.push({
        name: e.name,
        kind: e.kind,
        description: e.description,
        modelInvocable: e.modelInvocable,
        userInvocable: e.userInvocable,
      });
    }
    result.roots.push({ key: root.key, path: root.path, label: root.label, mutable: root.mutable, exists, skills });
  }
  return result;
}

export { KEBAB_RE };
