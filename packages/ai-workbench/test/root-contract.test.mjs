import test from "node:test";
import assert from "node:assert/strict";
import { ROOT_CHILDREN, createRootRegistration } from "../lib/client/root.js";

test("custom Root redeclares every official child seat", () => {
  assert.deepEqual(ROOT_CHILDREN, {
    sidebar: { kind: "single", scope: "root" },
    conversation: { kind: "single", scope: "session-maybe" },
    details: { kind: "single", scope: "session" },
    "shell.overlay": { kind: "list", scope: "root" },
  });
});

test("layout adapter refuses a host without attachPanels", () => {
  const registration = createRootRegistration({ layout: {} }, () => ({}));
  assert.throws(() => registration.inject({}), /attachPanels/);
});
