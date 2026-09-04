const missing = Symbol("missing");

function readProperty(value, key) {
  if (value == null) return missing;
  try {
    return value[key];
  } catch {
    return missing;
  }
}

function getFunction(value, key) {
  const property = readProperty(value, key);
  return typeof property === "function" ? property : null;
}

export function probeClientContracts(ctx) {
  const source = ctx ?? {};
  const failures = [];
  const slots = readProperty(source, "slots");
  const spec = getFunction(slots, "spec");
  for (const slot of ["root", "sidebar", "conversation", "details", "shell.overlay"]) {
    if (spec == null) {
      failures.push(`slot:${slot}`);
      continue;
    }
    try {
      if (Reflect.apply(spec, slots, [slot]) == null) failures.push(`slot:${slot}`);
    } catch {
      failures.push(`slot:${slot}`);
    }
  }
  if (getFunction(slots, "register") == null) failures.push("slots:register");
  const layout = readProperty(source, "layout");
  for (const method of ["toggleSidebar", "openDetails", "closeDetails", "attachPanels"]) {
    if (getFunction(layout, method) == null) failures.push(`layout:${method}`);
  }
  const sessions = readProperty(source, "sessions");
  for (const method of ["open", "binding", "subscribe"]) {
    if (getFunction(sessions, method) == null) failures.push(`sessions:${method}`);
  }
  return { ok: failures.length === 0, failures };
}

export function probeHostContracts(ctx) {
  const source = ctx ?? {};
  const failures = [];
  const apiProxy = readProperty(source, "apiProxy");
  const apiSessions = readProperty(apiProxy, "sessions");
  if (getFunction(apiSessions, "create") == null) failures.push("apiProxy.sessions:create");
  if (getFunction(apiSessions, "prompt") == null) failures.push("apiProxy.sessions:prompt");
  const sessionQuery = readProperty(source, "sessionQuery");
  if (getFunction(sessionQuery, "listSessions") == null) failures.push("sessionQuery:listSessions");
  const storage = readProperty(source, "storage");
  const backend = readProperty(storage, "backend");
  if (getFunction(backend, "get") == null) failures.push("storage.backend:get");
  if (getFunction(source, "setTimeout") == null) failures.push("timer:setTimeout");
  return { ok: failures.length === 0, failures };
}
