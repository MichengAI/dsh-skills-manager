import { DEFAULT_CHAT_CONFIG, buildChatSessionInput, keyboardAction, validateChatConfig, rotateBatch } from "../shared/chat-config.js";
import { workbenchApi } from "./api.js";
import { normalizeImageLimits, readImageAttachment } from "./image-input.js";
import { AI_ORB_SOURCE } from "./assets.js";

function normalizeChatDraft(draft = {}) {
  return {
    text: typeof draft?.text === "string" ? draft.text : "",
    attachments: Array.isArray(draft?.attachments) ? draft.attachments : [],
  };
}

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function iconFor(item) {
  const icons = { portal: "⌂", mail: "✉", document: "▤", file: "▧" };
  return icons[item.icon] || "↗";
}

export function createChatHome(React, options = {}) {
  const h = React.createElement;
  const api = options.api || workbenchApi;
  const config = validateChatConfig(options.config || DEFAULT_CHAT_CONFIG);

  return function ChatHome({ state, dispatch, workbench }) {
    const draft = normalizeChatDraft(state?.drafts?.chat);
    const [deepThinking, setDeepThinking] = React.useState(false);
    const [webSearch, setWebSearch] = React.useState(false);
    const [guessPage, setGuessPage] = React.useState(0);
    const [popularPage, setPopularPage] = React.useState(0);
    const [navigationCategory, setNavigationCategory] = React.useState("服务导航");
    const [sending, setSending] = React.useState(false);
    const [attachmentError, setAttachmentError] = React.useState(null);
    const [submitError, setSubmitError] = React.useState(null);
    const [notice, setNotice] = React.useState(null);
    const [speechListening, setSpeechListening] = React.useState(false);
    const [speechError, setSpeechError] = React.useState(null);
    const fileInput = React.useRef(null);
    const draftRef = React.useRef(draft);
    draftRef.current = draft;

    const speech = workbench?.speech || workbench?.ctx?.speech || workbench?.ctx?.voice;
    const speechSupported = speech?.supported === true;
    React.useEffect(() => () => speech?.stop?.(), [speech]);

    const replaceDraft = (next) => dispatch({ type: "draft/replace", mode: "chat", draft: normalizeChatDraft(next) });
    const changeText = (text) => replaceDraft({ ...draft, text });
    const selectShortcut = (item) => {
      replaceDraft({ ...draft, text: item.prompt });
      setSubmitError(null);
      setNotice(null);
    };

    const addFiles = async (event) => {
      const files = [...(event.target.files || [])];
      if (files.length === 0) return;
      const imageLimits = workbench?.imageLimits || workbench?.ctx?.imageLimits || {};
      setAttachmentError(null);
      try {
        const attachments = [...draft.attachments];
        for (const file of files) attachments.push(await readImageAttachment(file, imageLimits, attachments));
        replaceDraft({ ...draft, attachments });
      } catch (error) {
        setAttachmentError(error.message || "附件不可用");
      } finally {
        event.target.value = "";
      }
    };

    const removeAttachment = (index) => replaceDraft({ ...draft, attachments: draft.attachments.filter((_, itemIndex) => itemIndex !== index) });

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
      event?.preventDefault?.();
      if (!draft.text.trim() || sending) return;
      setSending(true);
      setSubmitError(null);
      setNotice(null);
      try {
        const result = await api.startSession(buildChatSessionInput({
          text: draft.text,
          attachments: draft.attachments,
          deepThinking,
          webSearch,
          clientTimeZone: timeZone(),
        }));
        if (!result?.sessionId) throw new Error("会话创建未返回 sessionId");
        replaceDraft({ text: "", attachments: [] });
        if (deepThinking && result.reasoning?.applied === false) setNotice("当前模型不支持所选深度思考级别");
        workbench?.sessions?.open?.(result.sessionId);
      } catch (error) {
        if (error?.sessionId) workbench?.sessions?.open?.(error.sessionId);
        setSubmitError(error);
      } finally {
        setSending(false);
      }
    };

    const openNavigation = (item) => {
      if (item.action !== "open-link") {
        setNotice("暂未配置");
        return;
      }
      if (typeof globalThis.window?.open === "function") globalThis.window.open(item.url, "_blank", "noopener,noreferrer");
    };

    const imageLimits = normalizeImageLimits(workbench?.imageLimits || workbench?.ctx?.imageLimits || {});
    const guesses = rotateBatch(config.guesses, 3, guessPage);
    const popular = rotateBatch(config.popular, 3, popularPage);
    const navigation = config.navigation.filter((item) => item.category === navigationCategory);
    const navigationTabs = ["服务导航", "文档资料"];
    const navigationContent = navigation.length === 0
      ? h("p", { className: "daw-chat-empty" }, "暂无配置，请联系管理员")
      : h("div", { className: "daw-chat-navigation-list" }, navigation.map((item) => h(
        "button",
        {
          type: "button",
          className: "daw-chat-navigation-item",
          key: item.id,
          disabled: item.action === "disabled",
          onClick: () => openNavigation(item),
          title: item.action === "disabled" ? "暂未配置" : item.title,
          "aria-label": item.action === "disabled" ? `${item.title}，暂未配置` : item.title,
        },
        h("span", { className: "daw-chat-navigation-icon", "aria-hidden": "true" }, iconFor(item)),
        h("span", null, item.title),
        h("span", { className: "daw-chat-navigation-status" }, item.action === "disabled" ? "暂未配置" : "↗"),
      )));

    const renderShortcut = (item) => h("button", {
      type: "button",
      className: "daw-chat-shortcut",
      key: item.id,
      onClick: () => selectShortcut(item),
    }, h("span", { className: "daw-chat-shortcut-icon", "aria-hidden": "true" }, "✦"), h("span", null, item.label));

    const renderRefresh = (label, onClick) => h("button", { type: "button", className: "daw-chat-refresh", onClick, "aria-label": `换一批${label}` }, "换一批 ↻");

    return h("section", { className: "daw-chat-home", "aria-labelledby": "daw-chat-home-title" },
      h("div", { className: "daw-chat-hero" },
        h("img", { className: "daw-ai-orb", src: AI_ORB_SOURCE, alt: "", width: 104, height: 104 }),
        h("p", { className: "daw-eyebrow" }, "CHAT MODE"),
        h("h1", { id: "daw-chat-home-title" }, "有什么校园问题想问我？"),
        h("p", { className: "daw-chat-copy" }, "随时问我校园服务、学习生活和知识问题。")),
      h("form", { className: "daw-chat-composer", onSubmit: submit },
        h("textarea", {
          className: "daw-chat-textarea",
          value: draft.text,
          onChange: (event) => changeText(event.target.value),
          onKeyDown: (event) => {
            const action = keyboardAction(event);
            if (action === "send") {
              event.preventDefault();
              submit(event);
            }
          },
          placeholder: "例如：学校理发服务如何预约？",
          "aria-label": "校园问题",
          rows: 4,
        }),
        draft.attachments.length > 0 ? h("div", { className: "daw-attachment-list", "aria-label": "已添加附件" }, draft.attachments.map((attachment, index) => h("span", { className: "daw-attachment-chip", key: `${attachment.name || "image"}-${index}` }, attachment.name || "图片", h("button", { type: "button", onClick: () => removeAttachment(index), "aria-label": `移除${attachment.name || "图片"}` }, "×")))) : null,
        attachmentError ? h("p", { className: "daw-inline-error", role: "alert" }, attachmentError) : null,
        h("div", { className: "daw-chat-toolbar" },
          h("div", { className: "daw-chat-actions" },
            h("input", { ref: fileInput, className: "daw-visually-hidden", type: "file", accept: [...imageLimits.mediaTypes].join(","), multiple: true, onChange: addFiles }),
            h("button", { type: "button", className: "daw-tool-button", onClick: () => fileInput.current?.click(), "aria-label": "添加图片附件" }, "＋ 图片"),
            speechSupported ? h("button", { type: "button", className: "daw-tool-button", onClick: toggleSpeech, "aria-label": speechListening ? "停止语音输入" : "语音输入", "aria-pressed": speechListening }, speechListening ? "◌ 停止" : "◌ 语音") : null,
            h("button", { type: "button", className: `daw-toggle-button${deepThinking ? " is-active" : ""}`, role: "switch", "aria-checked": deepThinking, onClick: () => setDeepThinking(!deepThinking) }, "深度思考"),
            h("button", { type: "button", className: "daw-toggle-button", role: "switch", "aria-checked": false, disabled: true, title: "联网能力由 DSH Chat 预设统一配置", "aria-label": "联网搜索由管理员配置" }, "联网搜索（管理员配置）")),
          h("button", { type: "submit", className: "daw-send-button", disabled: sending || !draft.text.trim() }, sending ? "发送中…" : "发送 ➤")),
        h("p", { className: "daw-keyboard-help" }, "Enter 发送，Ctrl+Enter 换行"),
        speechError ? h("p", { className: "daw-inline-error", role: "alert" }, speechError) : null,
        submitError ? h("p", { className: "daw-inline-error", role: "alert" }, submitError.message || "问题发送失败") : null,
        notice ? h("p", { className: "daw-inline-note", role: "status" }, notice) : null),
      h("div", { className: "daw-chat-cards" },
        h("section", { className: "daw-chat-card", "aria-labelledby": "daw-chat-guesses-title" },
          h("div", { className: "daw-chat-card-heading" }, h("h2", { id: "daw-chat-guesses-title" }, "猜你想问"), renderRefresh("猜你想问", () => setGuessPage((page) => page + 1))),
          h("div", { className: "daw-chat-shortcuts" }, guesses.map(renderShortcut))),
        h("section", { className: "daw-chat-card", "aria-labelledby": "daw-chat-popular-title" },
          h("div", { className: "daw-chat-card-heading" }, h("h2", { id: "daw-chat-popular-title" }, "热门服务"), renderRefresh("热门服务", () => setPopularPage((page) => page + 1))),
          h("div", { className: "daw-chat-shortcuts" }, popular.map(renderShortcut))),
        h("section", { className: "daw-chat-card", "aria-labelledby": "daw-chat-navigation-title" },
          h("div", { className: "daw-chat-card-heading" }, h("h2", { id: "daw-chat-navigation-title" }, "服务导航")),
          h("div", { className: "daw-chat-tabs", role: "tablist", "aria-label": "服务导航分类" }, navigationTabs.map((category) => h("button", { type: "button", role: "tab", key: category, "aria-selected": navigationCategory === category, onClick: () => setNavigationCategory(category) }, category))),
          navigationContent)));
  };
}
