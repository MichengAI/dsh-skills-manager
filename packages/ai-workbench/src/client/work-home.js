import { recommendExecution } from "../shared/auto-select.js";
import { findWorkTemplate, WORK_TEMPLATES } from "../shared/work-templates.js";
import { workbenchApi } from "./api.js";
import { normalizeImageLimits, readImageAttachment } from "./image-input.js";
import { AI_ORB_SOURCE } from "./assets.js";

export const EMPTY_WORK_DRAFT = {
  text: "",
  attachments: [],
  workspaceId: null,
  capabilityIds: [],
  execution: null,
};

export function normalizeWorkDraft(draft = {}) {
  return {
    ...EMPTY_WORK_DRAFT,
    ...(draft && typeof draft === "object" ? draft : {}),
    attachments: Array.isArray(draft?.attachments) ? draft.attachments : [],
    capabilityIds: Array.isArray(draft?.capabilityIds) ? [...new Set(draft.capabilityIds)] : [],
    execution: draft?.execution && typeof draft.execution === "object" ? { ...draft.execution } : null,
  };
}

export function draftFromTemplate(template, currentDraft = EMPTY_WORK_DRAFT, enabledIds = []) {
  const selected = template || findWorkTemplate("teaching-weekly") || WORK_TEMPLATES[0];
  const recommendation = recommendExecution(selected.promptTemplate, enabledIds.length ? enabledIds : selected.recommendedCapabilityIds);
  return {
    ...normalizeWorkDraft(currentDraft),
    text: selected.promptTemplate,
    capabilityIds: [...recommendation.capabilityIds],
    execution: { ...recommendation },
  };
}

export function buildWorkSessionInput(draft) {
  const value = normalizeWorkDraft(draft);
  return {
    mode: "work",
    text: value.text,
    attachments: value.attachments,
    workspaceId: value.workspaceId || null,
    capabilityIds: value.capabilityIds,
    ...(value.execution ? { execution: { ...value.execution } } : {}),
  };
}

export function workspaceItemsFromFeed(feed) {
  const items = Array.isArray(feed?.items)
    ? feed.items
    : Array.isArray(feed?.state?.items)
      ? feed.state.items
      : [];
  const feedWorkspaceId = typeof feed?.workspaceId === "string" && feed.workspaceId
    ? feed.workspaceId
    : typeof feed?.state?.id === "string" && feed.state.id
      ? feed.state.id
      : null;
  return items.flatMap((item) => {
    if (!item || typeof item.path !== "string") return [];
    const id = typeof item.workspaceId === "string" && item.workspaceId
      ? item.workspaceId
      : typeof item.id === "string" && item.id
        ? item.id
        : feedWorkspaceId;
    if (!id) return [];
    return [{
      id,
      title: typeof item.title === "string" && item.title ? item.title : item.path,
      path: item.path,
    }];
  });
}

export function workspaceFeedFromWorkbench(workbench) {
  const direct = workbench?.workspaceFeed;
  if (direct !== undefined) return direct;
  const runtime = workbench?.workspaces || workbench?.ctx?.workspaces;
  if (typeof runtime?.getSnapshot === "function") {
    try {
      return runtime.getSnapshot();
    } catch {
      return null;
    }
  }
  const candidates = [
    workbench?.useWorkspaces,
    workbench?.ctx?.useWorkspaces,
    workbench?.workspaces?.useWorkspaces,
    workbench?.ctx?.workspaces?.useWorkspaces,
    workbench?.ctx?.root?.useWorkspaces,
  ];
  const hook = candidates.find((candidate) => typeof candidate === "function");
  if (!hook) return null;
  try {
    return hook();
  } catch {
    return null;
  }
}

export function capabilityItemsFromWorkbench(workbench) {
  const source = workbench?.capabilities || workbench?.ctx?.capabilities || workbench?.ctx?.skills;
  if (!Array.isArray(source)) return [];
  return source.flatMap((item) => {
    const id = typeof item === "string" ? item : item?.id;
    if (typeof id !== "string" || !id) return [];
    return [{ id, title: typeof item === "object" && item.title ? item.title : id }];
  });
}

function modelsFrom(catalog) {
  return Array.isArray(catalog?.groups) ? catalog.groups.flatMap((group) => {
    if (!group || typeof group.id !== "string") return [];
    const models = Array.isArray(group.models) ? group.models.filter((model) => typeof model?.id === "string") : [];
    return [{ id: group.id, label: group.label || group.id, models }];
  }) : [];
}

