import {
  isoFromLocalDateTime,
  localDateTimeInput,
  validateAutomationDraft,
} from "./schedule-fields.js";
import {
  capabilityItemsFromWorkbench,
  workspaceFeedFromWorkbench,
  workspaceItemsFromFeed,
} from "./work-home.js";
import { workbenchApi } from "./api.js";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function systemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function scheduleForKind(kind, current = {}) {
  const time = current.time || "08:00";
  if (kind === "once") return { kind, at: current.at || new Date().toISOString() };
  if (kind === "weekly") return { kind, time, weekdays: Array.isArray(current.weekdays) && current.weekdays.length ? current.weekdays : [1] };
  if (kind === "monthly") return { kind, time, day: Number.isInteger(current.day) ? current.day : 1 };
  if (kind === "interval") return { kind, every: Number.isInteger(current.every) && current.every > 0 ? current.every : 1, unit: ["minute", "hour", "day"].includes(current.unit) ? current.unit : "hour", anchorAt: current.anchorAt || new Date().toISOString() };
  return { kind, time };
}

export function automationInitialValue(item, initialDraft) {
  const source = item || initialDraft || {};
  const type = source.type === "work" ? "work" : "reminder";
  return {
    ...source,
    name: typeof source.name === "string" ? source.name : "",
    type,
    prompt: typeof source.prompt === "string" ? source.prompt : "",
    enabled: source.enabled !== false,
    schedule: scheduleForKind(source.schedule?.kind || "daily", source.schedule),
    timezone: typeof source.timezone === "string" && source.timezone ? source.timezone : systemTimezone(),
    workspaceRef: type === "work" && typeof source.workspaceRef === "string" ? source.workspaceRef : null,
    capabilitySelection: type === "work" && Array.isArray(source.capabilitySelection) ? [...new Set(source.capabilitySelection.filter((id) => typeof id === "string"))] : [],
    notificationPolicy: {
      onSuccess: true,
      onFailure: true,
      onApprovalRequired: true,
      ...(source.notificationPolicy && typeof source.notificationPolicy === "object" ? source.notificationPolicy : {}),
    },
  };
}

function uniqueWorkspaceItems(workbench) {
  const entries = workspaceItemsFromFeed(workspaceFeedFromWorkbench(workbench));
  return [...new Map(entries.map((item) => [item.id, item])).values()];
}

