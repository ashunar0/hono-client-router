import type { Child } from "hono/jsx";
import { useNavigating } from "../jsx-adapter";

// 全ページ共通のレイアウト。遷移の途中は「読み込み中」を出す
export default function RootLayout({ children }: { children?: Child }) {
  const navigating = useNavigating();
  return (
    <>
      <nav>
        <a href="/">Home</a> <a href="/about">About</a> <a href="/users">Users</a> <a href="/admin">Admin</a>
        {navigating && <span> 読み込み中…</span>}
      </nav>
      <main style={{ opacity: navigating ? 0.5 : 1 }}>{children}</main>
    </>
  );
}
