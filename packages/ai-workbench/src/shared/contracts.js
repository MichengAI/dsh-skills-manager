export const MODES = new Set(["work", "chat"]);
export const ORIGINS = new Set(["user", "automation", "migration"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function contractError(message, code) {
  return Object.assign(new Error(message), { statusCode: 400, code, public: true });
}

function optionalString(value, maxLength = 255) {
  return typeof value === "string" ? value.slice(0, maxLength) : null;
}

export function assertMode(value) {
  if (!MODES.has(value)) throw contractError("invalid mode", "invalid-mode");
  return value;
}

export function parseSessionMeta(value) {
  if (!isRecord(value)) throw contractError("invalid session metadata", "invalid-session-meta");
  for (const field of ["automationId", "runId", "createdAt"]) {
    if (Object.prototype.hasOwnProperty.call(value, field) && typeof value[field] !== "string") {
      throw contractError("invalid session metadata", "invalid-session-meta");
    }
  }
  const mode = assertMode(value?.mode);
  const origin = ORIGINS.has(value?.origin) ? value.origin : "user";
  return {
    mode,
    origin,
    automationId: value?.automationId || null,
    runId: value?.runId || null,
    createdAt: value?.createdAt || new Date().toISOString(),
  };
}

export function parseDraft(value, mode) {
  assertMode(mode);
  if (!isRecord(value)) throw contractError("invalid draft", "invalid-draft");
  if (typeof value?.text !== "string" || value.text.length > 20_000) {
    throw contractError("invalid draft", "invalid-draft");
  }

  const mediaTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!Array.isArray(value.attachments) || value.attachments.length > 20) {
    throw contractError("invalid attachments", "invalid-attachments");
  }
  if (
    value.capabilityIds !== undefined
    && (!Array.isArray(value.capabilityIds) || value.capabilityIds.some((id) => typeof id !== "string"))
  ) {
    throw contractError("invalid capability IDs", "invalid-capability-ids");
  }

  const attachments = value.attachments.map((item) => {
    if (
      !mediaTypes.has(item?.mediaType)
      || typeof item?.data !== "string"
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data)
    ) {
      throw contractError("invalid attachment", "invalid-attachment");
    }
    return {
      mediaType: item.mediaType,
      data: item.data,
      name: typeof item.name === "string" ? item.name.slice(0, 255) : undefined,
    };
  });

  const execution = mode === "work" && value.execution ? {
    modelPolicy: value.execution.modelPolicy === "manual" ? "manual" : "auto",
    provider: typeof value.execution.provider === "string" ? value.execution.provider : null,
    model: typeof value.execution.model === "string" ? value.execution.model : null,
    intensity: value.execution.intensity === "deep" ? "deep" : "standard",
  } : null;
  if (execution?.modelPolicy === "manual" && (!execution.provider || !execution.model)) {
    throw contractError("manual model is incomplete", "invalid-execution");
  }

  return {
    mode,
    text: value.text,
    workspaceId: mode === "work" && typeof value.workspaceId === "string" ? value.workspaceId : null,
    attachments,
    capabilityIds: mode === "work" && Array.isArray(value.capabilityIds)
      ? [...new Set(value.capabilityIds)].slice(0, 50)
      : [],
    execution,
  };
}

export function parseSessionStart(value) {
  if (!isRecord(value)) throw contractError("invalid session request", "invalid-session-request");
  const mode = assertMode(value.mode);
  const draft = parseDraft({ ...value, attachments: value.attachments ?? [] }, mode);
  if (value.deepThinking !== undefined && typeof value.deepThinking !== "boolean") {
    throw contractError("invalid deep thinking flag", "invalid-deep-thinking");
  }
  if (value.webSearch !== undefined && typeof value.webSearch !== "boolean") {
    throw contractError("invalid web search flag", "invalid-web-search");
  }
  if (value.clientTimeZone !== undefined && value.clientTimeZone !== null && typeof value.clientTimeZone !== "string") {
    throw contractError("invalid client time zone", "invalid-client-time-zone");
  }
  return {
    ...draft,
    deepThinking: value.deepThinking === true,
    webSearch: value.webSearch === true,
    clientTimeZone: optionalString(value.clientTimeZone, 100),
  };
}

export function sanitizeModelCatalog(value) {
  const groups = Array.isArray(value?.groups) ? value.groups : [];
  return {
    groups: groups.flatMap((group) => {
      if (typeof group?.id !== "string") return [];
      const models = Array.isArray(group.models) ? group.models.flatMap((model) => {
        if (typeof model?.id !== "string") return [];
        const result = {
          id: model.id,
          ...(typeof model.label === "string" ? { label: model.label } : {}),
        };
        const efforts = Array.isArray(model.reasoning?.efforts)
          ? model.reasoning.efforts.flatMap((effort) => {
            const id = typeof effort === "string" ? effort : effort?.id;
            return typeof id === "string" ? [id] : [];
          })
          : [];
        if (efforts.length > 0) result.reasoning = { efforts: [...new Set(efforts)] };
        return [result];
      }) : [];
      return [{
        id: group.id,
        ...(typeof group.label === "string" ? { label: group.label } : {}),
        models,
      }];
    }),
  };
}

export function parseSettings(value) {
  if (!isRecord(value)) throw contractError("invalid settings", "invalid-settings");
  const defaultMode = assertMode(value?.defaultMode || "work");
  const lastMode = assertMode(value?.lastMode || defaultMode);
  const localDisplayName = typeof value?.localDisplayName === "string" && value.localDisplayName.trim()
    ? value.localDisplayName.trim().slice(0, 40)
    : "本地用户";
  return {
    schemaVersion: 1,
    brandName: "正方 AI 工作台",
    theme: "light",
    defaultMode,
    lastMode,
    localDisplayName,
    voiceEnabled: value?.voiceEnabled !== false,
  };
}
