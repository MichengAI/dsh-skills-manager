export const MODES = new Set(["work", "chat"]);
export const ORIGINS = new Set(["user", "automation", "migration"]);

function contractError(message, code) {
  return Object.assign(new Error(message), { statusCode: 400, code, public: true });
}

export function assertMode(value) {
  if (!MODES.has(value)) throw contractError("invalid mode", "invalid-mode");
  return value;
}

export function parseSessionMeta(value) {
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
  if (typeof value?.text !== "string" || value.text.length > 20_000) {
    throw contractError("invalid draft", "invalid-draft");
  }

  const mediaTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!Array.isArray(value.attachments) || value.attachments.length > 20) {
    throw contractError("invalid attachments", "invalid-attachments");
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

export function parseSettings(value) {
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
