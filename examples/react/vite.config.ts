import path from "node:path";
import { defineConfig } from "vite";
import { routes } from "../../plugins/routes";

// React 版のサンプル。ルーター本体（core）と生成のしくみは、リポジトリ直下の src/router.ts と plugins/routes.ts を使う
export default defineConfig({
  plugins: [routes({ router: "../../src/router.ts" })],
  server: { fs: { allow: [path.resolve(import.meta.dirname, "../..")] } },
});
