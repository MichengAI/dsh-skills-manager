import test from "node:test";
import assert from "node:assert/strict";
import { probeClientContracts, probeHostContracts } from "../lib/shared/compatibility.js";

test("client probe accepts the required DSH slot and layout faces", () => {
  const result = probeClientContracts({
    slots: {
      spec: (name) => ({ root: {}, sidebar: {}, conversation: {}, details: {}, "shell.overlay": {} })[name],
      register() {},
    },
    layout: { toggleSidebar() {}, openDetails() {}, closeDetails() {}, attachPanels() {} },
    sessions: { open() {}, binding() {}, subscribe() {} },
  });
  assert.deepEqual(result, { ok: true, failures: [] });
});

test("client probe reports missing contracts without throwing", () => {
  const result = probeClientContracts({ slots: { spec: () => undefined } });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("slot:conversation"));
  assert.ok(result.failures.includes("layout:attachPanels"));
});

test("client probe fails closed when the context is missing", () => {
  const result = probeClientContracts(null);
  assert.deepEqual(result, {
    ok: false,
    failures: [
      "slot:root",
      "slot:sidebar",
      "slot:conversation",
      "slot:details",
      "slot:shell.overlay",
      "slots:register",
      "layout:toggleSidebar",
      "layout:openDetails",
      "layout:closeDetails",
      "layout:attachPanels",
      "sessions:open",
      "sessions:binding",
      "sessions:subscribe",
    ],
  });
});

test("client probe fails closed when a slot spec throws", () => {
  const result = probeClientContracts({
    slots: {
      spec() {
        throw new Error("boom");
      },
    },
  });
  assert.deepEqual(result, {
    ok: false,
    failures: [
      "slot:root",
      "slot:sidebar",
      "slot:conversation",
      "slot:details",
      "slot:shell.overlay",
      "slots:register",
      "layout:toggleSidebar",
      "layout:openDetails",
      "layout:closeDetails",
      "layout:attachPanels",
      "sessions:open",
      "sessions:binding",
      "sessions:subscribe",
    ],
  });
});

test("host probe requires the gateway, query, storage, and timer faces", () => {
  const result = probeHostContracts({
    apiProxy: { sessions: { create() {}, prompt() {} } },
    sessionQuery: { listSessions() {} },
    storage: { backend: { get() {} } },
    setTimeout() {},
  });
  assert.equal(result.ok, true);
});
