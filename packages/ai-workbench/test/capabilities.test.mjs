import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCapabilities, filterCapabilities, summarizeCapabilities } from "../lib/shared/capabilities.js";
import { capabilityManifest, validateCapabilityManifest } from "../lib/shared/capability-manifest.js";

const MODEL_KEYS = ["id", "name", "description", "kind", "source", "available", "enabled", "details"];

test("Skills, tools, and business systems share one stable model", () => {
  const items = normalizeCapabilities({
    skillState: {
      roots: [{
        key: "dsh",
        label: "DSH 技能",
        enabled: true,
        skills: [{
          name: "documents",
          declaredName: "文档技能",
          description: "创建文档",
          loadable: true,
          managerEnabled: true,
          diagnostics: ["ok"],
          path: "/workspace/skills/documents",
          effectiveModelInvocable: true,
        }],
      }],
    },
    manifest: {
      tools: [{ id: "web", name: "联网搜索", description: "搜索公开网页", source: "DSH", available: true }],
      businessSystems: [{ id: "oa", name: "OA", description: "校园办公", source: "校园系统", connected: false }],
    },
    enabledIds: ["skill:dsh:documents", "tool:web"],
  });

  assert.deepEqual(items.map(({ id, kind, enabled, available }) => ({ id, kind, enabled, available })), [
    { id: "skill:dsh:documents", kind: "skill", enabled: true, available: true },
    { id: "tool:web", kind: "tool", enabled: true, available: true },
    { id: "business:oa", kind: "business", enabled: false, available: false },
  ]);
  assert.deepEqual(Object.keys(items[0]).sort(), MODEL_KEYS.slice().sort());
  assert.deepEqual(items[0].details, {
    diagnostics: ["ok"],
    path: "/workspace/skills/documents",
    modelInvocable: true,
  });
  assert.deepEqual(items[1].details, {});
  assert.deepEqual(items[2].details, { connectionHint: null });
});

test("normalization preserves unavailable declared capabilities and sorts deterministically", () => {
  const input = {
    skillState: {
      roots: [{
        key: "local",
        label: "本地技能",
        enabled: false,
        skills: [{ name: "zeta", description: "不可用技能", loadable: true, managerEnabled: true }],
      }],
    },
    manifest: {
      tools: [
        { id: "shell", name: "本机命令", description: "命令", available: false },
        { id: "web", name: "联网搜索", description: "网页", available: true },
      ],
      businessSystems: [{ id: "oa", name: "OA", description: "办公", connected: false }],
    },
  };
  const reversed = {
    ...input,
    skillState: { roots: [...input.skillState.roots].reverse() },
    manifest: {
      tools: [...input.manifest.tools].reverse(),
      businessSystems: [...input.manifest.businessSystems].reverse(),
    },
  };

  const first = normalizeCapabilities(input);
  const second = normalizeCapabilities(reversed);
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.deepEqual(first.map((item) => ({ id: item.id, available: item.available })), [
    { id: "skill:local:zeta", available: false },
    { id: "tool:shell", available: false },
    { id: "tool:web", available: true },
    { id: "business:oa", available: false },
  ]);
});

test("filter matches query, kind, and source without removing unavailable items", () => {
  const items = normalizeCapabilities({
    skillState: { roots: [] },
    manifest: {
      tools: [{ id: "shell", name: "本机命令", description: "在 DSH 中运行命令", source: "DSH", available: false }],
      businessSystems: [],
    },
  });

  assert.equal(filterCapabilities(items, { query: "运行命令", kind: "all", source: "all" }).length, 1);
  assert.equal(filterCapabilities(items, { query: "dsh", kind: "all", source: "all" }).length, 1);
  assert.equal(filterCapabilities(items, { query: "", kind: "business", source: "all" }).length, 0);
  assert.equal(filterCapabilities(items, { query: "", kind: "tool", source: "other" }).length, 0);
  assert.equal(filterCapabilities(items, { query: "", kind: "tool", source: "DSH" })[0].available, false);
});

test("summary counts enabled, disabled, and unavailable independently", () => {
  const items = [
    { enabled: true, available: true },
    { enabled: false, available: true },
    { enabled: true, available: false },
  ];
  assert.deepEqual(summarizeCapabilities(items), {
    total: 3,
    enabled: 2,
    disabled: 1,
    unavailable: 1,
  });
});

test("normalization helpers tolerate null options and malformed list entries", () => {
  assert.deepEqual(normalizeCapabilities(null), []);
  assert.deepEqual(filterCapabilities([null, { id: "tool:web", name: "联网搜索", description: "网页", kind: "tool", source: "DSH" }], null).map((item) => item.id), ["tool:web"]);
  assert.deepEqual(summarizeCapabilities([null, { enabled: true, available: true }]), {
    total: 1,
    enabled: 1,
    disabled: 0,
    unavailable: 0,
  });
});

test("production capability manifest is versioned and runtime-validated", () => {
  assert.equal(capabilityManifest.version, 1);
  assert.doesNotThrow(() => validateCapabilityManifest(capabilityManifest));
  assert.throws(() => validateCapabilityManifest({ ...capabilityManifest, version: 2 }), /unsupported capability manifest version/);
});

test("capability manifest contains only the declared DSH tools and no business systems", async () => {
  const manifest = JSON.parse(await readFile(new URL("../assets/capabilities.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest, {
    version: 1,
    tools: [
      { id: "web", name: "联网搜索", description: "搜索公开网页信息", source: "DSH", available: true },
      { id: "local-files", name: "工作区文件", description: "读取和编辑已授权工作区内的文件", source: "DSH", available: true },
      { id: "shell", name: "本机命令", description: "在 DSH 权限策略约束下运行本机命令", source: "DSH", available: true },
    ],
    businessSystems: [],
  });
});
