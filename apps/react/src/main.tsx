import { createRouter, mountRouter } from "@hcr/react";
import * as users from "./lib/users";
import { createSession } from "./lib/session";
import { app } from "./routes.gen";

// loader / action / middleware に渡すもの。ルートのファイルは lib を直接 import せず、context から使う
const context = { users, session: createSession() };

declare module "@hcr/core" {
  interface Register {
    context: typeof context;
  }
}

const router = createRouter(app, { context });
mountRouter(router, document.getElementById("app")!);
