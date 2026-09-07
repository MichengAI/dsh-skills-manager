function bridgeError(message, code) {
  return Object.assign(new Error(message), { code });
}

function bindingFor(sessions, sessionId) {
  if (typeof sessions?.binding === "function") return sessions.binding(sessionId);
  if (typeof sessions?.scope === "function") {
    const scope = sessions.scope(sessionId);
    return scope ? { ctx: scope } : undefined;
  }
  return undefined;
}

function decodeBase64(data) {
  if (typeof data !== "string") throw bridgeError("附件内容无效", "invalid-attachment");
  if (typeof atob === "function") {
    const binary = atob(data);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(data, "base64"));
  throw bridgeError("当前环境不支持附件转换", "attachment-conversion-unavailable");
}

function fileFromAttachment(attachment) {
  if (typeof globalThis.File !== "function" || typeof globalThis.Blob !== "function") return null;
  const bytes = decodeBase64(attachment.data);
  const blob = new globalThis.Blob([bytes], { type: attachment.mediaType });
  return new globalThis.File([blob], attachment.name || "附件", { type: attachment.mediaType });
}

function nativeState(shell) {
  if (shell?.state && typeof shell.state.getSnapshot === "function") return shell.state.getSnapshot();
  return shell?.snapshot || { draft: "", draftRev: 0, phase: "plain", imageIds: [] };
}

/**
 * Adapter from the workbench home draft to the host-owned conversation input.
 * The adapter deliberately owns no message transport: SessionInputShell.submit
 * remains the only send path, so command/skill adjudication and references stay
 * in the DSH input pipeline.
 */
