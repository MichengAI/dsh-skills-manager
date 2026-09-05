function isoNow() {
  return new Date().toISOString();
}

function policyAllows(automation, kind) {
  if (automation.type === "reminder") return true;
  const policy = automation.notificationPolicy || {};
  return kind === "succeeded" ? policy.onSuccess === true : kind === "waiting_approval" ? policy.onApprovalRequired === true : policy.onFailure === true;
}

export function createAutomationRunner({ service, gateway, notifications, now = isoNow } = {}) {
  const sessions = new Map();
  const terminal = new Set();

  async function notify(automation, run, kind, summary) {
    if (!policyAllows(automation, kind)) return;
    await notifications?.create?.({
      kind,
      title: kind === "waiting_approval" ? "自动化任务等待批准" : kind === "succeeded" && automation.type === "reminder" ? "提醒" : kind === "succeeded" ? "自动化任务已完成" : "自动化任务失败",
      summary,
      automationId: automation.id,
      runId: run.id,
    });
  }

  async function execute(automation, run) {
    await service.updateRun(run.id, { status: "running", startedAt: now() });
    if (automation.type === "reminder") {
      const finished = await service.updateRun(run.id, { status: "succeeded", finishedAt: now() });
      terminal.add(run.id);
      await notify(automation, finished, "succeeded", automation.prompt);
      return finished;
    }
    try {
      const result = await gateway.startAutomation(automation, run);
      sessions.set(result.sessionId, { runId: run.id, automation });
      return service.updateRun(run.id, { sessionId: result.sessionId });
    } catch (error) {
      const failed = await service.updateRun(run.id, { status: "failed", finishedAt: now(), errorCode: error?.code || "automation-start-failed", errorMessage: error?.message || "automation failed" });
      await notify(automation, failed, "failed", failed.errorMessage);
      return failed;
    }
  }

  async function handleEvent(session, event) {
    const context = sessions.get(session?.id);
    if (!context) return null;
    const { runId, automation } = context;
    if (terminal.has(runId)) return null;
    const data = event?.data || {};
    if (event?.type === "approval/asked") {
      const waiting = await service.updateRun(runId, { status: "waiting_approval", approvalId: data.approvalId || null, approvalToolName: data.toolName || null, approvalReason: data.reason || null });
      await notify(automation, waiting, "waiting_approval", `${data.toolName || "操作"}：${data.reason || "需要批准"}`);
      return waiting;
    }
    if (event?.type === "approval/decided") {
      if (data.approved === true) return service.updateRun(runId, { status: "running" });
      const rejected = await service.updateRun(runId, { status: "rejected", finishedAt: now(), errorCode: "approval-rejected", errorMessage: "批准被拒绝" });
      terminal.add(runId);
      await notify(automation, rejected, "rejected", rejected.errorMessage);
      return rejected;
    }
    if (event?.type === "turn/end") {
      const reason = data.reason?.kind || data.reason || "unknown";
      if (reason === "completed") {
        const succeeded = await service.updateRun(runId, { status: "succeeded", finishedAt: now() });
        terminal.add(runId);
        await notify(automation, succeeded, "succeeded", automation.name);
        return succeeded;
      }
      const failed = await service.updateRun(runId, { status: "failed", finishedAt: now(), errorCode: String(reason), errorMessage: String(reason) });
      terminal.add(runId);
      await notify(automation, failed, "failed", String(reason));
      return failed;
    }
    return null;
  }

  return { execute, handleEvent, runForSession: (sessionId) => sessions.get(sessionId)?.runId || null };
}
