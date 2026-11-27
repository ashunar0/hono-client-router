import { fetchUsers } from "../../lib/users";
import { href } from "../../router";
import type { Route } from "./+types/_layout";

// サイドバーのユーザー一覧。/users 配下のページの loader と同時に取りに行く
export const loader = ({ request }: Route.LoaderArgs) => fetchUsers(request.signal);

export function Pending() {
  return <p>ユーザー一覧を読み込み中…</p>;
}

export default function UsersLayout({ data, children }: Route.ComponentProps) {
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
