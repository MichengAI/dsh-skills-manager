import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyPreview, countOutcomes, runSequential } from "../src/repository-batch.ts";

test("runSequential 按顺序执行并保留逐项结果", async () => {
  const seen = [];
  const { results, stoppedAt } = await runSequential([1, 2, 3], async (item) => {
    seen.push(item);
    return { status: "ok" };
  });
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(stoppedAt, undefined);
  assert.deepEqual(results.map((result) => result.item), [1, 2, 3]);
  assert.deepEqual(results.map((result) => result.outcome.status), ["ok", "ok", "ok"]);
});

test("单项失败不会中断后续项", async () => {
  const { results } = await runSequential(["a", "b", "c"], async (item) => {
    if (item === "b") throw new Error("boom");
    return { status: "ok" };
  });
  assert.deepEqual(results.map((result) => result.outcome.status), ["ok", "failed", "ok"]);
  assert.equal(results[1].outcome.error.message, "boom");
});

test("shouldStop 为真时剩余项标记为 notRun 并返回 stoppedAt", async () => {
  const { results, stoppedAt } = await runSequential([1, 2, 3, 4], async (item) => {
    if (item === 2) return { status: "failed", reason: "conflict" };
    return { status: "ok" };
  }, undefined, (_index, _item, outcome) => outcome.status === "failed");
  assert.equal(stoppedAt, 2);
  assert.deepEqual(results.map((result) => result.outcome.status), ["ok", "failed", "notRun", "notRun"]);
});

test("onProgress 在执行每项前收到索引与条目", async () => {
  const progress = [];
  await runSequential([10, 20], async () => ({ status: "ok" }), (index, item) => {
    progress.push([index, item]);
  });
  assert.deepEqual(progress, [[0, 10], [1, 20]]);
});

test("run 返回空值视为成功", async () => {
  const { results } = await runSequential(["x"], async () => undefined);
  assert.equal(results[0].outcome.status, "ok");
});

test("classifyPreview 按预览结果分桶", () => {
  assert.equal(classifyPreview(undefined), "unchanged");
  assert.equal(classifyPreview(null), "unchanged");
  assert.equal(classifyPreview({}), "unchanged");
  assert.equal(classifyPreview({ changes: [] }), "unchanged");
  assert.equal(classifyPreview({ changes: [{ path: "a" }] }), "updatable");
  assert.equal(classifyPreview({ changes: [{ path: "a" }], localModified: true }), "local-modified");
  assert.equal(classifyPreview({ changes: [], localModified: true }), "unchanged");
});

test("countOutcomes 统计各状态数量", () => {
  const counts = countOutcomes([
    { outcome: { status: "ok" } },
    { outcome: { status: "ok" } },
    { outcome: { status: "failed" } },
    { outcome: { status: "skipped" } },
    { outcome: { status: "notRun" } },
  ]);
  assert.deepEqual(counts, { ok: 2, failed: 1, skipped: 1, notRun: 1 });
});
