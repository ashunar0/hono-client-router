import type { Child } from "hono/jsx";
import { mountRouter } from "./jsx-adapter";
import { createRouter } from "./router";
import { app } from "./routes.gen";

const router = createRouter<Child>(app);
mountRouter(router, document.getElementById("app")!);
