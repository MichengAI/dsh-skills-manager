import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { RepositoryInput, RepositorySource, CodedError } from "./types.js";

function failure(message: string, code = "error.repo.invalid", params?: Record<string, unknown>): CodedError {
  return Object.assign(new Error(message), {
    code,
    statusCode: 400,
    ...(params && typeof params === "object" && !Array.isArray(params) ? { params } : {}),
  });
}

function safePath(value: string, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > 512 || (!value && !allowEmpty)) throw failure("仓库路径无效");
  if (!value) return value;
  const parts = value.split("/");
  if (
    parts.length > 64 ||
    parts.some(
      (p) =>
        !p ||
        p === "." ||
        p === ".." ||
        /[\\:<>\"|?*\x00-\x1f]/.test(p) ||
        /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)
    )
  ) {
    throw failure("仓库路径不安全");
  }
  return value;
}

export function parseGitUrl(input: RepositoryInput = {}): RepositorySource {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw failure("仓库参数必须是对象");
  if (["ref", "subdirectory"].some((key) => input[key as keyof RepositoryInput] !== undefined && typeof input[key as keyof RepositoryInput] !== "string")) {
    throw failure("仓库分支和子目录必须是字符串");
  }
  let raw = typeof input.url === "string" ? input.url.trim() : "";
  if (!raw || raw.length > 2048 || /[%?#\s]/.test(raw)) throw failure("仓库地址无效");
  const isLocalPath = raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw);
  if (!isLocalPath && /\\/.test(raw)) throw failure("仓库地址无效");
  if (raw.startsWith("-") || raw.includes("::")) throw failure("仓库地址不安全");
  if (/@/.test(raw)) throw failure("仓库地址不能包含用户名或密码");

  // 本地文件系统目录（支持测试环境或私有磁盘路径）
  if (raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw)) {
    const normalized = raw.replace(/\\/g, "/").replace(/\/$/, "");
    const parts = normalized.split("/");
    const name = (parts.pop() || "").replace(/\.git$/, "").toLowerCase();
    const owner = (parts.pop() || "local").toLowerCase();
    const ref = input.ref || "";
    const subdirectory = safePath(input.subdirectory || "", true);
    return { owner, name, ref, subdirectory, url: raw };
  }

  // GitHub 简写格式 owner/name
  if (!raw.includes("://")) {
    const parts = raw.replace(/\/$/, "").split("/");
    const owner = (parts[0] || "").toLowerCase();
    const name = (parts[1] || "").replace(/\.git$/, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner) || !/^[a-z0-9_.-]{1,100}$/.test(name) || name === "." || name === ".." || parts.length !== 2) {
      throw failure("请输入公开 Git 仓库地址或 owner/repo");
    }
    const ref = input.ref || "";
    if (typeof ref !== "string" || ref.length > 200 || (ref && !/^[a-zA-Z0-9_./-]+$/.test(ref)) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) {
      throw failure("仓库分支无效");
    }
    const subdirectory = safePath(input.subdirectory || "", true);
    return { owner, name, ref, subdirectory };
  }

  // GitHub 官方标准 URL（保留原有无 url 字段的数据结构，保持历史 ID 不变）
  if (raw.startsWith("https://github.com/")) {
    const stripped = raw.slice(19);
    const parts = stripped.replace(/\/$/, "").split("/");
    const owner = (parts[0] || "").toLowerCase();
    const name = (parts[1] || "").replace(/\.git$/, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner) || !/^[a-z0-9_.-]{1,100}$/.test(name) || name === "." || name === ".." || (parts.length > 2 && (parts[2] !== "tree" || !parts[3]))) {
      throw failure("请输入公开 GitHub 仓库地址或 owner/repo");
    }
    const ref = input.ref || parts[3] || "";
    if (typeof ref !== "string" || ref.length > 200 || (ref && !/^[a-zA-Z0-9_./-]+$/.test(ref)) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) {
      throw failure("仓库分支无效");
    }
    const subdirectory = safePath(input.subdirectory || parts.slice(4).join("/"), true);
    return { owner, name, ref, subdirectory };
  }

  // 通用 HTTPS / HTTP Git 仓库（如 Gitee、GitLab、自建 Git 服务、加速站前缀等）
  let urlObj: URL;
  try {
    urlObj = new URL(raw);
  } catch {
    throw failure("仓库地址无效");
  }
  if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
    throw failure("仅支持 HTTP 或 HTTPS 协议的 Git 仓库地址");
  }
  if (urlObj.hostname === "github.com" && urlObj.protocol !== "https:") {
    throw failure("GitHub 仓库仅支持 HTTPS 地址");
  }
  if (urlObj.hostname.startsWith("github.com.") || urlObj.hostname.endsWith(".evil")) {
    throw failure("仓库地址无效");
  }
  if (urlObj.username || urlObj.password) {
    throw failure("仓库地址不能包含用户名或密码");
  }
  if (!urlObj.hostname || urlObj.hostname.startsWith("-")) {
    throw failure("仓库地址无效");
  }

  let pathname = urlObj.pathname;
  let extractedRef = "";
  let extractedSubdir = "";

  // 识别并解构常见的代理/镜像前缀（如 https://gh-proxy.com/https://github.com/owner/name）
  let targetPath = pathname;
  const proxyMatch = raw.match(/^https?:\/\/[^/]+\/(https?:\/\/.+)$/i) || raw.match(/^https?:\/\/[^/]+\/(github\.com\/.+)$/i);
  if (proxyMatch) {
    try {
      const innerUrl = proxyMatch[1].startsWith("http") ? new URL(proxyMatch[1]) : new URL("https://" + proxyMatch[1]);
      targetPath = innerUrl.pathname;
    } catch {
      // 保持原有 pathname
    }
  }

  const treeMarkers = ["/-/tree/", "/-/blob/", "/src/branch/", "/src/tag/", "/tree/"];
  for (const marker of treeMarkers) {
    const idx = targetPath.indexOf(marker);
    if (idx !== -1) {
      const rest = targetPath.slice(idx + marker.length);
      targetPath = targetPath.slice(0, idx);
      const slash = rest.indexOf("/");
      if (slash !== -1) {
        extractedRef = decodeURIComponent(rest.slice(0, slash));
        extractedSubdir = decodeURIComponent(rest.slice(slash + 1));
      } else {
        extractedRef = decodeURIComponent(rest);
      }
      break;
    }
  }

  targetPath = targetPath.replace(/\/$/, "");
  const segments = targetPath.split("/").filter(Boolean);
  if (!segments.length) throw failure("仓库地址无效");
  const rawName = segments[segments.length - 1].replace(/\.git$/, "");
  const name = rawName.toLowerCase();
  if (!name || name === "." || name === "..") throw failure("仓库名称无效");

  const ownerSegments = segments.slice(0, -1);
  const owner = (ownerSegments.length ? ownerSegments.join("/") : urlObj.hostname).toLowerCase();

  const ref = input.ref || extractedRef || "";
  if (typeof ref !== "string" || ref.length > 200 || (ref && !/^[a-zA-Z0-9_./-]+$/.test(ref)) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) {
    throw failure("仓库分支无效");
  }
  const subdirectory = safePath(input.subdirectory || extractedSubdir || "", true);
  return { owner, name, ref, subdirectory, url: raw };
}

