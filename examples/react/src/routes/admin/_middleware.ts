import type { MiddlewareHandler } from "hono";
import { isLoggedIn } from "../../lib";
import { href } from "../../react-adapter";

const guard: MiddlewareHandler = async (c, next) => {
  if (!isLoggedIn()) return c.redirect(href("/login"));
  await next();
};

export default guard;
