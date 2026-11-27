import { createRouter, mountRouter } from "./react-adapter";
import { app } from "./routes.gen";

const router = createRouter(app);
mountRouter(router, document.getElementById("app")!);
