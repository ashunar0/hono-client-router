import { href, Link, useNavigating } from "../react-adapter";
import type { Route } from "./+types/_layout";

// 全ページ共通のレイアウト。遷移の途中は「読み込み中」を出す
export default function RootLayout({ children }: Route.ComponentProps) {
  const navigating = useNavigating();
  return (
    <>
      <nav>
        <strong>React 版</strong> <Link to={href("/")}>Home</Link> <Link to={href("/users")}>Users</Link>{" "}
        <Link to={href("/admin")}>Admin</Link>
        {navigating && <span> 読み込み中…</span>}
      </nav>
      <main style={{ opacity: navigating ? 0.5 : 1 }}>{children}</main>
    </>
  );
}
