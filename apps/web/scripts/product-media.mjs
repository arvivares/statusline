import { readFile } from "node:fs/promises";
import { productImage, productViews } from "../src/product-media.ts";

export const productAssets = new Map(
  productViews.flatMap((view) =>
    ["en", "es"].map((language) => [
      productImage(view, language),
      new URL(
        `../../../docs/assets/readme/still-signature/${view}-${language}.png`,
        import.meta.url,
      ),
    ]),
  ),
);

export function productMediaPlugin() {
  return {
    name: "shared-product-captures",
    async generateBundle() {
      for (const [path, source] of productAssets) {
        this.emitFile({
          type: "asset",
          fileName: path.slice(1),
          source: await readFile(source),
        });
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const source = productAssets.get(request.url?.split("?")[0]);
        if (!source) return next();
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" });
          return response.end();
        }
        try {
          const bytes = await readFile(source);
          response.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": bytes.length,
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
          });
          response.end(request.method === "HEAD" ? undefined : bytes);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
