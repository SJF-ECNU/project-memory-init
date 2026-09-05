import esbuild from "esbuild";
import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const outputDirectory = ".test-build";
const testNames = ["graph-model", "graph-motion", "constellation-view"];

await esbuild.build({
  entryPoints: ["src/graph-model.test.ts", "src/graph-motion.test.ts", "src/constellation-view.test.mjs"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outdir: outputDirectory,
  outExtension: { ".js": ".cjs" },
  logLevel: "warning",
  plugins: [{
    name: "obsidian-test-host",
    setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({
        path: "obsidian", namespace: "test-host",
      }));
      build.onLoad({ filter: /.*/, namespace: "test-host" }, () => ({
        contents: "export class ItemView {} export class TFile {} export function setIcon() {}",
        loader: "js",
      }));
    },
  }],
});

const result = spawnSync(process.execPath, [
  "--test", ...testNames.map((name) => `${outputDirectory}/${name}.test.cjs`),
], {
  stdio: "inherit",
});

await rm(outputDirectory, { recursive: true, force: true });
process.exit(result.status ?? 1);
