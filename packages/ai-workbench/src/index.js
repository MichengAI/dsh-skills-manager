import { probeHostContracts } from "./shared/compatibility.js";
import { createDiagnostics } from "./host/diagnostics.js";
import { API_PREFIX, routeRequest, sendJson } from "./host/http.js";

const name = "ai-workbench";
const inject = ["webServer", "webRuntime", "apiProxy", "sessionQuery", "storage"];

function apply(ctx) {
  const diagnostics = createDiagnostics(probeHostContracts(ctx));
  return ctx.webServer.register({
    kind: "prefix",
    path: API_PREFIX,
    handler: async (req, res) => sendJson(res, await routeRequest(req, { diagnostics })),
  });
}

export { apply, inject, name };
