import { mountRouter } from "./jsx-adapter";
import { createRouter } from "./router";
import { app } from "./routes.gen";

const router = createRouter(app);
mountRouter(router, document.getElementById("app")!);
