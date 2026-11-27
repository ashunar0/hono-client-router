import type { MiddlewareHandler } from "hono";
import { isLoggedIn } from "../../lib/session";

// ガード: /admin 配下はログインしていなければ /login へ
const guard: MiddlewareHandler = async (c, next) => {
  if (!isLoggedIn()) return c.redirect("/login");
  await next();
};

export default guard;
