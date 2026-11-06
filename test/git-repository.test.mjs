// 验证支持多种 Git 托管平台（Gitee、GitLab 等）、加速代理地址及 Git 获取与大小限制。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
import http from "node:http";

const sandbox = await mkdtemp(join(tmpdir(), "dssm-git-repo-test-"));
process.env.DSH_HOME = join(sandbox, "home");
process.env.USERPROFILE = join(sandbox, "user");

try {
  const { parseGitUrl, fetchGitRepository, sparseFetchGitRepository, skillCheckoutPatterns, probeGitRemote, probeGitHubHttp } = await import("../lib/repository-git.js");
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

  // 9. 稀疏检出（Issue #79）：GitHub 仓库只下载技能目录，README 封面图等无关内容不参与传输
  assert.deepEqual(
    skillCheckoutPatterns(["README.md", "docs/a.png", "skills/pdf/SKILL.md", "skills/pdf/a.txt", "skills/docx/x/SKILL.md", "skills/pdf/sub/b.txt"]),
    ["/skills/docx/x/**", "/skills/pdf/**"],
    "每个技能目录生成一条根锚定规则，嵌套技能目录由父规则覆盖"
  );
  assert.deepEqual(skillCheckoutPatterns(["skills/a/SKILL.md", "skills/a/inner/SKILL.md"]), ["/skills/a/**"], "祖先规则已覆盖的嵌套技能不重复出规则");
  assert.equal(skillCheckoutPatterns(["SKILL.md", "docs/a.png", "skills/pdf/SKILL.md"]), null, "根级技能需要整库文件，不启用稀疏检出");
  assert.deepEqual(skillCheckoutPatterns(["skills/pdf/SKILL.md", "other/x/SKILL.md"], "skills"), ["/skills/pdf/**"], "子目录筛选只保留范围内的技能目录");
  assert.deepEqual(skillCheckoutPatterns(["skills/we[ir]d/SKILL.md"]), ["/skills/we\\[ir\\]d/**"], "通配字符必须转义，避免仓库内目录名改写规则");
  assert.deepEqual(skillCheckoutPatterns(["README.md", "docs/a.png"]), ["/.dsh-skills-manager-empty/**"], "无技能仓库检出空工作树，不下载整库");
  assert.throws(() => skillCheckoutPatterns(["skills/../x/SKILL.md"]), /路径/, "不安全路径不得变成检出规则");

  const sparseRemoteDir = join(sandbox, "sparse-remote-repo");
  await mkdir(join(sparseRemoteDir, "skills/alpha"), { recursive: true });
  await mkdir(join(sparseRemoteDir, "skills/beta/nested"), { recursive: true });
  await mkdir(join(sparseRemoteDir, "skills/we[ir]d"), { recursive: true });
  await mkdir(join(sparseRemoteDir, "docs"), { recursive: true });
  execFileSync("git", ["init"], { cwd: sparseRemoteDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: sparseRemoteDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: sparseRemoteDir, stdio: "ignore" });
  await writeFile(join(sparseRemoteDir, "skills/alpha/SKILL.md"), skillDoc, "utf8");
  await writeFile(join(sparseRemoteDir, "skills/alpha/reference.txt"), "稀疏资源", "utf8");
  await writeFile(join(sparseRemoteDir, "skills/beta/nested/SKILL.md"), "---\nname: beta-nested\ndescription: 嵌套技能\n---\n正文\n", "utf8");
  await writeFile(join(sparseRemoteDir, "skills/we[ir]d/SKILL.md"), "---\nname: weird\ndescription: 通配名技能\n---\n正文\n", "utf8");
  await writeFile(join(sparseRemoteDir, "docs/k-dense-web.gif"), "整段仓库封面动图占位".repeat(64), "utf8");
  await writeFile(join(sparseRemoteDir, "README.md"), "# 仓库首页", "utf8");
  execFileSync("git", ["add", "."], { cwd: sparseRemoteDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "sparse fixture"], { cwd: sparseRemoteDir, stdio: "ignore" });
  const sparseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sparseRemoteDir, encoding: "utf8" }).trim();

  async function listFiles(dir) {
    const found = [];
    async function walk(current, prefix = "") {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(join(current, entry.name), rel);
        else found.push(rel);
      }
    }
    await walk(dir);
    return found.sort();
  }

  const sparseDest = join(sandbox, "sparse-target");
  const sparseFetchRes = await sparseFetchGitRepository(
    { owner: "local", name: "sparse-remote-repo", ref: "", subdirectory: "", url: sparseRemoteDir },
    sparseDest,
    { maxBytes: 10 * 1024 * 1024 }
  );
  assert.equal(sparseFetchRes.commit, sparseSha, "稀疏检出返回提交 SHA");
  assert.deepEqual(
    await listFiles(sparseDest),
    ["skills/alpha/SKILL.md", "skills/alpha/reference.txt", "skills/beta/nested/SKILL.md", "skills/we[ir]d/SKILL.md"],
    "只检出技能目录内容，README 与仓库图片不落地"
  );

  // 子目录限定：只检出范围内的技能
  const sparseSubDest = join(sandbox, "sparse-subdir-target");
  await sparseFetchGitRepository(
    { owner: "local", name: "sparse-remote-repo", ref: "", subdirectory: "skills/beta", url: sparseRemoteDir },
    sparseSubDest,
    {}
  );
  assert.deepEqual(await listFiles(sparseSubDest), ["skills/beta/nested/SKILL.md"], "子目录外的技能不参与检出");

  // 配额防御沿用 Git 路径口径：超限时给出专用错误码
  const sparseTinyDest = join(sandbox, "sparse-tiny-target");
  await assert.rejects(
    sparseFetchGitRepository({ owner: "local", name: "sparse-remote-repo", ref: "", subdirectory: "", url: sparseRemoteDir }, sparseTinyDest, { maxBytes: 8 }),
    (err) => err.code === "error.repo.tooLarge" || err.code === "error.repo.transientTooLarge",
    "稀疏检出仍受 maxBytes 配额约束"
  );

  // 根级 SKILL.md 的仓库必须完整检出，不能把 README 之类的资源漏掉
  const rootSkillDir = join(sandbox, "root-skill-repo");
  await mkdir(join(rootSkillDir, "references"), { recursive: true });
  execFileSync("git", ["init"], { cwd: rootSkillDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: rootSkillDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: rootSkillDir, stdio: "ignore" });
  await writeFile(join(rootSkillDir, "SKILL.md"), "---\nname: root-skill\ndescription: 根级技能\n---\n正文\n", "utf8");
  await writeFile(join(rootSkillDir, "references/guide.md"), "整库资源", "utf8");
  execFileSync("git", ["add", "."], { cwd: rootSkillDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "root skill"], { cwd: rootSkillDir, stdio: "ignore" });
  const rootSkillDest = join(sandbox, "root-skill-target");
  await sparseFetchGitRepository({ owner: "local", name: "root-skill-repo", ref: "", subdirectory: "", url: rootSkillDir }, rootSkillDest, {});
  assert.deepEqual(await listFiles(rootSkillDest), ["SKILL.md", "references/guide.md"], "根级技能不启用稀疏检出，整库文件都要落地");

  // 10. 管理器分支：GitHub 来源优先稀疏检出，无 Git 才回落归档
  const sparseOnlyManager = createRepositoryManager({
    fetchImpl: async () => { throw new Error("稀疏检出成功时不应请求归档"); },
    sparseFetch: async (_repo, destinationDir) => {
      await mkdir(join(destinationDir, "skills/sparse-skill"), { recursive: true });
      await writeFile(join(destinationDir, "skills/sparse-skill/SKILL.md"), "---\nname: sparse-skill\ndescription: 稀疏技能\n---\n正文\n", "utf8");
      await writeFile(join(destinationDir, "skills/sparse-skill/asset.txt"), "稀疏资源", "utf8");
      return { commit: "d".repeat(40) };
    },
  });
  const sparseRepo = await sparseOnlyManager.add({ url: "example/sparse-repo", skipProbe: true });
  const sparseRefreshed = await sparseOnlyManager.refresh({ id: sparseRepo.id });
  assert.equal(sparseRefreshed.error, null, "稀疏检出成功时不应留下仓库错误");
  assert.equal(sparseRefreshed.commit, "d".repeat(40), "GitHub 来源以提交 SHA 锁定扫描版本");
  assert.equal(sparseRefreshed.skills.length, 1);
  const sparseInstalled = await sparseOnlyManager.install({ id: sparseRepo.id, path: "skills/sparse-skill" });
  assert.equal(sparseInstalled.name, "sparse-skill");
  assert.equal(
    await readFile(join(process.env.DSH_HOME, "skills/sparse-skill/asset.txt"), "utf8"),
    "稀疏资源",
    "安装直接复用稀疏检出目录，不再整库下载"
  );

  const archiveRequests = [];
  const fallbackManager = createRepositoryManager({
    fetchImpl: async (url) => { archiveRequests.push(url); return new Response(zipSync({ "r/skills/pdf/SKILL.md": strToU8("---\nname: pdf\ndescription: 归档技能\n---\n正文\n") })); },
    sparseFetch: async () => { throw Object.assign(new Error("未检测到 Git 命令行工具，请先安装 Git 后重试"), { code: "error.repo.noGit" }); },
  });
  const fallbackRepo = await fallbackManager.add({ url: "example/fallback-repo", skipProbe: true });
  const fallbackRefreshed = await fallbackManager.refresh({ id: fallbackRepo.id });
  assert.match(fallbackRefreshed.commit, /^[a-f0-9]{64}$/, "缺少 Git 时回落归档并以内容摘要锁定");
  assert.equal(fallbackRefreshed.skills.length, 1, "回落归档后仍能列出技能");
  assert.ok(archiveRequests.some((url) => url.startsWith("https://codeload.github.com/")), "回落路径请求 codeload 归档");

  const hardFailManager = createRepositoryManager({
    fetchImpl: async () => { throw new Error("配额超限不应改走归档下载"); },
    sparseFetch: async () => { throw Object.assign(new Error("仓库超过大小限制"), { code: "error.repo.tooLarge" }); },
  });
  const hardFailRepo = await hardFailManager.add({ url: "example/hard-fail-repo", skipProbe: true });
  const hardFailRefresh = await hardFailManager.refresh({ id: hardFailRepo.id });
  assert.equal(hardFailRefresh.error?.code, "error.repo.tooLarge", "体积配额错误不能被归档回落掩盖成另一个错误");

  console.log("Git 仓库地址解析、Git 检出、稀疏检出、配额防御与端到端管理测试通过");
} finally {
  // Windows 上超时分支用异步 taskkill 收尾，git 子进程退出前仍占着 deadline-test 目录，
  // 单次 rm 会撞 EBUSY；重试几次即可，否则整个沙箱会残留在 %TEMP%。
  await rm(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
