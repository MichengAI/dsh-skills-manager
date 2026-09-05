import { mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { build } from "esbuild";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(packageRoot, "src");
const libDirectory = join(packageRoot, "lib");
const stagingRoot = await mkdtemp(join(packageRoot, ".lib-staging-"));
const stagingLib = join(stagingRoot, "lib");

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

async function publish() {
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

try {
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

  await publish();
  console.log("[dsh-ai-workbench] built host and client entries");
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
