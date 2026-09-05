export const AUTOMATION_STATUS_LABELS = {
  all: "全部",
  active: "已开启",
  paused: "已暂停",
  completed: "已完成",
  disabled_by_error: "已停用",
};

export const SCHEDULE_LABELS = {
  once: "仅一次",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  workdays: "工作日",
  interval: "按间隔",
};

export function scheduleCopy(schedule = {}) {
  const label = SCHEDULE_LABELS[schedule.kind] || "自定义计划";
  if (schedule.kind === "once") return `${label} · ${schedule.at ? new Date(schedule.at).toLocaleString("zh-CN") : "待设置"}`;
  if (schedule.kind === "weekly") return `${label} ${schedule.weekdays?.join("、") || ""} · ${schedule.time || ""}`;
  if (schedule.kind === "monthly") return `${label} ${schedule.day || ""} 日 · ${schedule.time || ""}`;
  if (schedule.kind === "interval") return `每 ${schedule.every || ""} ${schedule.unit || ""}`;
  return `${label} · ${schedule.time || ""}`;
}

export function sortAutomations(items) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => String(left.nextRunAt || "9999").localeCompare(String(right.nextRunAt || "9999")) || String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

export function validateAutomationDraft(value = {}) {
  const errors = {};
  if (!String(value.name || "").trim()) errors.name = "请输入任务名称";
  if (!String(value.prompt || "").trim()) errors.prompt = "请输入任务内容";
  if (value.type === "work" && !String(value.workspaceRef || "").trim()) errors.workspaceRef = "Work 任务需要选择工作空间";
  if (!value.schedule?.kind) errors.schedule = "请选择执行频率";
  if (["daily", "weekly", "monthly", "workdays"].includes(value.schedule?.kind) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.schedule?.time || "")) errors.time = "请输入有效时间";
  return errors;
}
