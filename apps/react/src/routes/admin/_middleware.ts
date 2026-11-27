import { href, type Middleware } from "@hcr/react";

const guard: Middleware = async (c, next) => {
  if (!c.env.session.isLoggedIn()) return c.redirect(href("/login"));
  await next();
};

export default guard;
