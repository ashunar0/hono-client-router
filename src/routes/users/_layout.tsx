import type { Child } from "hono/jsx";
import { fetchUsers } from "../../lib/users";
import { href, type LoaderArgs } from "../../router";

// サイドバーのユーザー一覧。/users 配下のページの loader と同時に取りに行く
export const loader = ({ request }: LoaderArgs) => fetchUsers(request.signal);

export function Pending() {
  return <p>ユーザー一覧を読み込み中…</p>;
}

export default function UsersLayout({
  data,
  children,
}: {
  data: Awaited<ReturnType<typeof loader>>;
  children?: Child;
}) {
  return (
    <div style={{ display: "flex", gap: "24px" }}>
      <aside>
        <input placeholder="検索" />
        <ul>
          {data.map((user) => (
            <li>
              <a href={href("/users/:id", { params: { id: user.id } })}>{user.name}</a>
            </li>
          ))}
        </ul>
      </aside>
      <section>{children}</section>
    </div>
  );
}
