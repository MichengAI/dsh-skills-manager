// 状态观察器回归：首次读取被禁用后，重新开启必须重取状态，不能只恢复空按钮。
import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import * as React from "react";

const { outputFiles } = buildSync({ entryPoints: ["src/plugin-update-ui.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external" });
const module = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)((id) => {
  if (id === "react") return React;
  if (id === "react-dom/client") return { createRoot: () => ({ render() {}, unmount() {} }) };
  if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Button() {}, Modal() {} };
  throw new Error("未知依赖：" + id);
}, module, module.exports);

class Node {
  constructor() { this.children = []; this.dataset = {}; this.className = ""; this.textContent = ""; this.isConnected = true; }
  append(node) { this.children.push(node); node.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); this.isConnected = false; }
  querySelector(selector) {
    if (selector === "h1,h2") return this.heading ?? null;
    if (selector === ".links") return this.links ?? null;
    return this.children.find((node) => selector.includes("mpi-version") ? node.className === "mpi-version" : selector.includes("data-mpi-check") ? Boolean(node.dataset.mpiCheck) : false) ?? null;
  }
}

test("首次更新请求被禁用后重新开启，重新取版本并恢复完整入口", async () => {
  const originals = Object.fromEntries(["document", "window", "MutationObserver", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const row = new Node(); row.heading = new Node(); row.links = new Node();
  let enabled = false, requests = 0, cleanup;
  try {
    globalThis.document = {
      baseURI: "http://localhost/", body: new Node(), head: new Node(), documentElement: Object.assign(new Node(), { lang: "zh" }),
      getElementById: () => null, createElement: () => new Node(),
      querySelector: () => row,
      querySelectorAll: () => [...row.heading.children, ...row.links.children],
    };
    globalThis.window = { requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    globalThis.fetch = async () => {
      requests++;
      return { ok: enabled, json: async () => enabled ? { packageName: "test", currentVersion: "1.2.12", updateAvailable: false, profileName: "test", canAutoUpdate: false, latestCheckFailed: false } : { error: "在线更新已禁用" } };
    };
    cleanup = module.exports.observePluginUpdate({ endpoint: "/api/update", packageName: "test", titleRowSelector: ".row", linksSelector: ".links", zhName: "技能", enName: "Skills", createIcon: () => new Node(), isEnabled: () => enabled });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
    assert.equal(row.heading.children.length, 0);
    enabled = true;
    cleanup.refresh();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 2, "开启后必须重试首次失败的状态读取");
    assert.equal(row.heading.children[0]?.textContent, "v1.2.12");
    assert.equal(row.links.children.length, 1);
    enabled = false;
    cleanup.refresh(); cleanup.refresh();
    assert.equal(row.heading.children.length, 0);
    assert.equal(row.links.children.length, 0);
  } finally {
    cleanup?.();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
