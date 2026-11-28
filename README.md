# hono-client-router

Hono をブラウザで動かして作った、クライアントサイドルーターです。

Hono のアプリは `app.fetch(request)` を呼ぶと `Response` を返します。`Request` も `Response` も Web 標準なので、このやり取りはサーバーを通さずブラウザの中だけでも成り立ちます。そこで、リンクのクリックや戻る操作を `Request` に変えて `app.fetch` に渡し、Hono のマッチングと middleware をクライアントのルーターに使っています。データの取得と描画は、TanStack Router や React Router と同じように、ルーターが loader とコンポーネントを呼んで行います。

学習用の実験です。ライブラリとして配布はしていません。

## パッケージ

pnpm workspace で、ルーター本体と、描画のフレームワークごとの adapter と、サンプルアプリに分けています。TanStack Router の `router-core` と `react-router` / `solid-router` と同じ分け方です。

| パッケージ | 中身 |
|---|---|
| `@hcr/core` | ルーター本体（`createRouter` / `href` / `redirect` / 型）と、生成のしくみ（`@hcr/core/vite`）。描画のフレームワークに依存しない |
| `@hcr/hono-jsx` | hono/jsx/dom 用の adapter（`mountRouter` / `useNavigate` / `<Link>` / `useNavigating`）。core のものも export し直す |
| `@hcr/react` | React 用の adapter。中身は `@hcr/hono-jsx` と同じ |
| `apps/hono-jsx` | hono/jsx 版のサンプル |
| `apps/react` | React 版のサンプル |

アプリは adapter のパッケージから import します。

```tsx
import { createRouter, href, Link, mountRouter, useNavigate } from "@hcr/hono-jsx"; // React なら "@hcr/react"
```

## 書き方

