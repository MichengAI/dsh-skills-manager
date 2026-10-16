// 设置页控件改为 Ant Design，不再按宿主版本分叉自绘开关、标签和页签。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const built = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
const source = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");
assert.ok(built.includes("@deepseek-ai/dsh-client-ui-primitives"));
assert.equal(built.includes("dssm-fallback-tabs"), false);
assert.equal(built.includes("dssm-fallback-switch"), false);
assert.equal(built.includes("dssm-host-modal{"), false);
assert.ok(built.includes("data-ds-dark-theme"));
assert.ok(built.includes('require("react")'));
assert.ok(built.includes('require("react-dom")'));
assert.ok(built.includes('require("react-dom/client")'));
assert.ok(source.includes("block: true"));
console.log("设置页不再保留宿主控件兜底");
