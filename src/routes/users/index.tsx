import { z } from "zod";
import { fetchUserPage } from "../../lib/users";
import { href, type LoaderArgs } from "../../router";

// このページが受け付ける search params。数字でないときや 1 より小さいときは 1 にする
export const validateSearch = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

// search は検証済みで、search.page は number
export const loader = ({ search, request }: LoaderArgs<"/users", typeof validateSearch>) =>
  fetchUserPage(search.page, request.signal);

export default function UsersPage({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <>
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
        {data.page > 1 && <a href={href("/users", { search: { page: data.page - 1 } })}>前へ</a>}{" "}
        {data.page < data.totalPages && <a href={href("/users", { search: { page: data.page + 1 } })}>次へ</a>}
      </p>
    </>
  );
}
