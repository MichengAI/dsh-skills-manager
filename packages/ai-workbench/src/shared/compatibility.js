function hasFunction(value, key) {
  return value != null && typeof value[key] === "function";
}

export function probeClientContracts(ctx) {
  const failures = [];
  for (const slot of ["root", "sidebar", "conversation", "details", "shell.overlay"]) {
    if (!hasFunction(ctx.slots, "spec") || ctx.slots.spec(slot) == null) failures.push(`slot:${slot}`);
  }
  if (!hasFunction(ctx.slots, "register")) failures.push("slots:register");
  for (const method of ["toggleSidebar", "openDetails", "closeDetails", "attachPanels"]) {
    if (!hasFunction(ctx.layout, method)) failures.push(`layout:${method}`);
  }
  for (const method of ["open", "binding", "subscribe"]) {
    if (!hasFunction(ctx.sessions, method)) failures.push(`sessions:${method}`);
  }
  return { ok: failures.length === 0, failures };
}

export function probeHostContracts(ctx) {
  const failures = [];
  if (!hasFunction(ctx.apiProxy?.sessions, "create")) failures.push("apiProxy.sessions:create");
  if (!hasFunction(ctx.apiProxy?.sessions, "prompt")) failures.push("apiProxy.sessions:prompt");
  if (!hasFunction(ctx.sessionQuery, "listSessions")) failures.push("sessionQuery:listSessions");
  if (!hasFunction(ctx.storage?.backend, "get")) failures.push("storage.backend:get");
  if (!hasFunction(ctx, "setTimeout")) failures.push("timer:setTimeout");
  return { ok: failures.length === 0, failures };
}
