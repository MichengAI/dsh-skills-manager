import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
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
        "-c", "advice.detachedHead=false",
        "-c", "http.lowSpeedLimit=1000",
        "-c", "http.lowSpeedTime=30",
        ...args
      ],
      {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          LC_ALL: "C",
          LANGUAGE: "C",
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      }
    );
    let stdout = "";
    let stderr = "";
    let killed = false;

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
