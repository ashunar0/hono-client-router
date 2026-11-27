import { logIn } from "../../lib";
import { href, redirect } from "../../react-adapter";

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

export const action = () => {
  logIn();
  return redirect(href("/admin"));
};
