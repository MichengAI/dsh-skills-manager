import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("统一筛选与操作按钮规范契约检查", async () => {
  const clientSource = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");
  const sourceSelectSource = await readFile(new URL("../src/source-select.ts", import.meta.url), "utf8");

  // 1. SourceSelect 必须支持 values 多选高亮与 separator / label 分组项
  assert.ok(
    sourceSelectSource.includes("selectedIds: props.values") || sourceSelectSource.includes("selectedIds"),
    "SourceSelect 必须支持透传 selectedIds / values 给宿主 Menu",
  );
  assert.ok(
    sourceSelectSource.includes('type === "separator"') || sourceSelectSource.includes("isSeparator"),
    "SourceSelect 必须支持 separator 类型的菜单项",
  );
  assert.ok(
    sourceSelectSource.includes('type === "label"') || sourceSelectSource.includes("isLabel"),
    "SourceSelect 必须支持 label 类型的菜单分组标题",
  );

  // 2. 全局技能与项目技能必须使用合并后的综合状态与分组筛选
  assert.doesNotMatch(
    clientSource,
    /className:\s*"dssm-group-filter"/,
    "按来源目录不再作为独立下拉框占用单行物理空间，必须合并进状态筛选",
  );
  assert.match(
    clientSource,
    /statusGroupOptions|statusOptions|statusGroupMenu/,
    "必须定义包含分组和状态的综合选项集合",
  );

  // 3. 全局技能与项目技能的操作按钮必须统一为 2 个：刷新与添加下拉菜单
  assert.match(
    clientSource,
    /action:\s*true,\s*icon:[^,]+,\s*label:\s*t\("btn\.create"\)/,
    "添加操作必须使用带有下拉菜单的图标按钮",
  );
  assert.doesNotMatch(
    clientSource,
    /filterActionButton\(t\("import\.global"\)/,
    "导入技能必须收归入添加菜单，不再作为独立图标按钮占据工具栏",
  );
  assert.doesNotMatch(
    clientSource,
    /filterActionButton\(t\("rootPath\.manage"\)/,
    "来源目录管理必须收归入添加菜单，不再作为独立图标按钮占据工具栏",
  );
});
