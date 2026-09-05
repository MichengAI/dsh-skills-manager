import { validateAutomationDraft } from "./schedule-fields.js";
import { workbenchApi } from "./api.js";

function initialValue(item) {
  return item || {
    name: "",
    type: "reminder",
    prompt: "",
    enabled: true,
    schedule: { kind: "daily", time: "08:00" },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    workspaceRef: null,
    capabilitySelection: [],
    notificationPolicy: { onSuccess: true, onFailure: true, onApprovalRequired: true },
  };
}

export function createAutomationEditor(React, options = {}) {
  const h = React.createElement;
  const api = options.api || workbenchApi;
  return function AutomationEditor({ item, onClose, onSaved, workbench } = {}) {
    const [value, setValue] = React.useState(() => initialValue(item));
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState("");
    const errors = validateAutomationDraft(value);
    const update = (patch) => setValue((current) => ({ ...current, ...patch }));
    const updateSchedule = (patch) => update({ schedule: { ...value.schedule, ...patch } });
    const save = async () => {
      if (Object.keys(errors).length > 0 || saving) return;
      setSaving(true);
      setError("");
      try {
        const result = item ? await api.updateAutomation(item.id, value) : await api.createAutomation(value);
        onSaved?.(result);
        onClose?.();
      } catch (cause) {
        setError(cause?.message || "保存失败，请稍后重试");
      } finally {
        setSaving(false);
      }
    };
    return h("div", { className: "daw-automation-editor", role: "dialog", "aria-modal": "true", "aria-labelledby": "daw-automation-editor-title" }, [
      h("div", { className: "daw-dialog-header", key: "header" }, [h("h2", { id: "daw-automation-editor-title", key: "title" }, item ? "编辑自动化任务" : "创建自动化任务"), h("button", { type: "button", className: "daw-dialog-close", onClick: onClose, "aria-label": "关闭", key: "close" }, "×")]),
      h("label", { className: "daw-automation-field", key: "name" }, [h("span", null, "任务名称"), h("input", { value: value.name, onChange: (event) => update({ name: event.target.value }), placeholder: "例如：每日简报" }), errors.name ? h("small", { className: "daw-field-error" }, errors.name) : null]),
      h("label", { className: "daw-automation-field", key: "type" }, [h("span", null, "任务类型"), h("select", { value: value.type, onChange: (event) => update({ type: event.target.value, workspaceRef: event.target.value === "work" ? value.workspaceRef : null }) }, [h("option", { value: "reminder", key: "reminder" }, "提醒"), h("option", { value: "work", key: "work" }, "Work 任务")])]),
      h("label", { className: "daw-automation-field", key: "prompt" }, [h("span", null, value.type === "work" ? "要完成的工作" : "提醒内容"), h("textarea", { value: value.prompt, onChange: (event) => update({ prompt: event.target.value }), rows: 4, placeholder: "描述任务内容" }), errors.prompt ? h("small", { className: "daw-field-error" }, errors.prompt) : null]),
      value.type === "work" ? h("label", { className: "daw-automation-field", key: "workspace" }, [h("span", null, "工作空间"), h("input", { value: value.workspaceRef || "", onChange: (event) => update({ workspaceRef: event.target.value }), placeholder: "workspace:默认工作空间" }), errors.workspaceRef ? h("small", { className: "daw-field-error" }, errors.workspaceRef) : null]) : null,
      h("div", { className: "daw-automation-schedule", key: "schedule" }, [h("span", null, "执行计划"), h("div", { className: "daw-automation-schedule-row" }, [h("select", { value: value.schedule.kind, onChange: (event) => updateSchedule({ kind: event.target.value }) }, [h("option", { value: "once" }, "仅一次"), h("option", { value: "daily" }, "每天"), h("option", { value: "workdays" }, "工作日"), h("option", { value: "weekly" }, "每周"), h("option", { value: "monthly" }, "每月")]), value.schedule.kind === "once" ? h("input", { type: "datetime-local", value: value.schedule.at ? value.schedule.at.slice(0, 16) : "", onChange: (event) => updateSchedule({ at: event.target.value ? new Date(event.target.value).toISOString() : "" }) }) : h("input", { type: "time", value: value.schedule.time || "08:00", onChange: (event) => updateSchedule({ time: event.target.value }) })]), errors.schedule || errors.time ? h("small", { className: "daw-field-error" }, errors.schedule || errors.time) : null]),
      h("p", { className: "daw-automation-timezone", key: "timezone" }, `时区：${value.timezone || "系统时区"}（跟随系统）`),
      error ? h("p", { className: "daw-inline-error", role: "alert", key: "error" }, error) : null,
      h("div", { className: "daw-automation-editor-actions", key: "actions" }, [h("button", { type: "button", className: "daw-tool-button", onClick: onClose }, "取消"), h("button", { type: "button", className: "daw-send-button", disabled: Object.keys(errors).length > 0 || saving, onClick: save }, saving ? "保存中…" : "保存")]),
    ]);
  };
}
