import build from "@hono/vite-build/node";
import devServer from "@hono/vite-dev-server";
import { routes } from "@hcr/core/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  // ブラウザの分のビルド（vite build --mode client）。src/main.tsx から、dist/static/client.js を作る
  if (mode === "client") {
    return {
      plugins: [routes()],
      build: {
        outDir: "dist/static",
        emptyOutDir: true,
        copyPublicDir: false,
        rollupOptions: { input: "src/main.tsx", output: { entryFileNames: "client.js" } },
      },
    };
  }
  // dev と、サーバーの分のビルド（vite build）。
  // dev では、ページを開いたときのリクエストは src/server.ts（Hono）が受ける。.tsx などのファイルは Vite が返す。
  // ビルドすると、src/server.ts が Node で動く dist/index.js になる。dist/static/ のファイルもこのサーバーが返す
  return {
    plugins: [routes(), devServer({ entry: "src/server.ts" }), build({ entry: "src/server.ts", staticRoot: "./dist" })],
  };
});
