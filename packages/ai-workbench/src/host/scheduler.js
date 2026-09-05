function asMs(value) {
  const result = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("invalid scheduler clock");
  return result;
}

function asIso(value) {
  return new Date(asMs(value)).toISOString();
}

export function createScheduler({
  automationService,
  execute = async () => {},
  clock = { now: () => Date.now(), setTimeout, clearTimeout },
  systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  log = () => {},
} = {}) {
  let timer = null;
  let disposed = false;
  let generation = 0;
  const lanes = new Map();

  function clear() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  async function dispatch(item, plannedAt) {
    const active = (await automationService.listRuns(item.id)).find((run) => ["running", "waiting_approval"].includes(run.status));
    const claim = await automationService.claim(item.id, plannedAt);
    if (!claim?.claimed) return;
    if (active || lanes.has(item.id)) {
      await automationService.updateRun(claim.run.id, {
        status: "skipped",
        finishedAt: asIso(clock.now()),
        skipReason: "previous_run_active",
      });
      return;
    }
    const previous = lanes.get(item.id) || Promise.resolve();
    const current = previous.then(() => execute(item, claim.run)).catch((error) => log("scheduler execute failed", error));
    lanes.set(item.id, current);
    void current.finally(() => {
      if (lanes.get(item.id) === current) lanes.delete(item.id);
    });
  }

  async function tick(expectedGeneration) {
    if (disposed || expectedGeneration !== generation) return;
    clear();
    const now = asMs(clock.now());
    await automationService.syncSystemTimezone(systemTimeZone(), asIso(now));
    await automationService.resume(asIso(now));
    for (const item of await automationService.list({ status: "active" })) {
      if (!item.enabled || !item.nextRunAt || Date.parse(item.nextRunAt) > now) continue;
      await dispatch(item, item.nextRunAt);
      await automationService.advance(item.id, asIso(now));
    }
    await arm();
  }

  async function arm() {
    clear();
    if (disposed) return;
    const ownGeneration = ++generation;
    const active = (await automationService.list({ status: "active" }))
      .filter((item) => item.enabled && item.nextRunAt != null)
      .sort((left, right) => Date.parse(left.nextRunAt) - Date.parse(right.nextRunAt));
    if (active.length === 0) return;
    const delay = Math.max(0, Math.min(60_000, Date.parse(active[0].nextRunAt) - asMs(clock.now())));
    timer = clock.setTimeout(() => void tick(ownGeneration), delay);
  }

  return {
    start: async () => {
      const now = asIso(clock.now());
      await automationService.syncSystemTimezone(systemTimeZone(), now);
      await automationService.resume(now);
      await arm();
    },
    changed: arm,
    dispose: () => {
      disposed = true;
      generation += 1;
      clear();
    },
  };
}