export interface GitFetchOptions {
  maxBytes?: number;
  maxTransientBytes?: number;
  timeoutMs?: number;
  gitBinary?: string;
}

export async function getDirectorySize(dir: string): Promise<number> {
  let total = 0;
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const info = await fs.lstat(full);
        total += info.size;
      }
    }
  }
  await walk(dir);
  return total;
}

function mapGitError(stderr: string): CodedError {
  const low = stderr.toLowerCase();
  if (
    low.includes("could not read username") ||
    low.includes("terminal prompts disabled") ||
    low.includes("authentication failed") ||
    low.includes("permission denied")
  ) {
    return failure("Git 仓库需要鉴权或无权访问，请确认仓库公开可访问", "error.repo.network");
  }
  if (
    low.includes("couldn't find remote ref") ||
    low.includes("unknown revision") ||
    low.includes("not found") ||
    low.includes("does not appear to be a git repository")
  ) {
    return failure("Git 仓库或分支不存在", "error.repo.network");
  }
  if (
    low.includes("could not resolve host") ||
    low.includes("connection refused") ||
    low.includes("network is unreachable") ||
    low.includes("timed out") ||
    low.includes("failed to connect")
  ) {
    return failure("无法连接到 Git 仓库，请检查网络或加速地址", "error.repo.network");
  }
  const line = stderr.trim().split("\n").pop() || "";
  return failure(line ? `Git 请求失败: ${line}` : "Git 请求失败，请检查网络或仓库地址", "error.repo.network");
}

