import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { foundationCss } from "../lib/client/styles.js";

async function loadDefinition() {
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  let definition;
  new Function("window", source)({
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  });
  return definition;
}

test("loader factory preserves host-owned seats and contributes only an additive overlay", async () => {
  const definition = await loadDefinition();
  const required = [];
  const effects = [];
  const registrations = [];
  const injections = [];
  let runtime;

  const bundle = definition.factory((id) => {
    required.push(id);
    if (id === "react") return { createElement() {} };
    if (id === "@deepseek-ai/dsh-client-runtime/client") {
      runtime = { defineStore() {} };
      return runtime;
    }
    throw new Error(`unexpected require: ${id}`);
  });

  assert.equal(typeof runtime?.defineStore, "function");
  assert.deepEqual(required, ["react", "@deepseek-ai/dsh-client-runtime/client"]);

  const ctx = {
    slots: {
      spec: () => ({}),
      register(...args) {
        registrations.push(args);
      },
      inject(name, callback) {
        injections.push(name);
        return callback();
      },
    },
    layout: {
      toggleSidebar() {},
      openDetails() {},
      closeDetails() {},
      attachPanels() {},
    },
    sessions: { open() {}, binding() {}, subscribe() {} },
    effect(callback) {
      effects.push(callback);
    },
  };

  assert.doesNotThrow(() => bundle.apply(ctx));
  assert.equal(effects.length, 1);
  assert.deepEqual(injections, ["shell.overlay"]);
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations.map(([registration]) => registration.name), ["shell.overlay"]);
  assert.equal(typeof registrations[0][1], "function");
  assert.equal(registrations[0][0].id, "dsh-ai-workbench");
  assert.equal("children" in registrations[0][0], false);
});

test("workbench frame establishes the containing block for its overlay", () => {
  assert.match(foundationCss, /\.daw-frame\{[^}]*position:relative/);
});

test("provider forwards runtime workspace hook and workspaces context to client UI", async () => {
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(source, /useWorkspaces:\s*ctx\.useWorkspaces/);
  assert.match(source, /workspaces:\s*ctx\.workspaces/);
});
