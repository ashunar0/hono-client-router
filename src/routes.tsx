import { Hono } from "hono";
import { UsersLayout } from "./components/users-layout";
import { jsxRenderer, layout } from "./jsx-adapter";

export const app = new Hono();

app.use("*", jsxRenderer());

// ログイン状態（メモリ上だけ。リロードすると消える）
let loggedIn = false;

app.get("/", (c) => c.render(<h1>Home</h1>));
app.get("/about", (c) => c.render(<h1>About</h1>));

// ---- /users ----

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

app.use("/users/*", layout(UsersLayout));

app.get("/users", (c) => c.render(<p>ユーザーを選択してください</p>));
app.get("/users/:id", async (c) => {
  // ルーターが Request に載せた signal を受け取る（React Router の request.signal と同じ）
  const user = await fetchUser(c.req.param("id"), c.req.raw.signal);
  return c.render(
    <>
      <h1>{user.name}</h1>
      <p>ID: {user.id}</p>
    </>,
  );
});

// ---- ログインと /admin ----

app.get("/login", (c) =>
  c.render(
    <>
      <h1>Login</h1>
      <form method="post" action="/login">
        <button>ログイン</button>
      </form>
    </>,
  ),
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
app.get("/admin", (c) => c.render(<h1>Admin</h1>));

// ---- 404 ----

app.notFound((c) => {
  c.status(404);
  return c.render(
    <>
      <h1>404 Not Found</h1>
      <p><a href="/">Home に戻る</a></p>
    </>,
  );
});
