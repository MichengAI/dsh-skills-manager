import { filterCapabilities, summarizeCapabilities } from "../shared/capabilities.js";
import { loadCapabilitySources } from "./capability-source.js";
import { workbenchApi } from "./api.js";

const KIND_LABELS = {
  skill: "Skills",
  tool: "DSH 工具",
  business: "业务系统",
};

function updateItem(items, id, enabled) {
  return items.map((item) => item.id === id ? { ...item, enabled } : item);
}

function grouped(items) {
  return ["skill", "tool", "business"].map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    items: items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0);
}

function formatError(error) {
  return error?.message || "能力库加载失败，请重试。";
}

function detailLines(item) {
  const lines = [
    ["类型", KIND_LABELS[item.kind] || item.kind],
    ["来源", item.source || "未标注"],
    ["状态", item.available ? "可用" : "暂不可用"],
  ];
  if (item.kind === "skill") {
    lines.push(["可被模型调用", item.details?.modelInvocable === false ? "否" : "是"]);
    if (item.details?.path) lines.push(["路径", item.details.path]);
    if (Array.isArray(item.details?.diagnostics) && item.details.diagnostics.length > 0) {
      lines.push(["诊断", `${item.details.diagnostics.length} 条诊断信息（详情请到高级管理查看）`]);
    }
  }
  return lines;
}

