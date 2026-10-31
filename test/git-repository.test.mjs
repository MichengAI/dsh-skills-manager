// 验证支持多种 Git 托管平台（Gitee、GitLab 等）、加速代理地址及 Git 获取与大小限制。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import http from "node:http";

const sandbox = await mkdtemp(join(tmpdir(), "dssm-git-repo-test-"));
process.env.DSH_HOME = join(sandbox, "home");
process.env.USERPROFILE = join(sandbox, "user");

try {
  const { parseGitUrl, fetchGitRepository, probeGitRemote, probeGitHubHttp } = await import("../lib/repository-git.js");
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
  execFileSync("git", ["tag", "-a", "v1.0.0", "-m", "version 1.0.0 tag"], { cwd: remoteDir, stdio: "ignore" });
  const realCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: remoteDir, encoding: "utf8" }).trim();

  // 验证 fetchGitRepository 及 Tag 引用解引用为 Commit SHA
  const checkoutDest = join(sandbox, "checkout-target");
  const fetchRes = await fetchGitRepository(
    { owner: "local", name: "remote-repo", ref: "v1.0.0", subdirectory: "", url: remoteDir },
    checkoutDest,
    { maxBytes: 10 * 1024 * 1024 }
  );
  assert.equal(fetchRes.commit, realCommitSha, "Tag 引用正确解引用为对应 Commit SHA");
  assert.equal(await readFile(join(checkoutDest, "skills/test-skill/SKILL.md"), "utf8"), skillDoc);

  // 验证超限拦截
  const tinyDest = join(sandbox, "checkout-tiny");
  await assert.rejects(
    fetchGitRepository(
      { owner: "local", name: "remote-repo", ref: "", subdirectory: "", url: remoteDir },
      tinyDest,
      { maxBytes: 10 }
    ),
    (err) => err.code === "error.repo.tooLarge" || err.code === "error.repo.transientTooLarge",
    "超出指定大小配额时应抛出 error.repo.tooLarge 或 error.repo.transientTooLarge"
  );

  // 3. createRepositoryManager 完整集成测试（非 GitHub 来源与加速站）
  const manager = createRepositoryManager();

  // 添加不存在的仓库应在 add 阶段被拒绝（本地非联网路径离线探测）
  const fakeLocal = join(sandbox, "non-existent-local-repo-404");
  await assert.rejects(
    manager.add({ url: fakeLocal }),
    /本地 Git 仓库路径不存在|无法访问|不存在|error\.repo/,
    "不存在的本地仓库在 add() 探测阶段即被拦截"
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

  // 验证 remove 仓库时清理磁盘快照缓存
  const cacheDir = join(process.env.DSH_HOME, "skills-manager/repository-cache");
  const cacheBeforeRemove = await readdir(cacheDir);
  assert.ok(cacheBeforeRemove.some((name) => name.startsWith(addedGitee.id)), "移除前磁盘上存在快照缓存");
  await manager.remove({ id: addedGitee.id });
  const cacheAfterRemove = await readdir(cacheDir);
  assert.ok(!cacheAfterRemove.some((name) => name.startsWith(addedGitee.id)), "移除后磁盘上的快照缓存已清理");

  // 4. probeGitHubHttp 单元测试（200放行、404拦截、网络异常宽容）
  await probeGitHubHttp("valid-owner", "valid-repo", async () => ({ status: 200 }));
  await assert.rejects(
    probeGitHubHttp("invalid-owner", "invalid-repo", async () => ({ status: 404 })),
    (err) => err.code === "error.repo.network",
    "GitHub 简写返回 404 时必须抛出 error.repo.network"
  );
  // 网络超时或 500 不硬阻断
  await probeGitHubHttp("err-owner", "err-repo", async () => { throw new Error("fetch failed"); });

  // 5. 并发 stage 目录隔离测试：pruneCache 不得清理其他仓库在途的 .stage- 目录
  await mkdir(cacheDir, { recursive: true });
  const otherRepoStage = join(cacheDir, ".stage-otherRepoA-inflight");
  const staleOrphanStage = join(cacheDir, ".stage-staleOrphan-old");
  await mkdir(otherRepoStage, { recursive: true });
  await mkdir(staleOrphanStage, { recursive: true });
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
  await utimes(staleOrphanStage, twoHoursAgo, twoHoursAgo);

  const testRepoB = await manager.add({ url: remoteDir, subdirectory: "skills" });
  await manager.refresh({ id: testRepoB.id });
  const cacheAfterRefresh = await readdir(cacheDir);
  assert.ok(cacheAfterRefresh.includes(".stage-otherRepoA-inflight"), "并发仓库在途的 .stage 目录不得被清理");
  assert.ok(!cacheAfterRefresh.includes(".stage-staleOrphan-old"), "超过 1 小时的孤儿 .stage 目录应被安全回收");
  await manager.remove({ id: testRepoB.id });

  // 6. 临时拉取缓冲（maxTransientBytes）与最终体积校验区分测试
  const transientDir = join(sandbox, "transient-test");
  await assert.rejects(
    fetchGitRepository(
      { owner: "local", name: "repo", ref: "master", subdirectory: "", url: remoteDir },
      transientDir,
      { maxBytes: 1000000, maxTransientBytes: 10 }
    ),
    (err) => err.code === "error.repo.transientTooLarge" && err.message.includes("临时下载体积过大"),
    "临时体积超出 maxTransientBytes 时抛出 error.repo.transientTooLarge"
  );
  const finalTooLargeDir = join(sandbox, "final-too-large-test");
  await assert.rejects(
    fetchGitRepository(
      { owner: "local", name: "repo", ref: "master", subdirectory: "", url: remoteDir },
      finalTooLargeDir,
      { maxBytes: 10, maxTransientBytes: 1000000 }
    ),
    (err) => err.code === "error.repo.tooLarge" && err.message.includes("仓库超过大小限制"),
    "解压后最终体积超出 maxBytes 时抛出 error.repo.tooLarge"
  );

  // 7. add 锁外网络探测并发测试：探测期间不阻塞其他只读请求
  const slowFetch = async (url) => {
    if (String(url).includes("slow-owner")) {
      await new Promise((r) => setTimeout(r, 140));
      return { status: 200 };
    }
    return { status: 200 };
  };
  const asyncManager = createRepositoryManager({ fetchImpl: slowFetch, probeRemote: true });
  const start = Date.now();
  const slowAddPromise = asyncManager.add({ url: "slow-owner/slow-repo" });
  const listDuringProbe = await asyncManager.list();
  const listDuration = Date.now() - start;
  assert.ok(listDuration < 100, `探测期间读取列表不应被阻塞，耗时: ${listDuration}ms`);
  const slowAdded = await slowAddPromise;
  assert.equal(slowAdded.name, "slow-repo");

  // 8. 共享 Deadline 递减测试：单次尝试耗尽总预算后立即终止，不进行重试累加
  const hangingServer = http.createServer((req, res) => {});
  await new Promise((resolve) => hangingServer.listen(0, "127.0.0.1", resolve));
  const hangPort = hangingServer.address().port;
  const deadlineTestDir = join(sandbox, "deadline-test");
  const dStart = Date.now();
  try {
    await assert.rejects(
      fetchGitRepository(
        { owner: "hang", name: "repo", ref: "multi-retry-ref", subdirectory: "", url: `http://127.0.0.1:${hangPort}/hang.git` },
        deadlineTestDir,
        { timeoutMs: 250 }
      ),
      (err) => err.code === "error.repo.network" && err.message.includes("Git 请求超时"),
      "挂起远端在达到总 deadline 时必须抛出超时且不应多次重试翻倍"
    );
    const dElapsed = Date.now() - dStart;
    assert.ok(dElapsed < 1100, `共享 deadline 耗尽后立即返回，不进行多分支重试累加，实际耗时: ${dElapsed}ms`);
  } finally {
    hangingServer.close();
  }

  console.log("Git 仓库地址解析、Git 检出、配额防御与端到端管理测试通过");
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
