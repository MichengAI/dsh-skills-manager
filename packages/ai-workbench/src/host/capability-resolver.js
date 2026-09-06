const EXECUTABLE_HEALTH = new Set(["ready"]);

function unavailable(id) {
  return Object.assign(new Error(`所选能力不可调用：${id}`), {
    code: "capability-unavailable",
    statusCode: 409,
    public: true,
    capabilityId: id,
  });
}

/**
 * Produces the immutable capability evidence stored with a task.  The host
 * must call this immediately before it creates a session, so an outdated UI
 * selection cannot silently turn into an arbitrary capability request.
 */
export function resolveSelection(ids, catalog) {
  const selected = Array.isArray(ids) ? [...new Set(ids)] : [];
  const byId = new Map((Array.isArray(catalog) ? catalog : [])
    .filter((item) => item && typeof item.id === "string")
    .map((item) => [item.id, item]));

  return selected.map((id) => {
    const item = byId.get(id);
    if (!item || !EXECUTABLE_HEALTH.has(item.health)) throw unavailable(id);
    return {
      id: item.id,
      source: typeof item.source === "string" ? item.source : "unknown",
      version: typeof item.version === "string" ? item.version : null,
    };
  });
}
