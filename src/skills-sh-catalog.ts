const SEARCH_URL = "https://skills.sh/api/search";
const MAX_QUERY_LENGTH = 100;
const MAX_RESPONSE_BYTES = 1 << 20;
const MAX_RESULTS = 100;

type SkillsShEntry = {
  id?: unknown;
  source?: unknown;
  skillId?: unknown;
  name?: unknown;
  installs?: unknown;
};

type SkillsShResponse = { skills?: unknown };

export type SkillsShSkill = {
  id: string;
  source: string;
  skillId: string;
  name: string;
  installs?: number;
};

function catalogError(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= maxLength ? text : undefined;
}

/** 通过固定的官方搜索端点查询目录，并只向本地客户端返回受校验字段。 */
export async function searchSkillsSh(query: string): Promise<{ skills: SkillsShSkill[] }> {
  const normalized = typeof query === "string" ? query.trim() : "";
  if (!normalized || normalized.length > MAX_QUERY_LENGTH) {
    throw catalogError("搜索词不能为空且不能超过 100 个字符", 400, "error.catalog.query");
  }

  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", normalized);
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw catalogError("skills.sh 搜索服务暂时不可用", 502, "error.catalog.upstream");
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw catalogError("skills.sh 搜索响应过大", 502, "error.catalog.response");
  }

  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    throw catalogError("skills.sh 搜索响应过大", 502, "error.catalog.response");
  }

  let payload: SkillsShResponse;
  try {
    payload = JSON.parse(body) as SkillsShResponse;
  } catch {
    throw catalogError("skills.sh 返回了无效的搜索结果", 502, "error.catalog.response");
  }
  if (!payload || !Array.isArray(payload.skills)) {
    throw catalogError("skills.sh 返回了无效的搜索结果", 502, "error.catalog.response");
  }

  const skills: SkillsShSkill[] = [];
  const seen = new Set<string>();
  for (const candidate of payload.skills as SkillsShEntry[]) {
    if (!candidate || typeof candidate !== "object") continue;
    const source = boundedString(candidate.source, 256);
    const skillId = boundedString(candidate.skillId, 256);
    const name = boundedString(candidate.name, 256);
    const id = boundedString(candidate.id, 768) || (source && skillId ? `${source}/${skillId}` : undefined);
    if (!id || !source || !skillId || !name || seen.has(id)) continue;
    const item: SkillsShSkill = { id, source, skillId, name };
    if (typeof candidate.installs === "number" && Number.isSafeInteger(candidate.installs) && candidate.installs >= 0) {
      item.installs = candidate.installs;
    }
    skills.push(item);
    seen.add(id);
    if (skills.length >= MAX_RESULTS) break;
  }
  return { skills };
}
