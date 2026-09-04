import { mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm(new URL("../lib", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../lib", import.meta.url), { recursive: true });
await build({
  entryPoints: ["src/index.js"],
  outdir: "lib",
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
});
await build({
  entryPoints: ["src/client.js"],
  outfile: "lib/client.js",
  bundle: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
});
console.log("[dsh-ai-workbench] built host and client entries");
