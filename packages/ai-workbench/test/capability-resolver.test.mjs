import test from "node:test";
import assert from "node:assert/strict";
import { resolveSelection } from "../lib/host/capability-resolver.js";

test("unknown health cannot be presented as executable", () => {
  assert.throws(() => resolveSelection(["tool:test"], [
    { id: "tool:test", health: "unknown", source: "fixture" },
  ]), { code: "capability-unavailable" });
});

test("selection removes duplicate ready capabilities and preserves an execution snapshot", () => {
  assert.deepEqual(resolveSelection(["tool:web", "tool:web"], [
    { id: "tool:web", health: "ready", source: "DSH", version: "rc.2" },
  ]), [{ id: "tool:web", source: "DSH", version: "rc.2" }]);
});