export function createNativeComposerBridge(options = {}) {
  const {
    ctx,
    sessions,
    mode,
    draftKey,
    workspaceId = null,
    resolveWorkspaceId,
    createSession,
    agentPreset,
    prepareSession,
    activateSession,
    onDraft,
    onState,
  } = options;

  let preparationPromise;
  let sessionId = null;
  let shell = null;
  let controller = null;
  let unsubscribeInput = () => {};
  let submitInFlight = false;
  let nativeImageIds = [];
  let disposed = false;

  function currentState() {
    return nativeState(shell);
  }

  function notifyState() {
    const snapshot = currentState();
    onState?.(snapshot);
    onDraft?.({ text: snapshot.draft, imageIds: [...(snapshot.imageIds || [])] }, snapshot);
    if (submitInFlight && snapshot.phase === "plain" && snapshot.draft === "") {
      submitInFlight = false;
      if (sessionId && typeof activateSession === "function") {
        Promise.resolve(activateSession(sessionId)).catch(() => {});
      }
    }
  }

  function connect(id) {
    const binding = bindingFor(sessions, id);
    const conversation = ctx?.conversation || ctx?.get?.("conversation");
    if (!binding?.ctx || !conversation?.input?.for) {
      throw bridgeError("DSH 原生输入服务不可用", "native-input-unavailable");
    }
    shell = conversation.input.for(binding.ctx);
    const inputTriggers = ctx?.inputTriggers || ctx?.get?.("inputTriggers");
    controller = typeof inputTriggers?.sessionOf === "function"
      ? inputTriggers.sessionOf(binding.ctx)
      : null;
    unsubscribeInput();
    unsubscribeInput = typeof shell?.state?.subscribe === "function"
      ? shell.state.subscribe(notifyState)
      : () => {};
    notifyState();
  }

  async function openAndConnect(id) {
    let lastError;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (disposed) throw bridgeError("原生输入适配器已释放", "bridge-disposed");
      try {
        sessions?.open?.(id);
        if (bindingFor(sessions, id)?.ctx) {
          connect(id);
          return;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw lastError || bridgeError("DSH 会话尚未可用", "session-not-ready");
  }

  async function selectAgentPreset(id) {
    if (!agentPreset) return;
    const connection = ctx?.connection || ctx?.get?.("connection");
    const select = connection?.api?.agentPresets?.select;
    if (typeof select !== "function") {
      throw bridgeError("DSH 预设选择服务不可用", "agent-preset-unavailable");
    }
    const response = await select.call(connection.api.agentPresets, {
      sessionId: id,
      agentPreset,
    });
    if (!response?.result?.ok) {
      throw bridgeError(
        response?.result?.error?.message || "DSH 预设选择失败",
        response?.result?.error?.code || "agent-preset-select-failed",
      );
    }
    sessions?.noteAgentPreset?.(id, response.result.value?.agentPreset || agentPreset);
  }

  async function prepare() {
    if (disposed) throw bridgeError("原生输入适配器已释放", "bridge-disposed");
    if (!preparationPromise) {
      if (typeof prepareSession !== "function") throw bridgeError("会话准备服务不可用", "prepare-unavailable");
      const effectiveWorkspaceId = workspaceId || await resolveWorkspaceId?.() || null;
      const create = typeof createSession === "function"
        ? Promise.resolve(createSession(effectiveWorkspaceId ? { workspaceId: effectiveWorkspaceId } : {}))
        : Promise.resolve(null);
      preparationPromise = create.then(async (created) => {
        const nativeId = typeof created === "string" ? created : created?.sessionId || created?.id || null;
        if (nativeId) await selectAgentPreset(nativeId);
        return prepareSession({ mode, draftKey, workspaceId: effectiveWorkspaceId, ...(nativeId ? { sessionId: nativeId } : {}) });
      }).then(async (result) => {
        if (!result?.sessionId) throw bridgeError("会话准备未返回 sessionId", "session-id-missing");
        sessionId = result.sessionId;
        await sessions?.refresh?.();
        await openAndConnect(sessionId);
        return result;
      }).catch((error) => {
        preparationPromise = undefined;
        throw error;
      });
    }
    return preparationPromise;
  }

  async function transfer(draft = {}) {
    await prepare();
    const text = typeof draft.text === "string" ? draft.text : "";
    shell.setDraft(text);

    const attachments = Array.isArray(draft.attachments) ? draft.attachments : [];
    const conversation = ctx?.conversation || ctx?.get?.("conversation");
    if (attachments.length > 0 && typeof conversation?.createDraftImages === "function") {
      const files = attachments.map(fileFromAttachment).filter(Boolean);
      if (files.length !== attachments.length) {
        throw bridgeError("当前环境无法转移图片附件", "attachment-transfer-unavailable");
      }
      const images = conversation.createDraftImages(files);
      const ids = images.map((image) => image?.id).filter((id) => id !== undefined);
      if (ids.length !== images.length || shell.addImages(ids) !== true) {
        conversation.releaseDraftImages?.(images);
        throw bridgeError("图片附件未能转移到 DSH 输入框", "attachment-transfer-failed");
      }
      nativeImageIds = ids;
    }
    notifyState();
    return { sessionId, draft: currentState() };
  }

  function track(text, caret = text.length) {
    const snapshot = currentState();
    controller?.track?.(text, caret, { tier: snapshot.phase === "plain" ? "plain" : "frozen" }, snapshot.draftRev);
  }

  function openSource(source, selection = {}) {
    const snapshot = currentState();
    if (!controller?.toggleSource) return false;
    const start = Number.isInteger(selection.start) ? selection.start : 0;
    const end = Number.isInteger(selection.end) ? selection.end : start;
    const trigger = source === "reference" ? "@" : "/";
    controller.toggleSource(source, {
      trigger,
      query: "",
      quoted: false,
      position: snapshot.draft.slice(0, start).trim() === "" ? "leading" : "inline",
      span: { start, end, draftRev: snapshot.draftRev },
    });
    return true;
  }

  async function submit() {
    await prepare();
    if (submitInFlight || typeof shell?.submit !== "function") return { accepted: false, sessionId };
    submitInFlight = true;
    shell.submit();
    return { accepted: true, sessionId };
  }

  return {
    get sessionId() { return sessionId; },
    get shell() { return shell; },
    get controller() { return controller; },
    get nativeImageIds() { return [...nativeImageIds]; },
    getState: currentState,
    prepare,
    transfer,
    track,
    openSource,
    subscribeMenu(listener) {
      const menu = controller?.menu;
      if (typeof menu?.subscribe !== "function") return () => {};
      return menu.subscribe(listener);
    },
    getMenuState() {
      return controller?.menu?.getSnapshot?.() || { open: false, groups: [] };
    },
    submit,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeInput();
      controller?.dismiss?.();
      shell = null;
      controller = null;
    },
  };
}
