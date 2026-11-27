import type { Child } from "hono/jsx";
import { href, Link, useNavigating } from "@hcr/hono-jsx";

// 全ページ共通のレイアウト。遷移の途中は「読み込み中」を出す
export default function RootLayout({ children }: { children?: Child }) {
  const navigating = useNavigating();
  return (
    <>
      <nav>
        <Link to={href("/")}>Home</Link> <Link to={href("/about")}>About</Link> <Link to={href("/users")}>Users</Link>{" "}
        <Link to={href("/admin")}>Admin</Link>
        {navigating && <span> 読み込み中…</span>}
      </nav>
      <main style={{ opacity: navigating ? 0.5 : 1 }}>{children}</main>
    </>
  );
}
