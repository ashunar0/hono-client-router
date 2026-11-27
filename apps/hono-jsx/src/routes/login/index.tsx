import { href, redirect } from "@hcr/hono-jsx";
import { logIn } from "../../lib/session";

export default function LoginPage() {
  return (
    <>
      <h1>Login</h1>
      <form method="post" action={href("/login")}>
        <button>ログイン</button>
      </form>
    </>
  );
}

// フォーム送信を受ける
export const action = () => {
  logIn();
  return redirect(href("/admin"));
};
