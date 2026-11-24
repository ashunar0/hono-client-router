import { Hono } from "hono";
import { html } from "hono/html";

const app = new Hono();

// ログイン状態（メモリ上だけ。リロードすると消える）
let loggedIn = false;

// ルート定義: ハンドラは HTML を返すだけ（案 X）
app.get("/", (c) => c.html(html`<h1>Home</h1>`));
app.get("/about", (c) => c.html(html`<h1>About</h1>`));
// API から取ってくるふり（0〜2 秒かかる）
// 本物の fetch(url, { signal }) なら、abort 時の中断は fetch が自動でやってくれる
function fetchUser(id: string, signal: AbortSignal) {
  return new Promise<{ id: string; name: string }>((resolve, reject) => {
    const timer = setTimeout(() => resolve({ id, name: `ユーザー${id}` }), Math.random() * 2000);
    signal.addEventListener("abort", () => {
      console.log(`User ${id} の取得を中断した`);
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

// レイアウト: /users 配下は、ページの中身をサイドバー付きの枠で包む
app.use("/users/*", async (c, next) => {
  c.setRenderer((content) =>
    c.html(html`
      <div style="display: flex; gap: 24px">
        <aside>
          <ul>
            <li><a href="/users/1">ユーザー1</a></li>
            <li><a href="/users/2">ユーザー2</a></li>
          </ul>
        </aside>
        <section>${content}</section>
      </div>
    `),
  );
  await next();
});

app.get("/users", (c) => c.render(html`<p>ユーザーを選択してください</p>`));
app.get("/users/:id", async (c) => {
  // render が Request に載せた signal を受け取る（React Router の request.signal と同じ）
  const user = await fetchUser(c.req.param("id"), c.req.raw.signal);
  return c.render(html`<h1>${user.name}</h1><p>ID: ${user.id}</p>`);
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

// いま進行中の遷移
let current: AbortController | undefined;

// ② URL を Hono に渡して、返ってきた HTML を描画する
async function render(url: string, init?: RequestInit) {
  // 新しい遷移が始まったら、古い遷移は止める（案 2）
  current?.abort();
  const controller = (current = new AbortController());
  const { signal } = controller;

  const res = await app.fetch(new Request(url, { ...init, signal }));
  if (signal.aborted) return; // 待っている間に古くなったら書き込まない（案 1）

  // リダイレクト: Location 先に履歴を置き換えて、描画し直す
  const location = res.headers.get("Location");
  if (res.status >= 300 && res.status < 400 && location) {
    const next = new URL(location, url).href;
    history.replaceState(null, "", next);
    return render(next);
  }

  const body = await res.text();
  if (signal.aborted) return;
  root.innerHTML = body;
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
