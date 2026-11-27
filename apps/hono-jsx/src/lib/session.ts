// ログイン状態（メモリ上だけ。リロードすると消える）。main.tsx で 1 つ作り、context で渡す
export function createSession() {
  let loggedIn = false;
  return {
    isLoggedIn: () => loggedIn,
    logIn() {
      loggedIn = true;
    },
  };
}
