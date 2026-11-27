import type { LoaderArgs } from "../../../router";
import { fetchUser } from "../../../lib/users";

// データを取る。request.signal は、次の遷移が始まったら abort される
export const loader = ({ params, request }: LoaderArgs<"/users/:id">) => fetchUser(params.id, request.signal);

// データを待っている間に、レイアウトの中に出す
export function Pending() {
  return <p>ユーザーを読み込み中…</p>;
}

export default function UserPage({ data }: { data: Awaited<ReturnType<typeof loader>> }) {
  return (
    <>
      <h1>{data.name}</h1>
      <p>ID: {data.id}</p>
    </>
  );
}
