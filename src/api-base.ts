/**
 * API 基址解析：把插件自己的根绝对路径端点解析到页面实际所在的 base 之下。
 *
 * 为什么需要：DSH 可能被挂在带路径前缀的反向代理后面（例如 https://host/app/dsh/，
 * 网关转发前剥掉前缀）。此时浏览器把根绝对路径 "/api/..." 解析到站点根，前缀丢失，
 * 网关返回自己的 HTML 404，面板就报「服务端返回非 JSON 响应（HTTP 404）」。
 *
 * 为什么这么解析：宿主前端同样以页面 base 解析 API 路径（参见 dsh-client-connection 的
 * openConnectionWebSocket 与 dsh-client-file-upload 的 new URL(path, document.baseURI)），
 * 这里沿用同一约定——先去掉前导 "/"，再用 new URL 相对解析；若直接 new URL("/api/x", base)
 * 会丢弃 base 的路径段，前缀就没了。
 */

/** 页面基准地址；末尾补斜杠，避免 /app/dsh 这类无斜杠页面把前缀解析掉一级。 */
function pageBaseHref(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const raw = document.baseURI;
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    const url = new URL(raw);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * 解析插件端点 URL。
 *
 * @param path 端点路径，通常是 "/api/michengai/dsh-skills-manager/xxx" 这类根绝对路径。
 * @returns 基于页面 base 的绝对 URL；相对路径、完整 URL、协议相对 URL、无 document
 *          或 base 非法时原样返回，保证非浏览器环境与测试夹具行为不变。
 */
export function resolveApiUrl(path: string): string {
  if (typeof path !== "string" || path.charAt(0) !== "/" || path.charAt(1) === "/") return path;
  const base = pageBaseHref();
  if (base === undefined) return path;
  try {
    return new URL(path.slice(1), base).href;
  } catch {
    return path;
  }
}
