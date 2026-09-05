import { scheduleCopy } from "./schedule-fields.js";
import { workbenchApi } from "./api.js";

export function createAutomationDetail(React, options = {}) {
  const h = React.createElement;
  const api = options.api || workbenchApi;
  return function AutomationDetail({ item, onClose, onEdit, onDeleted, workbench } = {}) {
    const [runs, setRuns] = React.useState([]);
    const [deleting, setDeleting] = React.useState(false);
    const [error, setError] = React.useState("");
    React.useEffect(() => { if (item) Promise.resolve(api.listAutomationRuns(item.id)).then(setRuns).catch(() => setRuns([])); }, [item?.id]);
    const openSession = (sessionId) => {
      const opener = workbench?.sessions?.open || workbench?.ctx?.sessions?.open;
      if (typeof opener === "function") opener(sessionId);
    };
    const remove = async () => {
      if (deleting || !item?.id) return;
      if (typeof globalThis.confirm === "function" && !globalThis.confirm(`删除“${item.name}”后无法恢复，确定删除吗？`)) return;
      setDeleting(true);
      setError("");
      try {
        await api.deleteAutomation(item.id);
        onDeleted?.(item.id);
      } catch (cause) {
        setError(cause?.message || "删除失败，请稍后重试");
      } finally {
        setDeleting(false);
      }
    };
    return h("div", { className: "daw-automation-detail", role: "dialog", "aria-modal": "true", "aria-labelledby": "daw-automation-detail-title" }, [
      h("div", { className: "daw-dialog-header", key: "header" }, [h("h2", { id: "daw-automation-detail-title", key: "title" }, item.name), h("div", { className: "daw-dialog-header-actions", key: "actions" }, [h("button", { type: "button", className: "daw-tool-button", onClick: () => onEdit?.(item) }, "编辑"), h("button", { type: "button", className: "daw-danger-button", disabled: deleting, onClick: remove }, deleting ? "删除中…" : "删除"), h("button", { type: "button", className: "daw-dialog-close", onClick: onClose, "aria-label": "关闭" }, "×")])]),
      h("p", { className: "daw-automation-detail-copy", key: "copy" }, item.prompt),
      h("dl", { className: "daw-automation-detail-meta", key: "meta" }, [
        h("div", { key: "type" }, [h("dt", null, "类型"), h("dd", null, item.type === "work" ? "Work 任务" : "提醒")]),
        h("div", { key: "schedule" }, [h("dt", null, "执行计划"), h("dd", null, scheduleCopy(item.schedule))]),
        h("div", { key: "next" }, [h("dt", null, "下次运行"), h("dd", null, item.nextRunAt || "暂无")]),
      ]),
      h("h3", { key: "runs-title" }, "运行记录"),
      h("div", { className: "daw-automation-runs", key: "runs" }, runs.length === 0 ? h("p", { className: "daw-empty" }, "暂时没有运行记录") : runs.map((run) => h("div", { className: "daw-automation-run", key: run.id }, [h("span", null, run.status), h("time", null, run.plannedAt), run.status === "waiting_approval" ? h("strong", null, "请在完整过程内处理批准") : null, run.sessionId ? h("button", { type: "button", onClick: () => openSession(run.sessionId) }, "查看完整过程") : null]))),
      error ? h("p", { className: "daw-inline-error", role: "alert", key: "error" }, error) : null,
    ]);
  };
}
