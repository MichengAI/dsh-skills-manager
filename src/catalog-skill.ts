import { parseSkillDoc } from "./core.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const MAX_TEXT_BYTES = 1 << 20;
const MAX_ARCHIVE_BYTES = 8 << 20;
const MAX_FILES = 100;

type CatalogRequest = { catalog?: unknown; owner?: unknown; slug?: unknown; source?: unknown; skillId?: unknown };

export type CatalogIdentity =
  | { catalog: "clawhub"; owner: string; slug: string }
  | { catalog: "skillsh"; source: string; skillId: string };

export type CatalogDetail = { name: string; description: string; body: string; origin: string };
export type CatalogPackage = { name: string; zip?: string; entries?: { path: string; data: string }[] };

type FetchLike = typeof fetch;

function catalogError(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

function identifier(value: unknown) {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : undefined;
}

function skillshParts(input: { source?: unknown; skillId?: unknown }) {
  const source = typeof input.source === "string" ? input.source : "";
  const [owner, repo, extra] = source.split("/");
  const skillId = identifier(input.skillId);
  if (!identifier(owner) || !identifier(repo) || extra !== undefined || !skillId) return undefined;
  return { owner: owner!, repo: repo!, skillId, source };
}

/** 只构造两个目录的固定官方地址，调用方不能传入 URL。 */
export function catalogUrls(input: CatalogRequest) {
  if (!input || input.catalog === "clawhub") {
    const owner = identifier(input?.owner);
    const slug = identifier(input?.slug);
    if (input?.catalog !== "clawhub" || !owner || !slug) throw catalogError("目录技能标识无效", 400, "error.catalog.identity");
    const detail = new URL(`https://clawhub.ai/api/v1/skills/${encodeURIComponent(slug)}/file`);
    detail.searchParams.set("path", "SKILL.md");
    detail.searchParams.set("owner", owner);
    const download = new URL("https://clawhub.ai/api/v1/download");
    download.searchParams.set("slug", slug);
    download.searchParams.set("owner", owner);
    return { detail: detail.toString(), download: download.toString(), origin: `${owner}/${slug}` };
  }
  if (input.catalog === "skillsh") {
    const parts = skillshParts(input);
    if (!parts) throw catalogError("目录技能标识无效", 400, "error.catalog.identity");
    const download = `https://skills.sh/api/download/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}/${encodeURIComponent(parts.skillId)}`;
    return { detail: download, download, origin: `${parts.source}/${parts.skillId}` };
  }
  throw catalogError("目录技能标识无效", 400, "error.catalog.identity");
}

async function readBounded(response: Response, limit: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw catalogError("目录技能内容过大", 502, "error.catalog.response");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        throw catalogError("目录技能内容过大", 502, "error.catalog.response");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof Error && "code" in error && error.code === "error.catalog.response" && "statusCode" in error && error.statusCode === 502) throw error;
    throw catalogError("目录技能响应无效或读取中断", 502, "error.catalog.response");
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

function parseFilesJson(bytes: Uint8Array) {
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw catalogError("目录技能返回了无效 JSON", 502, "error.catalog.response");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw catalogError("目录技能文件无效", 502, "error.catalog.response");
  const files = (payload as { files?: unknown }).files;
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) throw catalogError("目录技能文件无效或过多", 502, "error.catalog.response");
  for (const file of files) {
    if (!file || typeof file !== "object" || Array.isArray(file) || typeof file.path !== "string" || typeof file.contents !== "string") throw catalogError("目录技能文件无效", 502, "error.catalog.response");
  }
  return { files: files as { path: string; contents: string }[] };
}

function skillDocSummary(markdown: string) {
  const parsed = parseSkillDoc(markdown);
  const name = parsed.map.name?.trim();
  const description = parsed.map.description?.trim();
  return { name, description, body: parsed.body };
}

async function fetchFixed(url: string, fetchImpl: FetchLike, accept: string) {
  let response: Response;
  try { response = await fetchImpl(url, { headers: { accept }, redirect: "error", signal: AbortSignal.timeout(15_000) }); }
  catch { throw catalogError("目录技能暂时无法读取", 502, "error.catalog.upstream"); }
  if (!response.ok) throw catalogError("目录技能暂时无法读取", 502, "error.catalog.upstream");
  return response;
}

export async function readCatalogSkill(input: CatalogRequest, fetchImpl: FetchLike = fetch): Promise<CatalogDetail> {
  const urls = catalogUrls(input);
  if (input.catalog === "clawhub") {
    const response = await fetchFixed(urls.detail, fetchImpl, "text/markdown, text/plain");
    const markdown = new TextDecoder().decode(await readBounded(response, MAX_TEXT_BYTES));
    const parsed = skillDocSummary(markdown);
    if (!parsed.name || !parsed.description) throw catalogError("目录技能说明无效", 502, "error.catalog.response");
    return { name: parsed.name, description: parsed.description, body: parsed.body, origin: urls.origin };
  }
  const response = await fetchFixed(urls.download, fetchImpl, "application/json");
  const payload = parseFilesJson(await readBounded(response, MAX_TEXT_BYTES));
  const document = payload.files?.find(file => file.path === "SKILL.md" && typeof file.contents === "string");
  if (!document || typeof document.contents !== "string") throw catalogError("目录技能说明无效", 502, "error.catalog.response");
  const parsed = skillDocSummary(document.contents);
  if (!parsed.name || !parsed.description) throw catalogError("目录技能说明无效", 502, "error.catalog.response");
  return { name: parsed.name, description: parsed.description, body: parsed.body, origin: urls.origin };
}

export async function loadCatalogPackage(input: CatalogRequest, fetchImpl: FetchLike = fetch): Promise<CatalogPackage> {
  const urls = catalogUrls(input);
  if (input.catalog === "clawhub") {
    const response = await fetchFixed(urls.download, fetchImpl, "application/zip");
    const bytes = await readBounded(response, MAX_ARCHIVE_BYTES);
    const detail = await readCatalogSkill(input, fetchImpl);
    return { name: detail.name, zip: Buffer.from(bytes).toString("base64") };
  }
  const response = await fetchFixed(urls.download, fetchImpl, "application/json");
  const payload = parseFilesJson(await readBounded(response, MAX_ARCHIVE_BYTES));
  if (!Array.isArray(payload.files) || !payload.files.length || payload.files.length > MAX_FILES) throw catalogError("目录技能文件无效或过多", 502, "error.catalog.response");
  const entries = payload.files.map(file => {
    if (typeof file.path !== "string" || !SAFE_PATH.test(file.path) || typeof file.contents !== "string") throw catalogError("目录技能包含非法文件路径", 502, "error.catalog.response");
    return { path: file.path, data: Buffer.from(file.contents, "utf8").toString("base64") };
  });
  if (!entries.some(entry => entry.path === "SKILL.md")) throw catalogError("目录技能缺少 SKILL.md", 502, "error.catalog.response");
  const detail = skillDocSummary(Buffer.from(entries.find(entry => entry.path === "SKILL.md")!.data, "base64").toString("utf8"));
  if (!detail.name) throw catalogError("目录技能说明无效", 502, "error.catalog.response");
  return { name: detail.name, entries };
}
