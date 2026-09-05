import test from "node:test";
import assert from "node:assert/strict";
import { loadCapabilitySources } from "../lib/client/capability-source.js";
import { createCapabilityLibrary } from "../lib/client/capability-library.js";

function fakeReact() {
  return {
    React: {
      createElement(type, props, ...children) {
        return { type, props: props || {}, children: children.flat().filter((child) => child !== null && child !== undefined) };
      },
      useEffect() {},
      useState(value) { return [value, () => {}]; },
      useRef(value) { return { current: value }; },
    },
  };
}

function findByText(node, text) {
  if (!node || typeof node !== "object") return null;
  if (node.children?.some?.((child) => child === text)) return node;
  for (const child of node.children || []) {
    const result = findByText(child, text);
    if (result) return result;
  }
  return null;
}

test("source loader isolates failures and preserves manifest tools", async () => {
  const calls = [];
  const result = await loadCapabilitySources({
    fetchJson: async (url) => {
      calls.push(url);
      if (url.includes("skills-manager")) throw new Error("skills manager unavailable");
      return { enabledIds: ["tool:web"] };
    },
    manifest: {
      version: 1,
      tools: [{ id: "web", name: "联网搜索", description: "网页搜索", source: "DSH" }],
      businessSystems: [],
    },
  });

  assert.deepEqual(calls, [
    "/api/dsh-skills-manager/state",
    "/api/dsh-ai-workbench/capability-preferences",
  ]);
  assert.equal(result.items.find((item) => item.id === "tool:web")?.available, true);
  assert.equal(result.items.find((item) => item.id === "tool:web")?.enabled, true);
  assert.deepEqual(result.warnings.map(({ code }) => code), ["skills-manager-unavailable"]);
});

test("source loader reports preference failure without making the catalog unusable", async () => {
  const result = await loadCapabilitySources({
    fetchJson: async (url) => {
      if (url.includes("skills-manager")) {
        return { roots: [{ key: "dsh", label: "DSH 技能", enabled: true, skills: [] }] };
      }
      throw Object.assign(new Error("preference read failed"), { status: 503 });
    },
    manifest: {
      version: 1,
      tools: [{ id: "shell", name: "本机命令", description: "运行命令", source: "DSH" }],
      businessSystems: [],
    },
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].enabled, false);
  assert.deepEqual(result.warnings.map(({ code }) => code), ["capability-preferences-unavailable"]);
});

test("capability library exposes the catalog entry point and overview copy", () => {
  const fake = fakeReact();
  const Library = createCapabilityLibrary(fake.React, {
    loadSources: async () => ({ items: [], warnings: [], summary: { total: 0, enabled: 0, disabled: 0, unavailable: 0 } }),
  });
  const tree = Library({});
  assert.ok(findByText(tree, "能力库"));
  assert.ok(findByText(tree, "查看可用于 Work 任务的 Skills、DSH 工具和业务系统"));
  assert.ok(findByText(tree, "高级管理"));
});