export function createCapabilityLibrary(React, options = {}) {
  const h = React.createElement;
  const loadSources = options.loadSources || loadCapabilitySources;
  const api = options.api || workbenchApi;

  return function CapabilityLibrary({ workbench } = {}) {
    const [snapshot, setSnapshot] = React.useState({ items: [], warnings: [], summary: { total: 0, enabled: 0, disabled: 0, unavailable: 0 } });
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState(null);
    const [query, setQuery] = React.useState("");
    const [kind, setKind] = React.useState("all");
    const [source, setSource] = React.useState("all");
    const [details, setDetails] = React.useState(null);
    const [status, setStatus] = React.useState("");
    const [pending, setPending] = React.useState(() => new Set());
    const previous = React.useRef(new Map());

    const reload = () => {
      setLoading(true);
      setLoadError(null);
      Promise.resolve().then(() => loadSources()).then((next) => {
        setSnapshot(next);
        setLoading(false);
      }).catch((error) => {
        setLoadError(error);
        setLoading(false);
      });
    };

    React.useEffect(() => {
      reload();
    }, []);

    const visibleItems = filterCapabilities(snapshot.items, { query, kind, source });
    const sourceOptions = [...new Set(snapshot.items.map((item) => item.source).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
    const announce = (message) => setStatus(message);

    const toggle = (item) => {
      if (!item.available || pending.has(item.id)) return;
      const nextEnabled = !item.enabled;
      previous.current.set(item.id, snapshot);
      const optimistic = { ...snapshot, items: updateItem(snapshot.items, item.id, nextEnabled) };
      optimistic.summary = summarizeCapabilities(optimistic.items);
      setSnapshot(optimistic);
      setPending((current) => new Set(current).add(item.id));
      const enabledIds = optimistic.items.filter((candidate) => candidate.enabled).map((candidate) => candidate.id);
      Promise.resolve().then(() => api.saveCapabilityPreferences(enabledIds)).then((result) => {
        if (Array.isArray(result?.enabledIds)) {
          const enabled = new Set(result.enabledIds);
          setSnapshot((current) => {
            const items = current.items.map((candidate) => ({ ...candidate, enabled: enabled.has(candidate.id) }));
            return { ...current, items, enabledIds: result.enabledIds, summary: summarizeCapabilities(items) };
          });
        }
        previous.current.delete(item.id);
        announce(`${item.name} 已${nextEnabled ? "设为默认能力" : "取消默认能力"}`);
      }).catch((error) => {
        const prior = previous.current.get(item.id);
        if (prior) setSnapshot(prior);
        announce(`${item.name} 保存失败：${formatError(error)}`);
      }).finally(() => {
        setPending((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      });
    };

    const openAdvanced = () => {
      if (typeof options.onOpenAdvanced === "function") {
        options.onOpenAdvanced();
        return;
      }
      workbench?.dispatch?.({ type: "dialog/open", dialog: { title: "高级管理", message: "请从 DSH 设置中的“技能”模块管理高级能力。" } });
      announce("已提供高级管理入口，请从 DSH 设置进入技能模块。");
    };

    const summary = snapshot.summary || summarizeCapabilities(snapshot.items);
    const groups = grouped(visibleItems);
    const renderCard = (item) => h("article", {
      className: `daw-capability-card${item.available ? "" : " is-unavailable"}`,
      key: item.id,
    },
    h("div", { className: "daw-capability-card-heading" },
      h("div", null, h("h3", null, item.name), h("p", null, item.description)),
      h("span", { className: item.available ? "daw-availability is-available" : "daw-availability" }, item.available ? "可用" : "暂不可用")),
    h("div", { className: "daw-capability-card-meta" }, h("span", null, item.source || "未标注"), h("span", null, item.id)),
    h("div", { className: "daw-capability-card-actions" },
      h("label", { className: "daw-capability-toggle" },
        h("input", {
          type: "checkbox",
          checked: Boolean(item.enabled),
          disabled: !item.available || pending.has(item.id),
          onChange: () => toggle(item),
          "aria-label": `${item.name}${item.available ? "默认能力" : "，能力暂不可用"}`,
        }),
        h("span", null, item.available ? "默认" : "不可用")),
      h("button", { type: "button", className: "daw-details-button", onClick: () => setDetails(item) }, "查看详情")));
    const renderGroup = (group) => h("section", {
      className: "daw-capability-group",
      key: group.kind,
      "aria-labelledby": `daw-capability-group-${group.kind}`,
    },
    h("div", { className: "daw-section-heading" },
      h("h2", { id: `daw-capability-group-${group.kind}` }, group.label),
      h("span", null, `${group.items.length} 项`)),
    h("div", { className: "daw-capability-card-grid" }, group.items.map(renderCard)));
    const detailView = details ? h("div", { className: "daw-capability-detail-backdrop", onClick: () => setDetails(null) },
      h("div", { className: "daw-capability-detail", role: "dialog", "aria-modal": "true", "aria-labelledby": "daw-capability-detail-title", onClick: (event) => event.stopPropagation() }, [
        h("div", { className: "daw-dialog-header", key: "header" }, [
          h("h2", { id: "daw-capability-detail-title", key: "title" }, details.name),
          h("button", { type: "button", className: "daw-dialog-close", onClick: () => setDetails(null), "aria-label": "关闭详情", key: "close" }, "×"),
        ]),
        h("p", { className: "daw-dialog-message", key: "message" }, details.description),
        h("dl", { className: "daw-capability-detail-list", key: "details" }, detailLines(details).map(([label, value]) => h("div", { key: label }, h("dt", null, label), h("dd", null, value)))),
      ])) : null;
    return h("section", { className: "daw-capability-library", "aria-labelledby": "daw-capability-title", "aria-busy": loading ? "true" : "false" }, [
      h("header", { className: "daw-capability-header", key: "header" }, [
        h("div", { key: "intro" }, [
          h("p", { className: "daw-eyebrow", key: "eyebrow" }, "WORK CAPABILITIES"),
          h("h1", { id: "daw-capability-title", key: "title" }, "能力库"),
          h("p", { className: "daw-capability-copy", key: "copy" }, "查看可用于 Work 任务的 Skills、DSH 工具和业务系统"),
        ]),
        h("button", { type: "button", className: "daw-advanced-button", onClick: openAdvanced, key: "advanced" }, "高级管理"),
      ]),
      h("div", { className: "daw-capability-summary", "aria-label": "能力总览", key: "summary" }, [["total", "总能力", summary.total], ["enabled", "默认启用", summary.enabled], ["disabled", "默认停用", summary.disabled], ["unavailable", "暂不可用", summary.unavailable]].map(([id, label, value]) => h("div", { className: "daw-summary-cell", key: id }, h("strong", null, String(value)), h("span", null, label)))),
      snapshot.warnings?.length > 0 ? h("div", { className: "daw-capability-warnings", role: "alert", key: "warnings" }, snapshot.warnings.map((warning) => h("div", { className: "daw-capability-warning", key: warning.code }, h("span", null, warning.message), h("button", { type: "button", onClick: reload }, "重试")))) : null,
      loadError ? h("div", { className: "daw-capability-error", role: "alert", key: "error" }, h("span", null, formatError(loadError)), h("button", { type: "button", onClick: reload }, "重新加载")) : null,
      h("div", { className: "daw-capability-filters", key: "filters" }, [
        h("label", { className: "daw-capability-search", key: "search" }, h("span", { className: "daw-visually-hidden" }, "搜索能力"), h("input", { type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "搜索能力名称、描述或来源", "aria-label": "搜索能力" })),
        h("label", { className: "daw-capability-filter", key: "kind" }, h("span", { className: "daw-visually-hidden" }, "能力类型"), h("select", { value: kind, onChange: (event) => setKind(event.target.value), "aria-label": "按类型筛选" }, [h("option", { value: "all", key: "all" }, "全部类型"), h("option", { value: "skill", key: "skill" }, "Skills"), h("option", { value: "tool", key: "tool" }, "DSH 工具"), h("option", { value: "business", key: "business" }, "业务系统")])),
        h("label", { className: "daw-capability-filter", key: "source" }, h("span", { className: "daw-visually-hidden" }, "能力来源"), h("select", { value: source, onChange: (event) => setSource(event.target.value), "aria-label": "按来源筛选" }, [h("option", { value: "all", key: "all" }, "全部来源"), ...sourceOptions.map((value) => h("option", { key: value, value }, value))])),
      ]),
      loading && snapshot.items.length === 0 ? h("p", { className: "daw-capability-empty", key: "loading" }, "正在加载能力…") : null,
      !loading && groups.length === 0 ? h("div", { className: "daw-capability-empty", role: "status", key: "empty" }, query || kind !== "all" || source !== "all" ? "没有符合筛选条件的能力" : "当前没有可展示的能力") : null,
      h("div", { className: "daw-capability-groups", key: "groups" }, groups.map(renderGroup)),
      h("div", { className: "daw-capability-status", role: "status", "aria-live": "polite", key: "status" }, status),
      detailView,
    ]);
  };
}
