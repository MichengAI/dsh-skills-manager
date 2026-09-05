import { capabilityManifest } from "../shared/capability-manifest.js";
import { normalizeCapabilities, summarizeCapabilities } from "../shared/capabilities.js";

export const SKILLS_MANAGER_STATE_PATH = "/api/dsh-skills-manager/state";
export const CAPABILITY_PREFERENCES_PATH = "/api/dsh-ai-workbench/capability-preferences";

function sourceError(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

function unwrapPayload(payload) {
  if (payload && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")) return payload.data;
  if (payload && payload.ok === false) {
    const detail = payload.error && typeof payload.error === "object" ? payload.error : {};
    throw sourceError(detail.message || "source request failed", detail.code || "source-request-failed");
  }
  return payload;
}

async function defaultFetchJson(path) {
  if (typeof globalThis.fetch !== "function") throw sourceError("fetch is unavailable", "fetch-unavailable");
  let response;
  try {
    response = await globalThis.fetch(path, { headers: { accept: "application/json" } });
  } catch (error) {
    throw sourceError(error?.message || "network error", "network-error");
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw sourceError(error?.message || "invalid response", "invalid-response", response.status);
  }
  if (!response.ok) {
    const detail = payload?.error && typeof payload.error === "object" ? payload.error : {};
    throw sourceError(detail.message || `source request failed (${response.status})`, detail.code || "source-request-failed", response.status);
  }
  return unwrapPayload(payload);
}

function warningFor(source, error) {
  const isSkillsManager = source === "skills-manager";
  return {
    source,
    code: isSkillsManager ? "skills-manager-unavailable" : "capability-preferences-unavailable",
    message: isSkillsManager ? "技能来源暂不可用，已保留 DSH 工具和业务系统。" : "默认能力暂不可用，将使用本地默认状态。",
    detail: error?.message || "unknown source error",
    retryable: true,
  };
}

export async function loadCapabilitySources(options = {}) {
  const fetchJson = typeof options.fetchJson === "function" ? options.fetchJson : defaultFetchJson;
  const manifest = options.manifest || capabilityManifest;
  const results = await Promise.allSettled([
    fetchJson(SKILLS_MANAGER_STATE_PATH),
    fetchJson(CAPABILITY_PREFERENCES_PATH),
  ]);
  const [skillsResult, preferencesResult] = results;
  const warnings = [];
  const skillState = skillsResult.status === "fulfilled" ? unwrapPayload(skillsResult.value) : null;
  if (skillsResult.status === "rejected") warnings.push(warningFor("skills-manager", skillsResult.reason));

  let enabledIds = [];
  if (preferencesResult.status === "fulfilled") {
    const preferences = unwrapPayload(preferencesResult.value);
    if (Array.isArray(preferences?.enabledIds)) enabledIds = [...new Set(preferences.enabledIds.filter((id) => typeof id === "string"))];
  } else {
    warnings.push(warningFor("capability-preferences", preferencesResult.reason));
  }

  const items = normalizeCapabilities({ skillState, manifest, enabledIds });
  return {
    items,
    enabledIds,
    warnings,
    summary: summarizeCapabilities(items),
    sources: {
      skillsManager: skillsResult.status === "fulfilled" ? "ready" : "unavailable",
      preferences: preferencesResult.status === "fulfilled" ? "ready" : "unavailable",
    },
  };
}

