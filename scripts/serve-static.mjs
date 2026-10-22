import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), ".output", "public");
const pagesBase = process.env.GITHUB_ACTIONS ? "/neko-nap" : "";
const port = Number(process.env.E2E_PORT || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pagesBase && pathname.startsWith(pagesBase)) pathname = pathname.slice(pagesBase.length);
    if (pathname === "/" || pathname === "") pathname = "/index.html";

    const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
    let filePath = join(root, safePath);
    try {
      await access(filePath);
      if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      filePath = join(root, "index.html");
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Unable to serve test build");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Neko Nap test server listening on http://127.0.0.1:${port}${pagesBase}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
