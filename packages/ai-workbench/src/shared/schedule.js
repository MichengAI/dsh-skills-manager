const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const WEEKDAY = new Set([0, 1, 2, 3, 4, 5, 6]);
const UNITS = new Map([
  ["minute", MINUTE],
  ["hour", 60 * MINUTE],
  ["day", DAY],
]);

function scheduleError(message = "invalid schedule") {
  return Object.assign(new Error(message), {
    code: "invalid-schedule",
    statusCode: 400,
    public: true,
  });
}

function assertTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw scheduleError();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    const calendar = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (calendar.getUTCFullYear() !== Number(match[1]) || calendar.getUTCMonth() + 1 !== Number(match[2]) || calendar.getUTCDate() !== Number(match[3])) throw scheduleError();
  }
  return date.getTime();
}

function assertAfter(afterMs) {
  if (!Number.isFinite(afterMs)) throw scheduleError("invalid schedule reference time");
  return afterMs;
}

function parseTime(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw scheduleError();
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function setLocalTime(date, time) {
  const { hour, minute } = parseTime(time);
  const result = new Date(date.getTime());
  result.setHours(hour, minute, 0, 0);
  if (result.getHours() !== hour || result.getMinutes() !== minute) throw scheduleError();
  return result;
}

function assertCalendarRule(rule) {
  if (!rule || typeof rule !== "object" || typeof rule.kind !== "string") throw scheduleError();
  if (["daily", "workdays", "weekly", "monthly"].includes(rule.kind)) parseTime(rule.time);
  if (rule.kind === "weekly") {
    if (!Array.isArray(rule.weekdays) || rule.weekdays.length === 0 || rule.weekdays.some((day) => !Number.isInteger(day) || !WEEKDAY.has(day))) throw scheduleError();
    if (new Set(rule.weekdays).size !== rule.weekdays.length) throw scheduleError();
  }
  if (rule.kind === "monthly" && (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31)) throw scheduleError();
  if (rule.kind === "interval" && (!Number.isInteger(rule.every) || rule.every < 1 || rule.every > 999 || !UNITS.has(rule.unit))) throw scheduleError();
  if (!["once", "daily", "weekly", "monthly", "workdays", "interval"].includes(rule.kind)) throw scheduleError();
}

function nextCalendarOccurrence(rule, afterMs) {
  const start = new Date(afterMs);
  const candidate = new Date(start.getTime());
  if (rule.kind === "monthly") {
    for (let offset = 0; offset < 240; offset += 1) {
      candidate.setDate(1);
      candidate.setMonth(start.getMonth() + offset, 1);
      const month = candidate.getMonth();
      const lastDay = new Date(candidate.getFullYear(), month + 1, 0).getDate();
      if (rule.day > lastDay) continue;
      candidate.setDate(rule.day);
      const timed = setLocalTime(candidate, rule.time);
      if (timed.getTime() > afterMs) return timed.getTime();
    }
    return null;
  }

  const requested = rule.kind === "workdays" ? new Set([1, 2, 3, 4, 5]) : new Set(rule.weekdays || [0, 1, 2, 3, 4, 5, 6]);
  for (let offset = 0; offset <= 14; offset += 1) {
    const day = new Date(start.getTime());
    day.setDate(start.getDate() + offset);
    if (!requested.has(day.getDay())) continue;
    const timed = setLocalTime(day, rule.time);
    if (timed.getTime() > afterMs) return timed.getTime();
  }
  return null;
}

export function nextOccurrence(rule, afterMs) {
  assertCalendarRule(rule);
  assertAfter(afterMs);
  if (rule.kind === "once") {
    const target = assertTimestamp(rule.at);
    return target > afterMs ? target : null;
  }
  if (rule.kind === "interval") {
    const anchor = assertTimestamp(rule.anchorAt);
    const step = rule.every * UNITS.get(rule.unit);
    if (afterMs < anchor) return anchor;
    return anchor + (Math.floor((afterMs - anchor) / step) + 1) * step;
  }
  return nextCalendarOccurrence(rule, afterMs);
}

export function latestMissedOccurrence(rule, previousPlannedAt, nowMs) {
  assertCalendarRule(rule);
  assertAfter(nowMs);
  if (previousPlannedAt == null) return null;
  const previous = assertTimestamp(previousPlannedAt);
  if (previous >= nowMs) return null;
  if (rule.kind === "once") {
    const candidate = nextOccurrence(rule, previous);
    return candidate != null && candidate <= nowMs ? candidate : null;
  }

  let cursor = previous;
  let latest = null;
  for (let count = 0; count < 20_000; count += 1) {
    const candidate = nextOccurrence(rule, cursor);
    if (candidate == null || candidate > nowMs) break;
    latest = candidate;
    cursor = candidate;
  }
  return latest;
}

export function runKey(automationId, plannedAt) {
  if (typeof automationId !== "string" || !automationId) throw scheduleError("invalid automation id");
  return `${automationId}:${new Date(assertTimestamp(plannedAt)).toISOString()}`;
}
