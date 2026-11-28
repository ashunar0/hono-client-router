import { createRouter, mountRouter } from "@hcr/react";
import { createContext } from "./context";
import { app } from "./routes.gen";

// ブラウザでは document.cookie を読み書きする
const context = createContext({
  get: () => document.cookie.match(/(?:^|; )session=([^;]*)/)?.[1],
  set: (value) => {
    document.cookie = `session=${value}; path=/; SameSite=Lax`;
  },
});

const router = createRouter(app, { context });
mountRouter(router, document.getElementById("app")!);
