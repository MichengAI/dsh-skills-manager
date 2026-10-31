import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
function failure(message, code = "error.repo.invalid", params) {
  return Object.assign(new Error(message), {
    code,
    statusCode: 400,
    ...params && typeof params === "object" && !Array.isArray(params) ? { params } : {}
  });
}
function safePath(value, allowEmpty = false) {
  if (typeof value !== "string" || value.length > 512 || !value && !allowEmpty) throw failure("\u4ED3\u5E93\u8DEF\u5F84\u65E0\u6548");
  if (!value) return value;
  const parts = value.split("/");
  if (parts.length > 64 || parts.some(
    (p) => !p || p === "." || p === ".." || /[\\:<>\"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)
  )) {
    throw failure("\u4ED3\u5E93\u8DEF\u5F84\u4E0D\u5B89\u5168");
  }
  return value;
}
function parseGitUrl(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw failure("\u4ED3\u5E93\u53C2\u6570\u5FC5\u987B\u662F\u5BF9\u8C61");
  if (["ref", "subdirectory"].some((key) => input[key] !== void 0 && typeof input[key] !== "string")) {
    throw failure("\u4ED3\u5E93\u5206\u652F\u548C\u5B50\u76EE\u5F55\u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
  }
  let raw = typeof input.url === "string" ? input.url.trim() : "";
  if (!raw || raw.length > 2048 || /[%?#\s]/.test(raw)) throw failure("\u4ED3\u5E93\u5730\u5740\u65E0\u6548");
  const isLocalPath = raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw);
  if (!isLocalPath && /\\/.test(raw)) throw failure("\u4ED3\u5E93\u5730\u5740\u65E0\u6548");
  if (raw.startsWith("-") || raw.includes("::")) throw failure("\u4ED3\u5E93\u5730\u5740\u4E0D\u5B89\u5168");
  if (/@/.test(raw)) throw failure("\u4ED3\u5E93\u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
  if (raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw)) {
    const normalized = raw.replace(/\\/g, "/").replace(/\/$/, "");
    const parts = normalized.split("/");
    const name2 = (parts.pop() || "").replace(/\.git$/, "").toLowerCase();
    const owner2 = (parts.pop() || "local").toLowerCase();
    const ref2 = input.ref || "";
    const subdirectory2 = safePath(input.subdirectory || "", true);
    return { owner: owner2, name: name2, ref: ref2, subdirectory: subdirectory2, url: raw };
  }
  if (!raw.includes("://")) {
    const parts = raw.replace(/\/$/, "").split("/");
    const owner2 = (parts[0] || "").toLowerCase();
    const name2 = (parts[1] || "").replace(/\.git$/, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner2) || !/^[a-z0-9_.-]{1,100}$/.test(name2) || name2 === "." || name2 === ".." || parts.length !== 2) {
      throw failure("\u8BF7\u8F93\u5165\u516C\u5F00 Git \u4ED3\u5E93\u5730\u5740\u6216 owner/repo");
    }
    const ref2 = input.ref || "";
    if (typeof ref2 !== "string" || ref2.length > 200 || ref2 && !/^[a-zA-Z0-9_./-]+$/.test(ref2) || ref2.includes("..") || ref2.startsWith("/") || ref2.endsWith("/")) {
      throw failure("\u4ED3\u5E93\u5206\u652F\u65E0\u6548");
    }
    const subdirectory2 = safePath(input.subdirectory || "", true);
    return { owner: owner2, name: name2, ref: ref2, subdirectory: subdirectory2 };
  }
  if (raw.startsWith("https://github.com/")) {
    const stripped = raw.slice(19);
    const parts = stripped.replace(/\/$/, "").split("/");
    const owner2 = (parts[0] || "").toLowerCase();
    const name2 = (parts[1] || "").replace(/\.git$/, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner2) || !/^[a-z0-9_.-]{1,100}$/.test(name2) || name2 === "." || name2 === ".." || parts.length > 2 && (parts[2] !== "tree" || !parts[3])) {
      throw failure("\u8BF7\u8F93\u5165\u516C\u5F00 GitHub \u4ED3\u5E93\u5730\u5740\u6216 owner/repo");
    }
    const ref2 = input.ref || parts[3] || "";
    if (typeof ref2 !== "string" || ref2.length > 200 || ref2 && !/^[a-zA-Z0-9_./-]+$/.test(ref2) || ref2.includes("..") || ref2.startsWith("/") || ref2.endsWith("/")) {
      throw failure("\u4ED3\u5E93\u5206\u652F\u65E0\u6548");
    }
    const subdirectory2 = safePath(input.subdirectory || parts.slice(4).join("/"), true);
    return { owner: owner2, name: name2, ref: ref2, subdirectory: subdirectory2 };
  }
  let urlObj;
  try {
    urlObj = new URL(raw);
  } catch {
    throw failure("\u4ED3\u5E93\u5730\u5740\u65E0\u6548");
  }
  if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
    throw failure("\u4EC5\u652F\u6301 HTTP \u6216 HTTPS \u534F\u8BAE\u7684 Git \u4ED3\u5E93\u5730\u5740");
  }
  if (urlObj.hostname === "github.com" && urlObj.protocol !== "https:") {
    throw failure("GitHub \u4ED3\u5E93\u4EC5\u652F\u6301 HTTPS \u5730\u5740");
  }
  if (urlObj.hostname.startsWith("github.com.") || urlObj.hostname.endsWith(".evil")) {
    throw failure("\u4ED3\u5E93\u5730\u5740\u65E0\u6548");
  }
  if (urlObj.username || urlObj.password) {
    throw failure("\u4ED3\u5E93\u5730\u5740\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801");
  }
  if (!urlObj.hostname || urlObj.hostname.startsWith("-")) {
    throw failure("\u4ED3\u5E93\u5730\u5740\u65E0\u6548");
  }
  let pathname = urlObj.pathname;
  let extractedRef = "";
  let extractedSubdir = "";
  let targetPath = pathname;
  const proxyMatch = raw.match(/^https?:\/\/[^/]+\/(https?:\/\/.+)$/i) || raw.match(/^https?:\/\/[^/]+\/(github\.com\/.+)$/i);
  if (proxyMatch) {
    try {
      const innerUrl = proxyMatch[1].startsWith("http") ? new URL(proxyMatch[1]) : new URL("https://" + proxyMatch[1]);
      targetPath = innerUrl.pathname;
    } catch {
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
  if (!segments.length) throw failure("\u4ED3\u5E93\u5730\u5740\u65E0\u6548");
  const rawName = segments[segments.length - 1].replace(/\.git$/, "");
  const name = rawName.toLowerCase();
  if (!name || name === "." || name === "..") throw failure("\u4ED3\u5E93\u540D\u79F0\u65E0\u6548");
  const ownerSegments = segments.slice(0, -1);
  const owner = (ownerSegments.length ? ownerSegments.join("/") : urlObj.hostname).toLowerCase();
  const ref = input.ref || extractedRef || "";
  if (typeof ref !== "string" || ref.length > 200 || ref && !/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) {
    throw failure("\u4ED3\u5E93\u5206\u652F\u65E0\u6548");
  }
  const subdirectory = safePath(input.subdirectory || extractedSubdir || "", true);
  return { owner, name, ref, subdirectory, url: raw };
}
async function getDirectorySize(dir) {
  let total = 0;
  async function walk(current) {
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
function mapGitError(stderr) {
  const low = stderr.toLowerCase();
  if (low.includes("could not read username") || low.includes("terminal prompts disabled") || low.includes("authentication failed") || low.includes("permission denied")) {
    return failure("Git \u4ED3\u5E93\u9700\u8981\u9274\u6743\u6216\u65E0\u6743\u8BBF\u95EE\uFF0C\u8BF7\u786E\u8BA4\u4ED3\u5E93\u516C\u5F00\u53EF\u8BBF\u95EE", "error.repo.network");
  }
  if (low.includes("couldn't find remote ref") || low.includes("unknown revision") || low.includes("not found") || low.includes("does not appear to be a git repository")) {
    return failure("Git \u4ED3\u5E93\u6216\u5206\u652F\u4E0D\u5B58\u5728", "error.repo.network");
  }
  if (low.includes("could not resolve host") || low.includes("connection refused") || low.includes("network is unreachable") || low.includes("timed out") || low.includes("failed to connect")) {
    return failure("\u65E0\u6CD5\u8FDE\u63A5\u5230 Git \u4ED3\u5E93\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u52A0\u901F\u5730\u5740", "error.repo.network");
  }
  const line = stderr.trim().split("\n").pop() || "";
  return failure(line ? `Git \u8BF7\u6C42\u5931\u8D25: ${line}` : "Git \u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u4ED3\u5E93\u5730\u5740", "error.repo.network");
}
function killProcessTree(child) {
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
function runGit(args, cwd, optionsOrTimeout, legacyGitBinary = "git") {
  const options = typeof optionsOrTimeout === "number" ? { timeoutMs: optionsOrTimeout, gitBinary: legacyGitBinary } : optionsOrTimeout;
  const timeoutMs = options.timeoutMs ?? 3e5;
  const gitBinary = options.gitBinary || "git";
  return new Promise((resolve, reject) => {
    const child = spawn(
      gitBinary,
      [
        "-c",
        "protocol.ext.allow=never",
        "-c",
        "core.symlinks=false",
        "-c",
        "core.autocrlf=false",
        "-c",
        "advice.detachedHead=false",
        "-c",
        "http.lowSpeedLimit=1000",
        "-c",
        "http.lowSpeedTime=30",
        ...args
      ],
      {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          LC_ALL: "C",
          LANGUAGE: "C"
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32"
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
      reject(failure("Git \u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5", "error.repo.network"));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      if (killed) return;
      const code = err?.code;
      if (code === "ENOENT") {
        reject(failure("\u672A\u68C0\u6D4B\u5230 Git \u547D\u4EE4\u884C\u5DE5\u5177\uFF0C\u8BF7\u5148\u5B89\u88C5 Git \u540E\u91CD\u8BD5", "error.repo.noGit"));
      } else {
        reject(failure(`\u65E0\u6CD5\u542F\u52A8 Git: ${err.message}`, "error.repo.network"));
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
async function rmWithRetry(target, retries = 10, delay = 50) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (e) {
      const code = e?.code;
      if (i === retries - 1 || code !== "EBUSY" && code !== "EPERM" && code !== "EACCES") throw e;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
async function probeGitRemote(repoUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 3e4;
  const gitBinary = options.gitBinary || "git";
  try {
    await runGit(["ls-remote", "--heads", "-q", "--", repoUrl], process.cwd(), { timeoutMs, gitBinary });
  } catch (caught) {
    const err = caught;
    throw failure(err.message || "\u4ED3\u5E93\u65E0\u6CD5\u8BBF\u95EE\u6216\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5\u5730\u5740\u6216\u6743\u9650", "error.repo.network");
  }
}
async function probeGitHubHttp(owner, name, fetchImpl = globalThis.fetch, timeoutMs = 15e3) {
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
      throw failure("\u4ED3\u5E93\u65E0\u6CD5\u8BBF\u95EE\u6216\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5\u5730\u5740\u6216\u6743\u9650", "error.repo.network");
    }
  } catch (caught) {
    if (caught && caught.code === "error.repo.network") throw caught;
  } finally {
    clearTimeout(timer);
  }
}
async function fetchGitRepository(repo, destinationDir, options = {}) {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024 * 1024;
  const maxTransientBytes = options.maxTransientBytes ?? maxBytes * 2.5;
  const timeoutMs = options.timeoutMs ?? 9e5;
  const deadline = Date.now() + timeoutMs;
  const gitBinary = options.gitBinary || "git";
  const remainingTimeout = () => {
    const remain = deadline - Date.now();
    if (remain <= 0) throw failure("Git \u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5", "error.repo.network");
    return remain;
  };
  const repoUrl = repo.url || `https://github.com/${repo.owner}/${repo.name}.git`;
  const ref = repo.ref && repo.ref !== "HEAD" ? repo.ref : "HEAD";
  await fs.mkdir(destinationDir, { recursive: true });
  try {
    await runGit(["init", "-q"], destinationDir, { timeoutMs: remainingTimeout(), gitBinary });
    const refsToTry = ref === "HEAD" ? ["HEAD"] : [`refs/heads/${ref}`, `refs/tags/${ref}`, ref];
    let fetched = false;
    let lastError;
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
    if (!fetched) throw lastError || failure("Git \u5206\u652F\u6216\u6807\u7B7E\u4E0D\u5B58\u5728", "error.repo.network");
    await runGit(["checkout", "-q", "FETCH_HEAD"], destinationDir, { timeoutMs: remainingTimeout(), gitBinary });
    const { stdout: commitOut } = await runGit(["rev-parse", "FETCH_HEAD^{commit}"], destinationDir, { timeoutMs: remainingTimeout(), gitBinary });
    const commit = commitOut.trim();
    const rawSize = await getDirectorySize(destinationDir);
    if (rawSize > maxTransientBytes) {
      throw failure("\u4ED3\u5E93\u4E34\u65F6\u4E0B\u8F7D\u4F53\u79EF\u8FC7\u5927\uFF08\u5305\u542B Git \u5386\u53F2\u5BF9\u8C61\uFF09", "error.repo.transientTooLarge", { limit: maxTransientBytes, actual: rawSize });
    }
    await rmWithRetry(join(destinationDir, ".git"));
    const totalSize = await getDirectorySize(destinationDir);
    if (totalSize > maxBytes) {
      throw failure("\u4ED3\u5E93\u8D85\u8FC7\u5927\u5C0F\u9650\u5236", "error.repo.tooLarge", { limit: maxBytes, actual: totalSize });
    }
    return { commit };
  } catch (err) {
    await rmWithRetry(destinationDir).catch(() => void 0);
    throw err;
  }
}
export {
  fetchGitRepository,
  getDirectorySize,
  parseGitUrl,
  probeGitHubHttp,
  probeGitRemote
};
