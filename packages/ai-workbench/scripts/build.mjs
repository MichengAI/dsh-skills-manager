import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(packageRoot, "src");
const libDirectory = join(packageRoot, "lib");
const buildLockDirectory = join(packageRoot, ".lib-build.lock");
const buildLockOwner = join(buildLockDirectory, "owner.json");
const stagingPrefix = ".lib-staging-";
const backupPrefix = ".lib-backup-";

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function acquireBuildLock() {
  const owner = {
    pid: process.pid,
    token: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  for (;;) {
    let createdLockDirectory = false;
    try {
      await mkdir(buildLockDirectory);
      createdLockDirectory = true;
      await writeFile(buildLockOwner, JSON.stringify(owner), "utf8");
      return async () => {
        try {
          const currentOwner = JSON.parse(await readFile(buildLockOwner, "utf8"));
          if (currentOwner?.token === owner.token) {
            await rm(buildLockDirectory, { recursive: true, force: true });
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (createdLockDirectory) {
        await rm(buildLockDirectory, { recursive: true, force: true }).catch(() => {});
      }
      if (error.code !== "EEXIST") throw error;

      let currentOwner;
      try {
        currentOwner = JSON.parse(await readFile(buildLockOwner, "utf8"));
      } catch (readError) {
        throw new Error("[dsh-ai-workbench] build lock exists but owner metadata is unreadable", { cause: readError });
      }
      if (isProcessAlive(currentOwner?.pid)) {
        throw new Error(`[dsh-ai-workbench] build lock is held by process ${currentOwner.pid}`);
      }
      await rm(buildLockDirectory, { recursive: true, force: true });
    }
  }
}

async function findTransientDirectories(prefix) {
  let entries;
  try {
    entries = await readdir(packageRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => join(packageRoot, entry.name))
    .sort();
}

async function findBackupDirectories() {
  const backups = [];
  for (const path of await findTransientDirectories(backupPrefix)) {
    const metadata = await stat(path);
    backups.push({
      path,
      mtimeMs: metadata.mtimeMs,
      birthtimeMs: metadata.birthtimeMs,
    });
  }
  return backups.sort((left, right) =>
    right.mtimeMs - left.mtimeMs ||
    right.birthtimeMs - left.birthtimeMs ||
    right.path.localeCompare(left.path),
  );
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function recoverInterruptedPublish() {
  for (const stagingDirectory of await findTransientDirectories(stagingPrefix)) {
    await rm(stagingDirectory, { recursive: true, force: true });
  }

  const backupDirectories = await findBackupDirectories();
  if (backupDirectories.length === 0) return;

  if (await pathExists(libDirectory)) {
    for (const backupDirectory of backupDirectories) {
      await rm(backupDirectory.path, { recursive: true, force: true });
    }
    return;
  }

  const [backupToRestore, ...otherBackups] = backupDirectories;
  await rename(backupToRestore.path, libDirectory);
  for (const backupDirectory of otherBackups) {
    await rm(backupDirectory.path, { recursive: true, force: true });
  }
}

async function findJavaScriptFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findJavaScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

async function publish(stagingRoot, stagingLib) {
  const backupDirectory = join(packageRoot, `.lib-backup-${basename(stagingRoot)}`);
  let previousLibMoved = false;
  let newLibPublished = false;

  try {
    try {
      await rename(libDirectory, backupDirectory);
      previousLibMoved = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await rename(stagingLib, libDirectory);
    newLibPublished = true;
    await rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    if (newLibPublished) await rm(libDirectory, { recursive: true, force: true });
    if (previousLibMoved) await rename(backupDirectory, libDirectory);
    throw error;
  }
}

let releaseBuildLock;
let stagingRoot;
let stagingLib;
try {
  releaseBuildLock = await acquireBuildLock();
  await recoverInterruptedPublish();
  stagingRoot = await mkdtemp(join(packageRoot, stagingPrefix));
  stagingLib = join(stagingRoot, "lib");
  await mkdir(stagingLib, { recursive: true });
  const hostEntries = await findJavaScriptFiles(join(sourceRoot, "host"));
  const sharedEntries = await findJavaScriptFiles(join(sourceRoot, "shared"));
  const clientEntries = await findJavaScriptFiles(join(sourceRoot, "client"));

  await build({
    entryPoints: [join(sourceRoot, "index.js"), ...hostEntries, ...sharedEntries],
    outdir: stagingLib,
    outbase: sourceRoot,
    bundle: false,
    format: "esm",
    platform: "node",
    target: "node20",
  });
  await build({
    entryPoints: [join(packageRoot, "src/client.js")],
    outfile: join(stagingLib, "client.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
  });
  if (clientEntries.length > 0) {
    await build({
      entryPoints: clientEntries,
      outdir: join(stagingLib, "client"),
      outbase: join(sourceRoot, "client"),
      bundle: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
    });
  }

  if (process.env.DSH_AI_WORKBENCH_TEST_FAIL_BEFORE_PUBLISH === "1") {
    throw new Error("[dsh-ai-workbench] forced failure before publish");
  }

  await publish(stagingRoot, stagingLib);
  console.log("[dsh-ai-workbench] built host and client entries");
} finally {
  if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
  if (releaseBuildLock) await releaseBuildLock();
}
