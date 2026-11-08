import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyPreview } from "../src/repository-batch.ts";

test("classifyPreview 按预览结果分桶", () => {
  assert.equal(classifyPreview(undefined), "unchanged");
  assert.equal(classifyPreview(null), "unchanged");
  assert.equal(classifyPreview({}), "unchanged");
  assert.equal(classifyPreview({ changes: [] }), "unchanged");
  assert.equal(classifyPreview({ changes: [{ path: "a" }] }), "updatable");
  assert.equal(classifyPreview({ changes: [{ path: "a" }], localModified: true }), "local-modified");
  assert.equal(classifyPreview({ changes: [], localModified: true }), "unchanged");
});
