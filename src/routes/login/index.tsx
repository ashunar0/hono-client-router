import type { Context } from "hono";
import { logIn } from "../../lib/session";

export const GET = (c: Context) =>
  c.render(
    <>
      <h1>Login</h1>
      <form method="post" action="/login">
        <button>ログイン</button>
      </form>
    </>,
  );

// フォーム送信を受ける（React Router でいう action）
export const POST = (c: Context) => {
  logIn();
  return c.redirect("/admin");
};
