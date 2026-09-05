import { probeHostContracts } from "./shared/compatibility.js";
import { createDiagnostics } from "./host/diagnostics.js";
import { API_PREFIX, routeRequest, sendJson } from "./host/http.js";
import { createModeService } from "./host/mode-service.js";
import { createRepository, openWorkbenchUnit } from "./host/repository.js";

const name = "ai-workbench";
const inject = ["webServer", "webRuntime", "apiProxy", "sessionQuery", "storage"];

async function apply(ctx) {
  const diagnostics = createDiagnostics(probeHostContracts(ctx));
  const unit = await openWorkbenchUnit(ctx.storage);
  let repository;
  try {
    repository = await createRepository(unit);
  } catch (error) {
    await unit.close();
    throw error;
  }
  const modeService = createModeService({ repository, sessionQuery: ctx.sessionQuery });
  let unregister;
  try {
    unregister = ctx.webServer.register({
      kind: "prefix",
      path: API_PREFIX,
      handler: async (req, res) => sendJson(res, await routeRequest(req, {
        diagnostics,
        modeService,
        repository,
        sessionQuery: ctx.sessionQuery,
      })),
    });
  } catch (error) {
    await repository.close();
    throw error;
  }

  let disposed = false;
  return async () => {
    if (disposed) return;
    disposed = true;
    try {
      if (typeof unregister === "function") await unregister();
    } finally {
      await repository.close();
    }
  };
}

export { apply, inject, name };
