import { assertMode, parseSessionMeta } from "../shared/contracts.js";

const EPOCH = "1970-01-01T00:00:00.000Z";

function normalizeCreatedAt(value) {
  try {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? EPOCH : date.toISOString();
  } catch {
    return EPOCH;
  }
}

function sessionIdOf(session) {
  return session?.header?.id ?? session?.id;
}

function titleOf(result) {
  const title = result?.value?.title?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

export function historyTitle(meta, title) {
  if (typeof title === "string" && title.trim()) return title.trim();
  if (meta?.setupStatus === "failed") return "任务启动失败";
  if (meta?.origin === "migration") return "导入的未命名会话";
  return meta?.mode === "chat" ? "未命名对话" : "未命名任务";
}

export function createModeService({ repository, sessionQuery }) {
  const assignments = new Map();

  function enqueueAssignment(sessionId, operation) {
    const previous = assignments.get(sessionId) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    assignments.set(sessionId, current);
    return current.finally(() => {
      if (assignments.get(sessionId) === current) assignments.delete(sessionId);
    });
  }

  return {
    async assignSession(sessionId, input) {
      const next = parseSessionMeta(input);
      return enqueueAssignment(sessionId, async () => {
        const current = await repository.getSessionMeta(sessionId);
        if (current && current.mode !== next.mode) {
          throw Object.assign(new Error("mode-conflict"), { statusCode: 409, code: "mode-conflict" });
        }
        return current || repository.putSessionMeta(sessionId, next);
      });
    },

    async listHistory(mode) {
      assertMode(mode);
      const sessions = await sessionQuery.listSessions();
      const ids = sessions.map(sessionIdOf);
      const titleResults = await sessionQuery.readTitleSnapshots(ids);
      const titles = new Map(
        (Array.isArray(titleResults) ? titleResults : [])
          .filter((result) => result?.status === "fulfilled")
          .map((result) => [result.sessionId, titleOf(result)]),
      );

      const records = [];
      for (const session of sessions) {
        const sessionId = sessionIdOf(session);
        const sessionCreatedAt = normalizeCreatedAt(session?.header?.createdAt ?? session?.createdAt);
        const stored = await repository.getSessionMeta(sessionId);
        const meta = stored || {
          sessionId,
          mode: "work",
          origin: "migration",
          imported: true,
          createdAt: sessionCreatedAt,
        };
        records.push({
          ...meta,
          sessionId,
          title: historyTitle(meta, titles.get(sessionId)),
          createdAt: normalizeCreatedAt(meta.createdAt ?? sessionCreatedAt),
        });
      }

      return records
        .filter((record) => record.mode === mode && record.lifecycle !== "prepared")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
  };
}
