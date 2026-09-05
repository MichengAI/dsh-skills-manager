import { randomUUID } from "node:crypto";
import { normalizeAutomation } from "../shared/automation-contracts.js";
import { latestMissedOccurrence, nextOccurrence, runKey } from "../shared/schedule.js";

const RUN_STATUSES = new Set(["scheduled", "running", "waiting_approval", "succeeded", "failed", "rejected", "skipped"]);
const ACTIVE_RUN_STATUSES = new Set(["running", "waiting_approval"]);

function error(message, code, statusCode = 400, details) {
  return Object.assign(new Error(message), { code, statusCode, public: true, ...(details ? { details } : {}) });
}

function iso(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw error("invalid timestamp", "invalid-automation");
  return date.toISOString();
}

function validateTimeZone(timezone) {
  if (typeof timezone !== "string" || !timezone.trim()) throw error("invalid timezone", "invalid-automation");
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions().timeZone;
    if (!resolved) throw new Error("unknown timezone");
    return timezone;
  } catch {
    throw error("invalid timezone", "invalid-automation", 400, { field: "timezone" });
  }
}

function systemNow(now) {
  return typeof now === "function" ? now() : new Date().toISOString();
}

function runList(repository, automationId) {
  const values = typeof repository.listAutomationRuns === "function" ? repository.listAutomationRuns() : [];
  return values.filter((run) => !automationId || run.automationId === automationId);
}

function nextFor(record, nowMs) {
  if (!record.enabled || record.status !== "active") return null;
  const value = nextOccurrence(record.schedule, nowMs);
  return value == null ? null : new Date(value).toISOString();
}

