import { createAutomationDetail } from "./automation-detail.js";
import { createAutomationEditor } from "./automation-editor.js";
import { AUTOMATION_STATUS_LABELS, scheduleCopy, sortAutomations } from "./schedule-fields.js";
import { workbenchApi } from "./api.js";

export const AUTOMATION_SUGGESTIONS = [{
  name: "每日简报",
  type: "reminder",
  prompt: "整理今天的待办并提醒我。",
  schedule: { kind: "workdays", time: "08:00" },
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  enabled: true,
  notificationPolicy: { onSuccess: true, onFailure: false, onApprovalRequired: false },
}];

export function createAutomationList(React, options = {}) {
  const h = React.createElement;
  const api = options.api || workbenchApi;
  const AutomationEditor = createAutomationEditor(React, options);
  const AutomationDetail = createAutomationDetail(React, options);
  return function AutomationList({ workbench } = {}) {
    const [items, setItems] = React.useState([]);
    const [status, setStatus] = React.useState("all");
    const [query, setQuery] = React.useState("");
    const [editor, setEditor] = React.useState(null);
    const [detail, setDetail] = React.useState(null);
    const [error, setError] = React.useState("");
    const load = () => Promise.resolve(api.listAutomations({ query, status })).then((next) => setItems(sortAutomations(next))).catch((cause) => setError(cause?.message || "自动化任务加载失败"));
    React.useEffect(() => { load(); }, [query, status]);
    const refresh = () => load();
    const toggle = async (item) => { try { await api.setAutomationEnabled(item.id, !item.enabled); await refresh(); } catch (cause) { setError(cause?.message || "更新失败"); } };
    return h("section", { className: "daw-automation-page", "aria-labelledby": "daw-automation-title" }, [
      h("header", { className: "daw-automation-page-header", key: "header" }, [h("div", { key: "intro" }, [h("h1", { id: "daw-automation-title", key: "title" }, "已安排的任务"), h("p", { key: "copy" }, "让 DSH 按计划提醒你，或自动完成重复的 Work 任务")]), h("button", { type: "button", className: "daw-send-button", onClick: () => setEditor({ initialDraft: null }), key: "create" }, "创建")]),
      h("div", { className: "daw-automation-search", key: "search" }, h("input", { type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "搜索已安排任务", "aria-label": "搜索已安排任务" })),
      h("div", { className: "daw-automation-tabs", role: "tablist", key: "tabs" }, Object.entries(AUTOMATION_STATUS_LABELS).map(([value, label]) => h("button", { type: "button", role: "tab", "aria-selected": status === value, className: status === value ? "is-active" : "", onClick: () => setStatus(value), key: value }, label))),
      error ? h("p", { className: "daw-inline-error", role: "alert", key: "error" }, error) : null,
      h("div", { className: "daw-automation-items", key: "items" }, items.length === 0 ? h("p", { className: "daw-empty" }, "还没有安排任务。创建一个提醒或 Work 任务吧。") : items.map((item) => h("article", { className: "daw-automation-row", key: item.id }, [h("button", { type: "button", className: "daw-automation-row-main", onClick: () => setDetail(item) }, [h("strong", null, item.name), h("span", null, `${item.type === "work" ? "Work" : "提醒"} · ${scheduleCopy(item.schedule)}`), h("small", null, item.nextRunAt ? `下次运行 ${item.nextRunAt}` : "暂无下次运行")]), h("button", { type: "button", className: "daw-tool-button", onClick: () => toggle(item) }, item.enabled ? "暂停" : "开启")]))),
      h("section", { className: "daw-automation-suggestions", key: "suggestions" }, [h("h2", null, "建议"), h("p", null, "从常用模板开始安排"), ...AUTOMATION_SUGGESTIONS.map((suggestion) => h("button", { type: "button", onClick: () => setEditor({ initialDraft: suggestion }), key: suggestion.name }, "每日简报 · 工作日 08:00"))]),
      editor ? h(AutomationEditor, { item: editor.item || null, initialDraft: editor.initialDraft || null, onClose: () => setEditor(null), onSaved: refresh, workbench, key: "editor" }) : null,
      detail ? h(AutomationDetail, { item: detail, onClose: () => setDetail(null), onEdit: (item) => { setDetail(null); setEditor({ item }); }, onDeleted: () => { setDetail(null); refresh(); }, workbench, key: "detail" }) : null,
    ]);
  };
}
