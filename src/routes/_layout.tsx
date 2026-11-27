import type { Child } from "hono/jsx";
import { useNavigating } from "../jsx-adapter";
import { href } from "../router";

// 全ページ共通のレイアウト。遷移の途中は「読み込み中」を出す
export default function RootLayout({ children }: { children?: Child }) {
  const navigating = useNavigating();
  return (
    <>
      <nav>
        <a href={href("/")}>Home</a> <a href={href("/about")}>About</a> <a href={href("/users")}>Users</a>{" "}
        <a href={href("/admin")}>Admin</a>
        {navigating && <span> 読み込み中…</span>}
      </nav>
      <main style={{ opacity: navigating ? 0.5 : 1 }}>{children}</main>
    </>
  );
}
