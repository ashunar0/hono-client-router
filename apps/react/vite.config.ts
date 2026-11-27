import { routes } from "@hcr/core/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [routes()],
});
