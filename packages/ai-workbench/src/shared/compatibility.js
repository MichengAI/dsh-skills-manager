function hasFunction(value, key) {
  return value != null && typeof value[key] === "function";
}

export function probeClientContracts(ctx) {
  const source = ctx ?? {};
  const failures = [];
  for (const slot of ["root", "sidebar", "conversation", "details", "shell.overlay"]) {
    if (!hasFunction(source.slots, "spec")) {
      failures.push(`slot:${slot}`);
      continue;
    }
    try {
      if (source.slots.spec(slot) == null) failures.push(`slot:${slot}`);
    } catch {
      failures.push(`slot:${slot}`);
    }
  }
  if (!hasFunction(source.slots, "register")) failures.push("slots:register");
  for (const method of ["toggleSidebar", "openDetails", "closeDetails", "attachPanels"]) {
    if (!hasFunction(source.layout, method)) failures.push(`layout:${method}`);
  }
  for (const method of ["open", "binding", "subscribe"]) {
    if (!hasFunction(source.sessions, method)) failures.push(`sessions:${method}`);
  }
  return { ok: failures.length === 0, failures };
}

export function probeHostContracts(ctx) {
  const source = ctx ?? {};
  const failures = [];
  if (!hasFunction(source.apiProxy?.sessions, "create")) failures.push("apiProxy.sessions:create");
  if (!hasFunction(source.apiProxy?.sessions, "prompt")) failures.push("apiProxy.sessions:prompt");
  if (!hasFunction(source.sessionQuery, "listSessions")) failures.push("sessionQuery:listSessions");
  if (!hasFunction(source.storage?.backend, "get")) failures.push("storage.backend:get");
  if (!hasFunction(source, "setTimeout")) failures.push("timer:setTimeout");
  return { ok: failures.length === 0, failures };
}
