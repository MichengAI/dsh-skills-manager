const SEARCH_URL = "https://skills.sh/api/search";
const MAX_QUERY_LENGTH = 100;
const MAX_RESPONSE_BYTES = 1 << 20;
const MAX_RESULTS = 100;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function catalogError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}
function boundedString(value, maxLength) {
  if (typeof value !== "string") return void 0;
  const text = value.trim();
  return text && text.length <= maxLength ? text : void 0;
}
async function searchSkillsSh(query) {
  const normalized = typeof query === "string" ? query.trim() : "";
  if (!normalized || normalized.length > MAX_QUERY_LENGTH) {
    throw catalogError("\u641C\u7D22\u8BCD\u4E0D\u80FD\u4E3A\u7A7A\u4E14\u4E0D\u80FD\u8D85\u8FC7 100 \u4E2A\u5B57\u7B26", 400, "error.catalog.query");
  }
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", normalized);
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(1e4)
    });
  } catch {
    throw catalogError("skills.sh \u641C\u7D22\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528", 502, "error.catalog.upstream");
  }
  if (!response.ok) {
    throw catalogError("skills.sh \u641C\u7D22\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528", 502, "error.catalog.upstream");
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => void 0);
    throw catalogError("skills.sh \u641C\u7D22\u54CD\u5E94\u8FC7\u5927", 502, "error.catalog.response");
  }
  const chunks = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          throw catalogError("skills.sh \u641C\u7D22\u54CD\u5E94\u8FC7\u5927", 502, "error.catalog.response");
        }
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => void 0);
      if (error instanceof Error && "code" in error && error.code === "error.catalog.response" && "statusCode" in error && error.statusCode === 502) throw error;
      throw catalogError("skills.sh \u641C\u7D22\u54CD\u5E94\u65E0\u6548\u6216\u8BFB\u53D6\u4E2D\u65AD", 502, "error.catalog.response");
    } finally {
      reader.releaseLock();
    }
  }
  const body = Buffer.concat(chunks, size).toString("utf8");
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw catalogError("skills.sh \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u641C\u7D22\u7ED3\u679C", 502, "error.catalog.response");
  }
  if (!payload || !Array.isArray(payload.skills)) {
    throw catalogError("skills.sh \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u641C\u7D22\u7ED3\u679C", 502, "error.catalog.response");
  }
  const skills = [];
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of payload.skills) {
    if (!candidate || typeof candidate !== "object") continue;
    const source = typeof candidate.source === "string" && candidate.source.split("/").length === 2 && candidate.source.split("/").every((part) => IDENTIFIER.test(part)) ? candidate.source : void 0;
    const skillId = typeof candidate.skillId === "string" && IDENTIFIER.test(candidate.skillId) ? candidate.skillId : void 0;
    const name = boundedString(candidate.name, 256);
    const id = boundedString(candidate.id, 768) || (source && skillId ? `${source}/${skillId}` : void 0);
    if (!id || !source || !skillId || !name || seen.has(id)) continue;
    const item = { id, source, skillId, name };
    if (typeof candidate.installs === "number" && Number.isSafeInteger(candidate.installs) && candidate.installs >= 0) {
      item.installs = candidate.installs;
    }
    skills.push(item);
    seen.add(id);
    if (skills.length >= MAX_RESULTS) break;
  }
  return { skills };
}
export {
  searchSkillsSh
};
