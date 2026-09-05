const KIND_ORDER = new Map([
  ["skill", 0],
  ["tool", 1],
  ["business", 2],
]);

function clean(value) {
  return String(value ?? "").trim();
}

function compareText(left, right) {
  return left.localeCompare(right, "zh-CN") || left.localeCompare(right);
}

function compareCapabilities(left, right) {
  return (KIND_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
    (KIND_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER) ||
    compareText(left.name, right.name) ||
    compareText(left.source, right.source) ||
    compareText(left.id, right.id);
}

function normalizeSkillCapabilities(skillState, enabled) {
  const roots = Array.isArray(skillState?.roots) ? skillState.roots : [];
  return roots.flatMap((root) => {
    const rootKey = clean(root?.key);
    const source = clean(root?.label) || rootKey;
    const skills = Array.isArray(root?.skills) ? root.skills : [];
    return skills.map((skill) => {
      const skillName = clean(skill?.name);
      const id = `skill:${rootKey}:${skillName}`;
      return {
        id,
        name: clean(skill?.declaredName) || skillName,
        description: clean(skill?.description) || "未提供简介",
        kind: "skill",
        source,
        available: Boolean(root?.enabled && skill?.loadable && skill?.managerEnabled),
        enabled: enabled.has(id),
        details: {
          diagnostics: Array.isArray(skill?.diagnostics) ? skill.diagnostics : [],
          path: clean(skill?.path) || null,
          modelInvocable: skill?.effectiveModelInvocable !== false,
        },
      };
    });
  });
}

function normalizeToolCapabilities(manifest, enabled) {
  const tools = Array.isArray(manifest?.tools) ? manifest.tools : [];
  return tools.map((item) => {
    const itemId = clean(item?.id);
    const id = `tool:${itemId}`;
    return {
      id,
      name: clean(item?.name) || itemId,
      description: clean(item?.description) || "未提供简介",
      kind: "tool",
      source: clean(item?.source) || "DSH",
      available: item?.available !== false,
      enabled: enabled.has(id),
      details: {},
    };
  });
}

function normalizeBusinessCapabilities(manifest, enabled) {
  const systems = Array.isArray(manifest?.businessSystems) ? manifest.businessSystems : [];
  return systems.map((item) => {
    const itemId = clean(item?.id);
    const id = `business:${itemId}`;
    return {
      id,
      name: clean(item?.name) || itemId,
      description: clean(item?.description) || "未提供简介",
      kind: "business",
      source: clean(item?.source) || clean(item?.name) || itemId,
      available: item?.connected === true,
      enabled: enabled.has(id),
      details: { connectionHint: clean(item?.connectionHint) || null },
    };
  });
}

export function normalizeCapabilities({ skillState, manifest, enabledIds } = {}) {
  const enabled = new Set(Array.isArray(enabledIds) ? enabledIds : []);
  return [
    ...normalizeSkillCapabilities(skillState, enabled),
    ...normalizeToolCapabilities(manifest, enabled),
    ...normalizeBusinessCapabilities(manifest, enabled),
  ].sort(compareCapabilities);
}

export function filterCapabilities(items, { query = "", kind = "all", source = "all" } = {}) {
  const needle = clean(query).toLocaleLowerCase("zh-CN");
  return (Array.isArray(items) ? items : []).filter((item) =>
    (kind === "all" || item.kind === kind) &&
    (source === "all" || item.source === source) &&
    (!needle || [item.name, item.description, item.source, item.kind]
      .some((value) => clean(value).toLocaleLowerCase("zh-CN").includes(needle))),
  );
}

export function summarizeCapabilities(items) {
  const capabilities = Array.isArray(items) ? items : [];
  return {
    total: capabilities.length,
    enabled: capabilities.filter((item) => item.enabled).length,
    disabled: capabilities.filter((item) => !item.enabled).length,
    unavailable: capabilities.filter((item) => !item.available).length,
  };
}
