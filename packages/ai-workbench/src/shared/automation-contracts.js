const TYPES = new Set(["reminder", "work"]);
const STATUSES = new Set(["active", "paused", "completed", "disabled_by_error"]);
const WORKSPACE_REF = /^(workspace:[^\s]+|path:\/[^\s]+)$/;

function invalid(details) {
  return Object.assign(new Error("invalid automation"), {
    code: "invalid-automation",
    statusCode: 400,
    public: true,
    details,
  });
}

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid({ field: "automation" });
  return value;
}

function time(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw invalid({ field: "schedule.time" });
  return value;
}

export function normalizeSchedule(value) {
  const rule = record(value);
  if (rule.kind === "once") {
    const at = new Date(rule.at);
    if (!Number.isFinite(at.getTime())) throw invalid({ field: "schedule.at" });
    return { kind: "once", at: at.toISOString() };
  }
  if (["daily", "workdays"].includes(rule.kind)) return { kind: rule.kind, time: time(rule.time) };
  if (rule.kind === "weekly") {
    if (!Array.isArray(rule.weekdays) || !rule.weekdays.length || rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(rule.weekdays).size !== rule.weekdays.length) throw invalid({ field: "schedule.weekdays" });
    return { kind: "weekly", weekdays: [...rule.weekdays].sort((a, b) => a - b), time: time(rule.time) };
  }
  if (rule.kind === "monthly") {
    if (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31) throw invalid({ field: "schedule.day" });
    return { kind: "monthly", day: rule.day, time: time(rule.time) };
  }
  if (rule.kind === "interval") {
    if (!Number.isInteger(rule.every) || rule.every < 1 || rule.every > 999 || !["minute", "hour", "day"].includes(rule.unit)) throw invalid({ field: "schedule.interval" });
    const anchorAt = new Date(rule.anchorAt);
    if (!Number.isFinite(anchorAt.getTime())) throw invalid({ field: "schedule.anchorAt" });
    return { kind: "interval", every: rule.every, unit: rule.unit, anchorAt: anchorAt.toISOString() };
  }
  throw invalid({ field: "schedule.kind" });
}

export function normalizeAutomation(value, { now = new Date().toISOString() } = {}) {
  const input = record(value);
  if (typeof input.name !== "string" || !input.name.trim()) throw invalid({ field: "name" });
  if (!TYPES.has(input.type)) throw invalid({ field: "type" });
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw invalid({ field: "prompt" });
  const schedule = normalizeSchedule(input.schedule);
  const workspaceRef = input.workspaceRef == null ? null : input.workspaceRef;
  if (input.type === "work" && (typeof workspaceRef !== "string" || !WORKSPACE_REF.test(workspaceRef))) throw invalid({ field: "workspaceRef" });
  if (input.type === "reminder" && workspaceRef !== null) throw invalid({ field: "workspaceRef" });
  if (input.type === "reminder" && input.capabilitySelection != null) throw invalid({ field: "capabilitySelection" });
  const status = input.status == null ? (input.enabled === false ? "paused" : "active") : input.status;
  if (!STATUSES.has(status)) throw invalid({ field: "status" });
  const timezone = typeof input.timezone === "string" && input.timezone ? input.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    name: input.name.trim().slice(0, 200),
    type: input.type,
    prompt: input.prompt.slice(0, 20_000),
    enabled: input.enabled !== false,
    status,
    schedule,
    timezone,
    workspaceRef,
    capabilitySelection: input.type === "work" && Array.isArray(input.capabilitySelection) ? [...new Set(input.capabilitySelection.filter((id) => typeof id === "string"))].slice(0, 50) : [],
    executionProfile: input.type === "work" && input.executionProfile && typeof input.executionProfile === "object" ? structuredClone(input.executionProfile) : null,
    notificationPolicy: input.notificationPolicy && typeof input.notificationPolicy === "object" ? structuredClone(input.notificationPolicy) : { onSuccess: true, onFailure: true, onApprovalRequired: true },
    createdAt: input.createdAt || now,
    updatedAt: now,
    lastRunAt: input.lastRunAt || null,
    nextRunAt: input.nextRunAt || null,
  };
}

export function assertAutomationStatus(value) {
  if (!STATUSES.has(value)) throw invalid({ field: "status" });
  return value;
}

