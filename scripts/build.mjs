// Bundles src/ into dist/ and copies the static PWA shell files alongside it.
// dist/ is a self-contained, deployable mirror of the app: nothing outside
// this directory is needed to serve the site.
import { build } from "esbuild";
import { cpSync, rmSync, mkdirSync } from "node:fs";

const isProd = process.env.NODE_ENV === "production";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  outfile: "dist/main.js",
  format: "esm",
  target: ["es2020"],
  charset: "utf8",
  sourcemap: true,
  minify: isProd,
  logLevel: "info"
});

cpSync("index.html", "dist/index.html");
cpSync("privacy.html", "dist/privacy.html");
cpSync("landing", "dist/landing", { recursive: true });
cpSync("styles.css", "dist/styles.css");
cpSync("manifest.json", "dist/manifest.json");
cpSync("sw.js", "dist/sw.js");
cpSync("icons", "dist/icons", { recursive: true });