function executionFor(draft, recommendation) {
  const override = draft.execution || {};
  return {
    modelPolicy: override.modelPolicy === "manual" && override.provider && override.model ? "manual" : "auto",
    intensity: override.intensity === "deep" ? "deep" : (override.intensity === "standard" ? "standard" : recommendation.intensity),
    capabilityIds: draft.capabilityIds.length ? draft.capabilityIds : (Array.isArray(override.capabilityIds) && override.capabilityIds.length ? override.capabilityIds : recommendation.capabilityIds),
    ...(override.modelPolicy === "manual" && override.provider && override.model ? { provider: override.provider, model: override.model } : {}),
  };
}

export function createWorkHome(React, options = {}) {
  const h = React.createElement;
  const api = options.api || workbenchApi;

  return function WorkHome({ state, dispatch, workbench }) {
    const draft = normalizeWorkDraft(state?.drafts?.work);
    const capabilityOptions = capabilityItemsFromWorkbench(workbench);
    const enabledIds = capabilityOptions.map((item) => item.id);
    const recommendation = recommendExecution(draft.text, enabledIds);
    const execution = executionFor(draft, recommendation);
    const workspaceFeed = workspaceFeedFromWorkbench(workbench);
    const workspaceItems = workspaceItemsFromFeed(workspaceFeed);
    const imageLimits = workbench?.imageLimits || workbench?.ctx?.imageLimits || {};
    const normalizedImageLimits = normalizeImageLimits(imageLimits);
    const [selectionOpen, setSelectionOpen] = React.useState(false);
    const [models, setModels] = React.useState(null);
    const [modelsError, setModelsError] = React.useState(null);
    const [sending, setSending] = React.useState(false);
    const [attachmentError, setAttachmentError] = React.useState(null);
    const [submitError, setSubmitError] = React.useState(null);
    const [speechListening, setSpeechListening] = React.useState(false);
    const [speechError, setSpeechError] = React.useState(null);
    const fileInput = React.useRef(null);
    const draftRef = React.useRef(draft);
    draftRef.current = draft;

    const speech = workbench?.speech || workbench?.ctx?.speech || workbench?.ctx?.voice;
    const speechSupported = speech?.supported === true;
    React.useEffect(() => () => speech?.stop?.(), [speech]);

    React.useEffect(() => {
      if (!selectionOpen || models || modelsError) return undefined;
      let active = true;
      Promise.resolve(api.listModels()).then((value) => {
        if (active) setModels(value);
      }).catch((error) => {
        if (active) setModelsError(error);
      });
      return () => { active = false; };
    }, [selectionOpen, models, modelsError]);

    const replaceDraft = (next) => dispatch({ type: "draft/replace", mode: "work", draft: normalizeWorkDraft(next) });
    const changeText = (text) => replaceDraft({ ...draft, text });
    const openDialog = (title, message) => dispatch({ type: "dialog/open", dialog: { title, message } });

    const selectTemplate = (template) => {
      replaceDraft(draftFromTemplate(template, draft, enabledIds));
      setSubmitError(null);
    };

    const addFiles = async (event) => {
      const files = [...(event.target.files || [])];
      if (files.length === 0) return;
      setAttachmentError(null);
      let attachments = [...draft.attachments];
      try {
        for (const file of files) {
          attachments.push(await readImageAttachment(file, imageLimits, attachments));
        }
        replaceDraft({ ...draft, attachments });
      } catch (error) {
        setAttachmentError(error.message || "附件不可用");
      } finally {
        event.target.value = "";
      }
    };

    const removeAttachment = (index) => replaceDraft({ ...draft, attachments: draft.attachments.filter((_, itemIndex) => itemIndex !== index) });

    const addWorkspace = async () => {
      const workspaceApi = workbench?.ctx?.workspaces;
      if (typeof workspaceApi?.pickDirectory !== "function" || typeof workspaceApi?.create !== "function") {
        openDialog("工作空间", "当前宿主暂未提供添加工作空间能力。");
        return;
      }
      try {
        const picked = await workspaceApi.pickDirectory();
        const path = typeof picked === "string" ? picked : picked?.path;
        if (!path) return;
        const created = await workspaceApi.create({ path });
        const id = created?.id || created?.workspaceId || created?.value?.id;
        if (typeof id === "string" && id) replaceDraft({ ...draft, workspaceId: id });
      } catch (error) {
        if (error?.code !== "cancelled" && error?.code !== "canceled") setSubmitError(error);
      }
    };

    const changeCapability = (id, checked) => {
      const next = checked ? [...new Set([...draft.capabilityIds, id])] : draft.capabilityIds.filter((item) => item !== id);
      replaceDraft({ ...draft, capabilityIds: next, execution: { ...execution, capabilityIds: next } });
    };

    const resetAutomatic = () => replaceDraft({
      ...draft,
      capabilityIds: [...recommendation.capabilityIds],
      execution: { ...recommendation, modelPolicy: "auto", provider: null, model: null },
    });

    const changeModel = (value) => {
      if (!value) {
        replaceDraft({ ...draft, execution: { ...execution, modelPolicy: "auto", provider: null, model: null } });
        return;
      }
      const [provider, model] = value.split("\u0000");
      replaceDraft({ ...draft, execution: { ...execution, modelPolicy: "manual", provider, model } });
    };

    const toggleSpeech = () => {
      if (!speechSupported) return;
      setSpeechError(null);
      if (speechListening) {
        speech.stop?.();
        setSpeechListening(false);
        return;
      }
      try {
        speech.start?.({
          onText: (text) => {
            const value = typeof text === "string" ? text.trim() : "";
            if (value) {
              const nextText = `${draftRef.current.text}${draftRef.current.text ? "\n" : ""}${value}`;
              draftRef.current = { ...draftRef.current, text: nextText };
              changeText(nextText);
            }
          },
          onState: (nextState) => setSpeechListening(nextState === "listening"),
          onError: (error) => {
            setSpeechListening(false);
            setSpeechError(error);
          },
        });
        setSpeechListening(true);
      } catch (error) {
        setSpeechListening(false);
        setSpeechError(error?.message || "语音识别失败，请重试");
      }
    };

    const submit = async (event) => {
      event.preventDefault();
      if (!draft.text.trim() || sending) return;
      setSending(true);
      setSubmitError(null);
      try {
        const result = await api.startSession(buildWorkSessionInput({ ...draft, execution }));
        if (!result?.sessionId) throw new Error("会话创建未返回 sessionId");
        replaceDraft(EMPTY_WORK_DRAFT);
        workbench?.ctx?.sessions?.open?.(result.sessionId);
      } catch (error) {
        if (error?.sessionId) workbench?.ctx?.sessions?.open?.(error.sessionId);
        setSubmitError(error);
      } finally {
        setSending(false);
      }
    };

    const modelValue = execution.modelPolicy === "manual" ? `${execution.provider}\u0000${execution.model}` : "";
    const selectedWorkspace = workspaceItems.find((item) => item.id === draft.workspaceId);
    const modelGroups = modelsFrom(models);

    const templateRows = WORK_TEMPLATES.map((template) => h("button", {
      type: "button",
      className: "daw-template-row",
      key: template.id,
      onClick: () => selectTemplate(template),
    },
    h("span", { className: "daw-template-index" }, String(template.sortOrder).padStart(2, "0")),
    h("span", { className: "daw-template-title" }, template.title),
    h("span", { className: "daw-template-arrow", "aria-hidden": "true" }, "→")));

    return h("section", { className: "daw-work-home", "aria-labelledby": "daw-work-home-title" },
      h("div", { className: "daw-work-hero" },
        h("img", { className: "daw-ai-orb", src: AI_ORB_SOURCE, alt: "", width: 104, height: 104 }),
        h("p", { className: "daw-eyebrow" }, "WORK MODE"),
        h("h1", { id: "daw-work-home-title" }, "今天，想完成什么工作？"),
        h("p", { className: "daw-work-copy" }, "描述目标，选择工作空间与能力，AI 会按需完成并交付结果。")),
      h("form", { className: "daw-work-composer", onSubmit: submit },
        h("textarea", {
          className: "daw-work-textarea",
          value: draft.text,
          onChange: (event) => changeText(event.target.value),
          placeholder: "例如：核对本周科研数据，生成一页简报",
          "aria-label": "工作任务",
          rows: 4,
        }),
        draft.attachments.length > 0 ? h("div", { className: "daw-attachment-list", "aria-label": "已添加附件" }, draft.attachments.map((attachment, index) => h("span", { className: "daw-attachment-chip", key: `${attachment.name || "image"}-${index}` }, attachment.name || "图片", h("button", { type: "button", onClick: () => removeAttachment(index), "aria-label": `移除${attachment.name || "图片"}` }, "×")))) : null,
        attachmentError ? h("p", { className: "daw-inline-error", role: "alert" }, attachmentError) : null,
        h("div", { className: "daw-work-toolbar" },
          h("div", { className: "daw-work-actions" },
            h("input", { ref: fileInput, className: "daw-visually-hidden", type: "file", accept: [...normalizedImageLimits.mediaTypes].join(","), multiple: true, onChange: addFiles }),
            h("button", { type: "button", className: "daw-tool-button", onClick: () => fileInput.current?.click(), "aria-label": "添加图片附件" }, "＋ 图片"),
            speechSupported ? h("button", { type: "button", className: "daw-tool-button", onClick: toggleSpeech, "aria-label": speechListening ? "停止语音输入" : "语音输入", "aria-pressed": speechListening }, speechListening ? "◌ 停止" : "◌ 语音") : null,
            h("button", { type: "button", className: "daw-policy-chip", onClick: () => openDialog("需要时请求批准", "AI 只会在任务需要时申请宿主批准；文件与系统权限仍由 DSH 宿主策略控制。") }, "✓ 需要时请求批准")),
          h("button", { type: "submit", className: "daw-send-button", disabled: sending || !draft.text.trim() }, sending ? "发送中…" : "发送 ➤")),
        speechError ? h("p", { className: "daw-inline-error", role: "alert" }, speechError) : null,
        submitError ? h("p", { className: "daw-inline-error", role: "alert" }, submitError.message || "任务发送失败") : null),
      h("div", { className: "daw-work-options" },
        h("label", { className: "daw-option-label" }, "工作空间", h("select", { value: draft.workspaceId || "", onChange: (event) => replaceDraft({ ...draft, workspaceId: event.target.value || null }), "aria-label": "选择工作空间" }, h("option", { value: "" }, "不指定工作空间"), workspaceItems.map((item) => h("option", { key: item.id, value: item.id }, `${item.title} · ${item.path}`))), selectedWorkspace ? h("span", { className: "daw-selected-path" }, selectedWorkspace.path) : null),
        h("button", { type: "button", className: "daw-add-workspace", onClick: addWorkspace }, "＋ 添加工作空间")),
      h("section", { className: "daw-auto-selection" },
        h("button", { type: "button", className: "daw-auto-selection-toggle", onClick: () => setSelectionOpen(!selectionOpen), "aria-expanded": selectionOpen }, h("span", null, "自动选择"), h("span", { className: "daw-auto-selection-summary" }, `${execution.modelPolicy === "manual" ? `${execution.provider}/${execution.model}` : "自动模型"} · ${execution.capabilityIds.length || 0} 项能力 · ${execution.intensity === "deep" ? "深度" : "标准"}`), h("span", { "aria-hidden": "true" }, selectionOpen ? "⌃" : "⌄")),
        selectionOpen ? h("div", { className: "daw-selection-panel" },
          h("div", { className: "daw-selection-row" }, h("span", null, "强度"), h("select", { value: execution.intensity, onChange: (event) => replaceDraft({ ...draft, execution: { ...execution, intensity: event.target.value } }) }, h("option", { value: "standard" }, "标准"), h("option", { value: "deep" }, "深度"))),
          h("div", { className: "daw-selection-row" }, h("span", null, "模型"), h("select", { value: modelValue, onChange: (event) => changeModel(event.target.value) }, h("option", { value: "" }, "自动（使用 DSH 默认）"), modelGroups.map((group) => h("optgroup", { key: group.id, label: group.label }, group.models.map((model) => h("option", { key: `${group.id}/${model.id}`, value: `${group.id}\u0000${model.id}` }, model.label || model.id))))), modelsError ? h("span", { className: "daw-inline-error" }, "模型列表暂不可用") : null),
          h("div", { className: "daw-capability-picker" }, h("span", null, "能力"), capabilityOptions.length === 0 ? h("span", { className: "daw-muted-note" }, "宿主未提供能力目录，将按任务自动选择") : capabilityOptions.map((item) => h("label", { key: item.id, className: "daw-capability-option" }, h("input", { type: "checkbox", checked: execution.capabilityIds.includes(item.id), onChange: (event) => changeCapability(item.id, event.target.checked) }), item.title))),
          h("button", { type: "button", className: "daw-reset-selection", onClick: resetAutomatic }, "恢复自动选择")) : null),
      h("section", { className: "daw-work-templates", "aria-label": "推荐任务" },
        h("div", { className: "daw-section-heading" },
          h("h2", null, "推荐任务"),
          h("span", null, "点击后仅预填，不会自动发送")),
        templateRows));
  };
}
