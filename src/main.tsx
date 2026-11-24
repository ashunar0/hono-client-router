import { app } from "./routes";
import { startRouter } from "./router";

startRouter(app, document.getElementById("app")!);
