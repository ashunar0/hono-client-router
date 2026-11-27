import { fetchUserPage } from "../../lib/users";
import { href, type LoaderArgs } from "../../router";

// ?page=2 は、request.url から自分で読む。数字でないときや 1 より小さいときの扱いも、ここで決める
export const loader = ({ request }: LoaderArgs) => {
  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1);
  return fetchUserPage(page, request.signal);
};

export default function UsersPage({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <>
      <h2>
        全ユーザー（{data.page} / {data.totalPages} ページ）
      </h2>
      <ul>
        {data.users.map((user) => (
          <li>
            <a href={href("/users/:id", { id: user.id })}>{user.name}</a>
          </li>
        ))}
      </ul>
      <p>
        {data.page > 1 && <a href={`${href("/users")}?page=${data.page - 1}`}>前へ</a>}{" "}
        {data.page < data.totalPages && <a href={`${href("/users")}?page=${data.page + 1}`}>次へ</a>}
      </p>
    </>
  );
}
