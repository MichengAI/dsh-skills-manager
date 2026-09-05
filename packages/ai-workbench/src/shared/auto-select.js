const RULES = [
  { pattern: /表格|数据|统计|汇总|核对|报表/, ids: ["skill:dsh:spreadsheets"], intensity: "deep", label: "数据处理" },
  { pattern: /文档|周报|简报|纪要|报告/, ids: ["skill:dsh:documents"], intensity: "standard", label: "文档生成" },
  { pattern: /网页|最新|联网|搜索/, ids: ["tool:web"], intensity: "standard", label: "联网查询" },
  { pattern: /系统|审批|教务|人事|科研/, prefix: "business:", intensity: "deep", label: "业务系统" },
];

export function recommendExecution(text, enabledIds = []) {
  const value = typeof text === "string" ? text : "";
  const available = Array.isArray(enabledIds) ? enabledIds : [];
  const matches = RULES.filter((rule) => rule.pattern.test(value));
  const suggested = [...new Set(matches.flatMap((rule) => rule.prefix
    ? available.filter((id) => id.startsWith(rule.prefix))
    : rule.ids))].filter((id) => available.length === 0 || available.includes(id));
  const capabilityIds = suggested.length ? suggested : available.slice(0, 4);
  const reasonMatches = matches.filter((rule) => rule.prefix
    ? available.some((id) => id.startsWith(rule.prefix))
    : available.length === 0 || rule.ids.some((id) => available.includes(id)));
  return {
    modelPolicy: "auto",
    intensity: matches.some((rule) => rule.intensity === "deep") ? "deep" : "standard",
    capabilityIds,
    reason: reasonMatches.length ? `命中${reasonMatches.map((rule) => rule.label).join("与")}规则` : "使用已启用的默认能力",
  };
}

export function applyExecutionOverride(recommendation, override = {}) {
  const next = { ...recommendation };
  if (override.modelPolicy === "manual" && override.provider && override.model) {
    next.modelPolicy = "manual";
    next.provider = override.provider;
    next.model = override.model;
  }
  if (override.intensity === "deep" || override.intensity === "standard") next.intensity = override.intensity;
  if (Array.isArray(override.capabilityIds)) next.capabilityIds = [...new Set(override.capabilityIds)];
  return next;
}
