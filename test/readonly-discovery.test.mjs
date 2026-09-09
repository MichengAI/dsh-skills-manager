// 只读技能发现回归：隔离用户目录，验证真实目录链接与策略，不触碰本机技能。
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temp = await mkdtemp(join(tmpdir(), "dssm-discovery-"));
process.env.USERPROFILE = join(temp, "home");
process.env.HOME = process.env.USERPROFILE;
process.env.DSH_HOME = join(temp, "dsh");
process.env.DSH_AGENTS_HOME = join(temp, "agents");
process.env.DSH_CODEX_HOME = join(temp, "codex");
const core = await import("../lib/core.js");
const linkType = process.platform === "win32" ? "junction" : "dir";
async function skill(path, name) {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "SKILL.md"),
    `---\nname: ${name}\ndescription: 回归技能\n---\n${name} 正文`,
    "utf8",
  );
  return path;
}
async function link(target, path) {
  await mkdir(join(path, ".."), { recursive: true });
  await symlink(target, path, linkType);
}
try {
  const roots = core.userRoots();
  const agents = roots.find((r) => r.key === "agents");
  const codex = roots.find((r) => r.key === "codex");
  const dsh = roots.find((r) => r.key === "dsh");
  const external = await skill(
    join(temp, "external", "review"),
    "external-review",
  );
  await link(external, join(agents.path, "alias"));
  assert.ok(
    (await core.scanEntries(agents.path)).entries.some(
      (e) => e.name === "alias",
    ),
    "默认发现未知外部目录链接",
  );
  assert.equal(
    (await core.skillDetail("agents", "alias")).body,
    "external-review 正文",
  );
  const candidate = (await core.listProviderCandidates()).find(
    (e) => e.name === "external-review",
  );
  assert.equal(
    (await core.getProviderSkill(candidate)).content,
    "external-review 正文",
  );
  assert.equal(
    (await core.deleteSkill(agents.path, "alias")).code,
    "error.root.readonly",
  );

  await link(external, join(codex.path, "group", "other-alias"));
  await core.setSkillEnabled(codex.path, "group/other-alias", false);
  assert.equal(
    (await core.readManagerState()).writable,
    true,
    "递归路径策略可往返保存",
  );
  assert.equal(
    (await core.listProviderCandidates()).find(
      (e) => e.name === "external-review",
    ).invocation.modelInvocable,
    false,
    "不同名称的分发入口继承停用",
  );
  assert.equal(
    (await core.skillDetail("codex", "group/other-alias")).code,
    "error.skill.notFound",
    "详情隐藏已去重入口",
  );
  await core.setSkillEnabled(agents.path, "alias", true);
  assert.equal(
    (await core.listProviderCandidates()).find(
      (e) => e.name === "external-review",
    ).invocation.modelInvocable,
    true,
  );
  assert.equal(
    await core.resolveEntry(agents.path, "../external/review"),
    null,
  );
  assert.equal(
    await core.resolveEntry(agents.path, "group/../../external/review"),
    null,
  );

  const nested = await skill(
    join(agents.path, "nested", "review"),
    "nested-review",
  );
  await link(join(agents.path, "nested"), join(agents.path, "nested", "loop"));
  await skill(join(agents.path, ".hidden", "secret"), "hidden-secret");
  const hiddenTarget = await skill(
    join(temp, ".hidden-target"),
    "visible-hidden-target",
  );
  await link(hiddenTarget, join(agents.path, "visible"));
  await skill(
    join(agents.path, "a", "b", "c", "d", "e", "f", "too-deep"),
    "too-deep",
  );
  const scan = await core.scanEntries(agents.path);
  assert.ok(scan.entries.some((e) => e.name === "nested/review"));
  assert.ok(scan.entries.some((e) => e.name === "visible"));
  assert.ok(
    !scan.entries.some(
      (e) =>
        e.name.includes("loop") ||
        e.name.includes(".hidden") ||
        e.declaredName === "too-deep",
    ),
  );
  assert.equal(scan.truncated, true, "超深目录报告扫描截断");
  assert.ok(
    (await core.state()).warnings.some(
      (w) => w.code === "warning.scan.truncated",
    ),
  );
  await core.setSkillEnabled(agents.path, "nested/review", false);
  assert.equal(
    (await core.listProviderCandidates()).find(
      (e) => e.name === "nested-review",
    ).invocation.userInvocable,
    false,
  );

  await link(join(temp, "missing-target"), join(agents.path, "broken"));
  assert.equal(
    await core.resolveEntry(agents.path, "broken"),
    null,
    "失效目录链接被忽略",
  );
  await mkdir(join(agents.path, "file-link"), { recursive: true });
  try {
    await symlink(
      join(external, "SKILL.md"),
      join(agents.path, "file-link", "SKILL.md"),
      "file",
    );
    assert.equal(
      await core.resolveEntry(agents.path, "file-link"),
      null,
      "不跟随 SKILL.md 文件链接",
    );
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOSYS"].includes(error.code)) throw error;
    console.log(
      "当前系统不允许创建文件软链接；仅此用例跳过，目录 junction 用例已执行",
    );
  }

  const rootTarget = await skill(join(temp, "whole-root"), "root-skill");
  await skill(join(rootTarget, "group", "child"), "root-child");
  process.env.DSH_GEMINI_HOME = join(temp, "gemini");
  const gemini = core.userRoots().find((r) => r.key === "gemini");
  await link(rootTarget, gemini.path);
  assert.ok(
    (await core.scanEntries(gemini.path)).entries.some(
      (e) => e.name === "group/child",
    ),
    "根技能与嵌套技能并存",
  );
  assert.equal(
    (await core.skillDetail("gemini", ".")).body,
    "root-skill 正文",
    "用户技能根本身可链接且根 SKILL.md 可读取",
  );
  await core.setSkillEnabled(gemini.path, ".", false);
  assert.equal((await core.readManagerState()).writable, true);
  assert.equal(
    (await core.listProviderCandidates()).find((e) => e.name === "root-skill")
      .invocation.userInvocable,
    false,
  );

  const project = join(temp, "project");
  await mkdir(join(project, ".git"), { recursive: true });
  await link(join(temp, "external"), join(project, ".agents", "skills"));
  const projectRoot = (await core.projectRoots([project])).find(
    (r) => r.kind === "project-agents",
  );
  assert.ok(projectRoot, "项目只读技能根本身允许链接");
  assert.equal(
    (
      await core.skillDetail(projectRoot.key, "review", {
        projectCwds: [project],
      })
    ).body,
    "external-review 正文",
  );
  const projectCandidate = (
    await core.listProviderCandidates({ cwd: project })
  ).find((e) => e.name === "external-review");
  assert.equal(projectCandidate.source, "project-agents");
  assert.equal(
    (await core.getProviderSkill(projectCandidate, { cwd: project })).content,
    "external-review 正文",
  );
  await core.setSkillEnabled(projectRoot, "review", false);
  assert.equal(
    (await core.listProviderCandidates({ cwd: project })).find(
      (e) => e.name === "external-review",
    ).invocation.userInvocable,
    false,
  );
  assert.equal(
    (await core.deleteSkill(projectRoot, "review")).code,
    "error.root.readonly",
  );
  await skill(join(projectRoot.path, "group", "project-only"), "project-only");
  const soleProject = (
    await core.listProviderCandidates({ cwd: project })
  ).find((e) => e.name === "project-only");
  assert.ok(soleProject, "没有同名冲突或显式策略时也提供项目只读候选");
  assert.equal(
    (await core.getProviderSkill(soleProject, { cwd: project })).content,
    "project-only 正文",
  );
  assert.equal(
    await core.getProviderSkill(soleProject, {
      cwd: join(temp, "other-project"),
    }),
    undefined,
    "项目候选不能跨工作区加载",
  );

  const overlapProject = join(temp, "linked-overlap-project");
  await mkdir(join(overlapProject, ".git"), { recursive: true });
  const staleRoot = (await core.projectRoots([overlapProject])).find(
    (r) => r.kind === "project-agents",
  );
  await link(agents.path, join(overlapProject, ".agents", "skills"));
  assert.ok(
    !(await core.projectRoots([overlapProject])).some(
      (r) => r.kind === "project-agents",
    ),
    "根 junction 指向用户来源时隐藏项目来源",
  );
  assert.equal(
    (await core.setSkillEnabled(staleRoot, "nested/review", true)).code,
    "error.root.unsafe",
    "链接重叠后旧项目 key 也不可修改策略",
  );
  const overlapCandidate = (
    await core.listProviderCandidates({ cwd: overlapProject })
  ).find((e) => e.name === "nested-review");
  assert.equal(
    overlapCandidate.invocation.modelInvocable,
    false,
    "链接项目根不能绕过用户停用",
  );

  await link(external, join(dsh.path, "external"));
  assert.equal(
    await core.resolveEntry(dsh.path, "external"),
    null,
    "可写 DSH 继续拒绝目录链接",
  );
  await rm(join(agents.path, "alias"));
  const replacement = await skill(join(temp, "replacement"), "external-review");
  await link(replacement, join(agents.path, "alias"));
  assert.equal(
    await core.getProviderSkill(candidate),
    undefined,
    "旧候选拒绝改指的链接",
  );
  assert.match(
    await readFile(join(external, "SKILL.md"), "utf8"),
    /external-review 正文$/,
  );

  // 真实宽目录验证预算，避免错误地把达到上限的扫描宣称为完整结果。
  const wide = join(temp, "wide");
  await mkdir(wide);
  for (let start = 0; start < 2005; start += 100) {
    await Promise.all(
      Array.from({ length: Math.min(100, 2005 - start) }, (_, i) =>
        mkdir(join(wide, `dir-${start + i}`)),
      ),
    );
  }
  const { discoverReadonlyEntries } = await import(
    "../lib/readonly-discovery.js"
  );
  assert.equal(
    (await discoverReadonlyEntries(wide)).truncated,
    true,
    "目录预算限制宽目录扫描",
  );
  const bounded = join(temp, "bounded");
  const bundle = await skill(join(bounded, "a-bundle"), "bundle-leaf");
  await link(wide, join(bundle, "references"));
  await skill(join(bundle, "scripts", "internal"), "internal-resource");
  await link(wide, join(bounded, "node_modules"));
  await skill(join(bounded, "z-group", "nested"), "after-resources");
  const boundedScan = await discoverReadonlyEntries(bounded);
  assert.deepEqual(
    boundedScan.entries.map((e) => e.name),
    ["a-bundle", "z-group/nested"],
    "bundle 资源和依赖树不作为技能扫描",
  );
  assert.equal(
    boundedScan.truncated,
    false,
    "bundle 资源和依赖树不占用遍历预算",
  );
  console.log("只读递归发现、外部链接、项目加载、策略与写边界回归通过");
} finally {
  await rm(temp, { recursive: true, force: true });
}
