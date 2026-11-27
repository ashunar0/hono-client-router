import { z } from "zod";
import { fetchUserPage } from "../../lib/users";
import { useNavigate } from "../../jsx-adapter";
import { href } from "../../router";
import type { Route } from "./+types/index";

// このページが受け付ける search params。page は数字でないときや 1 より小さいときは 1 にする
export const validateSearch = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  q: z.string().catch(""),
});

// search は検証済みで、search.page は number
export const loader = ({ search, request }: Route.LoaderArgs) =>
  fetchUserPage(search.page, search.q, request.signal);

export default function UsersPage({ data, search }: Route.ComponentProps) {
  const navigate = useNavigate();
  return (
    <>
      {/* 打つたびに ?q= を変えて遷移する。履歴は積まず、スクロールも動かさない。前の遷移は中断される */}
      <input
        placeholder="名前で検索"
        value={search.q}
        onInput={(e: InputEvent) => {
          const q = (e.target as HTMLInputElement).value;
          navigate(href("/users", { search: { q, page: 1 } }), { replace: true, resetScroll: false });
        }}
      />
      <h2>
        全ユーザー（{data.page} / {data.totalPages} ページ）
      </h2>
      <ul>
        {data.users.map((user) => (
          <li>
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
