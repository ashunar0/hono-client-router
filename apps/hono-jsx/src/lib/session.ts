// ログイン状態を cookie に持つ。サーバーもブラウザも、同じ cookie を読んで判定する。
// cookie の読み書きのしかたはサーバーとブラウザで違うので、外から渡す。
// サンプルなので、cookie には「ログインしているか」だけを入れる。本物なら署名付きの cookie にする
export type User = { id: string; name: string };
export type CookieJar = { get(): string | undefined; set(value: string): void };

export function createSession(cookie: CookieJar) {
  return {
    user: (): User | null => (cookie.get() === "1" ? { id: "1", name: "管理者" } : null),
    logIn() {
      cookie.set("1");
    },
  };
}
