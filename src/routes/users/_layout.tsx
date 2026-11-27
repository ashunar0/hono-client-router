import type { Child } from "hono/jsx";

export default function UsersLayout({ children }: { children?: Child }) {
  return (
    <div style={{ display: "flex", gap: "24px" }}>
      <aside>
        <input placeholder="検索" />
        <ul>
          <li><a href="/users/1">ユーザー1</a></li>
          <li><a href="/users/2">ユーザー2</a></li>
        </ul>
      </aside>
      <section>{children}</section>
    </div>
  );
}
