import type { Child } from "hono/jsx";
import { href } from "../../router";

export default function UsersLayout({ children }: { children?: Child }) {
  return (
    <div style={{ display: "flex", gap: "24px" }}>
      <aside>
        <input placeholder="検索" />
        <ul>
          <li><a href={href("/users/:id", { id: "1" })}>ユーザー1</a></li>
          <li><a href={href("/users/:id", { id: "2" })}>ユーザー2</a></li>
        </ul>
      </aside>
      <section>{children}</section>
    </div>
  );
}
