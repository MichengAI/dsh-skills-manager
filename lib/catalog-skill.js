const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const MAX_TEXT_BYTES = 1 << 20;
const MAX_ARCHIVE_BYTES = 8 << 20;
const MAX_FILES = 100;
function catalogError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}
function identifier(value) {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : void 0;
}
function skillshParts(input) {
  const source = typeof input.source === "string" ? input.source : "";
  const [owner, repo, extra] = source.split("/");
  const skillId = identifier(input.skillId);
  if (!identifier(owner) || !identifier(repo) || extra !== void 0 || !skillId) return void 0;
  return { owner, repo, skillId, source };
}
function catalogUrls(input) {
  if (!input || input.catalog === "clawhub") {
    const owner = identifier(input?.owner);
    const slug = identifier(input?.slug);
    if (input?.catalog !== "clawhub" || !owner || !slug) throw catalogError("\u76EE\u5F55\u6280\u80FD\u6807\u8BC6\u65E0\u6548", 400, "error.catalog.identity");
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
    if (!parts) throw catalogError("\u76EE\u5F55\u6280\u80FD\u6807\u8BC6\u65E0\u6548", 400, "error.catalog.identity");
    const download = `https://skills.sh/api/download/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}/${encodeURIComponent(parts.skillId)}`;
    return { detail: download, download, origin: `${parts.source}/${parts.skillId}` };
  }
  throw catalogError("\u76EE\u5F55\u6280\u80FD\u6807\u8BC6\u65E0\u6548", 400, "error.catalog.identity");
}
async function readBounded(response, limit) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw catalogError("\u76EE\u5F55\u6280\u80FD\u5185\u5BB9\u8FC7\u5927", 502, "error.catalog.response");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw catalogError("\u76EE\u5F55\u6280\u80FD\u5185\u5BB9\u8FC7\u5927", 502, "error.catalog.response");
  return bytes;
}
function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const block = match?.[1] || "";
  const field = (name) => {
    const lines = block.split(/\r?\n/);
    const index = lines.findIndex((line) => line.startsWith(`${name}:`));
    if (index < 0) return void 0;
    const rest = lines[index].slice(name.length + 1).trim();
    if (rest === ">" || rest === "|") {
      const folded = [];
      for (let i = index + 1; i < lines.length; i++) {
        if (lines[i] !== "" && !/^\s/.test(lines[i])) break;
        folded.push(lines[i].trim());
      }
      const text = folded.join(rest === "|" ? "\n" : " ").replace(/[ \t]{2,}/g, " ").trim();
      return text || void 0;
    }
    return rest.replace(/^["']|["']$/g, "").trim() || void 0;
  };
  return { name: field("name"), description: field("description"), body: match ? markdown.slice(match[0].length) : markdown };
}
async function fetchFixed(url, fetchImpl, accept) {
  const response = await fetchImpl(url, { headers: { accept }, redirect: "error", signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw catalogError("\u76EE\u5F55\u6280\u80FD\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6", 502, "error.catalog.upstream");
  return response;
}
async function readCatalogSkill(input, fetchImpl = fetch) {
  const urls = catalogUrls(input);
  if (input.catalog === "clawhub") {
    const response2 = await fetchFixed(urls.detail, fetchImpl, "text/markdown, text/plain");
    const markdown = new TextDecoder().decode(await readBounded(response2, MAX_TEXT_BYTES));
    const parsed2 = frontmatter(markdown);
    if (!parsed2.name || !parsed2.description) throw catalogError("\u76EE\u5F55\u6280\u80FD\u8BF4\u660E\u65E0\u6548", 502, "error.catalog.response");
    return { name: parsed2.name, description: parsed2.description, body: parsed2.body, origin: urls.origin };
  }
  const response = await fetchFixed(urls.download, fetchImpl, "application/json");
  const payload = JSON.parse(new TextDecoder().decode(await readBounded(response, MAX_TEXT_BYTES)));
  const document = payload.files?.find((file) => file.path === "SKILL.md" && typeof file.contents === "string");
  if (!document || typeof document.contents !== "string") throw catalogError("\u76EE\u5F55\u6280\u80FD\u8BF4\u660E\u65E0\u6548", 502, "error.catalog.response");
  const parsed = frontmatter(document.contents);
  if (!parsed.name || !parsed.description) throw catalogError("\u76EE\u5F55\u6280\u80FD\u8BF4\u660E\u65E0\u6548", 502, "error.catalog.response");
  return { name: parsed.name, description: parsed.description, body: parsed.body, origin: urls.origin };
}
async function loadCatalogPackage(input, fetchImpl = fetch) {
  const urls = catalogUrls(input);
  if (input.catalog === "clawhub") {
    const response2 = await fetchFixed(urls.download, fetchImpl, "application/zip");
    const bytes = await readBounded(response2, MAX_ARCHIVE_BYTES);
    const detail2 = await readCatalogSkill(input, fetchImpl);
    return { name: detail2.name, zip: Buffer.from(bytes).toString("base64") };
  }
  const response = await fetchFixed(urls.download, fetchImpl, "application/json");
  const payload = JSON.parse(new TextDecoder().decode(await readBounded(response, MAX_ARCHIVE_BYTES)));
  if (!Array.isArray(payload.files) || !payload.files.length || payload.files.length > MAX_FILES) throw catalogError("\u76EE\u5F55\u6280\u80FD\u6587\u4EF6\u65E0\u6548\u6216\u8FC7\u591A", 502, "error.catalog.response");
  const entries = payload.files.map((file) => {
    if (typeof file.path !== "string" || !SAFE_PATH.test(file.path) || typeof file.contents !== "string") throw catalogError("\u76EE\u5F55\u6280\u80FD\u5305\u542B\u975E\u6CD5\u6587\u4EF6\u8DEF\u5F84", 502, "error.catalog.response");
    return { path: file.path, data: Buffer.from(file.contents, "utf8").toString("base64") };
  });
  if (!entries.some((entry) => entry.path === "SKILL.md")) throw catalogError("\u76EE\u5F55\u6280\u80FD\u7F3A\u5C11 SKILL.md", 502, "error.catalog.response");
  const detail = frontmatter(Buffer.from(entries.find((entry) => entry.path === "SKILL.md").data, "base64").toString("utf8"));
  if (!detail.name) throw catalogError("\u76EE\u5F55\u6280\u80FD\u8BF4\u660E\u65E0\u6548", 502, "error.catalog.response");
  return { name: detail.name, entries };
}
export {
  catalogUrls,
  loadCatalogPackage,
  readCatalogSkill
};
