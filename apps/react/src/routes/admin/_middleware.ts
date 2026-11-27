import type { MiddlewareHandler } from "hono";
import { isLoggedIn } from "../../lib/session";
import { href } from "@hcr/react";

const guard: MiddlewareHandler = async (c, next) => {
  if (!isLoggedIn()) return c.redirect(href("/login"));
  await next();
};

export default guard;
