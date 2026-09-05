const NAVIGATION_CATEGORIES = new Set(["服务导航", "文档资料"]);
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

export const DEFAULT_CHAT_CONFIG = {
  guesses: [
    { id: "haircut", label: "理发预约", prompt: "学校理发服务如何预约？", sortOrder: 1, enabled: true },
    { id: "week-plan", label: "一周安排", prompt: "帮我梳理本周的校园日程安排。", sortOrder: 2, enabled: true },
    { id: "face-photo", label: "人脸照片怎么换", prompt: "校园人脸识别照片如何更换？", sortOrder: 3, enabled: true },
    { id: "staff-phone", label: "教职工电话", prompt: "如何查询校内教职工联系电话？", sortOrder: 4, enabled: true },
    { id: "campus-password", label: "智慧校园密码怎么改", prompt: "智慧校园账号密码如何修改？", sortOrder: 5, enabled: true },
  ],
  popular: [
    { id: "popular-haircut", label: "理发预约", prompt: "学校理发服务如何预约？", sortOrder: 1, enabled: true },
    { id: "teacher-student", label: "师生通", prompt: "师生通服务如何使用？", sortOrder: 2, enabled: true },
    { id: "project-apply", label: "项目申报", prompt: "校内项目申报需要经过哪些步骤？", sortOrder: 3, enabled: true },
    { id: "class-adjust", label: "调停课申请", prompt: "调课或停课申请如何办理？", sortOrder: 4, enabled: true },
    { id: "seal-apply", label: "用印申请", prompt: "校内用印申请如何办理？", sortOrder: 5, enabled: true },
    { id: "popular-week", label: "一周安排", prompt: "帮我梳理本周的校园日程安排。", sortOrder: 6, enabled: true },
  ],
  navigation: [
    { id: "portal", title: "融合门户", category: "服务导航", url: "", icon: "portal", sortOrder: 1, enabled: true },
    { id: "mail", title: "校园邮箱", category: "服务导航", url: "", icon: "mail", sortOrder: 2, enabled: true },
  ],
};

function rows(value, kind) {
  if (!Array.isArray(value)) throw new Error(`invalid-${kind}`);
  return value.map((item) => {
    if (!item?.id || (kind === "navigation" ? !item.title : !item.label)) throw new Error(`invalid-${kind}-item`);
    if (kind === "navigation") {
      if (!NAVIGATION_CATEGORIES.has(item.category) || !item.icon || !Number.isFinite(item.sortOrder) || typeof item.enabled !== "boolean") {
        throw new Error("invalid-navigation-item");
      }
      if (!item.enabled || item.url === "") return { ...item, action: "disabled" };
      let url;
      try {
        url = new URL(item.url);
      } catch {
        throw new Error("unsafe-url");
      }
      if (!SAFE_PROTOCOLS.has(url.protocol)) throw new Error("unsafe-url");
      return { ...item, action: "open-link" };
    }
    if (!item.prompt) throw new Error(`invalid-${kind}-prompt`);
    return { ...item, action: "prefill" };
  });
}

export function validateChatConfig(value) {
  if (!value || typeof value !== "object") throw new Error("invalid-chat-config");
  return {
    guesses: rows(value.guesses, "guesses").filter((item) => item.enabled !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    popular: rows(value.popular, "popular").filter((item) => item.enabled !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    navigation: rows(value.navigation, "navigation").sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function rotateBatch(items, size, page) {
  if (!Array.isArray(items) || !Number.isInteger(size) || size <= 0 || items.length <= size) return Array.isArray(items) ? items.slice() : [];
  const start = ((Number.isInteger(page) ? page : 0) * size) % items.length;
  return Array.from({ length: Math.min(size, items.length) }, (_, index) => items[(start + index) % items.length]);
}

export function buildChatSessionInput({ text, attachments = [], deepThinking = false, webSearch = false, clientTimeZone }) {
  return {
    mode: "chat",
    text,
    attachments,
    deepThinking: deepThinking === true,
    webSearch: webSearch === true,
    clientTimeZone,
  };
}

export function keyboardAction(event) {
  if (event?.key !== "Enter") return null;
  return event.ctrlKey || event.metaKey ? "newline" : "send";
}
