function safe(value, max = 120) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

function scriptValue(value) {
  return safe(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

export function createNotifier({ platform = process.platform, spawn, browserSink = null, log = () => {} } = {}) {
  return {
    async notify({ title, body }) {
      const safeTitle = safe(title);
      const safeBody = safe(body);
      try {
        if (platform === "darwin" && typeof spawn === "function") {
          spawn("osascript", ["-e", `display notification "${scriptValue(safeBody)}" with title "${scriptValue(safeTitle)}"`], { stdio: "ignore" });
        } else if (platform === "linux" && typeof spawn === "function") {
          spawn("notify-send", [safeTitle, safeBody], { stdio: "ignore" });
        } else if (typeof browserSink === "function") {
          await browserSink({ title: safeTitle, body: safeBody });
        } else {
          log("notification unavailable", { title: safeTitle });
        }
        return { delivered: true };
      } catch (error) {
        log("notification delivery failed", { message: error?.message || "unknown" });
        return { delivered: false };
      }
    },
  };
}
