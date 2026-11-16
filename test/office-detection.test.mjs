import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "dssm-office-detect-test-"));

try {
  const core = await import("../lib/core.js");

  console.log("── 1. 验证 candidateOfficeSkillsDirs 导出与探测候选生成 ──");
  assert.equal(typeof core.candidateOfficeSkillsDirs, "function", "core 应当导出 candidateOfficeSkillsDirs 函数");

  // 模拟 Web 宿主场景：
  // 存在全局 node_global 安装路径与 profiles 软链
  const mockGlobalDir = join(tempDir, "node_global", "node_modules", "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai", "dsh-skill-office", "assets");
  const mockDesktopRuntimeDir = join(tempDir, "desktop-runtime", "assets");
  await mkdir(mockGlobalDir, { recursive: true });
  await mkdir(mockDesktopRuntimeDir, { recursive: true });

  const cands = core.candidateOfficeSkillsDirs({
    platform: "win32",
    execPath: join(tempDir, "node_global", "node.exe"),
    homedir: tempDir,
    resolveBase(id, base) {
      if (base.includes("profiles")) {
        // 模拟父级软链解析到桌面端
        return mockDesktopRuntimeDir;
      }
      return undefined;
    },
  });

  assert.ok(Array.isArray(cands), "应当返回候选路径数组");
  // 关键断言（防止 P1 再次发生）：全局运行环境候选必须排在 profiles/desktop 软链候选之前
  const globalIdx = cands.findIndex((c) => c.includes("node_global"));
  const desktopIdx = cands.findIndex((c) => c.includes("desktop-runtime"));
  assert.ok(globalIdx !== -1, "候选列表中应包含全局 node_global 路径");
  assert.ok(desktopIdx === -1 || globalIdx < desktopIdx, "全局 Node 路径必须优先于跨应用软链解析路径");

  console.log("── 2. 负缓存行为测试 ──");
  core.clearOfficeSkillsDirCache();
  delete process.env.DSH_OFFICE_SKILLS_DIR;
  // 在完全空的临时目录下探测
  const emptyHome = join(tempDir, "empty-home");
  await mkdir(emptyHome, { recursive: true });
  const missingResult = core.resolveOfficeSkillsDir({
    homedir: emptyHome,
    execPath: join(emptyHome, "node.exe"),
    argv: [join(emptyHome, "node.exe"), join(emptyHome, "dummy.js")],
    platform: "win32",
  });
  assert.equal(missingResult, undefined, "未找到 Office 技能时应返回 undefined，绝不能返回虚构不存在的目录");

  console.log("── 3. 动态 Rank 常量测试 ──");
  assert.equal(typeof core.getBundledSkillRank, "function", "应当导出 getBundledSkillRank 函数");
  assert.equal(core.getBundledSkillRank(), 600, "默认或对齐官方导出的 BUNDLED_SKILL_RANK 应当为 600");

  console.log("── 4. 白名单过滤测试 ──");
  assert.ok(Array.isArray(core.OFFICIAL_OFFICE_SKILL_NAMES), "应当导出官方 Office 技能名称白名单");
  assert.deepEqual(
    [...core.OFFICIAL_OFFICE_SKILL_NAMES].sort(),
    ["office", "office-docx", "office-pptx", "office-xlsx"],
    "白名单应包含官方定义的 4 个 Office 技能",
  );

  console.log("── 5. 本机真实环境探测无串味断言 ──");
  core.clearOfficeSkillsDirCache();
  delete process.env.DSH_OFFICE_SKILLS_DIR;
  const realOfficeDir = core.resolveOfficeSkillsDir();
  if (realOfficeDir) {
    console.log("本机真实探测到 Office 目录:", realOfficeDir);
    assert.equal(realOfficeDir.includes("AppData\\Roaming\\DSH Codex Desktop"), false, "在独立 Node/Web 宿主下严禁穿透到桌面端旧副本");
    assert.ok(realOfficeDir.toLowerCase().includes("node_global") || realOfficeDir.toLowerCase().includes("node_modules"), "应命中当前环境 node_modules");
  }

  console.log("探测测试全部通过！");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
