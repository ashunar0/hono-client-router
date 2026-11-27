import type { Route } from "./+types/index";
import { fetchUser } from "../../../lib/users";

// データを取る。request.signal は、次の遷移が始まったら abort される
export const loader = ({ params, request }: Route.LoaderArgs) => fetchUser(params.id, request.signal);

// データを待っている間に、レイアウトの中に出す
export function Pending() {
  return <p>ユーザーを読み込み中…</p>;
}

// loader が失敗したら、画面の代わりに出す。サイドバー（外側のレイアウト）はそのまま
export function ErrorComponent({ error }: Route.ErrorProps) {
  return <p>読み込めませんでした：{error instanceof Error ? error.message : String(error)}</p>;
}

export default function UserPage({ data }: Route.ComponentProps) {
  return (
    <>
      <h1>{data.name}</h1>
      <p>ID: {data.id}</p>
    </>
  );
}
