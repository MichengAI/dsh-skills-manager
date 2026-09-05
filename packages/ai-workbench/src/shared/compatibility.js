const missing = Symbol("missing");
const functionToString = Function.prototype.toString;

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

function isSafeHostMethod(value) {
  if (typeof value !== "function") return false;

  let source;
  try {
    source = functionToString.call(value);
  } catch {
    return false;
  }

  // Function#toString reports bound functions and callable Proxies as
  // native-looking. They cannot be validated without invoking their apply
  // behavior, so reject them instead of executing a host method at startup.
  if (/\[native code\]/.test(source) || /^\s*class\b/.test(source)) return false;
  return true;
}

function probeHostMethod(owner, key) {
  const method = getFunction(owner, key);
  return isSafeHostMethod(method);
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
  for (const method of ["open", "binding"]) {
    if (getFunction(sessions, method) == null) failures.push(`sessions:${method}`);
  }
  if (getFunction(sessions, "subscribe") == null && getFunction(readProperty(sessions, "list"), "subscribe") == null) {
    failures.push("sessions:subscribe");
  }
  return { ok: failures.length === 0, failures };
}

export function probeHostContracts(ctx) {
  const source = ctx ?? {};
  const failures = [];
  const apiProxy = readProperty(source, "apiProxy");
  const apiSessions = readProperty(apiProxy, "sessions");
  if (!probeHostMethod(apiSessions, "create")) failures.push("apiProxy.sessions:create");
  if (!probeHostMethod(apiSessions, "prompt")) failures.push("apiProxy.sessions:prompt");
  const sessionQuery = readProperty(source, "sessionQuery");
  if (!probeHostMethod(sessionQuery, "listSessions")) failures.push("sessionQuery:listSessions");
  if (!probeHostMethod(sessionQuery, "readTitleSnapshots")) failures.push("sessionQuery:readTitleSnapshots");
  const storage = readProperty(source, "storage");
  const backend = readProperty(storage, "backend");
  if (!probeHostMethod(backend, "get")) failures.push("storage.backend:get");
  if (!probeHostMethod(source, "setTimeout")) failures.push("timer:setTimeout");
  return { ok: failures.length === 0, failures };
}
