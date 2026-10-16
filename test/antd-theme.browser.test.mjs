// 源码不再引入 antd。宿主原语由运行时平台表提供。
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

async function sourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await sourceFiles(path));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) found.push(path);
  }
  return found;
}

test("源码不再引入 antd", async () => {
  const files = await sourceFiles("src");
  assert.ok(files.length > 0, "必须扫到源码");
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /from ["']antd/, `${file} 仍引入 antd`);
    assert.doesNotMatch(text, /antd\/es\//, `${file} 仍引用 antd/es`);
    assert.doesNotMatch(text, /ant-btn|ant-select|ant-collapse|dssm-antd-select|--ant-btn/, `${file} 仍保留 ant 类名或变量`);
  }
});
