# hono-client-router

Hono をブラウザで動かして作った、クライアントサイドルーターです。

Hono のアプリは `app.fetch(request)` を呼ぶと `Response` を返します。`Request` も `Response` も Web 標準なので、このやり取りはサーバーを通さずブラウザの中だけでも成り立ちます。そこで、リンクのクリックや戻る操作を `Request` に変えて `app.fetch` に渡し、Hono のマッチングと middleware をクライアントのルーターに使っています。データの取得と描画は、TanStack Router や React Router と同じように、ルーターが loader とコンポーネントを呼んで行います。

学習用の実験です。ライブラリとして配布はしていません。

## 書き方

`src/routes/` のディレクトリが URL になります。決まりは [hono-kit](https://github.com/ashunar0/hono-kit) に揃えています。

```
src/routes/
  _layout.tsx            全ページのレイアウト
  index.tsx              /
  login/index.tsx        /login（action でログイン）
  users/
    _layout.tsx          /users 配下のレイアウト
    index.tsx            /users
    [id]/index.tsx       /users/:id（loader でデータを取る）
  admin/
    _middleware.ts       /admin 配下のガード
    index.tsx            /admin
  _404.tsx               どれにも当たらないとき
```

| ファイル | 中身 |
|---|---|
| `index.tsx` | 画面のコンポーネントを default export する。必要なら `loader`（データ取得）、`Pending`（待っている間の表示）、`ErrorComponent`（loader が失敗したときの表示）、`action`（フォーム送信）を名前付きで export する |
| `_layout.tsx` | レイアウトのコンポーネントを default export する。ページと同じように `loader` / `Pending` / `ErrorComponent` も export できる。外側のディレクトリのレイアウトほど外側に包む |
| `_middleware.ts` | Hono の middleware を default export する。そのディレクトリ配下のすべてのルートで動く |
| `_404.tsx` | `src/routes/` の直下にだけ置ける。どのルートにも当たらないときのコンポーネントを default export する |

ディレクトリ名の `[id]` は `:id`、`[...path]` は残りのパス全部になります。`(名前)` は URL に出ないグループです。

```tsx
// src/routes/users/[id]/index.tsx
import type { Route } from "./+types/index";

export const loader = ({ params, request }: Route.LoaderArgs) =>
  fetchUser(params.id, request.signal);

export function Pending() {
  return <p>ユーザーを読み込み中…</p>;
}

export function ErrorComponent({ error }: Route.ErrorProps) {
  return <p>読み込めませんでした：{String(error)}</p>;
}

export default function UserPage({ data }: Route.ComponentProps) {
  return <h1>{data.name}</h1>;
}

// src/routes/login/index.tsx
export const action = () => {
  logIn();
  return redirect(href("/admin"));
};

// src/routes/admin/_middleware.ts（Hono の middleware）
const guard: MiddlewareHandler = async (c, next) => {
  if (!isLoggedIn()) return c.redirect(href("/login"));
  await next();
};
export default guard;
```

`Route` は、ページやレイアウトのファイルごとに生成される型です（React Router v7 の `+types` と同じ考え方）。`Route.LoaderArgs` では `params.id` や `search` に型が付き、`Route.ComponentProps` の `data` は loader の戻り値の型になります。型は `.routes-types/` に書き出し、tsconfig の `rootDirs` で `./+types/<ファイル名>` から読めるようにしています。`import type` で読んでください。`request.signal` は、次の遷移が始まると abort されます。

レイアウトとページの loader は、同時に呼ばれます。/users/1 → /users/2 のように同じレイアウトのまま移るときは、レイアウトの loader は呼び直さずにデータを使い回します（action のあとは呼び直します）。search params（`?page=2` など）は、段ごとに `validateSearch` で受け付けるものを決めます。Standard Schema に対応したライブラリ（zod、valibot など）のスキーマを export すると、loader は検証済みで型の付いた `search` を受け取ります。検証したあとの search が変わった段だけ、loader を呼び直します。

```tsx
// src/routes/users/index.tsx
export const validateSearch = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

export const loader = ({ search, request }: Route.LoaderArgs) =>
  fetchUserPage(search.page, request.signal);
```

loader が失敗すると、その段から外側に向かっていちばん近い `ErrorComponent` を、その段の場所に出します。それより外側のレイアウトはそのまま描きます。どの段にも `ErrorComponent` がなければ、決まった表示を画面全体に出します。

リンクにマウスを乗せて 50ms たつと（またはフォーカスすると）、その URL の loader を先に呼んでおきます（preload）。30 秒以内にクリックすれば、その結果を使います。届いていれば待たずに描き、取得の途中なら同じ取得の完了を待ちます。

リンクは `href()` で作ると、パスと params と search に型が付きます。存在しないパス、足りない params、受け付けない search は型エラーになります。

```tsx
<a href={href("/users/:id", { params: { id: "1" } })}>ユーザー1</a>
<a href={href("/users", { search: { page: 2 } })}>2 ページ目</a>
```

`plugins/routes.ts`（Vite プラグイン）が `src/routes/` を読んで、ルートを Hono の app に登録する `src/routes.gen.ts` を書き出します。dev の間は、ファイルを足したり消したりすると書き直します。`routes.gen.ts` はコミットしません。

## React Router との対応

| やりたいこと | このルーター | React Router |
|---|---|---|
| ルートの定義 | `src/routes/users/[id]/index.tsx` | `{ path: "/users/:id" }` |
| データ取得 | `loader` | `loader` |
| 待っている間の表示 | `Pending` | `HydrateFallback`（最初の表示のみ） |
| フォーム送信 | `action` | `action` |
| リダイレクト | `redirect()` / middleware では `c.redirect()` | `redirect()` |
| ガード | `_middleware.ts` | 親ルートの `loader` / middleware |
| レイアウト | `_layout.tsx` | `<Outlet />` |
| loader のエラー | `ErrorComponent` | `ErrorBoundary` |
| 404 | `_404.tsx` | `errorElement` |
| search params | `validateSearch` と loader の `search` | `new URL(request.url).searchParams` |
| 遷移の中断 | `request.signal` | `request.signal` |
| 遷移中かどうか | `useNavigating()` | `useNavigation().state` |
| 先読み | リンクにマウスを乗せると自動 | `<Link prefetch="intent">` |

## 仕組み

ルーターは 3 つに分かれています。

- Hono（`src/routes.gen.ts` が登録する）：URL がどのルートに当たるかを決め、ガードの middleware を通す。POST なら action を動かす
- `src/router.ts`（ルーティング）：ブラウザと Hono の間をつなぎ、loader を呼び、状態を `subscribe` 先に知らせる。画面のことは知らない
- `src/jsx-adapter.tsx`（描画）：状態を見て、レイアウトの中に `Pending` / 画面のコンポーネント / エラーのどれかを `hono/jsx/dom` で描画する

1. `<a>` のクリックとフォーム送信を横取りし、`history.pushState` で URL を更新する
2. URL から `Request` を作り、`app.fetch` に渡す。Hono は当たったルートと params を置いて、本文が空の `Response` を返す
3. `Response` が 3xx なら `Location` 先へ `history.replaceState` し、もう一度 2 から実行する
4. 当たったルートを、外側から順の段（全体のレイアウト、/users のレイアウト、ページ）の並びにする
5. 各段の `loader` を同時に呼ぶ。届いたものから、その段のコンポーネントに渡して描く。まだ届いていない段には、その段の `Pending` を描く
6. 外側から見て最初の未完了の段に `Pending` がなければ、前の画面のまま待つ。その間は `useNavigating()` が true になる
7. `popstate`（戻る・進む）では URL を積まずに 2 から実行する

スクロール位置は、ブラウザの自動復元を止めて（`history.scrollRestoration = "manual"`）ルーターが戻します。`pushState` で履歴の項目ごとに key を付けて、その項目を離れるときの位置を覚えておきます。新しいページは一番上から、戻る・進むでは覚えておいた位置から表示します。

新しい遷移が始まると、`AbortController` で前の遷移を中断します。これにより、遅れて届いた古いデータで画面が上書きされることはありません。

### 当たったルートの受け渡し

`Response` には「どのルートに当たったか」を入れる場所がありません。そのため、Hono のハンドラは当たったルートと params を `Request` をキーにした `WeakMap` に置き、本文が空の `Response` を返します。ルーターは `Response` でステータスとリダイレクトを判定し、当たったルートは `WeakMap` から受け取ります。

## ファイル構成

```
src/
  router.ts         ルーティング（画面のことは知らない）
  jsx-adapter.tsx   hono/jsx での描画
  routes/           ルート定義（サンプルアプリ）
  routes.gen.ts     plugins/routes.ts が書き出す。コミットしない
  lib/              サンプルアプリのログイン状態とデータ取得
  main.tsx          ルート定義とルーターをつなぐ
plugins/
  routes.ts         src/routes から routes.gen.ts と .routes-types/ を書き出す
.routes-types/      ルートごとの型（+types）。コミットしない
```

## 動かし方

```bash
pnpm install
pnpm dev
```

## 未対応のこと

- コンポーネントの描画中のエラーと、action のエラーを受けること（今は loader のエラーだけ）
- スクロール位置をリロードのあとも残すこと（今はメモリに覚えているだけ）
- `#section` のようなハッシュへのリンク
- 使われなかった preload の取得を止めることと、preload しないリンクを選ぶこと
