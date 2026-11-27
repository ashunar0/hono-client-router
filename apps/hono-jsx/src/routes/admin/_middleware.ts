import { href, type Middleware } from "@hcr/hono-jsx";

// ガード: /admin 配下はログインしていなければ /login へ
const guard: Middleware = async (c, next) => {
  if (!c.env.session.isLoggedIn()) return c.redirect(href("/login"));
  await next();
};

export default guard;
