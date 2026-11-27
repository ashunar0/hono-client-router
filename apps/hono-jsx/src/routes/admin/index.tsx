import type { Route } from "./+types/index";

// context.user は、admin/_middleware.ts が c.set() したもの。/admin の外のページでは型エラーになる
export const loader = ({ context }: Route.LoaderArgs) => ({ name: context.user.name });

export default function AdminPage({ data }: Route.ComponentProps) {
  return (
    <>
      <h1>Admin</h1>
      <p>{data.name} としてログイン中</p>
    </>
  );
}