export function createAutomationService({ repository, id = randomUUID, now = () => new Date().toISOString() } = {}) {
  if (!repository) throw new Error("automation repository is required");
  let writes = Promise.resolve();

  function enqueue(operation) {
    const next = writes.then(operation, operation);
    writes = next.catch(() => undefined);
    return next;
  }

  function currentIso() {
    return iso(systemNow(now));
  }

  async function save(record) {
    return repository.putAutomation({ ...record, updatedAt: currentIso() });
  }

  async function get(idValue) {
    return repository.getAutomation(idValue);
  }

  async function create(input) {
    return enqueue(async () => {
      const createdAt = currentIso();
      const normalized = normalizeAutomation(input, { now: createdAt });
      normalized.timezone = validateTimeZone(normalized.timezone);
      const idValue = id();
      if (typeof idValue !== "string" || !idValue) throw error("invalid automation id", "invalid-automation");
      normalized.id = idValue;
      normalized.nextRunAt = nextFor(normalized, Date.parse(createdAt));
      return repository.putAutomation(normalized);
    });
  }

  async function update(idValue, patch) {
    return enqueue(async () => {
      const existing = await get(idValue);
      if (!existing) throw error("automation not found", "automation-not-found", 404);
      const updatedAt = currentIso();
      const normalized = normalizeAutomation({ ...existing, ...(patch || {}), id: existing.id, createdAt: existing.createdAt }, { now: updatedAt });
      normalized.timezone = validateTimeZone(normalized.timezone);
      normalized.id = existing.id;
      normalized.nextRunAt = nextFor(normalized, Date.parse(updatedAt));
      return repository.putAutomation(normalized);
    });
  }

  async function remove(idValue) {
    return enqueue(async () => {
      const existing = await get(idValue);
      if (!existing) throw error("automation not found", "automation-not-found", 404);
      if (runList(repository, idValue).some((run) => ACTIVE_RUN_STATUSES.has(run.status))) {
        throw error("automation has an active run", "automation-active", 409);
      }
      await repository.deleteAutomation(idValue);
      return { id: idValue, deleted: true };
    });
  }

  async function setEnabled(idValue, enabled) {
    const existing = await get(idValue);
    if (!existing) throw error("automation not found", "automation-not-found", 404);
    return update(idValue, {
      enabled: enabled === true,
      status: enabled === true ? "active" : "paused",
    });
  }

  function list({ query = "", status = "all" } = {}) {
    const needle = String(query || "").trim().toLocaleLowerCase("zh-CN");
    return (typeof repository.listAutomations === "function" ? repository.listAutomations() : [])
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => !needle || [item.name, item.prompt, item.type].some((value) => String(value || "").toLocaleLowerCase("zh-CN").includes(needle)))
      .sort((left, right) => String(left.nextRunAt || "").localeCompare(String(right.nextRunAt || "")) || String(left.name).localeCompare(String(right.name), "zh-CN"));
  }

  function listRuns(automationId) {
    return runList(repository, automationId).sort((left, right) => String(right.plannedAt).localeCompare(String(left.plannedAt)));
  }

  function claim(automationId, plannedAt) {
    return enqueue(async () => {
      const automation = await get(automationId);
      if (!automation) throw error("automation not found", "automation-not-found", 404);
      const planned = iso(plannedAt);
      const key = runKey(automationId, planned);
      const existing = runList(repository).find((run) => run.idempotencyKey === key);
      if (existing) return { claimed: false, runId: existing.id };
      const run = {
        id: id(),
        idempotencyKey: key,
        automationId,
        plannedAt: planned,
        startedAt: null,
        finishedAt: null,
        status: "scheduled",
        sessionId: null,
        errorCode: null,
        errorMessage: null,
        approvalId: null,
        approvalToolName: null,
        approvalReason: null,
        skipReason: null,
      };
      return { claimed: true, run: await repository.putAutomationRun(run) };
    });
  }

  function updateRun(runId, patch) {
    return enqueue(async () => {
      const existing = typeof repository.getAutomationRun === "function"
        ? await repository.getAutomationRun(runId)
        : runList(repository).find((run) => run.id === runId);
      if (!existing) throw error("automation run not found", "automation-run-not-found", 404);
      const next = { ...existing, ...(patch || {}), id: existing.id };
      if (!RUN_STATUSES.has(next.status)) throw error("invalid automation run", "invalid-automation");
      return repository.putAutomationRun(next);
    });
  }

  async function advance(idValue, at = currentIso()) {
    return enqueue(async () => {
      const existing = await get(idValue);
      if (!existing) throw error("automation not found", "automation-not-found", 404);
      const nowMs = Date.parse(iso(at));
      if (!existing.nextRunAt || Date.parse(existing.nextRunAt) > nowMs) return existing;
      if (existing.schedule.kind === "once") {
        const completed = { ...existing, enabled: false, status: "completed", lastRunAt: existing.nextRunAt || existing.lastRunAt, nextRunAt: null, updatedAt: currentIso() };
        return repository.putAutomation(completed);
      }
      const nextRunAt = nextFor(existing, nowMs);
      return repository.putAutomation({ ...existing, nextRunAt, updatedAt: currentIso() });
    });
  }

  async function resume(at = currentIso()) {
    return enqueue(async () => {
      const nowIso = iso(at);
      const nowMs = Date.parse(nowIso);
      const updated = [];
      for (const item of list({ status: "active" })) {
        if (!item.enabled || !item.nextRunAt || Date.parse(item.nextRunAt) > nowMs) continue;
        if (item.schedule.kind === "once") {
          updated.push(item);
          continue;
        }
        const previous = new Date(Date.parse(item.nextRunAt) - 1).toISOString();
        const latest = latestMissedOccurrence(item.schedule, previous, nowMs);
        if (latest != null) {
          const next = { ...item, nextRunAt: new Date(latest).toISOString(), updatedAt: currentIso() };
          updated.push(await repository.putAutomation(next));
        }
      }
      return updated;
    });
  }

  async function syncSystemTimezone(timezone, at = currentIso()) {
    const nextZone = validateTimeZone(timezone);
    const nowIso = iso(at);
    const nowMs = Date.parse(nowIso);
    return enqueue(async () => {
      const updated = [];
      for (const item of list()) {
        if (item.timezone === nextZone) continue;
        const nextRunAt = item.enabled && item.status === "active" ? nextFor({ ...item, timezone: nextZone }, nowMs) : item.nextRunAt;
        updated.push(await repository.putAutomation({ ...item, timezone: nextZone, nextRunAt, updatedAt: currentIso() }));
      }
      return updated;
    });
  }

  return {
    get,
    list,
    create,
    update,
    remove,
    setEnabled,
    listRuns,
    claim,
    updateRun,
    advance,
    resume,
    syncSystemTimezone,
  };
}
