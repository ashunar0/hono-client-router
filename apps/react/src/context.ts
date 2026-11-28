import * as users from "./lib/users";
import { createSession, type CookieJar } from "./lib/session";

// loader / action / middleware に渡すもの。ルートのファイルは lib を直接 import せず、context から使う。
// ブラウザ（main.tsx）とサーバー（server.ts）が、それぞれの cookie の読み書きで作る。形は同じ
export const createContext = (cookie: CookieJar) => ({ users, session: createSession(cookie) });

declare module "@hcr/core" {
  interface Register {
    context: ReturnType<typeof createContext>;
  }
}
