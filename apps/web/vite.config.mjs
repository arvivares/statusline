import { readFile } from "node:fs/promises";
import { defineConfig } from "vite";
import { renderPublicPage } from "./scripts/render-public-pages.mjs";
import { publicPageMatch } from "../../content/public-pages.ts";

export default defineConfig({
  plugins: [
    {
      name: "public-information-pages",
      configureServer(server) {
        server.middlewares.use(servePublicPage);
      },
      configurePreviewServer(server) {
        server.middlewares.use(servePublicPage);
      },
    },
    {
      name: "shared-download-qr",
      apply: "serve",
      configureServer(server) {
        // The production HTML pipeline bundles this relative source directly.
        // In dev, serve only this public asset, not the rest of the repository.
        server.middlewares.use(async (request, response, next) => {
          if (
            request.url?.split("?")[0] !==
            "/docs/assets/readme/app-store-qr.svg"
          ) {
            next();
            return;
          }
          try {
            const svg = await readFile(
              new URL(
                "../../docs/assets/readme/app-store-qr.svg",
                import.meta.url,
              ),
            );
            response.setHeader("Content-Type", "image/svg+xml");
            response.setHeader("Cache-Control", "no-cache");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.end(svg);
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
});

function servePublicPage(request, response, next) {
  const pathname = request.url?.split("?")[0] ?? "";
  const page = publicPageMatch(pathname);
  if (!page) return next();
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end();
  }
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(
    request.method === "HEAD"
      ? undefined
      : renderPublicPage(page.id, page.language),
  );
}