export function createAutomationEditor(React, options = {}) {
  const h = React.createElement;
  const api = options.api || workbenchApi;
  return function AutomationEditor({ item, initialDraft, onClose, onSaved, workbench } = {}) {
    const [value, setValue] = React.useState(() => automationInitialValue(item, initialDraft));
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState("");
    const workspaceItems = uniqueWorkspaceItems(workbench);
    const capabilityItems = capabilityItemsFromWorkbench(workbench);
    const errors = validateAutomationDraft(value);
    const update = (patch) => setValue((current) => ({ ...current, ...patch }));
    const updateSchedule = (patch) => update({ schedule: { ...value.schedule, ...patch } });
    const changeType = (type) => update({
      type,
      workspaceRef: type === "work" ? value.workspaceRef : null,
      capabilitySelection: type === "work" ? value.capabilitySelection : [],
    });
    const changeCapability = (id, selected) => {
      const current = Array.isArray(value.capabilitySelection) ? value.capabilitySelection : [];
      update({ capabilitySelection: selected ? [...new Set([...current, id])] : current.filter((item) => item !== id) });
    };
    const changeNotification = (key, checked) => update({ notificationPolicy: { ...value.notificationPolicy, [key]: checked } });
    const changeWeekday = (day, selected) => {
      const current = Array.isArray(value.schedule.weekdays) ? value.schedule.weekdays : [];
      updateSchedule({ weekdays: selected ? [...new Set([...current, day])].sort((left, right) => left - right) : current.filter((item) => item !== day) });
    };
    const save = async () => {
      if (Object.keys(errors).length > 0 || saving) return;
      setSaving(true);
      setError("");
      try {
        const result = item?.id ? await api.updateAutomation(item.id, value) : await api.createAutomation(value);
        onSaved?.(result);
        onClose?.();
      } catch (cause) {
        setError(cause?.message || "保存失败，请稍后重试");
      } finally {
        setSaving(false);
      }
    };

    const knownWorkspaceRefs = new Set(workspaceItems.map((workspace) => `workspace:${workspace.id}`));
    const hasLegacyWorkspace = value.workspaceRef && !knownWorkspaceRefs.has(value.workspaceRef);
    const scheduleError = errors.schedule || errors.time || errors.at || errors.weekdays || errors.day || errors.interval || errors.anchorAt;
    const isWork = value.type === "work";

    return h("div", { className: "daw-automation-editor", role: "dialog", "aria-modal": "true", "aria-labelledby": "daw-automation-editor-title" }, [
      h("div", { className: "daw-dialog-header", key: "header" }, [h("h2", { id: "daw-automation-editor-title", key: "title" }, item?.id ? "编辑自动化任务" : "创建自动化任务"), h("button", { type: "button", className: "daw-dialog-close", onClick: onClose, "aria-label": "关闭", key: "close" }, "×")]),
      h("label", { className: "daw-automation-field", key: "name" }, [h("span", null, "任务名称"), h("input", { value: value.name, onChange: (event) => update({ name: event.target.value }), placeholder: "例如：每日简报" }), errors.name ? h("small", { className: "daw-field-error" }, errors.name) : null]),
      h("label", { className: "daw-automation-field", key: "type" }, [h("span", null, "任务类型"), h("select", { value: value.type, onChange: (event) => changeType(event.target.value) }, [h("option", { value: "reminder", key: "reminder" }, "提醒"), h("option", { value: "work", key: "work" }, "Work 任务")])]),
      h("label", { className: "daw-automation-field", key: "prompt" }, [h("span", null, isWork ? "要完成的工作" : "提醒内容"), h("textarea", { value: value.prompt, onChange: (event) => update({ prompt: event.target.value }), rows: 4, placeholder: "描述任务内容" }), errors.prompt ? h("small", { className: "daw-field-error" }, errors.prompt) : null]),
      isWork ? h("label", { className: "daw-automation-field", key: "workspace" }, [
        h("span", null, "工作空间"),
        h("select", { value: value.workspaceRef || "", onChange: (event) => update({ workspaceRef: event.target.value || null }) }, [
          h("option", { value: "", key: "empty" }, workspaceItems.length ? "请选择工作空间" : "当前没有可用工作空间"),
          hasLegacyWorkspace ? h("option", { value: value.workspaceRef, key: "legacy" }, `${value.workspaceRef}（已关联）`) : null,
          ...workspaceItems.map((workspace) => h("option", { value: `workspace:${workspace.id}`, key: workspace.id }, workspace.title)),
        ]),
        workspaceItems.length === 0 ? h("small", { className: "daw-field-help" }, "请先在 Work 首页添加工作空间，再创建 Work 自动化任务。") : null,
        errors.workspaceRef ? h("small", { className: "daw-field-error" }, errors.workspaceRef) : null,
      ]) : null,
      isWork ? h("fieldset", { className: "daw-automation-field daw-automation-capabilities", key: "capabilities" }, [
        h("legend", null, "允许使用的能力"),
        capabilityItems.length === 0 ? h("small", { className: "daw-field-help" }, "当前没有可选能力；任务将使用宿主默认能力。") : h("div", { className: "daw-check-grid" }, capabilityItems.map((capability) => h("label", { key: capability.id }, [h("input", { type: "checkbox", checked: value.capabilitySelection.includes(capability.id), onChange: (event) => changeCapability(capability.id, event.target.checked) }), h("span", null, capability.title)]))),
      ]) : null,
      h("div", { className: "daw-automation-schedule", key: "schedule" }, [
        h("span", null, "执行计划"),
        h("div", { className: "daw-automation-schedule-row" }, [
          h("select", { value: value.schedule.kind, onChange: (event) => update({ schedule: scheduleForKind(event.target.value, value.schedule) }) }, [h("option", { value: "once" }, "仅一次"), h("option", { value: "daily" }, "每天"), h("option", { value: "workdays" }, "工作日"), h("option", { value: "weekly" }, "每周"), h("option", { value: "monthly" }, "每月"), h("option", { value: "interval" }, "按间隔")]),
          value.schedule.kind === "once" ? h("input", { type: "datetime-local", value: localDateTimeInput(value.schedule.at), onChange: (event) => updateSchedule({ at: isoFromLocalDateTime(event.target.value) }) }) : null,
          value.schedule.kind !== "once" && value.schedule.kind !== "interval" ? h("input", { type: "time", value: value.schedule.time || "08:00", onChange: (event) => updateSchedule({ time: event.target.value }) }) : null,
        ]),
        value.schedule.kind === "weekly" ? h("div", { className: "daw-weekday-picker", role: "group", "aria-label": "选择每周执行日期" }, WEEKDAYS.map((label, day) => h("label", { key: label }, [h("input", { type: "checkbox", checked: value.schedule.weekdays?.includes(day) === true, onChange: (event) => changeWeekday(day, event.target.checked) }), h("span", null, label)]))) : null,
        value.schedule.kind === "monthly" ? h("label", { className: "daw-inline-field" }, [h("span", null, "每月日期"), h("input", { type: "number", min: 1, max: 31, value: value.schedule.day ?? 1, onChange: (event) => updateSchedule({ day: Number(event.target.value) }) })]) : null,
        value.schedule.kind === "interval" ? h("div", { className: "daw-interval-fields" }, [h("label", { className: "daw-inline-field", key: "interval" }, [h("span", null, "每隔"), h("input", { type: "number", min: 1, max: 999, value: value.schedule.every ?? 1, onChange: (event) => updateSchedule({ every: Number(event.target.value) }) })]), h("label", { className: "daw-inline-field", key: "unit" }, [h("span", null, "单位"), h("select", { value: value.schedule.unit || "hour", onChange: (event) => updateSchedule({ unit: event.target.value }) }, [h("option", { value: "minute" }, "分钟"), h("option", { value: "hour" }, "小时"), h("option", { value: "day" }, "天")])]), h("label", { className: "daw-inline-field daw-interval-anchor", key: "anchor" }, [h("span", null, "从此时间开始"), h("input", { type: "datetime-local", value: localDateTimeInput(value.schedule.anchorAt), onChange: (event) => updateSchedule({ anchorAt: isoFromLocalDateTime(event.target.value) }) })])]) : null,
        scheduleError ? h("small", { className: "daw-field-error" }, scheduleError) : null,
      ]),
      h("fieldset", { className: "daw-automation-field daw-automation-notifications", key: "notifications" }, [
        h("legend", null, "通知"),
        h("label", null, [h("input", { type: "checkbox", checked: value.notificationPolicy.onSuccess === true, onChange: (event) => changeNotification("onSuccess", event.target.checked) }), h("span", null, isWork ? "任务完成时通知" : "到时提醒我")]),
        isWork ? h("label", null, [h("input", { type: "checkbox", checked: value.notificationPolicy.onFailure === true, onChange: (event) => changeNotification("onFailure", event.target.checked) }), h("span", null, "执行失败时通知")]) : null,
        isWork ? h("label", null, [h("input", { type: "checkbox", checked: value.notificationPolicy.onApprovalRequired === true, onChange: (event) => changeNotification("onApprovalRequired", event.target.checked) }), h("span", null, "需要批准时通知")]) : null,
      ]),
      h("p", { className: "daw-automation-timezone", key: "timezone" }, `时区：${value.timezone || "系统时区"}（跟随系统）`),
      error ? h("p", { className: "daw-inline-error", role: "alert", key: "error" }, error) : null,
      h("div", { className: "daw-automation-editor-actions", key: "actions" }, [h("button", { type: "button", className: "daw-tool-button", onClick: onClose }, "取消"), h("button", { type: "button", className: "daw-send-button", disabled: Object.keys(errors).length > 0 || saving, onClick: save }, saving ? "保存中…" : "保存")]),
    ]);
  };
}
