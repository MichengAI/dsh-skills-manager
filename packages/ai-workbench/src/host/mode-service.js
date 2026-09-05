import { assertMode, parseSessionMeta } from "../shared/contracts.js";

const EPOCH = "1970-01-01T00:00:00.000Z";

function normalizeCreatedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? EPOCH : date.toISOString();
}

function sessionIdOf(session) {
  return session?.header?.id ?? session?.id;
}

function titleOf(result) {
  return result?.value?.title?.title || "未命名";
}

export function createModeService({ repository, sessionQuery }) {
  return {
    async assignSession(sessionId, input) {
      const next = parseSessionMeta(input);
      const current = await repository.getSessionMeta(sessionId);
      if (current && current.mode !== next.mode) {
        throw Object.assign(new Error("mode-conflict"), { statusCode: 409, code: "mode-conflict" });
      }
      return current || repository.putSessionMeta(sessionId, next);
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
          title: titles.get(sessionId) || "未命名",
          createdAt: normalizeCreatedAt(meta.createdAt ?? sessionCreatedAt),
        });
      }

      return records
        .filter((record) => record.mode === mode)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
  };
}
