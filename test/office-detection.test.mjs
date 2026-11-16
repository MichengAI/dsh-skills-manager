import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "dssm-office-detect-test-"));

try {
  const core = await import("../lib/core.js");

  console.log("── 1. 验证 Web 宿主模式下候选生成与防穿透隔离 ──");
  assert.equal(typeof core.candidateOfficeSkillsDirs, "function", "core 应当导出 candidateOfficeSkillsDirs 函数");

  const mockGlobalDir = join(tempDir, "node_global", "node_modules", "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai", "dsh-skill-office", "assets");
  const mockDesktopRuntimeDir = join(tempDir, "AppData", "Roaming", "DSH Codex Desktop", "dsh-runtime", "assets");
  await mkdir(mockGlobalDir, { recursive: true });
  await mkdir(mockDesktopRuntimeDir, { recursive: true });

  const webCandidates = core.candidateOfficeSkillsDirs({
    platform: "win32",
    execPath: join(tempDir, "node_global", "node.exe"),
    argv: [join(tempDir, "node_global", "node.exe"), join(tempDir, "dsh-web-start.js")],
    homedir: tempDir,
    resolveBase(id, base) {
      if (base.includes("profiles")) {
        // 模拟软链解析到桌面端旧 runtime
        return mockDesktopRuntimeDir;
      }
      return undefined;
    },
  });

  assert.ok(Array.isArray(webCandidates), "应当返回候选路径数组");
  const globalIdx = webCandidates.findIndex((c) => c.includes("node_global"));
  assert.ok(globalIdx !== -1, "Web 宿主候选列表中应包含全局 node_global 路径");
  const hasDesktopPath = webCandidates.some((c) => /dsh.*desktop|dsh-runtime/i.test(c));
  assert.equal(hasDesktopPath, false, "Web 宿主下严禁包含任何桌面端私有 AppData / runtime 路径");

  console.log("── 2. 验证桌面端（Electron）宿主模式下自身打包资源优先 ──");
  const mockAppAsarUnpacked = join(tempDir, "desktop-app", "resources", "app.asar.unpacked", "dsh", "node_modules", "@deepseek-ai", "dsh-skill-office", "assets");
  await mkdir(mockAppAsarUnpacked, { recursive: true });

  const desktopCandidates = core.candidateOfficeSkillsDirs({
    platform: "win32",
    resourcesPath: join(tempDir, "desktop-app", "resources"),
    execPath: join(tempDir, "desktop-app", "DSH Codex Desktop.exe"),
    argv: [join(tempDir, "desktop-app", "DSH Codex Desktop.exe")],
    homedir: tempDir,
  });

  const appAsarIdx = desktopCandidates.findIndex((c) => c.includes("app.asar.unpacked"));
  const desktopGlobalIdx = desktopCandidates.findIndex((c) => c.includes("node_global"));
  assert.ok(appAsarIdx !== -1, "桌面宿主下应优先包含 app.asar.unpacked 打包资源");
  if (desktopGlobalIdx !== -1) {
    assert.ok(appAsarIdx < desktopGlobalIdx, "桌面宿主下自身打包资源必须优先于系统全局 node_modules");
  }

  console.log("── 3. 负缓存行为与未命中状态测试 ──");
  core.clearOfficeSkillsDirCache();
  delete process.env.DSH_OFFICE_SKILLS_DIR;
  const emptyHome = join(tempDir, "empty-home");
  await mkdir(emptyHome, { recursive: true });
  const missingResult = core.resolveOfficeSkillsDir({
    homedir: emptyHome,
    execPath: join(emptyHome, "node.exe"),
    argv: [join(emptyHome, "node.exe"), join(emptyHome, "dummy.js")],
    platform: "win32",
  });
  assert.equal(missingResult, undefined, "未找到 Office 技能时应返回 undefined，绝不能返回虚构目录");

  console.log("── 4. 动态 Rank 常量与基于目录上下文加载测试 ──");
  assert.equal(typeof core.getBundledSkillRank, "function", "应当导出 getBundledSkillRank 函数");
  assert.equal(core.getBundledSkillRank(), 600, "默认或对齐官方导出的 BUNDLED_SKILL_RANK 应当为 600");
  assert.equal(core.getBundledSkillRank(emptyHome), 600, "baseDir 无效时优雅回退到 600");

  console.log("── 5. 官方 Office 技能命名规范与过滤判定测试 ──");
  assert.ok(Array.isArray(core.KNOWN_OFFICE_SKILL_NAMES), "应当导出 KNOWN_OFFICE_SKILL_NAMES 列表");
  assert.deepEqual(
    [...core.KNOWN_OFFICE_SKILL_NAMES].sort(),
    ["office", "office-docx", "office-pptx", "office-xlsx"],
    "已知白名单应包含官方定义的 4 个 Office 技能",
  );
  assert.equal(typeof core.isOfficialOfficeSkillName, "function", "应当导出 isOfficialOfficeSkillName 函数");
  assert.equal(core.isOfficialOfficeSkillName("office"), true, "office 必须判定为合法");
  assert.equal(core.isOfficialOfficeSkillName("office-docx"), true, "office-docx 必须判定为合法");
  assert.equal(core.isOfficialOfficeSkillName("office-pptx"), true, "office-pptx 必须判定为合法");
  assert.equal(core.isOfficialOfficeSkillName("office-xlsx"), true, "office-xlsx 必须判定为合法");
  assert.equal(core.isOfficialOfficeSkillName("office-chart"), true, "前向兼容合法的 office-xxx 技能");
  assert.equal(core.isOfficialOfficeSkillName("office-pdf"), true, "前向兼容合法的 office-xxx 技能");
  assert.equal(core.isOfficialOfficeSkillName("collision-dsh-office"), false, "必须拦截 collision-dsh-office 脏目录");
  assert.equal(core.isOfficialOfficeSkillName("test-office"), false, "必须拦截 test-office 目录");
  assert.equal(core.isOfficialOfficeSkillName("dummy"), false, "必须拦截无关名称");

  console.log("── 6. 确定性端到端解析验证（解耦真实系统环境） ──");
  core.clearOfficeSkillsDirCache();
  delete process.env.DSH_OFFICE_SKILLS_DIR;
  const resolvedWeb = core.resolveOfficeSkillsDir({
    platform: "win32",
    execPath: join(tempDir, "node_global", "node.exe"),
    argv: [join(tempDir, "node_global", "node.exe"), join(tempDir, "dsh-web-start.js")],
    homedir: tempDir,
  });
  assert.equal(resolvedWeb, mockGlobalDir, "Web 宿主必须精准 resolve 到全局目录");

  core.clearOfficeSkillsDirCache();
  const resolvedDesktop = core.resolveOfficeSkillsDir({
    platform: "win32",
    resourcesPath: join(tempDir, "desktop-app", "resources"),
    execPath: join(tempDir, "desktop-app", "DSH Codex Desktop.exe"),
    argv: [join(tempDir, "desktop-app", "DSH Codex Desktop.exe")],
    homedir: tempDir,
  });
  assert.equal(resolvedDesktop, mockAppAsarUnpacked, "桌面宿主必须精准 resolve 到桌面自身打包资源");

  console.log("探测测试全部通过！");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