アプリの `src/routes/` のディレクトリが URL になります（例は `apps/hono-jsx`）。決まりは [hono-kit](https://github.com/ashunar0/hono-kit) に揃えています。

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

export const loader = ({ params, request, context }: Route.LoaderArgs) =>
  context.users.fetchUser(params.id, request.signal);

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
export const action = ({ context }: Route.ActionArgs) => {
  context.session.logIn();
  return redirect(href("/admin"));
};

// src/routes/admin/_middleware.ts（Hono の middleware）
const guard: Middleware = async (c, next) => {
  if (!c.env.session.isLoggedIn()) return c.redirect(href("/login"));
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

export const loader = ({ search, request, context }: Route.LoaderArgs) =>
  context.users.fetchUserPage(search.page, request.signal);
```

loader と action と middleware が使うもの（API クライアント、ログイン状態など）は、ルートのファイルで import せずに、`createRouter` に `context` として渡します。型は `Register` に書き足すと、`Route.LoaderArgs` / `Route.ActionArgs` の `context` と、`Middleware` の `c.env` に付きます。`context` を渡し忘れると型エラーになります。

```tsx
// src/context.ts
export const createContext = (cookie: CookieJar) => ({ users, session: createSession(cookie) });

declare module "@hcr/core" {
  interface Register {
    context: ReturnType<typeof createContext>;
  }
}

// src/main.tsx
const context = createContext({ get: () => /* document.cookie から読む */, set: (value) => /* document.cookie に書く */ });
const router = createRouter(app, { context });
```

action と middleware は Hono の中で動くので、ルーターは `app.fetch(request, context)` の第 2 引数で渡しています。Cloudflare Workers で env（バインディング）を渡すのと同じ通り道なので、Hono の側では `c.env` で読めます。

`_middleware.ts` が `c.set()` したものは、そのディレクトリ配下の loader と action の `context` に足されます。足すものの型は `Middleware<{ ... }>` に書きます。生成する型は、そのファイルの上にある `_middleware.ts` だけを足すので、配下でないページで `context.user` と書くと型エラーになります。外側の context と同じ名前を足すと、上書きで隠れないように `routes.gen.ts` が型エラーになります。

```tsx
// src/routes/admin/_middleware.ts
const guard: Middleware<{ user: User }> = async (c, next) => {
  const user = c.env.session.user();
  if (!user) return c.redirect(href("/login"));
  c.set("user", user);
  await next();
};

// src/routes/admin/index.tsx
export const loader = ({ context }: Route.LoaderArgs) => ({ name: context.user.name });
```

React Router v7 は、型の付いた鍵（`createContext<User>()`）で `context.set()` / `context.get()` します。鍵の型は入っているものの形を保証しますが、その middleware を通ったか（本当に入っているか）は実行時にしかわかりません。このルーターは middleware をディレクトリに置き、型を生成するので、通ってきた middleware が型でわかります。

loader が失敗すると、その段から外側に向かっていちばん近い `ErrorComponent` を、その段の場所に出します。それより外側のレイアウトはそのまま描きます。どの段にも `ErrorComponent` がなければ、決まった表示を画面全体に出します。

loader の結果は、段ごとに、その段の params と検証した search params を鍵にして取っておきます。戻る・進むなどで同じ鍵の段をまた描くときは、取っておいた結果ですぐに描き、裏で loader を呼び直して、届いたら差し替えます（stale-while-revalidate）。取り直しに失敗したときは、古い結果のまま出しておきます。`createRouter(app, { staleTime: 60_000 })` のように渡すと、取ってからその時間のあいだは呼び直しません（初期値は 0）。action のあとは、取っておいた結果を全部捨てます。30 分使われなかった結果も捨てます。

リンクにマウスを乗せて 50ms たつと（またはフォーカスすると）、その URL の loader を先に呼んでおきます（preload）。結果は同じところに取っておき、30 秒以内にクリックすれば呼び直さずに使います。届いていれば待たずに描き、取得の途中なら同じ取得の完了を待ちます。

React Router v7 は、loader の結果を取っておきません。遷移のたびに loader を呼び、取っておきたいときは HTTP のキャッシュか TanStack Query などを使う、という考え方です。TanStack Router は、このルーターと同じく stale-while-revalidate で取っておきます（`staleTime` の初期値も 0）。

リンクは `href()` で作ると、パスと params と search に型が付きます。存在しないパス、足りない params、受け付けない search は型エラーになります。

```tsx
<a href={href("/users/:id", { params: { id: "1" } })}>ユーザー1</a>
<a href={href("/users", { search: { page: 2 } })}>2 ページ目</a>
```

`<Link>` は、今いるページを指していれば `aria-current="page"` を付けます。配下のページにいても付きます（`end` を付けると完全に一致したときだけ）。コードから遷移するときは `useNavigate()` を使います。`<Link to>` と `navigate()` は `href()` で作った URL しか受け取らないので、文字列を直接渡すと型エラーになります。

```tsx
<Link to={href("/users")}>Users</Link>

const navigate = useNavigate();
navigate(href("/users", { search: { q } }), { replace: true, resetScroll: false });
```

`@hcr/core/vite` の Vite プラグイン（`plugins: [routes()]`）が `src/routes/` を読んで、ルートを Hono の app に登録する `src/routes.gen.ts` を書き出します。dev の間は、ファイルを足したり消したりすると書き直します。`routes.gen.ts` はコミットしません。

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
| loader / action に依存を渡す | `createRouter(app, { context })` | `context`（サーバーでは `getLoadContext`） |
| middleware から loader に渡す | `c.set()` → `context.user` | `context.set(key)` → `context.get(key)` |
| 遷移中かどうか | `useNavigating()` | `useNavigation().state` |
| リンク | `<Link>`（今いるページなら `aria-current="page"`） | `<NavLink>` |
| コードから遷移 | `useNavigate()` | `useNavigate()` |
| 先読み | リンクにマウスを乗せると自動 | `<Link prefetch="intent">` |
| loader の結果を取っておく | 段ごとに取っておく（`staleTime`） | 取っておかない（HTTP のキャッシュなどに任せる） |

## 仕組み

ルーターは 3 つに分かれています。

- Hono（アプリの `src/routes.gen.ts` が登録する）：URL がどのルートに当たるかを決め、ガードの middleware を通す。POST なら action を動かす
- `@hcr/core`（ルーティング）：ブラウザと Hono の間をつなぎ、loader を呼び、状態を `subscribe` 先に知らせる。画面のことは知らない
- adapter（`@hcr/hono-jsx` / `@hcr/react`、描画）：状態を見て、レイアウトの中に `Pending` / 画面のコンポーネント / エラーのどれかを描画する

1. Navigation API の `navigate` イベントで、ページの中で起きる遷移（リンクのクリック、フォーム送信、戻る・進む、`navigation.navigate()`）を横取りする（`e.intercept()`）。URL と履歴はブラウザが更新する
2. 行き先の URL から `Request` を作り、`app.fetch` に渡す。POST のフォームなら、`e.formData` を本文にする。Hono は当たったルートと params を置いて、本文が空の `Response` を返す
3. `Response` が 3xx なら、`navigation.navigate(Location, { history: "replace" })` で遷移し直す
4. 当たったルートを、外側から順の段（全体のレイアウト、/users のレイアウト、ページ）の並びにする
5. 各段の `loader` を同時に呼ぶ。届いたものから、その段のコンポーネントに渡して描く。まだ届いていない段には、その段の `Pending` を描く
6. 外側から見て最初の未完了の段に `Pending` がなければ、前の画面のまま待つ。その間は `useNavigating()` が true になる
7. 描き終わったら `e.scroll()` を呼ぶ

横取りしないものは、ブラウザに任せます。同じページの `#hash` への移動（`e.hashChange`）、ダウンロードのリンク、別オリジンへの遷移、新しいタブで開く操作（Ctrl/Cmd クリックなど。`navigate` イベント自体が来ません）です。

スクロールは、`e.intercept({ scroll: "manual" })` で止めておき、新しい画面を描いてから `e.scroll()` でブラウザに任せます。新しいページは一番上から（URL に `#hash` があればそこから）、戻る・進むではその項目を離れたときの位置から表示します。位置はブラウザが履歴の項目ごとに覚えているので、リロードしたあとでも戻ります。

新しい遷移が始まると、前の遷移を中断します。`navigate` イベントの `e.signal` は、その遷移の handler が終わるまでしか abort されません。loader を裏で取り直している途中で次の遷移が来ることもあるので、ルーターは自分でも `AbortController` を持ち、`AbortSignal.any()` で `e.signal` とつないでいます。これにより、遅れて届いた古いデータで画面が上書きされることはありません。

### サーバーでも同じ app を動かす

ふつうの SPA では、サーバーはルートの表を知らないので、どの URL にも `index.html` を 200 で返します。無いページも、ログインが要るページも、ブラウザで JS が動いてから 404 の画面を描いたり、リダイレクトしたりします。HTTP のステータスは 200 のままです。

このルーターのルートの表は Hono の app なので、同じ app をサーバーにも置けます。`@hcr/core/server` の `pages()` は、ページを開いたとき（GET）に、ブラウザと同じ `app.fetch` でルートを判定し、正しいステータスで HTML を返します。

| サーバーで `app.fetch` した結果 | 返すもの |
|---|---|
| ページに当たった | HTML を 200 で |
| `_404.tsx` に当たった、どのルートにも当たらなかった | HTML を 404 で |
| middleware がリダイレクトした | そのリダイレクト（HTML は返さない） |
| middleware がほかのステータスを返した | HTML をそのステータスで |

```ts
// src/server.ts
const server = new Hono();
// server.route("/api", api) のように、API も同じ Hono に置ける
server.get(
  "*",
  pages(app, {
    html, // <div id="app"></div> と、src/main.tsx を読み込む <script> を入れた HTML
    context: (c) =>
      createContext({
        get: () => getCookie(c, "session"),
        set: (value) => setCookie(c, "session", value, { path: "/" }),
      }),
  }),
);
export default server;
```

- loader と画面は、サーバーでは動かしません（SSR はしません）。サーバーがするのは、ルートの判定と、middleware を通すことだけです
- `context` は、ブラウザで `createRouter` に渡すものと同じ形のものを、リクエストごとに作ります。ログイン状態は人によって違うからです。サンプルでは、ブラウザは `document.cookie`、サーバーはリクエストの Cookie ヘッダーから、同じ cookie を読みます
- サーバーのガードがよくするのは、ステータスと、「画面が一瞬見えてからリダイレクトされる」ことです。データを守るのは、loader が呼ぶ API の側です
- dev では、`@hono/vite-dev-server` が `src/server.ts` を動かします。`.tsx` などのファイルは Vite が返します
- ビルドは 2 回です。`vite build --mode client` で `src/main.tsx` から `dist/static/client.js` を作り、`vite build`（`@hono/vite-build/node`）で `src/server.ts` から Node で動く `dist/index.js` を作ります。`dist/index.js` は `/static/*` のファイルも返します。HTML が読み込むスクリプトは、dev では `/src/main.tsx`、ビルドしたあとは `/static/client.js` です（`import.meta.env.PROD` で切り替えます）。`index.html` はありません

React Router の SPA モードや data mode、TanStack Router の SPA では、loader をブラウザで動かしたまま、サーバーでルートを判定することはできません。正しいステータスを返すには、loader がサーバーで動く構成（React Router の framework mode の `ssr: true`、TanStack Start）にする必要があります。

### 当たったルートの受け渡し

`Response` には「どのルートに当たったか」を入れる場所がありません。そのため、Hono のハンドラは当たったルートと params を `Request` をキーにした `WeakMap` に置き、本文が空の `Response` を返します。ルーターは `Response` でステータスとリダイレクトを判定し、当たったルートは `WeakMap` から受け取ります。

## ファイル構成

```
packages/
  core/src/router.ts       ルーター本体（画面のことは知らない）
  core/src/server.ts       サーバーで同じ app を動かし、正しいステータスで HTML を返す pages()
  core/src/vite.ts         src/routes から routes.gen.ts と .routes-types/ を書き出す Vite プラグイン
  hono-jsx/src/index.tsx   hono/jsx/dom 用の adapter
  react/src/index.tsx      React 用の adapter
apps/
  hono-jsx/                hono/jsx 版のサンプル
  react/                   React 版のサンプル
    src/routes/            ルート定義
    src/lib/               サンプルのログイン状態とデータ取得
    src/context.ts         loader / action / middleware に渡す context の作り方と型
    src/main.tsx           ブラウザ：ルート定義とルーターをつなぎ、context を渡す
    src/server.ts          サーバー：同じルート定義で、ページを開いたときのステータスを決める
    src/routes.gen.ts      生成される。コミットしない
    .routes-types/         ルートごとの型（+types）。生成される。コミットしない
notes/                     学習ノート（書いた時点の記録。今の構成とは違うところがある）
```

## 動かし方

```bash
pnpm install
pnpm dev         # hono/jsx 版（apps/hono-jsx）
pnpm dev:react   # React 版（apps/react）
pnpm build       # 両方をビルドして型をチェックする
pnpm --filter @hcr/app-hono-jsx start   # ビルドしたサーバーを Node で動かす（http://localhost:3000）
```

## adapter の役割

`apps/hono-jsx` と `apps/react` は、同じ `@hcr/core` を使っています。違うのは adapter とページだけです。

- adapter は `useNavigate()` / `<Link>` / `useNavigating()` / `mountRouter()` を、それぞれのフレームワークの仕組みで作ります
- レイアウトの `children` の型は、adapter が `declare module "@hcr/core"` で `Register` に教えます（hono/jsx なら `Child`、React なら `ReactNode`）
- React 版の検索欄は、`value` ではなく `defaultValue` にしています。React の `value` だと、遷移が終わるまで入力欄が古い値に戻されるためです

## 未対応のこと

- コンポーネントの描画中のエラーと、action のエラーを受けること（今は loader のエラーだけ）
- Navigation API がないブラウザ（Safari 26.2 / Firefox 147 より前）で動かすこと
- SSR（サーバーで loader と画面を動かして、HTML を作ること）
- middleware がリダイレクト以外のステータス（403 など）を返したときに、ブラウザで出す画面
- 使われなかった preload の取得を止めることと、preload しないリンクを選ぶこと
