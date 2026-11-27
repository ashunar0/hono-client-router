// ログイン状態（メモリ上だけ。リロードすると消える）。main.tsx で 1 つ作り、context で渡す
export type User = { id: string; name: string };

export function createSession() {
  let user: User | null = null;
  return {
    user: () => user,
    logIn() {
      user = { id: "1", name: "管理者" };
    },
  };
}
