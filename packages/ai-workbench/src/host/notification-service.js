import { randomUUID } from "node:crypto";

function clean(value, max = 120) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function createNotificationService({ repository, notifier, id = randomUUID, now = () => new Date().toISOString() } = {}) {
  return {
    async create(input) {
      const record = {
        id: id(),
        kind: clean(input?.kind, 40),
        title: clean(input?.title, 80),
        summary: clean(input?.summary, 120),
        automationId: typeof input?.automationId === "string" ? input.automationId : null,
        runId: typeof input?.runId === "string" ? input.runId : null,
        createdAt: new Date(now()).toISOString(),
        readAt: null,
      };
      const saved = await repository.putNotification(record);
      const delivery = await notifier?.notify?.({ title: record.title, body: record.summary });
      if (delivery?.delivered === true) return saved;
      return saved;
    },
    list() {
      return repository.listNotifications?.() || [];
    },
    async markRead(notificationId) {
      const current = (repository.listNotifications?.() || []).find((item) => item.id === notificationId);
      if (!current) return null;
      return repository.putNotification({ ...current, readAt: current.readAt || new Date(now()).toISOString() });
    },
  };
}
