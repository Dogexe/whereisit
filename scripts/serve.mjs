// Minimal static file server for dist/ -- used by playwright.config.js's
// webServer so E2E tests don't depend on a second language runtime just to
// serve static files. (Local manual dev testing still uses
// `python -m http.server`, per this repo's README/CLAUDE.md -- that's fine
// for a person at a terminal, but a CI job and `npm run test:e2e` shouldn't
// need python installed just to serve files Node can serve itself.)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../dist/", import.meta.url));
const PORT = Number(process.env.PORT) || 8793;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json"
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(normalize(ROOT))) { res.writeHead(403); res.end(); return; }
    const s = await stat(filePath).catch(() => null);
    const finalPath = s && s.isDirectory() ? join(filePath, "index.html") : filePath;
    const data = await readFile(finalPath);
    res.writeHead(200, { "Content-Type": MIME[extname(finalPath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Serving ${ROOT}${sep} at http://127.0.0.1:${PORT}`);
});
