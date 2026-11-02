import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
if (!["css", "js"].includes(mode)) throw new Error("Usage: node scripts/build_assets.mjs css|js");

await build({
  absWorkingDir: root,
  entryPoints: mode === "css" ? ["src/styles.css"] : ["src/app.ts", "src/bootstrap.ts"],
  outdir: `assets/${mode}`,
  bundle: true,
  ...(mode === "js" ? { format: "iife" } : {}),
  minify: true,
  target: mode === "css" ? ["chrome110", "firefox115", "safari16.4"] : "es2020",
  // Asset URLs are authored relative to the output CSS directory, not src/.
  plugins: mode === "css" ? [{
    name: "local-asset-urls",
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => args.kind === "url-token" ? { path: args.path, external: true } : null);
    },
  }] : [],
  logLevel: "info",
});
