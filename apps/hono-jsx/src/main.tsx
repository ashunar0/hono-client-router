import { createRouter, mountRouter } from "@hcr/hono-jsx";
import { app } from "./routes.gen";

const router = createRouter(app);
mountRouter(router, document.getElementById("app")!);
