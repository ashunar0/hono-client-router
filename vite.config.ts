import { defineConfig } from "vite";
import { routes } from "./plugins/routes";

export default defineConfig({
  plugins: [routes()],
});
