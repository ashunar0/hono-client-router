import { createRouter, mountRouter } from "@hcr/react";
import { app } from "./routes.gen";

const router = createRouter(app);
mountRouter(router, document.getElementById("app")!);