function killProcessTree(child: ChildProcess) {
  if (child.pid) {
    if (process.platform === "win32") {
      try {
        spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
      } catch {
        child.kill("SIGKILL");
      }
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  }
}

interface RunGitOptions {
  timeoutMs?: number;
  gitBinary?: string;
  /** 通过标准输入传给 Git 的整段文本；规则条目很多时避免超出 Windows 命令行长度上限。 */
  input?: string;
}

function runGit(
  args: string[],
  cwd: string,
  optionsOrTimeout: RunGitOptions | number,
  legacyGitBinary = "git"
): Promise<{ stdout: string; stderr: string }> {
  const options = typeof optionsOrTimeout === "number" ? { timeoutMs: optionsOrTimeout, gitBinary: legacyGitBinary } : optionsOrTimeout;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const gitBinary = options.gitBinary || "git";

  return new Promise((resolve, reject) => {
    const child = spawn(
      gitBinary,
      [
        "-c", "protocol.ext.allow=never",
        "-c", "core.symlinks=false",
        "-c", "core.autocrlf=false",
        // 技能目录层级深时，Windows 默认 260 字符上限会让检出直接失败。
        "-c", "core.longpaths=true",
        "-c", "advice.detachedHead=false",
        // 只支持公开仓库：禁用凭据助手，避免 Git Credential Manager 弹出账号选择窗口并卡住插件进程。
        "-c", "credential.helper=",
        "-c", "http.lowSpeedLimit=1000",
        "-c", "http.lowSpeedTime=30",
        ...args
      ],
      {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GCM_INTERACTIVE: "never",
          GIT_ASKPASS: "echo",
          LC_ALL: "C",
          LANGUAGE: "C",
        },
        // 只在确实要写规则时才接管 stdin，其余调用保持 ignore。
        stdio: (options.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]) as ["ignore" | "pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      }
    ) as ChildProcessWithoutNullStreams;
    let stdout = "";
    let stderr = "";
    let killed = false;

    if (options.input !== undefined && child.stdin) {
      // Git 在读到规则前就退出（例如不认识该子命令）时会 EPIPE，不能让它变成未捕获异常。
      child.stdin.on("error", () => undefined);
      child.stdin.end(options.input);
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      killed = true;
      killProcessTree(child);
      reject(failure("Git 请求超时，请检查网络后重试", "error.repo.network"));
    }, timeoutMs);

    child.on("error", (err: unknown) => {
      clearTimeout(timer);
      if (killed) return;
      const code = (err as { code?: string })?.code;
      if (code === "ENOENT") {
        reject(failure("未检测到 Git 命令行工具，请先安装 Git 后重试", "error.repo.noGit"));
      } else {
        reject(failure(`无法启动 Git: ${(err as Error).message}`, "error.repo.network"));
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code === 0) resolve({ stdout, stderr });
      else reject(mapGitError(stderr || stdout));
    });
  });
}

async function rmWithRetry(target: string, retries = 10, delay = 50): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (i === retries - 1 || (code !== "EBUSY" && code !== "EPERM" && code !== "EACCES")) throw e;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function probeGitRemote(
  repoUrl: string,
  options: { timeoutMs?: number; gitBinary?: string } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const gitBinary = options.gitBinary || "git";

  try {
    await runGit(["ls-remote", "--heads", "-q", "--", repoUrl], process.cwd(), { timeoutMs, gitBinary });
  } catch (caught) {
    const err = caught as CodedError;
    throw failure(err.message || "仓库无法访问或不存在，请检查地址或权限", "error.repo.network");
  }
}

