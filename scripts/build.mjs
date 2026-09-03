// 统一从 src 生成可发布的 lib，避免运行产物成为手工维护入口。

import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("lib", { recursive: true, force: true });

await build({
  entryPoints: ["src/core.js", "src/index.js"],
  outdir: "lib",
  outbase: "src",
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
});

await build({
  entryPoints: ["src/client.js"],
  outfile: "lib/client.js",
  bundle: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
});

console.log("[dsh-skills-manager] 已从 src 生成 Host 与客户端发布产物");
