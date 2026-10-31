// 验证支持多种 Git 托管平台（Gitee、GitLab 等）、加速代理地址及 Git 获取与大小限制。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const sandbox = await mkdtemp(join(tmpdir(), "dssm-git-repo-test-"));
process.env.DSH_HOME = join(sandbox, "home");
process.env.USERPROFILE = join(sandbox, "user");

try {
  const { parseGitUrl, fetchGitRepository } = await import("../lib/repository-git.js");
  const { parseRepositoryInput, createRepositoryManager } = await import("../lib/repositories.js");
  const { installationSourceKey } = await import("../lib/repository-updates.js");

  // 1. 地址解析测试
  // GitHub 简写与标准地址保持旧结构（不带 url 字段，确保历史 ID 不漂移）
  const ghShort = parseRepositoryInput({ url: "example/skills" });
  assert.deepEqual(ghShort, { owner: "example", name: "skills", ref: "", subdirectory: "" });
  assert.equal(ghShort.url, undefined, "GitHub 简写不携带额外 url 字段");

  const ghStandard = parseRepositoryInput({ url: "https://github.com/Example/Skills/tree/main/skills" });
  assert.deepEqual(ghStandard, { owner: "example", name: "skills", ref: "main", subdirectory: "skills" });
  assert.equal(ghStandard.url, undefined, "GitHub 标准地址保持旧结构");

  // Gitee 仓库地址
  const gitee = parseRepositoryInput({ url: "https://gitee.com/org-name/skill-repo.git" });
  assert.equal(gitee.owner, "org-name");
  assert.equal(gitee.name, "skill-repo");
  assert.equal(gitee.url, "https://gitee.com/org-name/skill-repo.git");

  // GitLab 多层路径
  const gitlab = parseRepositoryInput({ url: "https://gitlab.example.com/team/subgroup/project.git" });
  assert.equal(gitlab.owner, "team/subgroup");
  assert.equal(gitlab.name, "project");
  assert.equal(gitlab.url, "https://gitlab.example.com/team/subgroup/project.git");

  // 加速站前缀地址（例如 gh-proxy）
  const proxyUrl = "https://gh-proxy.com/https://github.com/Unclecheng-li/AI_Animation.git";
  const proxy = parseRepositoryInput({ url: proxyUrl });
  assert.equal(proxy.owner, "unclecheng-li", "加速前缀应正确提取真实 owner，而不是代理协议头");
  assert.equal(proxy.name, "ai_animation", "加速前缀应正确提取真实 name");
  assert.equal(proxy.url, proxyUrl, "保留完整加速代理下载地址");

  // 安全拦截：带凭据、危险协议、非法参数开头
  for (const invalid of [
    "https://user:password123@gitee.com/a/b",
    "https://token@gitlab.com/a/b",
    "-oProxyCommand=calc.exe",
    "ext::sh -c calc",
    "ftp://gitee.com/a/b",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => parseRepositoryInput({ url: invalid }), /仓库|安全|密码/);
  }

  // 2. 本地真实 Git 仓库获取与大小限制测试
  const remoteDir = join(sandbox, "remote-repo");
  await mkdir(join(remoteDir, "skills/test-skill"), { recursive: true });
  execFileSync("git", ["init"], { cwd: remoteDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: remoteDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: remoteDir, stdio: "ignore" });

  const skillDoc = `---\nname: git-test-skill\ndescription: 测试 Git 仓库技能\n---\n## 技能正文\n内容已成功通过 Git 检出。\n`;
  await writeFile(join(remoteDir, "skills/test-skill/SKILL.md"), skillDoc, "utf8");
  await writeFile(join(remoteDir, "skills/test-skill/reference.txt"), "Git 仓库资源数据", "utf8");
  execFileSync("git", ["add", "."], { cwd: remoteDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial commit"], { cwd: remoteDir, stdio: "ignore" });
  const realCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: remoteDir, encoding: "utf8" }).trim();

  // 验证 fetchGitRepository
  const checkoutDest = join(sandbox, "checkout-target");
  const fetchRes = await fetchGitRepository(
    { owner: "local", name: "remote-repo", ref: "", subdirectory: "", url: remoteDir },
    checkoutDest,
    { maxBytes: 10 * 1024 * 1024 }
  );
  assert.equal(fetchRes.commit, realCommitSha, "获取到的提交号与本地仓库 HEAD 一致");
  assert.equal(await readFile(join(checkoutDest, "skills/test-skill/SKILL.md"), "utf8"), skillDoc);

  // 验证超限拦截
  const tinyDest = join(sandbox, "checkout-tiny");
  await assert.rejects(
    fetchGitRepository(
      { owner: "local", name: "remote-repo", ref: "", subdirectory: "", url: remoteDir },
      tinyDest,
      { maxBytes: 10 }
    ),
    (err) => err.code === "error.repo.tooLarge",
    "超出指定大小配额时应抛出 error.repo.tooLarge"
  );

  // 3. createRepositoryManager 完整集成测试（非 GitHub 来源与加速站）
  const manager = createRepositoryManager();

  // 添加不存在的远程仓库应在 add 阶段被拒绝，不能返回 200 或存入列表
  await assert.rejects(
    manager.add({ url: "https://gitee.com/demo-user/non-existent-skill-repo-404.git" }),
    /无法访问|不存在|error\.repo/,
    "不存在的仓库在 add() 探测阶段即被拦截"
  );

  const addedGitee = await manager.add({
    url: remoteDir,
    subdirectory: "skills",
  });
  assert.equal(addedGitee.name, "remote-repo");
  assert.equal(addedGitee.url, remoteDir);

  await manager.refresh({ id: addedGitee.id });
  const list = await manager.list();
  const foundRepo = list.repositories.find((r) => r.id === addedGitee.id);
  assert.ok(foundRepo, "仓库列表中应存在添加的 Gitee/Git 仓库");
  assert.equal(foundRepo.commit, realCommitSha);
  assert.equal(foundRepo.skills.length, 1);
  assert.equal(foundRepo.skills[0].name, "git-test-skill");

  // 安装技能
  const installed = await manager.install({ id: addedGitee.id, path: "skills/test-skill" });
  assert.equal(installed.name, "git-test-skill");
  const installedSkillFile = join(process.env.DSH_HOME, "skills/git-test-skill/SKILL.md");
  assert.equal(await readFile(installedSkillFile, "utf8"), skillDoc, "已成功安装由 Git 检出的技能内容");

  // 安装来源验证
  const sources = await manager.sources();
  const sourceKey = installationSourceKey(join(process.env.DSH_HOME, "skills"), "git-test-skill");
  assert.ok(sources[sourceKey], "应记录完整的安装来源");
  assert.equal(sources[sourceKey].url, remoteDir);

  console.log("Git 仓库地址解析、Git 检出、配额防御与端到端管理测试通过");
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