export async function probeGitHubHttp(
  owner: string,
  name: string,
  fetchImpl: typeof fetch = globalThis.fetch,
  timeoutMs = 15_000
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://github.com/${owner}/${name}`, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (res.status === 404) {
      throw failure("仓库无法访问或不存在，请检查地址或权限", "error.repo.network");
    }
  } catch (caught: any) {
    if (caught && caught.code === "error.repo.network") throw caught;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGitRepository(
  repo: RepositorySource,
  destinationDir: string,
  options: GitFetchOptions = {}
): Promise<{ commit: string }> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024 * 1024;
  const maxTransientBytes = options.maxTransientBytes ?? (maxBytes * 2.5);
  const timeoutMs = options.timeoutMs ?? 900_000;
  const deadline = Date.now() + timeoutMs;
  const gitBinary = options.gitBinary || "git";
  const remainingTimeout = () => {
    const remain = deadline - Date.now();
    if (remain <= 0) throw failure("Git 请求超时，请检查网络后重试", "error.repo.network");
    return remain;
  };
  const repoUrl = repo.url || `https://github.com/${repo.owner}/${repo.name}.git`;
  const ref = repo.ref && repo.ref !== "HEAD" ? repo.ref : "HEAD";

  await fs.mkdir(destinationDir, { recursive: true });

  try {
    await runGit(["init", "-q"], destinationDir, { timeoutMs: remainingTimeout(), gitBinary });
    const refsToTry = ref === "HEAD" ? ["HEAD"] : [`refs/heads/${ref}`, `refs/tags/${ref}`, ref];
    let fetched = false;
    let lastError: unknown;

    for (const r of refsToTry) {
      try {
        await runGit(["fetch", "--progress", "--depth", "1", "--no-tags", "--", repoUrl, r], destinationDir, { timeoutMs: remainingTimeout(), gitBinary });
        fetched = true;
        break;
      } catch (err) {
        lastError = err;
        if (r === refsToTry[refsToTry.length - 1]) {
          try {
            await runGit(["fetch", "--progress", "--no-tags", "--", repoUrl, r], destinationDir, { timeoutMs: remainingTimeout(), gitBinary });
            fetched = true;
          } catch {
            throw err;
          }
        }
      }
    }
    if (!fetched) throw lastError || failure("Git 分支或标签不存在", "error.repo.network");

    await runGit(["checkout", "-q", "FETCH_HEAD"], destinationDir, { timeoutMs: remainingTimeout(), gitBinary });
    const { stdout: commitOut } = await runGit(["rev-parse", "FETCH_HEAD^{commit}"], destinationDir, { timeoutMs: remainingTimeout(), gitBinary });
    const commit = commitOut.trim();

    const rawSize = await getDirectorySize(destinationDir);
    if (rawSize > maxTransientBytes) {
      throw failure("仓库临时下载体积过大（包含 Git 历史对象）", "error.repo.transientTooLarge", { limit: maxTransientBytes, actual: rawSize });
    }

    await rmWithRetry(join(destinationDir, ".git"));
    const totalSize = await getDirectorySize(destinationDir);
    if (totalSize > maxBytes) {
      throw failure("仓库超过大小限制", "error.repo.tooLarge", { limit: maxBytes, actual: totalSize });
    }

    return { commit };
  } catch (err) {
    await rmWithRetry(destinationDir).catch(() => undefined);
    throw err;
  }
}

const SKILL_DOC_SUFFIX = "/SKILL.md";
/** 仓库里一个技能都没有时使用的规则：匹配不到任何路径，避免为「没有技能」下载整库。 */
const EMPTY_CHECKOUT_PATTERN = "/.dsh-skills-manager-empty/**";

/** 目录名里的 [ ] 在检出规则中是字符类，必须转义成字面量；* ? \ 之类别名 safePath 已经拦下。 */
function checkoutPatternFor(directory: string): string {
  return `/${directory.replace(/[[\]]/g, "\\$&")}/**`;
}

/**
 * 把仓库文件清单换算成稀疏检出规则，只覆盖含 SKILL.md 的技能目录。
 * 根级 SKILL.md 代表技能包含整库文件，返回 null 表示必须完整检出。
 */
export function skillCheckoutPatterns(paths: string[], subdirectory = ""): string[] | null {
  const collected: string[] = [];
  for (const path of paths) {
    if (typeof path !== "string" || !path) continue;
    if (path === "SKILL.md") return null;
    if (!path.endsWith(SKILL_DOC_SUFFIX)) continue;
    const directory = path.slice(0, -SKILL_DOC_SUFFIX.length);
    if (!directory) continue;
    if (subdirectory && directory !== subdirectory && !directory.startsWith(`${subdirectory}/`)) continue;
    // 规则直接进 Git，仓库自带的目录名不能越过与技能文件同样的路径约束。
    safePath(directory);
    collected.push(directory);
  }
  if (!collected.length) return [EMPTY_CHECKOUT_PATTERN];
  const directories = [...new Set(collected)].sort();
  return directories
    .filter((directory) => !directories.some((other) => other !== directory && directory.startsWith(`${other}/`)))
    .map(checkoutPatternFor);
}

/** 清单来自目录树对象，部分克隆下不触发任何 blob 下载。 */
async function listTreePaths(
  destinationDir: string,
  revision: string,
  options: RunGitOptions & { timeoutMs: number }
): Promise<string[]> {
  const { stdout } = await runGit(["ls-tree", "-r", "-z", "--name-only", "--", revision], destinationDir, options);
  return stdout.split("\0").filter(Boolean);
}

async function clearSparseCheckout(destinationDir: string, options: RunGitOptions & { timeoutMs: number }): Promise<void> {
  // 老版本 Git 可能连 sparse-checkout 子命令都没有，因此只回退配置与规则文件。
  for (const key of ["core.sparseCheckout", "core.sparseCheckoutCone"]) {
    await runGit(["config", "--unset-all", key], destinationDir, options).catch(() => undefined);
  }
  await fs.rm(join(destinationDir, ".git", "info", "sparse-checkout"), { force: true }).catch(() => undefined);
}

