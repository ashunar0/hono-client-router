import type { MiddlewareHandler } from "hono";
import { isLoggedIn } from "../../lib/session";
import { href } from "@hcr/hono-jsx";

// ガード: /admin 配下はログインしていなければ /login へ
const guard: MiddlewareHandler = async (c, next) => {
  if (!isLoggedIn()) return c.redirect(href("/login"));
  await next();
};

export default guard;
