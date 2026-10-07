// Exercise both configured roots without touching any real agent skills.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";

const sandbox = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "dssm-targets-"));
process.env.DSH_HOME = join(sandbox, "dsh");
process.env.DSH_AGENTS_HOME = join(sandbox, "agents");
process.env.USERPROFILE = join(sandbox, "user");
const { createRepositoryManager } = await import("../lib/repositories.js");
const { userRoots, state, listTrash, permanentlyDeleteTrash, deleteSkill, importUploadedSkill } = await import("../lib/core.js");
const doc = name => strToU8(`---\nname: ${name}\ndescription: Test install destinations\n---\nTest instructions\n`);
let archive;
const snapshot = text => zipSync({
  "root/shared/SKILL.md": doc("shared-demo"), "root/shared/resources/help.txt": strToU8(text),
  "root/default/SKILL.md": doc("default-demo"), "root/blocked/SKILL.md": doc("blocked-demo"),
  "root/concurrent/SKILL.md": doc("concurrent-demo"),
});
archive = snapshot("v1");
const manager = createRepositoryManager({ fetchImpl: async () => new Response(archive) });
const restoreTrash = id => manager.restoreTrash(id);
const root = key => userRoots().find(item => item.key === key);
const exists = path => fs.lstat(path).then(() => true, () => false);
const stateFile = join(process.env.DSH_HOME, "skills-manager/repositories.json");
try {
  const repo = await manager.add({ url: "example/targets" });
  await manager.refresh({ id: repo.id });
  const skill = async name => (await manager.list()).repositories[0].skills.find(item => item.name === name);
  for (const invalid of [null, "claude", "../agents", "/tmp/skills", {}, false])
    await assert.rejects(manager.install({ id: repo.id, path: "shared", root: invalid }), error => error.code === "error.repo.invalid");
  await assert.rejects(manager.uninstall({ id: repo.id, path: "shared" }), /安装记录/);

  const installed = await manager.install({ id: repo.id, path: "shared", root: "agents" });
  assert.equal(installed.root, root("agents").path);
  assert.equal(await exists(join(root("dsh").path, "shared-demo")), false);
  assert.equal(await fs.readFile(join(root("agents").path, "shared-demo/resources/help.txt"), "utf8"), "v1");
  assert.equal((await skill("shared-demo")).installedRoot, "agents");
  assert.equal((await skill("shared-demo")).status, "installed");
  assert.equal((await skill("shared-demo")).canUninstall, true);
  assert.equal((await manager.sources())["shared-demo"].root, "agents");
  const policy = JSON.parse(await fs.readFile(join(process.env.DSH_HOME, "skills-manager/state.json"), "utf8"));
  assert.ok(policy.enabledSkills.agents.includes("shared-demo"));
  assert.equal((await state()).roots.find(item => item.key === "agents").mutable, false, "general Shared Agent source stays read-only");
  assert.equal((await deleteSkill(root("agents"), "shared-demo")).ok, false);
  const deniedImport = await importUploadedSkill({ name: "blocked-demo", entries: [{ path: "SKILL.md", data: Buffer.from(doc("blocked-demo")).toString("base64") }] }, undefined, { root: root("agents") });
  assert.equal(deniedImport.ok, false, "generic import cannot write an external root");

  archive = snapshot("v2");
  await manager.refresh({ id: repo.id });
  assert.equal((await skill("shared-demo")).status, "update");
  assert.equal((await skill("shared-demo")).canUninstall, true);
  const preview = await manager.preview({ id: repo.id, path: "shared" });
  await manager.update({ id: repo.id, path: "shared", token: preview.token });
  assert.equal(await fs.readFile(join(root("agents").path, "shared-demo/resources/help.txt"), "utf8"), "v2");
  const rollback = await manager.preview({ id: repo.id, path: "shared", rollback: true });
  await manager.rollback({ id: repo.id, path: "shared", token: rollback.token });
  assert.equal(await fs.readFile(join(root("agents").path, "shared-demo/resources/help.txt"), "utf8"), "v1");

  await fs.writeFile(join(root("agents").path, "shared-demo/local.txt"), "preserve edits");
  assert.equal((await skill("shared-demo")).status, "conflict");
  assert.equal((await skill("shared-demo")).canUninstall, true);
  // Retirement must be durable before moving the installed folder.
  const renameBeforeRetirement = fs.rename;
  fs.rename = async (from, to) => { if (to === stateFile) throw new Error("retirement write failed"); return renameBeforeRetirement(from, to); };
  try { await assert.rejects(manager.uninstall({ id: repo.id, path: "shared" }), /retirement write failed/); }
  finally { fs.rename = renameBeforeRetirement; }
  assert.equal(await exists(join(root("agents").path, "shared-demo")), true);
  assert.equal((await skill("shared-demo")).canUninstall, true);
  assert.equal((await listTrash()).length, 0);

  const renameBeforeMove = fs.rename;
  fs.rename = async (from, to) => { if (from === join(root("agents").path, "shared-demo")) throw new Error("trash move failed"); return renameBeforeMove(from, to); };
  try { await assert.rejects(manager.uninstall({ id: repo.id, path: "shared" }), /trash move failed/); }
  finally { fs.rename = renameBeforeMove; }
  assert.equal((await skill("shared-demo")).canUninstall, true, "rolled-back uninstall restores ownership of the unchanged original");

  const trashed = await manager.uninstall({ id: repo.id, path: "shared", root: "dsh", name: "unrelated" });
  assert.equal(trashed.root.key, "agents", "uninstall ignores client-provided root/name");
  assert.equal(await exists(join(root("agents").path, "shared-demo")), false);
  assert.equal((await skill("shared-demo")).status, "available");
  assert.equal((await skill("shared-demo")).canUninstall, false);
  assert.ok((await listTrash()).some(item => item.id === trashed.id && item.root.key === "agents"));
  await assert.rejects(manager.uninstall({ id: repo.id, path: "shared" }));
  const externalCopy = join(root("agents").path, "shared-demo");
  await fs.mkdir(externalCopy);
  await fs.writeFile(join(externalCopy, "SKILL.md"), doc("shared-demo"));
  await fs.writeFile(join(externalCopy, "external.txt"), "installed by another agent");
  assert.equal((await skill("shared-demo")).canUninstall, false, "a replacement does not inherit retired ownership");
  assert.equal((await skill("shared-demo")).tracked, false);
  assert.equal((await manager.sources())["shared-demo"], undefined);
  await assert.rejects(manager.uninstall({ id: repo.id, path: "shared" }), /安装记录/);
  await assert.rejects(manager.preview({ id: repo.id, path: "shared" }), /安装记录/);
  await assert.rejects(manager.rollback({ id: repo.id, path: "shared", token: "stale" }), /安装记录/);
  assert.equal((await restoreTrash(trashed.id)).code, "error.trash.conflict");
  assert.equal((await skill("shared-demo")).canUninstall, false, "failed restore does not activate replacement ownership");
  assert.equal(await fs.readFile(join(externalCopy, "external.txt"), "utf8"), "installed by another agent");
  assert.equal(await fs.realpath(externalCopy), join(await fs.realpath(root("agents").path), "shared-demo"));
  await fs.rm(externalCopy, { recursive: true });

  // If final provenance persistence fails after restore, recover only the
  // explicitly journalled restored contents, including local edits.
  const renameBeforeRestore = fs.rename;
  let restoreWrites = 0;
  fs.rename = async (from, to) => { if (to === stateFile && ++restoreWrites === 2) throw new Error("restore final write failed"); return renameBeforeRestore(from, to); };
  try { await assert.rejects(restoreTrash(trashed.id), error => error.code === "error.repo.installState"); }
  finally { fs.rename = renameBeforeRestore; }
  assert.ok(JSON.parse(await fs.readFile(stateFile, "utf8")).installs.find(item => item.name === "shared-demo").trashId);
  assert.equal((await skill("shared-demo")).canUninstall, true, "an explicit successful restore recovers its exact provenance after write failure");
  assert.equal(await fs.readFile(join(root("agents").path, "shared-demo/local.txt"), "utf8"), "preserve edits");
  assert.equal((await skill("shared-demo")).canUninstall, true);
  assert.ok((await manager.preview({ id: repo.id, path: "shared" })).localModified, "restoring preserves update provenance");

  await fs.rm(join(root("agents").path, "shared-demo/SKILL.md"));
  assert.equal((await skill("shared-demo")).canUninstall, true, "damaged installed folder can still be safely trashed");
  const damaged = await manager.uninstall({ id: repo.id, path: "shared" });
  await restoreTrash(damaged.id);
  await fs.writeFile(join(root("agents").path, "shared-demo/SKILL.md"), doc("shared-demo"));

  const sibling = join(root("agents").path, "shared-demo.md");
  await fs.writeFile(sibling, "not part of this installation");
  const folderOnly = await manager.uninstall({ id: repo.id, path: "shared" });
  assert.equal(await fs.readFile(sibling, "utf8"), "not part of this installation");
  await fs.rm(sibling);
  await restoreTrash(folderOnly.id);

  const outside = join(sandbox, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(join(outside, "important.txt"), "do not delete");
  const link = join(root("agents").path, "shared-demo/linked");
  await fs.symlink(outside, link);
  assert.equal((await skill("shared-demo")).canUninstall, false, "unsafe trees are never offered for deletion");
  await assert.rejects(manager.uninstall({ id: repo.id, path: "shared" }), /链接/);
  await fs.unlink(link);
  assert.equal(await fs.readFile(join(outside, "important.txt"), "utf8"), "do not delete");

  const legacy = await manager.install({ id: repo.id, path: "default" });
  assert.equal(legacy.root, root("dsh").path);
  const stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
  delete stored.installs.find(item => item.name === "default-demo").root;
  await fs.writeFile(stateFile, JSON.stringify(stored));
  assert.equal((await skill("default-demo")).installedRoot, "dsh", "legacy records stay compatible");
  const deletedLegacy = await manager.uninstall({ id: repo.id, path: "default" });
  await restoreTrash(deletedLegacy.id);
  assert.equal((await skill("default-demo")).status, "installed");

  // Existing generic DSH Delete -> Restore remains compatible with a moved
  // DSH_HOME represented by a directory symlink (skills itself is real).
  const originalDshHome = process.env.DSH_HOME;
  const linkedDshHome = join(sandbox, "linked-dsh-home");
  await fs.symlink(originalDshHome, linkedDshHome);
  process.env.DSH_HOME = linkedDshHome;
  try {
    const deleted = await deleteSkill(root("dsh"), "default-demo");
    assert.ok(deleted.id);
    const healthyRepositories = await fs.readFile(stateFile, "utf8");
    await fs.writeFile(stateFile, "{corrupt");
    try {
      const restored = await manager.restoreTrash(deleted.id);
      assert.equal(restored.root.key, "dsh", "ordinary restore neither reads repository state nor runs its recovery");
      assert.equal(await exists(join(root("dsh").path, "default-demo/SKILL.md")), true);
    } finally { await fs.writeFile(stateFile, healthyRepositories); }
  } finally { process.env.DSH_HOME = originalDshHome; }

  const concurrent = await Promise.allSettled([
    manager.install({ id: repo.id, path: "concurrent", root: "agents" }),
    manager.install({ id: repo.id, path: "concurrent", root: "dsh" }),
  ]);
  assert.equal(concurrent.filter(item => item.status === "fulfilled").length, 1, "no cross-root duplicate installations");

  // Fail enable-state persistence: copied Shared Agent folder must be removed.
  const originalRename = fs.rename;
  fs.rename = async (from, to) => { if (to.endsWith("state.json")) throw new Error("enable write failed"); return originalRename(from, to); };
  try { await assert.rejects(manager.install({ id: repo.id, path: "blocked", root: "agents" })); }
  finally { fs.rename = originalRename; }
  assert.equal(await exists(join(root("agents").path, "blocked-demo")), false);

  // Configured Shared Agent home must not be a link redirecting writes.
  const safeAgentsHome = process.env.DSH_AGENTS_HOME;
  const linkedHome = join(sandbox, "linked-home");
  await fs.symlink(outside, linkedHome);
  process.env.DSH_AGENTS_HOME = linkedHome;
  try { await assert.rejects(manager.install({ id: repo.id, path: "blocked", root: "agents" })); }
  finally { process.env.DSH_AGENTS_HOME = safeAgentsHome; }
  assert.equal(await exists(join(outside, "skills/blocked-demo")), false);

  await fs.mkdir(join(root("agents").path, "blocked-demo"));
  await fs.writeFile(join(root("agents").path, "blocked-demo/SKILL.md"), doc("blocked-demo"));
  assert.equal((await skill("blocked-demo")).canUninstall, false, "untracked local skills are protected");
  await assert.rejects(manager.uninstall({ id: repo.id, path: "blocked" }), /安装记录/);

  // A known-denied restore whose journal-clear fails is not a successful
  // restore. Permanent Trash deletion must never resurrect that ownership,
  // even if another agent independently installs byte-identical files.
  const retiredDefault = await manager.uninstall({ id: repo.id, path: "default" });
  const identicalExternal = join(root("dsh").path, "default-demo");
  await fs.mkdir(identicalExternal);
  await fs.writeFile(join(identicalExternal, "SKILL.md"), doc("default-demo"));
  const renameBeforeConflict = fs.rename;
  let conflictWrites = 0;
  fs.rename = async (from, to) => { if (to === stateFile && ++conflictWrites === 2) throw new Error("conflict journal clear failed"); return renameBeforeConflict(from, to); };
  try { await assert.rejects(manager.restoreTrash(retiredDefault.id), /conflict journal clear failed/); }
  finally { fs.rename = renameBeforeConflict; }
  assert.equal((await skill("default-demo")).canUninstall, false);
  await permanentlyDeleteTrash(retiredDefault.id);
  assert.equal((await skill("default-demo")).canUninstall, false, "permanent deletion is not a restore receipt");
  assert.equal((await manager.sources())["default-demo"], undefined);
  await assert.rejects(manager.uninstall({ id: repo.id, path: "default" }), /安装记录/);
  await assert.rejects(manager.preview({ id: repo.id, path: "default" }), /安装记录/);
  assert.deepEqual(await fs.readFile(join(identicalExternal, "SKILL.md")), Buffer.from(doc("default-demo")));

  const validState = await fs.readFile(stateFile, "utf8");
  const invalidState = JSON.parse(validState);
  invalidState.installs[0].root = "../../outside";
  await fs.writeFile(stateFile, JSON.stringify(invalidState));
  await assert.rejects(manager.list(), error => error.code === "error.repo.state");
  await fs.writeFile(stateFile, validState);
  console.log("Install targets, Shared Agent updates/rollback, uninstall/Trash restore, legacy compatibility and security boundaries passed");
} finally {
  assert.equal(await fs.realpath(sandbox), sandbox);
  await fs.rm(sandbox, { recursive: true, force: true });
}
