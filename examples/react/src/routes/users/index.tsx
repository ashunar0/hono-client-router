import { z } from "zod";
import { fetchUserPage } from "../../lib";
import { href, useNavigate } from "../../react-adapter";
import type { Route } from "./+types/index";

export const validateSearch = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  q: z.string().catch(""),
});

export const loader = ({ search, request }: Route.LoaderArgs) => fetchUserPage(search.page, search.q, request.signal);

export default function UsersPage({ data, search }: Route.ComponentProps) {
  const navigate = useNavigate();
  return (
    <>
      {/* React の value にすると、遷移が終わるまで入力欄が古い q に戻されてしまうので、defaultValue にする */}
      <input
        placeholder="名前で検索"
        defaultValue={search.q}
        onChange={(e) => navigate(href("/users", { search: { q: e.target.value, page: 1 } }), { replace: true, resetScroll: false })}
      />
      <h2>
        全ユーザー（{data.page} / {data.totalPages} ページ）
      </h2>
      <ul>
        {data.users.map((user) => (
          <li key={user.id}>
            <a href={href("/users/:id", { params: { id: user.id } })}>{user.name}</a>
          </li>
        ))}
      </ul>
      <p>
        {data.page > 1 && <a href={href("/users", { search: { q: search.q, page: data.page - 1 } })}>前へ</a>}{" "}
        {data.page < data.totalPages && <a href={href("/users", { search: { q: search.q, page: data.page + 1 } })}>次へ</a>}
      </p>
    </>
  );
}
