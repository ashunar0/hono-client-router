import { href, type Middleware } from "@hcr/react";
import type { User } from "../../lib/session";

// ガード: /admin 配下はログインしていなければ /login へ。
// ログインしていれば user を c.set() する。配下の loader / action は context.user で読める
const guard: Middleware<{ user: User }> = async (c, next) => {
  const user = c.env.session.user();
  if (!user) return c.redirect(href("/login"));
  c.set("user", user);
  await next();
};

export default guard;
