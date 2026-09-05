const CAPABILITY_ID = /^[a-z0-9][a-z0-9._-]*$/i;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateItems(items, field) {
  if (!Array.isArray(items)) {
    throw new Error(`[dsh-ai-workbench] capability manifest field ${field} must be an array`);
  }
  return items.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || !CAPABILITY_ID.test(item.id)) {
      throw new Error(`[dsh-ai-workbench] capability manifest ${field}[${index}] has an invalid id`);
    }
    if (typeof item.name !== "string" || typeof item.description !== "string") {
      throw new Error(`[dsh-ai-workbench] capability manifest ${field}[${index}] has invalid display metadata`);
    }
    return item;
  });
}

export function validateCapabilityManifest(value) {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("[dsh-ai-workbench] unsupported capability manifest version");
  }
  const tools = validateItems(value.tools, "tools");
  const businessSystems = validateItems(value.businessSystems, "businessSystems");
  return Object.freeze({ version: 1, tools, businessSystems });
}

// Keep the runtime manifest as a small, build-safe module. The matching JSON
// file is shipped as the editable/package-facing source artifact and is
// covered by the same schema tests.
export const capabilityManifest = validateCapabilityManifest({
  version: 1,
  tools: [
    { id: "web", name: "联网搜索", description: "搜索公开网页信息", source: "DSH", available: true },
    { id: "local-files", name: "工作区文件", description: "读取和编辑已授权工作区内的文件", source: "DSH", available: true },
    { id: "shell", name: "本机命令", description: "在 DSH 权限策略约束下运行本机命令", source: "DSH", available: true },
  ],
  businessSystems: [],
});
