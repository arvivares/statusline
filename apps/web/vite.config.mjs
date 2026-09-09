import { readFile } from "node:fs/promises";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
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
