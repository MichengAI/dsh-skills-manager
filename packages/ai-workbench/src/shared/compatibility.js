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

function isSafeHostMethod(value, { allowCordisBound = false } = {}) {
  if (typeof value !== "function") return false;

  let source;
  try {
    source = functionToString.call(value);
  } catch {
    return false;
  }

  // Cordis exposes injected methods as bound wrappers. Function#toString
  // renders those wrappers as native-looking, even though the host service is
  // available. Only a trusted Cordis context may opt into that form; generic
  // callable Proxies remain rejected without executing their apply trap.
  if (/\[native code\]/.test(source)) return allowCordisBound;
  if (/^\s*class\b/.test(source)) return false;
  return true;
}

function isCordisContext(value) {
  return typeof getFunction(value, "get") === "function"
    && readProperty(value, "reflect") !== missing;
}

function probeHostMethod(owner, key, options) {
  const method = getFunction(owner, key);
  return isSafeHostMethod(method, options);
}

export function probeChatContracts(ctx) {
  const source = ctx ?? {};
  const options = { allowCordisBound: isCordisContext(source) };
  const failures = [];
  const agentPresets = readProperty(source, "agentPresets");
  for (const method of ["list", "read", "copy", "resolve", "remove"]) {
    if (!probeHostMethod(agentPresets, method, options)) failures.push(`agentPresets:${method}`);
  }
  const permissionPresets = readProperty(source, "permissionPresets");
  if (!probeHostMethod(permissionPresets, "set", options)) failures.push("permissionPresets:set");
  return { ok: failures.length === 0, failures };
}

export function probeClientContracts(ctx, options = {}) {
  const source = ctx ?? {};
  const failures = [];
  const slots = readProperty(source, "slots");
  const spec = getFunction(slots, "spec");
  for (const slot of ["shell.overlay"]) {
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
  if (getFunction(slots, "inject") == null) failures.push("slots:inject");
  const sessions = readProperty(source, "sessions");
  if (getFunction(sessions, "open") == null) failures.push("sessions:open");

  if (options.nativeConversation === true) {
    const nativeOptions = { allowCordisBound: isCordisContext(source) };
    const rootSpec = getFunction(slots, "spec");
    if (rootSpec == null) {
      failures.push("slot:root");
    } else {
      try {
        if (Reflect.apply(rootSpec, slots, ["root"]) == null) failures.push("slot:root");
      } catch {
        failures.push("slot:root");
      }
    }
    const layout = readProperty(source, "layout");
    if (!probeHostMethod(layout, "attachPanels", nativeOptions)) failures.push("layout:attachPanels");
    const inputTriggers = readProperty(source, "inputTriggers");
    if (!probeHostMethod(inputTriggers, "registerSource", nativeOptions)) failures.push("inputTriggers:registerSource");
    const commandUi = readProperty(source, "commandUi");
    if (!probeHostMethod(commandUi, "register", nativeOptions)) failures.push("commandUi:register");
  }
  return { ok: failures.length === 0, failures };
}

export function probeHostContracts(ctx) {
  const source = ctx ?? {};
  const options = { allowCordisBound: isCordisContext(source) };
  const failures = [];
  const apiProxy = readProperty(source, "apiProxy");
  const apiSessions = readProperty(apiProxy, "sessions");
  for (const method of ["create", "prompt", "models", "selectModel"]) {
    if (!probeHostMethod(apiSessions, method, options)) failures.push(`apiProxy.sessions:${method}`);
  }
  const apiLlm = readProperty(apiProxy, "llm");
  if (!probeHostMethod(apiLlm, "models", options)) failures.push("apiProxy.llm:models");
  const sessions = readProperty(source, "sessions");
  if (!probeHostMethod(sessions, "get", options)) failures.push("sessions:get");
  const permissionPresets = readProperty(source, "permissionPresets");
  if (!probeHostMethod(permissionPresets, "set", options)) failures.push("permissionPresets:set");
  const sessionQuery = readProperty(source, "sessionQuery");
  if (!probeHostMethod(sessionQuery, "listSessions", options)) failures.push("sessionQuery:listSessions");
  if (!probeHostMethod(sessionQuery, "readTitleSnapshots", options)) failures.push("sessionQuery:readTitleSnapshots");
  const storage = readProperty(source, "storage");
  const backend = readProperty(storage, "backend");
  if (!probeHostMethod(backend, "get", options)) failures.push("storage.backend:get");
  return { ok: failures.length === 0, failures };
}
