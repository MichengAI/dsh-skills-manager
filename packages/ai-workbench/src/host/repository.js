export const TABLES = Object.freeze([
  "session_modes",
  "drafts",
  "settings",
  "capability_preferences",
  "automations",
  "automation_runs",
  "home_content",
  "notifications",
]);

const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: 1,
  brandName: "正方 AI 工作台",
  theme: "light",
  defaultMode: "work",
  lastMode: "work",
  localDisplayName: "本地用户",
  voiceEnabled: true,
});
const DEFAULT_CAPABILITY_PREFERENCES = Object.freeze({ enabledIds: [], updatedAt: null });

export async function openWorkbenchUnit(storage) {
  return storage.backend.get("json").kv.open({
    name: "dsh_ai_workbench",
    version: 1,
    tables: TABLES,
    hasGlobal: false,
  });
}

export async function createRepository(unit) {
  const loaded = await unit.loadAll();
  const loadedTables = loaded?.tables ?? {};
  const tables = Object.fromEntries(
    TABLES.map((name) => [name, new Map(Object.entries(loadedTables[name] || {}))]),
  );
  let writes = Promise.resolve();

  function enqueue(operation) {
    const next = writes.then(operation, operation);
    writes = next.catch(() => undefined);
    return next;
  }

  function get(table, key) {
    const value = tables[table].get(key);
    return value == null ? null : structuredClone(value);
  }

  async function put(table, key, value) {
    const saved = structuredClone(value);
    return enqueue(async () => {
      await unit.putRecord(table, key, structuredClone(saved));
      tables[table].set(key, saved);
      return structuredClone(saved);
    });
  }

  function remove(table, key) {
    return enqueue(async () => {
      await unit.deleteRecord(table, key);
      tables[table].delete(key);
    });
  }

  function list(table) {
    return [...tables[table].values()].map((value) => structuredClone(value));
  }

  return {
    getDraft: (mode) => get("drafts", mode) || { mode, text: "", attachments: [], updatedAt: null },
    putDraft: (mode, draft) => put("drafts", mode, { ...draft, mode, updatedAt: new Date().toISOString() }),
    getSessionMeta: (sessionId) => get("session_modes", sessionId),
    putSessionMeta: (sessionId, meta) => put("session_modes", sessionId, { ...meta, sessionId }),
    listSessionMeta: () => list("session_modes"),
    getSettings: () => get("settings", "global") || structuredClone(DEFAULT_SETTINGS),
    putSettings: (settings) => put("settings", "global", settings),
    getCapabilityPreferences: () => get("capability_preferences", "global") || structuredClone(DEFAULT_CAPABILITY_PREFERENCES),
    putCapabilityPreferences: (value) => put("capability_preferences", "global", value),
    listAutomations: () => list("automations"),
    getAutomation: (id) => get("automations", id),
    putAutomation: (record) => put("automations", record.id, record),
    deleteAutomation: (id) => remove("automations", id),
    listAutomationRuns: () => list("automation_runs"),
    putAutomationRun: (record) => put("automation_runs", record.id, record),
    getHomeContent: (id) => get("home_content", id),
    putHomeContent: (record) => put("home_content", record.id, record),
    listNotifications: () => list("notifications"),
    putNotification: (record) => put("notifications", record.id, record),
    deleteNotification: (id) => remove("notifications", id),
    close: () => writes.then(() => unit.close()),
  };
}
