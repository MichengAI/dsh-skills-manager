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

const probeAbort = Symbol("probe-abort");
const probeReceiver = new Proxy(Object.create(null), {
  defineProperty() {
    throw probeAbort;
  },
  deleteProperty() {
    throw probeAbort;
  },
  get() {
    throw probeAbort;
  },
  getOwnPropertyDescriptor() {
    throw probeAbort;
  },
  has() {
    throw probeAbort;
  },
  ownKeys() {
    throw probeAbort;
  },
  set() {
    throw probeAbort;
  },
});

function isNativeCallable(value) {
  try {
    return /\[native code\]/.test(Function.prototype.toString.call(value));
  } catch {
    return true;
  }
}

function probeHostMethod(owner, key) {
  const method = getFunction(owner, key);
  if (method == null) return false;

  // Source functions are only checked for their callable face. Executing a
  // real DSH service method during plugin registration could perform work.
  // Function#toString exposes callable Proxies as native-looking functions;
  // invoke only that path so an apply trap that throws is not accepted.
  if (!isNativeCallable(method)) return true;
  if (key === "setTimeout" && method === globalThis.setTimeout) return true;

  try {
    const args = key === "setTimeout" ? [() => {}, 0] : [];
    const result = Reflect.apply(method, probeReceiver, args);
    if (key === "setTimeout" && result != null && typeof globalThis.clearTimeout === "function") {
      globalThis.clearTimeout(result);
    }
    return true;
  } catch (error) {
    return error === probeAbort;
  }
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
  if (!probeHostMethod(apiSessions, "create")) failures.push("apiProxy.sessions:create");
  if (!probeHostMethod(apiSessions, "prompt")) failures.push("apiProxy.sessions:prompt");
  const sessionQuery = readProperty(source, "sessionQuery");
  if (!probeHostMethod(sessionQuery, "listSessions")) failures.push("sessionQuery:listSessions");
  const storage = readProperty(source, "storage");
  const backend = readProperty(storage, "backend");
  if (!probeHostMethod(backend, "get")) failures.push("storage.backend:get");
  if (!probeHostMethod(source, "setTimeout")) failures.push("timer:setTimeout");
  return { ok: failures.length === 0, failures };
}
