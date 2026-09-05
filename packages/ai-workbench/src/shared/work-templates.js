export const WORK_TEMPLATES = [
  {
    id: "teaching-weekly",
    title: "汇总课表与考勤，分析教学情况并生成周报",
    promptTemplate: "汇总本周课表与考勤数据，分析教学运行情况并生成周报。",
    recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"],
    sortOrder: 1,
    enabled: true,
    action: "prefill",
  },
  {
    id: "student-risk",
    title: "关联成绩与出勤，识别风险并生成帮扶清单",
    promptTemplate: "关联学生成绩与出勤数据，识别风险学生并生成帮扶清单。",
    recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"],
    sortOrder: 2,
    enabled: true,
    action: "prefill",
  },
  {
    id: "research-summary",
    title: "核对科研与人事数据，汇总成果并生成简报",
    promptTemplate: "核对科研与人事数据，汇总科研成果并生成简报。",
    recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"],
    sortOrder: 3,
    enabled: true,
    action: "prefill",
  },
  {
    id: "employment-analysis",
    title: "关联学籍与就业数据，分析去向并生成报告",
    promptTemplate: "关联学籍与就业数据，分析毕业生去向并生成报告。",
    recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"],
    sortOrder: 4,
    enabled: true,
    action: "prefill",
  },
  {
    id: "meeting-minutes",
    title: "汇总通知与会议记录，提取待办并起草纪要",
    promptTemplate: "汇总相关通知与会议记录，提取待办事项并起草会议纪要。",
    recommendedCapabilityIds: ["skill:dsh:documents"],
    sortOrder: 5,
    enabled: true,
    action: "prefill",
  },
  {
    id: "workload-report",
    title: "核对排课与考勤，关联人事并生成工作量报表",
    promptTemplate: "核对排课与考勤数据，关联人事信息并生成工作量报表。",
    recommendedCapabilityIds: ["skill:dsh:spreadsheets", "skill:dsh:documents"],
    sortOrder: 6,
    enabled: true,
    action: "prefill",
  },
].filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder);

export function findWorkTemplate(id) {
  return WORK_TEMPLATES.find((item) => item.id === id) || null;
}
