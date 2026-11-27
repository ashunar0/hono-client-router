import type { Route } from "./+types/index";
import { href, redirect } from "@hcr/hono-jsx";

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
export const action = ({ context }: Route.ActionArgs) => {
  context.session.logIn();
  return redirect(href("/admin"));
};
