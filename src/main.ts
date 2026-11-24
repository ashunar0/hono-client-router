import { Hono } from "hono";
import { html } from "hono/html";

const app = new Hono();

// ログイン状態（メモリ上だけ。リロードすると消える）
let loggedIn = false;

// ルート定義: ハンドラは HTML を返すだけ（案 X）
app.get("/", (c) => c.html(html`<h1>Home</h1>`));
app.get("/about", (c) => c.html(html`<h1>About</h1>`));
app.get("/users/:id", (c) => {
  const id = c.req.param("id");
  return c.html(html`<h1>User ${id}</h1>`);
});
app.get("/login", (c) =>
  c.html(html`
    <h1>Login</h1>
    <form method="post" action="/login">
      <button>ログイン</button>
    </form>
  `),
);
// フォーム送信を受ける（React Router でいう action）
app.post("/login", (c) => {
  loggedIn = true;
  return c.redirect("/admin");
});

// ガード: /admin 配下はログインしていなければ /login へ
app.use("/admin/*", async (c, next) => {
  if (!loggedIn) return c.redirect("/login");
  await next();
});
app.get("/admin", (c) => c.html(html`<h1>Admin</h1>`));

// どのルートにもマッチしなかったとき
app.notFound((c) =>
  c.html(html`<h1>404 Not Found</h1><p><a href="/">Home に戻る</a></p>`, 404),
);

const root = document.getElementById("app")!;

// ② URL を Hono に渡して、返ってきた HTML を描画する
async function render(url: string, init?: RequestInit) {
  const res = await app.fetch(new Request(url, init));

  // リダイレクト: Location 先に履歴を置き換えて、描画し直す
  const location = res.headers.get("Location");
  if (res.status >= 300 && res.status < 400 && location) {
    const next = new URL(location, url).href;
    history.replaceState(null, "", next);
    return render(next);
  }

  root.innerHTML = await res.text();
}

// ① <a> のクリックを横取りする → ③ pushState → ②
document.addEventListener("click", (e) => {
  // 新しいタブで開く操作（Ctrl/Cmd クリックなど）はブラウザに任せる
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const a = (e.target as Element).closest("a");
  if (!a || a.origin !== location.origin) return;

  e.preventDefault();
  history.pushState(null, "", a.href);
  render(a.href);
});

// フォーム送信も横取りする → ③ pushState → ②（POST で）
document.addEventListener("submit", (e) => {
  const form = e.target as HTMLFormElement;
  if (form.method !== "post" || new URL(form.action).origin !== location.origin) return;

  e.preventDefault();
  history.pushState(null, "", form.action);
  render(form.action, { method: "POST", body: new FormData(form) });
});

// ④ 戻る・進む → ②（pushState はしない）
window.addEventListener("popstate", () => render(location.href));

// 最初の表示
render(location.href);
