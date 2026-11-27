import type { Route } from "./+types/index";

export const loader = ({ params, request, context }: Route.LoaderArgs) => context.users.fetchUser(params.id, request.signal);

export function Pending() {
  return <p>ユーザーを読み込み中…</p>;
}

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