/**
 * GitHub（及任何支持部分克隆的 Git 服务）来源的按需检出：
 * 先取提交与目录树，再只把技能目录写进工作树，仓库首页图之类的无关内容不参与下载。
 * 服务端不支持过滤、或本地 Git 过老时，逐级退化为浅克隆与完整检出。
 */
export async function sparseFetchGitRepository(
  repo: RepositorySource,
  destinationDir: string,
  options: GitFetchOptions = {}
): Promise<{ commit: string }> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024 * 1024;
  const maxTransientBytes = options.maxTransientBytes ?? (maxBytes * 2.5);
  const timeoutMs = options.timeoutMs ?? 900_000;
  const deadline = Date.now() + timeoutMs;
  const gitBinary = options.gitBinary || "git";
  const remainingTimeout = () => {
    const remain = deadline - Date.now();
    if (remain <= 0) throw failure("Git 请求超时，请检查网络后重试", "error.repo.network");
    return { timeoutMs: remain, gitBinary };
  };
  const repoUrl = repo.url || `https://github.com/${repo.owner}/${repo.name}.git`;
  const ref = repo.ref && repo.ref !== "HEAD" ? repo.ref : "HEAD";

  await fs.mkdir(destinationDir, { recursive: true });

  try {
    await runGit(["init", "-q"], destinationDir, remainingTimeout());
    // 按需取回 blob 需要具名远端，因此这里不能用 fetch <url> 的无远端写法。
    await runGit(["remote", "add", "origin", repoUrl], destinationDir, remainingTimeout());

    const refsToTry = ref === "HEAD" ? ["HEAD"] : [`refs/heads/${ref}`, `refs/tags/${ref}`, ref];
    let fetched = false;
    let lastError: unknown;

    for (const r of refsToTry) {
      try {
        await runGit(["fetch", "--progress", "--depth", "1", "--no-tags", "--filter=blob:none", "--", "origin", r], destinationDir, remainingTimeout());
        fetched = true;
        break;
      } catch (err) {
        lastError = err;
        try {
          await runGit(["fetch", "--progress", "--depth", "1", "--no-tags", "--", "origin", r], destinationDir, remainingTimeout());
          fetched = true;
          break;
        } catch (err2) {
          lastError = err2;
          if (r === refsToTry[refsToTry.length - 1]) {
            try {
              await runGit(["fetch", "--progress", "--no-tags", "--", "origin", r], destinationDir, remainingTimeout());
              fetched = true;
            } catch {
              throw err2;
            }
          }
        }
      }
    }
    if (!fetched) throw lastError || failure("Git 分支或标签不存在", "error.repo.network");

    const { stdout: commitOut } = await runGit(["rev-parse", "FETCH_HEAD^{commit}"], destinationDir, remainingTimeout());
    const commit = commitOut.trim();

    const patterns = skillCheckoutPatterns(await listTreePaths(destinationDir, "FETCH_HEAD", remainingTimeout()), repo.subdirectory);
    if (patterns) {
      try {
        // 规则经标准输入传入：技能目录很多时命令行长度会在 Windows 上先撑不住。
        await runGit(["sparse-checkout", "set", "--no-cone", "--stdin"], destinationDir, { ...remainingTimeout(), input: `${patterns.join("\n")}\n` });
      } catch (err) {
        const code = (err as CodedError)?.code;
        // Git 本身不可用（缺命令、网络断了）必须交回上层决定是否回落归档。
        if (code === "error.repo.noGit" || code === "error.repo.network") throw err;
        // 只是 Git 过老不认识稀疏检出：清掉半写的规则，退回完整检出，不能让本来可用的仓库变坏。
        await clearSparseCheckout(destinationDir, remainingTimeout());
      }
    }

    await runGit(["checkout", "-q", "FETCH_HEAD"], destinationDir, remainingTimeout());

    const rawSize = await getDirectorySize(destinationDir);
    if (rawSize > maxTransientBytes) {
      throw failure("仓库临时下载体积过大（包含 Git 历史对象）", "error.repo.transientTooLarge", { limit: maxTransientBytes, actual: rawSize });
    }

    await rmWithRetry(join(destinationDir, ".git"));
    const totalSize = await getDirectorySize(destinationDir);
    if (totalSize > maxBytes) {
      throw failure("仓库超过大小限制", "error.repo.tooLarge", { limit: maxBytes, actual: totalSize });
    }

    return { commit };
  } catch (err) {
    await rmWithRetry(destinationDir).catch(() => undefined);
    throw err;
  }
}
