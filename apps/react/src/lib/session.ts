// ログイン状態（メモリ上だけ。リロードすると消える）
let loggedIn = false;

export const isLoggedIn = () => loggedIn;

export function logIn() {
  loggedIn = true;
}
