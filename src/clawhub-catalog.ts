export type ClawHubListOptions = { limit?: unknown; cursor?: unknown; sort?: unknown };
export type ClawHubStats = { downloads?: number; installs?: number; stars?: number };
export type ClawHubItem = { ownerHandle: string; slug: string; displayName: string; summary: string; stats?: ClawHubStats };
export type ClawHubPage = { items: ClawHubItem[]; nextCursor: string | null };

export type ClawHubSearchOptions = { limit?: unknown };
export type ClawHubSearchItem = ClawHubItem & { source: "clawhub"; id?: string; downloads?: number };
export type ClawHubSearchResponse = { results: ClawHubSearchItem[] };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function skillItem(value: unknown): ClawHubItem | undefined {
  const candidate = record(value);
  if (!candidate) return undefined;
  const owner = candidate.ownerHandle ?? record(candidate.owner)?.handle;
  const slug = candidate.slug;
  const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  if (typeof owner !== "string" || !identifier.test(owner) || typeof slug !== "string" || !identifier.test(slug)) return undefined;
  const item: ClawHubItem = {
    ownerHandle: owner, slug,
    displayName: typeof candidate.displayName === "string" && candidate.displayName && candidate.displayName.length <= 256 ? candidate.displayName : slug,
    summary: typeof candidate.summary === "string" && candidate.summary.length <= 8192 ? candidate.summary : "",
  };
  const stats = record(candidate.stats) ?? record(record(record(candidate.native)?.skill)?.stats);
  if (stats) {
    item.stats = {};
    for (const key of ["downloads", "installs", "stars"] as const) {
      const number = count(stats[key]);
      if (number !== undefined) item.stats[key] = number;
    }
  }
  return item;
}

/** 固定官方搜索端点，query 仅作为编码后的 q 参数。 */
export async function searchClawHub(query: string, options: ClawHubSearchOptions = {}, fetchImpl: typeof fetch = fetch): Promise<ClawHubSearchResponse> {
  const normalized = typeof query === "string" ? query.trim() : "";
  if (!normalized || normalized.length > 100 || !record(options)) throw catalogError("目录搜索参数无效", 400, "error.catalog.query");
  const limit = requestLimit(options.limit, 100);
  const url = new URL("https://clawhub.ai/api/v1/search");
  url.searchParams.set("q", normalized);
  url.searchParams.set("limit", String(limit));
  const payload = await fetchJson(url, fetchImpl);
  if (!Array.isArray(payload.results)) throw catalogError("目录搜索响应无效", 502, "error.catalog.response");
  const results: ClawHubSearchItem[] = [];
  for (const value of payload.results) {
    const candidate = record(value);
    if (!candidate || candidate.source !== undefined && candidate.source !== "clawhub") continue;
    const item = skillItem(candidate);
    if (!item) continue;
    const result: ClawHubSearchItem = { ...item, source: "clawhub" };
    if (typeof candidate.id === "string" && candidate.id && candidate.id.length <= 768) result.id = candidate.id;
    const downloads = count(candidate.downloads);
    if (downloads !== undefined) result.downloads = downloads;
    results.push(result);
    if (results.length >= limit) break;
  }
  return { results };
}

function catalogError(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

async function fetchJson(url: URL, fetchImpl: typeof fetch) {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw catalogError("ClawHub 服务暂时不可用", 502, "error.catalog.upstream");
  }
  if (!response.ok) throw catalogError("ClawHub 服务暂时不可用", 502, "error.catalog.upstream");
  const maxBytes = 1 << 20;
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw catalogError("ClawHub 响应过大", 502, "error.catalog.response");
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          throw catalogError("ClawHub 响应过大", 502, "error.catalog.response");
        }
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      if (error instanceof Error && "code" in error && error.code === "error.catalog.response" && "statusCode" in error && error.statusCode === 502) throw error;
      throw catalogError("ClawHub 响应无效或过大", 502, "error.catalog.response");
    } finally { reader.releaseLock(); }
  }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.concat(chunks, size).toString("utf8")); }
  catch { throw catalogError("ClawHub 响应不是有效 JSON", 502, "error.catalog.response"); }
  const object = record(payload);
  if (!object) throw catalogError("ClawHub 响应结构无效", 502, "error.catalog.response");
  return object;
}

function requestLimit(value: unknown, max: number) {
  if (value === undefined) return max;
  const number = typeof value === "string" && /^[0-9]{1,3}$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > max) throw catalogError("目录查询 limit 无效", 400, "error.catalog.query");
  return number;
}

/** 固定官方榜单端点；不接受调用方 URL。 */
export async function listClawHub(options: ClawHubListOptions = {}, fetchImpl: typeof fetch = fetch): Promise<ClawHubPage> {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw catalogError("目录查询参数无效", 400, "error.catalog.query");
  const limit = requestLimit(options.limit, 10);
  const sort = options.sort === undefined ? "downloads" : options.sort;
  if (sort !== "downloads") throw catalogError("目录榜单排序无效", 400, "error.catalog.query");
  if (options.cursor !== undefined && (typeof options.cursor !== "string" || !options.cursor || options.cursor.length > 4096)) throw catalogError("目录分页标识无效", 400, "error.catalog.query");
  const url = new URL("https://clawhub.ai/api/v1/skills");
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", String(limit));
  if (options.cursor !== undefined) url.searchParams.set("cursor", options.cursor);
  const payload = await fetchJson(url, fetchImpl);
  if (!Array.isArray(payload.items)) throw catalogError("目录榜单响应无效", 502, "error.catalog.response");
  const nextCursor = payload.nextCursor;
  if (nextCursor !== undefined && nextCursor !== null && (typeof nextCursor !== "string" || nextCursor.length > 4096)) throw catalogError("目录分页响应无效", 502, "error.catalog.response");
  const items: ClawHubItem[] = [];
  for (const value of payload.items) {
    const item = skillItem(value);
    if (!item) continue;
    items.push(item);
    if (items.length >= limit) break;
  }
  return { items, nextCursor: typeof nextCursor === "string" && nextCursor ? nextCursor : null };
}
