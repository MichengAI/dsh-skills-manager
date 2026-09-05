import { randomUUID } from "node:crypto";
import { CHAT_PRESET_ID } from "./chat-preset.js";
import { parseSessionStart } from "../shared/contracts.js";

function gatewayError(message, code, statusCode = 502, details) {
  return Object.assign(new Error(message), {
    code,
    statusCode,
    public: true,
    ...(details === undefined ? {} : { details }),
  });
}

function unwrap(response, statusCode = 502) {
  if (response?.result?.ok === true) return response.result.value;
  const error = response?.result?.error || {};
  throw gatewayError(
    typeof error.message === "string" ? error.message : "DSH request failed",
    typeof error.code === "string" ? error.code : "dsh-request-failed",
    statusCode,
    error.details,
  );
}

function selectedCapabilityBlock(input) {
  if (input.mode !== "work" || input.capabilityIds.length === 0) return "";
  return `\n\n本次任务已选择的能力：${input.capabilityIds.join("、")}。仅在完成任务需要时使用这些能力，所有权限审批仍以宿主策略为准。`;
}

function chatWebBlock(input) {
  if (input.mode !== "chat") return "";
  return input.webSearch
    ? "\n\n本次回答允许在确有必要时使用联网搜索，并注明信息时效。"
    : "\n\n本次回答不要使用联网搜索；仅根据当前对话和用户附件作答。";
}

function deepEffort(catalog, provider, modelId) {
  const group = catalog?.groups?.find((item) => item?.id === provider);
  const model = group?.models?.find((item) => item?.id === modelId);
  const efforts = Array.isArray(model?.reasoning?.efforts) ? model.reasoning.efforts : [];
  const ids = efforts.map((item) => typeof item === "string" ? item : item?.id).filter((id) => typeof id === "string");
  return ids.find((id) => /^(deep|high|xhigh|max|ultra)$/i.test(id)) || ids.at(-1) || null;
}

function containsModel(catalog, provider, modelId) {
  return catalog?.groups?.some((group) => group?.id === provider
    && group.models?.some((model) => model?.id === modelId)) === true;
}

function contentFor(input) {
  return [
    {
      type: "text",
      text: input.text.trim() + selectedCapabilityBlock(input) + chatWebBlock(input),
    },
    ...input.attachments.map((image) => ({
      type: "image",
      mediaType: image.mediaType,
      data: image.data,
      ...(image.name ? { name: image.name } : {}),
    })),
  ];
}

export function createSessionGateway(dependencies) {
  const makeId = dependencies.id || randomUUID;
  const makeRpcId = dependencies.rpcId || randomUUID;
  const sessions = dependencies.apiProxy.sessions;

  async function callModelSelection(sessionId, provider, model, reasoningEffort) {
    const payload = { sessionId, provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) };
    return unwrap(await sessions.selectModel({ rpcId: makeRpcId(), payload }), 409);
  }

  return {
    async start(raw) {
      const input = parseSessionStart(raw);
      if (!input.text.trim()) throw gatewayError("prompt is empty", "empty-prompt", 400);

      const sessionId = makeId();
      const agentPreset = input.mode === "chat" ? CHAT_PRESET_ID : "standard";
      const meta = {
        mode: input.mode,
        origin: "user",
        createdAt: new Date().toISOString(),
        workspaceId: input.mode === "work" ? input.workspaceId : null,
        capabilityIds: input.mode === "work" ? input.capabilityIds : [],
        execution: input.mode === "work" ? input.execution : null,
      };
      await dependencies.repository.putSessionMeta(sessionId, meta);

      let published = false;
      let publishedSessionId = sessionId;
      try {
        const manualModel = input.mode === "work" && input.execution?.modelPolicy === "manual";
        if (manualModel) {
          const catalog = unwrap(await dependencies.apiProxy.llm.models({ rpcId: makeRpcId(), payload: {} }));
          if (!containsModel(catalog, input.execution.provider, input.execution.model)) {
            throw gatewayError("selected model is unavailable", "model-unavailable", 409);
          }
        }

        const created = unwrap(await sessions.create({
          rpcId: makeRpcId(),
          payload: {
            sessionId,
            agentPreset,
            ...(input.mode === "work" && input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          },
        }));
        published = true;
        publishedSessionId = created?.sessionId || sessionId;

        if (input.mode === "work") {
          const session = await dependencies.sessions.get(publishedSessionId);
          if (!session) throw gatewayError("created session is not live", "session-not-live");
          await dependencies.permissionPresets.set(session, "workspace-write");
        }

        const wantsDeep = input.deepThinking || input.execution?.intensity === "deep";
        const reasoning = { requested: wantsDeep, applied: false, reason: wantsDeep ? "unsupported" : null };
        const manualTarget = manualModel
          ? { provider: input.execution.provider, model: input.execution.model }
          : null;
        let liveCatalog = null;
        if (wantsDeep || manualModel) {
          const response = await sessions.models({ rpcId: makeRpcId(), payload: { sessionId: publishedSessionId } });
          if (response?.result?.ok === true) liveCatalog = response.result.value;
        }
        const target = manualTarget || liveCatalog?.current;
        const effort = wantsDeep && target ? deepEffort(liveCatalog, target.provider, target.model) : null;
        if (target) {
          await callModelSelection(publishedSessionId, target.provider, target.model, effort);
          if (wantsDeep && effort) {
            reasoning.applied = true;
            reasoning.reason = null;
          }
        }

        unwrap(await sessions.prompt({
          rpcId: makeRpcId(),
          payload: {
            sessionId: publishedSessionId,
            mode: "queue",
            content: contentFor(input),
            clientTimeZone: input.clientTimeZone,
          },
        }));

        return { sessionId: publishedSessionId, mode: input.mode, agentPreset, reasoning };
      } catch (error) {
        const original = error;
        try {
          if (published) {
            await dependencies.repository.putSessionMeta(sessionId, {
              ...meta,
              setupStatus: "failed",
              setupErrorCode: original.code || "internal",
            });
          } else {
            await dependencies.repository.deleteSessionMeta(sessionId);
          }
        } catch (cleanupError) {
          original.cleanupError = cleanupError;
        }
        if (published) original.sessionId = publishedSessionId;
        throw original;
      }
    },
  };
}
