function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function count(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function skillItem(value) {
  const candidate = record(value);
  if (!candidate) return void 0;
  const owner = candidate.ownerHandle ?? record(candidate.owner)?.handle;
  const slug = candidate.slug;
  const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  if (typeof owner !== "string" || !identifier.test(owner) || typeof slug !== "string" || !identifier.test(slug)) return void 0;
  const item = {
    ownerHandle: owner,
    slug,
    displayName: typeof candidate.displayName === "string" && candidate.displayName && candidate.displayName.length <= 256 ? candidate.displayName : slug,
    summary: typeof candidate.summary === "string" && candidate.summary.length <= 8192 ? candidate.summary : ""
  };
  const stats = record(candidate.stats) ?? record(record(record(candidate.native)?.skill)?.stats);
  if (stats) {
    item.stats = {};
    for (const key of ["downloads", "installs", "stars"]) {
      const number = count(stats[key]);
      if (number !== void 0) item.stats[key] = number;
    }
  }
  return item;
}
async function searchClawHub(query, options = {}, fetchImpl = fetch) {
  const normalized = typeof query === "string" ? query.trim() : "";
  if (!normalized || normalized.length > 100 || !record(options)) throw catalogError("\u76EE\u5F55\u641C\u7D22\u53C2\u6570\u65E0\u6548", 400, "error.catalog.query");
  const limit = requestLimit(options.limit, 100);
  const url = new URL("https://clawhub.ai/api/v1/search");
  url.searchParams.set("q", normalized);
  url.searchParams.set("limit", String(limit));
  const payload = await fetchJson(url, fetchImpl);
  if (!Array.isArray(payload.results)) throw catalogError("\u76EE\u5F55\u641C\u7D22\u54CD\u5E94\u65E0\u6548", 502, "error.catalog.response");
  const results = [];
  for (const value of payload.results) {
    const candidate = record(value);
    if (!candidate || candidate.source !== void 0 && candidate.source !== "clawhub") continue;
    const item = skillItem(candidate);
    if (!item) continue;
    const result = { ...item, source: "clawhub" };
    if (typeof candidate.id === "string" && candidate.id && candidate.id.length <= 768) result.id = candidate.id;
    const downloads = count(candidate.downloads);
    if (downloads !== void 0) result.downloads = downloads;
    results.push(result);
    if (results.length >= limit) break;
  }
  return { results };
}
function catalogError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}
async function fetchJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(1e4) });
  } catch {
    throw catalogError("ClawHub \u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528", 502, "error.catalog.upstream");
  }
  if (!response.ok) throw catalogError("ClawHub \u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528", 502, "error.catalog.upstream");
  const maxBytes = 1 << 20;
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => void 0);
    throw catalogError("ClawHub \u54CD\u5E94\u8FC7\u5927", 502, "error.catalog.response");
  }
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          throw catalogError("ClawHub \u54CD\u5E94\u8FC7\u5927", 502, "error.catalog.response");
        }
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => void 0);
      if (error instanceof Error && "code" in error && error.code === "error.catalog.response" && "statusCode" in error && error.statusCode === 502) throw error;
      throw catalogError("ClawHub \u54CD\u5E94\u65E0\u6548\u6216\u8FC7\u5927", 502, "error.catalog.response");
    } finally {
      reader.releaseLock();
    }
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    throw catalogError("ClawHub \u54CD\u5E94\u4E0D\u662F\u6709\u6548 JSON", 502, "error.catalog.response");
  }
  const object = record(payload);
  if (!object) throw catalogError("ClawHub \u54CD\u5E94\u7ED3\u6784\u65E0\u6548", 502, "error.catalog.response");
  return object;
}
function requestLimit(value, max) {
  if (value === void 0) return max;
  const number = typeof value === "string" && /^[0-9]{1,3}$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > max) throw catalogError("\u76EE\u5F55\u67E5\u8BE2 limit \u65E0\u6548", 400, "error.catalog.query");
  return number;
}
async function listClawHub(options = {}, fetchImpl = fetch) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw catalogError("\u76EE\u5F55\u67E5\u8BE2\u53C2\u6570\u65E0\u6548", 400, "error.catalog.query");
  const limit = requestLimit(options.limit, 10);
  const sort = options.sort === void 0 ? "downloads" : options.sort;
  if (sort !== "downloads") throw catalogError("\u76EE\u5F55\u699C\u5355\u6392\u5E8F\u65E0\u6548", 400, "error.catalog.query");
  if (options.cursor !== void 0 && (typeof options.cursor !== "string" || !options.cursor || options.cursor.length > 4096)) throw catalogError("\u76EE\u5F55\u5206\u9875\u6807\u8BC6\u65E0\u6548", 400, "error.catalog.query");
  const url = new URL("https://clawhub.ai/api/v1/skills");
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", String(limit));
  if (options.cursor !== void 0) url.searchParams.set("cursor", options.cursor);
  const payload = await fetchJson(url, fetchImpl);
  if (!Array.isArray(payload.items)) throw catalogError("\u76EE\u5F55\u699C\u5355\u54CD\u5E94\u65E0\u6548", 502, "error.catalog.response");
  const nextCursor = payload.nextCursor;
  if (nextCursor !== void 0 && nextCursor !== null && (typeof nextCursor !== "string" || nextCursor.length > 4096)) throw catalogError("\u76EE\u5F55\u5206\u9875\u54CD\u5E94\u65E0\u6548", 502, "error.catalog.response");
  const items = [];
  for (const value of payload.items) {
    const item = skillItem(value);
    if (!item) continue;
    items.push(item);
    if (items.length >= limit) break;
  }
  return { items, nextCursor: typeof nextCursor === "string" && nextCursor ? nextCursor : null };
}
export {
  listClawHub,
  searchClawHub
};
