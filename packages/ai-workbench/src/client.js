import { probeClientContracts } from "./shared/compatibility.js";
import { createRootComponent, createRootRegistration } from "./client/root.js";
import { foundationCss, installStyles } from "./client/styles.js";

window.__ModuleLoader__.load({
  id: "@michengai/dsh-ai-workbench",
  factory: (require) => {
    const React = require("react");
    const runtime = require("@deepseek-ai/dsh-client-runtime/client");
    const name = "ai-workbench-client";
    const inject = ["slots", "layout", "sessions"];
    function apply(ctx) {
      const probe = probeClientContracts(ctx);
      if (!probe.ok) {
        console.error("[dsh-ai-workbench] client compatibility failed", probe.failures);
        return undefined;
      }
      ctx.effect(() => installStyles(foundationCss));
      const registration = createRootRegistration(ctx, runtime.defineStore);
      ctx.effect(() => ctx.slots.register(registration, createRootComponent(React)));
      return undefined;
    }
    return { apply, inject, name };
  },
});
