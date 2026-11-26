# hono-client-router

Hono をブラウザで動かして作った、クライアントサイドルーターです。

Hono のアプリは `app.fetch(request)` を呼ぶと `Response` を返します。`Request` も `Response` も Web 標準なので、このやり取りはサーバーを通さずブラウザの中だけでも成り立ちます。そこで、リンクのクリックや戻る操作を `Request` に変えて `app.fetch` に渡せば、Hono のルーティングがそのままクライアントのルーターとして使えるはず、と考えて作りました。

学習用の実験です。ライブラリとして配布はしていません。

## 書き方

ルートの定義は、普通の Hono アプリとほぼ同じです。

```tsx
import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { createRouter } from "./router";
import { jsxRenderer, layout, mountRouter } from "./jsx-adapter";

const app = new Hono();

app.use("*", jsxRenderer());

// レイアウト
app.use("/users/*", layout(UsersLayout));

// データ取得（loader）
app.get("/users/:id", async (c) => {
  const user = await fetchUser(c.req.param("id"), c.req.raw.signal);
  return c.render(<h1>{user.name}</h1>);
});

// ガード
app.use("/admin/*", async (c, next) => {
  if (!loggedIn) return c.redirect("/login");
  await next();
});

// フォーム送信（action）
app.post("/login", (c) => {
  loggedIn = true;
  return c.redirect("/admin");
});

const router = createRouter<Child>(app);
mountRouter(router, document.getElementById("app")!);
```

## React Router との対応

| やりたいこと | このルーター | React Router |
|---|---|---|
| ルートの定義 | `app.get("/users/:id", ...)` | `{ path: "/users/:id" }` |
| データ取得 | async ハンドラ | `loader` |
| フォーム送信 | `app.post(...)` | `action` |
| リダイレクト | `c.redirect()` | `redirect()` |
| ガード | middleware | 親ルートの `loader` / middleware |
| レイアウト | `layout()` middleware | `<Outlet />` |
| 404 | `app.notFound()` | `errorElement` |
| 遷移の中断 | `c.req.raw.signal` | `request.signal` |

## 仕組み

「どの URL で何を出すか」は Hono が決めます。ルーターは、ルーティングと描画の 2 つに分かれています。

- `src/router.ts`（ルーティング）：ブラウザと Hono の間をつなぎ、遷移が終わるたびにハンドラが置いた view を `subscribe` 先に知らせる。画面のことは知らない
- `src/jsx-adapter.tsx`（描画）：`router.subscribe` で受け取った view を `hono/jsx/dom` で描画する。`c.render()` を使えるようにする middleware もここにある

1. `<a>` のクリックとフォーム送信を横取りし、`history.pushState` で URL を更新する
2. URL から `Request` を作り、`app.fetch` に渡す
3. `Response` が 3xx なら `Location` 先へ `history.replaceState` し、もう一度 2 から実行する
4. ハンドラが `c.render()` に渡した JSX を adapter に知らせ、`hono/jsx/dom` で差分描画する
5. `popstate`（戻る・進む）では URL を積まずに 2 から実行する

新しい遷移が始まると、`AbortController` で前の遷移を中断します。これにより、遅れて届いた古いデータで画面が上書きされることはありません。

### JSX の受け渡し

`Response` の本文には JSX を入れられません。そのため、`c.render()` は JSX を `Request` をキーにした `WeakMap` に置き、本文が空の `Response` を返します。ルーターは `Response` でステータスとリダイレクトを判定し、描画する JSX は `WeakMap` から受け取ります。

## ファイル構成

```
src/
  router.ts         ルーティング（画面のことは知らない）
  jsx-adapter.tsx   hono/jsx での描画と c.render()
  routes.tsx        ルート定義（サンプルアプリ）
  components/       サンプルアプリのコンポーネント
  main.tsx          ルート定義とルーターをつなぐ
```

## 動かし方

```bash
pnpm install
pnpm dev
```

## 未対応のこと

- レイアウトは 1 段のみ（`layout()` を重ねると内側で上書きされる）
- 読み込み中の表示（pending UI）
- 型安全なリンク
- スクロール位置の復元
