import { probeHostContracts } from "./shared/compatibility.js";
import { createDiagnostics } from "./host/diagnostics.js";
import { routeRequest, sendJson } from "./host/http.js";

const name = "ai-workbench";
const inject = ["webServer", "webRuntime", "apiProxy", "sessionQuery", "storage"];

function apply(ctx) {
  const diagnostics = createDiagnostics(probeHostContracts(ctx));
  return ctx.webServer.register({
    kind: "prefix",
    path: "/api/dsh-ai-workbench",
    handler: async (req, res) => sendJson(res, await routeRequest(req, { diagnostics })),
  });
}

export { apply, inject, name };
