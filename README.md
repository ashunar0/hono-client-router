# hono-client-router

Hono をブラウザで動かして作った、クライアントサイドルーターです。

Hono のアプリは `app.fetch(request)` を呼ぶと `Response` を返します。`Request` も `Response` も Web 標準なので、このやり取りはサーバーを通さずブラウザの中だけでも成り立ちます。そこで、リンクのクリックや戻る操作を `Request` に変えて `app.fetch` に渡せば、Hono のルーティングがそのままクライアントのルーターとして使えるはず、と考えて作りました。

学習用の実験です。ライブラリとして配布はしていません。

## 書き方

`src/routes/` のディレクトリが URL になります。決まりは [hono-kit](https://github.com/ashunar0/hono-kit) に揃えています。

```
src/routes/
  index.tsx              GET /
  login/index.tsx        GET /login と POST /login
  users/
    _layout.tsx          /users 配下のレイアウト
    index.tsx            GET /users
    [id]/index.tsx       GET /users/:id
  admin/
    _middleware.ts       /admin 配下のガード
    index.tsx            GET /admin
  _404.tsx               どれにも当たらないとき
```

| ファイル | 中身 |
|---|---|
| `index.tsx` | メソッド名（`GET` / `POST` / `PUT` / `PATCH` / `DELETE`）で Hono のハンドラを export する |
| `_layout.tsx` | レイアウトのコンポーネントを default export する。外側のディレクトリのレイアウトほど外側に包む |
| `_middleware.ts` | Hono の middleware を default export する。そのディレクトリ配下のすべてのルートで動く |
| `_404.tsx` | `src/routes/` の直下にだけ置ける。どのルートにも当たらないときのハンドラを default export する |

ディレクトリ名の `[id]` は `:id`、`[...path]` は残りのパス全部になります。`(名前)` は URL に出ないグループです。

```tsx
// src/routes/users/[id]/index.tsx（データ取得 = loader）
export const GET = async (c: Context) => {
  const user = await fetchUser(c.req.param("id")!, c.req.raw.signal);
  return c.render(<h1>{user.name}</h1>);
};

// src/routes/login/index.tsx（フォーム送信 = action）
export const POST = (c: Context) => {
  logIn();
  return c.redirect("/admin");
};

// src/routes/admin/_middleware.ts（ガード）
const guard: MiddlewareHandler = async (c, next) => {
  if (!isLoggedIn()) return c.redirect("/login");
  await next();
};
export default guard;
```

`plugins/routes.ts`（Vite プラグイン）が `src/routes/` を読んで、Hono の app を組み立てる `src/routes.gen.ts` を書き出します。dev の間は、ファイルを足したり消したりすると書き直します。`routes.gen.ts` はコミットしません。

## React Router との対応

| やりたいこと | このルーター | React Router |
|---|---|---|
| ルートの定義 | `src/routes/users/[id]/index.tsx` | `{ path: "/users/:id" }` |
| データ取得 | async ハンドラ | `loader` |
| フォーム送信 | `export const POST` | `action` |
| リダイレクト | `c.redirect()` | `redirect()` |
| ガード | `_middleware.ts` | 親ルートの `loader` / middleware |
| レイアウト | `_layout.tsx` | `<Outlet />` |
| 404 | `_404.tsx` | `errorElement` |
| 遷移の中断 | `c.req.raw.signal` | `request.signal` |
| 遷移中かどうか | `useNavigating()` | `useNavigation().state` |

## 仕組み

「どの URL で何を出すか」は Hono が決めます。ルーターは、ルーティングと描画の 2 つに分かれています。

- `src/router.ts`（ルーティング）：ブラウザと Hono の間をつなぎ、遷移が終わるたびにハンドラが置いた view を `subscribe` 先に知らせる。画面のことは知らない
- `src/jsx-adapter.tsx`（描画）：`router.subscribe` で受け取った view を `hono/jsx/dom` で描画する。`c.render()` を使えるようにする middleware もここにある

1. `<a>` のクリックとフォーム送信を横取りし、`history.pushState` で URL を更新する
2. URL から `Request` を作り、`app.fetch` に渡す
3. `Response` が 3xx なら `Location` 先へ `history.replaceState` し、もう一度 2 から実行する
4. ハンドラが `c.render()` に渡した JSX を adapter に知らせ、`hono/jsx/dom` で差分描画する
5. `popstate`（戻る・進む）では URL を積まずに 2 から実行する

スクロール位置は、ブラウザの自動復元を止めて（`history.scrollRestoration = "manual"`）ルーターが戻します。`pushState` で履歴の項目ごとに key を付けて、その項目を離れるときの位置を覚えておきます。新しいページは一番上から、戻る・進むでは覚えておいた位置から表示します。

新しい遷移が始まると、`AbortController` で前の遷移を中断します。これにより、遅れて届いた古いデータで画面が上書きされることはありません。

### JSX の受け渡し

`Response` の本文には JSX を入れられません。そのため、`c.render()` は JSX を `Request` をキーにした `WeakMap` に置き、本文が空の `Response` を返します。ルーターは `Response` でステータスとリダイレクトを判定し、描画する JSX は `WeakMap` から受け取ります。

## ファイル構成

```
src/
  router.ts         ルーティング（画面のことは知らない）
  jsx-adapter.tsx   hono/jsx での描画と c.render()
  routes/           ルート定義（サンプルアプリ）
  routes.gen.ts     plugins/routes.ts が書き出す。コミットしない
  lib/              サンプルアプリのログイン状態とデータ取得
  main.tsx          ルート定義とルーターをつなぐ
plugins/
  routes.ts         src/routes から routes.gen.ts を書き出す
```

## 動かし方

```bash
pnpm install
pnpm dev
```

## 未対応のこと

- 読み込み中に、新しいレイアウトを先に出すこと（今は前の画面を出したまま `useNavigating()` で「読み込み中」を出すだけ）
- 型安全なリンク
- スクロール位置をリロードのあとも残すこと（今はメモリに覚えているだけ）
- `#section` のようなハッシュへのリンク
