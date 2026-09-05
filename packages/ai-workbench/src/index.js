import { spawn } from "node:child_process";
import { probeChatContracts, probeHostContracts } from "./shared/compatibility.js";
import { ensureChatPreset } from "./host/chat-preset.js";
import { createDiagnostics } from "./host/diagnostics.js";
import { createCapabilityService } from "./host/capability-service.js";
import { createAutomationService } from "./host/automation-service.js";
import { createAutomationRunner } from "./host/automation-runner.js";
import { createNotifier } from "./host/notifications.js";
import { createNotificationService } from "./host/notification-service.js";
import { createScheduler } from "./host/scheduler.js";
import { API_PREFIX, routeRequest, sendJson } from "./host/http.js";
import { createModeService } from "./host/mode-service.js";
import { createRepository, openWorkbenchUnit } from "./host/repository.js";
import { createSessionGateway } from "./host/session-gateway.js";

const name = "ai-workbench";
const inject = ["webServer", "webRuntime", "apiProxy", "sessionQuery", "sessions", "storage", "agentPresets", "permissionPresets"];

async function apply(ctx) {
  const hostProbe = probeHostContracts(ctx);
  const chatProbe = probeChatContracts(ctx);
  let chatFeature = { available: false, reason: "chat-host-contracts-unavailable" };
  if (chatProbe.ok) {
    try {
      await ensureChatPreset(ctx.agentPresets);
      chatFeature = { available: true, reason: null };
    } catch (error) {
      chatFeature = { available: false, reason: error?.message || "chat-preset-unavailable" };
    }
  }
  const diagnostics = createDiagnostics(hostProbe, { chat: chatFeature });
  const unit = await openWorkbenchUnit(ctx.storage);
  let repository;
  try {
    repository = await createRepository(unit);
  } catch (error) {
    await unit.close();
    throw error;
  }
  const modeService = createModeService({ repository, sessionQuery: ctx.sessionQuery });
  const capabilityService = createCapabilityService({ repository });
  const automationService = createAutomationService({ repository });
  const sessionGateway = hostProbe.ok
    ? createSessionGateway({
      apiProxy: ctx.apiProxy,
      permissionPresets: ctx.permissionPresets,
      repository,
      sessions: ctx.sessions,
    })
    : null;
  const notificationService = createNotificationService({ repository, notifier: createNotifier({ spawn }) });
  const automationRunner = createAutomationRunner({ service: automationService, gateway: sessionGateway, notifications: notificationService });
  const scheduler = createScheduler({ automationService, execute: automationRunner.execute });
  const onSessionEvent = typeof ctx.on === "function"
    ? ctx.on("session/event", (session, event) => automationRunner.handleEvent(session, event), { global: true })
    : null;
  let unregister;
  try {
    unregister = ctx.webServer.register({
      kind: "prefix",
      path: API_PREFIX,
      handler: async (req, res) => sendJson(res, await routeRequest(req, {
        diagnostics,
        features: { chat: chatFeature },
        modeService,
        capabilityService,
        automationService,
        notificationService,
        scheduler,
        repository,
        sessionQuery: ctx.sessionQuery,
        apiProxy: ctx.apiProxy,
        sessionGateway,
      })),
    });
    await scheduler.start();
  } catch (error) {
    scheduler.dispose();
    await repository.close();
    throw error;
  }

  let disposed = false;
  return async () => {
    if (disposed) return;
    disposed = true;
    try {
      scheduler.dispose();
      if (typeof onSessionEvent === "function") await onSessionEvent();
      if (typeof unregister === "function") await unregister();
    } finally {
      await repository.close();
    }
  };
}

export { apply, inject, name };
