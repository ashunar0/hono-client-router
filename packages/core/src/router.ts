import type { Hono, MiddlewareHandler } from "hono";

// ---- search params のスキーマ ----

// Standard Schema（zod、valibot などが実装している共通の形）のうち、ここで使うところだけ
export interface SearchSchema<Output = unknown> {
  readonly "~standard": {
    validate(
      value: unknown,
    ):
      | { readonly value: Output; readonly issues?: undefined }
      | { readonly issues: readonly { readonly message: string }[] }
      | Promise<{ readonly value: Output; readonly issues?: undefined } | { readonly issues: readonly { readonly message: string }[] }>;
    readonly types?: { readonly input: unknown; readonly output: Output } | undefined;
  };
}

// スキーマが返す型。スキーマがなければ空
type OutputOf<S> = S extends SearchSchema<infer O> ? O : Record<never, never>;

// ページやレイアウトのファイルが受け付ける search params。リンクを作るときは、どれも省略できる
export type SearchOfModule<M> = M extends { validateSearch: infer S } ? Partial<OutputOf<S>> : Record<never, never>;

// ファイルの中身から、生成した型（+types）が使う型を取り出す
export type SchemaOfModule<M> = M extends { validateSearch: infer S } ? S : undefined;
export type LoaderDataOfModule<M> = M extends { loader: (...args: never[]) => infer R } ? Awaited<R> : undefined;

// ---- ルートの定義 ----

// routes.gen.ts が declare module で routes を書き足す（ルートのパス → そのルートの search params）。
// adapter は child（レイアウトの children の型）を書き足す
export interface Register {}
type Routes = Register extends { routes: infer R } ? R : Record<string, Record<never, never>>;
export type RoutePath = keyof Routes & string;
// レイアウトの children の型。adapter が declare module で Register に child を書き足す（hono/jsx なら Child、React なら ReactNode）
export type RouteChild = Register extends { child: infer C } ? C : unknown;
// loader / action / middleware に渡すもの。アプリが declare module で Register に context を書き足し、createRouter に渡す
export type RouterContext = Register extends { context: infer C } ? C : undefined;
// loader / action が受け取る context のうち、createRouter に渡した部分。渡していなければ空。
// RouterContext extends object ? ... と書くと、Disjoint の中で keyof が計算されずに残り、重なっていなくても型エラーになる
export type BaseContext = RouterContext extends undefined ? {} : RouterContext;

// "/users/:id" → { id: string }。catch-all の ":path{.+}" も path になる
type ParamsOf<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? { [K in StripPattern<Name>]: string } & ParamsOf<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? { [K in StripPattern<Name>]: string }
    : {};
type StripPattern<Name extends string> = Name extends `${infer N}{${string}}` ? N : Name;

// loader と action が受け取るもの。request.signal は、遷移が古くなったら abort される。
// search は、その段の validateSearch で検証したもの（S に typeof validateSearch を渡すと型が付く）。
// context は、createRouter に渡したものに、通ってきた middleware が c.set() したものを足したもの（C に渡す）
export type LoaderArgs<P extends string = string, S = undefined, C = BaseContext> = {
  params: ParamsOf<P>;
  request: Request;
  search: OutputOf<S>;
  context: C;
};
export type ActionArgs<P extends string = string, C = BaseContext> = { params: ParamsOf<P>; request: Request; context: C };

// _middleware.ts の型。c.env で createRouter に渡した context を読める。
// V は、この middleware が c.set() するもの。配下の loader / action の context に足される
export type Middleware<V extends object = {}> = MiddlewareHandler<{ Bindings: BaseContext; Variables: V }>;

// middleware の型から、c.set() するものを取り出す。生成した型（+types）が使う
export type VarsOf<M> = M extends Middleware<infer V> ? V : {};

// 外側の context に、middleware が c.set() するものを足す。同じ名前があれば型エラーにする（上書きで隠れないように）
export type Disjoint<A, B extends { [K in keyof A & keyof B]: "この名前は外側の context にもある" }> = A & B;

// ルーターの側から見た loader の引数。ページごとの LoaderArgs<"/users/:id", ...> をどれも受け入れられるように、
// 型引数を使わずに書く（型引数で比べると、search の型が合わないと判定されてしまう）
type AnyLoaderArgs = { params: Record<string, string>; request: Request; search: unknown; context: unknown };

// ページのファイル（index.tsx）とレイアウト（_layout.tsx）が export するもの。画面のコンポーネントは default export。
// コンポーネントは adapter が描くので、ここでは中身を知らない
export type RouteModule = {
  validateSearch?: SearchSchema;
  loader?(args: AnyLoaderArgs): unknown;
  action?(args: ActionArgs): Response | Promise<Response>;
  Pending?: unknown;
  ErrorComponent?: unknown;
  default?: unknown;
};

// ルートの 1 段。全体のレイアウト、/users のレイアウト、ページ、のように外側から並ぶ
export type Segment = {
  paramNames: string[]; // この段までの params の名前。変わらなければ、データを使い回せる
  validateSearch?: SearchSchema; // この段が受け付ける search params。検証した結果が変わらなければ、データを使い回せる
  loader?(args: AnyLoaderArgs): unknown;
  Pending?: unknown;
  ErrorComponent?: unknown; // この段か、内側の段の loader が失敗したときに、この段の場所に出す
  Component?: unknown;
};

// ファイルの中身から段を作る。routes.gen.ts が使う
export const toSegment = (paramNames: string[], module: RouteModule): Segment => ({
  paramNames,
  validateSearch: module.validateSearch,
  loader: module.loader,
  Pending: module.Pending,
  ErrorComponent: module.ErrorComponent,
  Component: module.default,
});

// ルーターが扱うルート。外側から順の段と、フォーム送信の action
export type Route = {
  segments: Segment[];
  action?(args: ActionArgs): Response | Promise<Response>;
};

// レイアウトの段と、ページのファイルからルートを作る。routes.gen.ts が使う
export const toRoute = (layouts: Segment[], paramNames: string[], page: RouteModule): Route => ({
  segments: [...layouts, toSegment(paramNames, page)],
  action: page.action,
});

// ---- リンクとリダイレクト ----

// href() の 2 つ目の引数。params が要るルートでは params が必須。search は、そのルートの段が受け付けるもの
type HrefOptions<P extends string> = (keyof ParamsOf<P> extends never ? { params?: never } : { params: ParamsOf<P> }) & {
  // search を 1 つも受け付けないルートでは、search を渡せない（{} だと余分なキーを見逃すため）
  search?: P extends keyof Routes ? (keyof Routes[P] extends never ? never : Routes[P]) : never;
};

// href() で作った URL。navigate() と <Link to> は、これしか受け取らない（文字列を直接渡すと型エラーになる）
export type Href = string & { readonly __brand: "Href" };

// ルートのパスと params / search から URL を作る。存在しないパス、足りない params、受け付けない search は型エラーになる。
// P を RoutePath で縛らないのは、一覧にないパスのとき「引数の数が違う」ではなく
// 「そのパスは一覧にない」というエラーにするため
export function href<P extends string>(
  path: P extends RoutePath ? P : keyof Routes & string,
  ...[options]: P extends RoutePath
    ? keyof ParamsOf<P> extends never
      ? [options?: HrefOptions<P>]
      : [options: HrefOptions<P>]
    : [options?: unknown]
): Href {
  const { params = {}, search = {} } = (options ?? {}) as {
    params?: Record<string, string>;
    search?: Record<string, unknown>;
  };
  const pathname = path.replace(/:(\w+)(\{[^}]*\})?/g, (_, name: string) =>
    // catch-all（{.+}）の値は a/b/c のようにスラッシュを含むので、段ごとにエンコードする
    params[name].split("/").map(encodeURIComponent).join("/"),
  );
  const entries = Object.entries(search).filter(([, value]) => value !== undefined);
  const query = new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString();
  return (query ? `${pathname}?${query}` : pathname) as Href;
}

// action から返すリダイレクト
export const redirect = (url: string) => new Response(null, { status: 302, headers: { Location: url } });

// ---- Hono から「どのルートに当たったか」を受け取る ----

// vars は、通ってきた middleware が c.set() したもの（c.var）
type Match = { route: Route; params: Record<string, string>; vars: object };

// Hono のハンドラが置いていく、当たったルートの置き場（Response とは別の「裏口」）
const matches = new WeakMap<Request, Match>();

export function putMatch(req: Request, route: Route, params: Record<string, string>, vars: object) {
  matches.set(req, { route, params, vars });
}

// ---- ルーター ----

// 段ごとの状態
export type SegmentState = {
  segment: Segment;
  status: "pending" | "success" | "error"; // loader の状態。loader がない段は最初から success
  search: unknown; // この段の validateSearch で検証した search params
  data: unknown; // loader が返したもの
  error: unknown; // loader が投げたもの
};

export type RouterState = {
  matches: SegmentState[]; // いま出しているルートの段。外側から順
  params: Record<string, string>;
  location: { pathname: string; search: string }; // いま出している画面の URL
  navigating: boolean; // 遷移の途中か
};

export type NavigateOptions = {
  replace?: boolean; // 履歴を積まずに、今の項目を置き換える
  resetScroll?: boolean; // 描いたあとに一番上へスクロールするか（初期値は true）
};

export type Router = {
  // 状態が変わるたびに受け取る。登録した時点で状態があれば、すぐに 1 回呼ぶ
  subscribe(listener: (state: RouterState) => void): () => void;
  // コードから遷移する。URL は href() で作る
  navigate(to: Href, options?: NavigateOptions): void;
};

// navigation.navigate() の info で、navigate イベントに渡すもの
type NavigateInfo = {
  revalidate?: boolean; // action のあとのリダイレクト。レイアウトのデータも使い回さずに取り直す
  resetScroll?: boolean; // false なら、描いたあとにスクロールしない
};

// createRouter の 2 つ目の引数。Register に context を書き足したら、context は必須
type RouterOptions = {
  context: RouterContext;
  // loader の結果を、取ってから何ミリ秒は新しいとみなすか（初期値は 0）。
  // 古い結果しかなければ、それで描いてから裏で取り直す
  staleTime?: number;
};

// ルーティングだけを担当する。画面に何をどう描くかは知らない
export function createRouter(
  app: Hono,
  ...[options]: undefined extends RouterContext ? [options?: Partial<RouterOptions>] : [options: RouterOptions]
): Router {
  const context = options?.context;
  const staleTime = options?.staleTime ?? 0;
  // Hono には第 2 引数（c.env）で渡す。action と middleware は c.env から読む
  const fetchRoute = (req: Request) => app.fetch(req, context as object | undefined);
  const listeners = new Set<(state: RouterState) => void>();
  let state: RouterState = { matches: [], params: {}, location: { pathname: "", search: "" }, navigating: false };
  let started = false;

  function publish(next: Partial<RouterState>) {
    state = { ...state, ...next };
    started = true;
    for (const listener of listeners) listener(state);
  }

  // いま出している（または出そうとしている）遷移。新しい遷移が始まったら abort する。
  // navigate イベントの e.signal は handler が終わるまでしか abort されないので、
  // handler のあとも続く裏の取り直しを止めるために、自分でも持つ
  let current: AbortController | undefined;

  // ---- loader の呼び出しとキャッシュ ----

  // loader 1 回ぶんの呼び出し。終わったら結果が settled に、届いた時刻が at に入る（終わっていれば、待たずに使える）
  type Loading = {
    promise: Promise<unknown>;
    // loader に渡した request.signal。届く前に abort されたら、もう使わない。
    // 遷移が終わったあとも、次の遷移が始まると abort されるので、届いたものは見ない
    signal: AbortSignal;
    preload: boolean; // preload で呼んだものか。遷移で使うまでは、PRELOAD_STALE_MS のあいだ新しいとみなす
    settled?: { ok: true; data: unknown } | { ok: false; error: unknown };
    at?: number;
  };

  // loader の呼び出しを、段ごとに取っておく。鍵は、その段の params と、検証した search params。
  // 失敗したものは取っておかない。action のあとは全部捨てる
  const cache = new Map<Segment, Map<string, Loading>>();
  const keyOf = (segment: Segment, params: Record<string, string>, search: unknown) =>
    JSON.stringify([segment.paramNames.map((name) => params[name]), search]);
  const cached = (segment: Segment, params: Record<string, string>, search: unknown) => {
    const loading = cache.get(segment)?.get(keyOf(segment, params, search));
    return loading && (loading.settled || !loading.signal.aborted) ? loading : undefined;
  };
  // 取得の途中か、届いてから ms 以内なら新しい
  const fresh = (loading: Loading, ms: number) => !loading.settled || Date.now() - (loading.at ?? 0) < ms;

  // 先読みしてからクリックするまでに取り直さないよう、preload した結果は 30 秒は新しいとみなす
  const PRELOAD_STALE_MS = 30_000;
  // 30 分使われなかった結果は捨てる
  const GC_MS = 30 * 60_000;

  // loader に渡す context。createRouter に渡したものに、middleware が c.set() したものを足す
  function startLoad(match: Match, segment: Segment, request: Request, search: unknown, preload = false): Loading {
    const { params, vars } = match;
    const args = { params, request, search, context: { ...context, ...vars } };
    const loading: Loading = { promise: Promise.resolve().then(() => segment.loader?.(args)), signal: request.signal, preload };

    const key = keyOf(segment, params, search);
    const entries = cache.get(segment) ?? new Map<string, Loading>();
    cache.set(segment, entries.set(key, loading));
    loading.promise.then(
      (data) => {
        loading.settled = { ok: true, data };
        loading.at = Date.now();
      },
      (error) => {
        loading.settled = { ok: false, error };
        if (entries.get(key) === loading) entries.delete(key);
      },
    );
    return loading;
  }

  // URL の search params を、段の validateSearch で検証する。validateSearch がない段は、search params を使わない
  type Validated = { ok: true; search: unknown } | { ok: false; error: Error };
  async function validateSearchOf(segment: Segment, url: string): Promise<Validated> {
    if (!segment.validateSearch) return { ok: true, search: {} };
    const input = Object.fromEntries(new URL(url).searchParams);
    const result = await segment.validateSearch["~standard"].validate(input);
    if (result.issues) return { ok: false, error: new Error(result.issues.map((issue) => issue.message).join(", ")) };
    return { ok: true, search: result.value };
  }

  // 前の画面の段のデータを、そのまま使い回せるか。同じ段で、その段の params も、検証した search params も同じならよい。
  // validateSearch がない段は、search params が変わっても使い回せる
  const reusable = (segment: Segment, params: Record<string, string>, search: unknown) => {
    const prev = state.matches.find((m) => m.segment === segment);
    const sameParams = segment.paramNames.every((name) => state.params[name] === params[name]);
    const sameSearch = JSON.stringify(prev?.search) === JSON.stringify(search);
    return prev?.status === "success" && sameParams && sameSearch ? prev : undefined;
  };

  // ガードを通している途中の URL。同じ URL で何度も通さない
  const preloading = new Set<string>();

  // その URL の loader を先に呼んで、キャッシュに入れておく。リンクにマウスを乗せたときに使う
  async function preload(url: string) {
    if (preloading.has(url)) return;
    preloading.add(url);
    try {
      // ガードも通す。リダイレクトになるなら、何も取っておかない
      const req = new Request(url);
      const res = await fetchRoute(req);
      const match = matches.get(req);
      if ((res.status >= 300 && res.status < 400) || !match) return;

      for (const segment of match.route.segments) {
        if (!segment.loader) continue;
        // search params が通らない段と、遷移しても使い回される段と、キャッシュが新しい段は、取りに行かない
        const validated = await validateSearchOf(segment, url);
        if (!validated.ok || reusable(segment, match.params, validated.search)) continue;
        const hit = cached(segment, match.params, validated.search);
        if (hit && fresh(hit, Math.max(staleTime, PRELOAD_STALE_MS))) continue;
        startLoad(match, segment, req, validated.search, true);
      }
    } finally {
      preloading.delete(url);
    }
  }

  // ② Hono にどのルートかを聞いて、loader を呼び、結果を知らせる。待つ必要のある loader が全部届いたら true を返す。
  // 途中で古くなったり、別の URL に遷移し直したりしたら false。
  // revalidate が true なら、レイアウトのデータも使い回さずに取り直す（action のあと）
  async function navigate(url: string, init?: RequestInit, revalidate = false, eventSignal?: AbortSignal): Promise<boolean> {
    // 新しい遷移が始まったら、古い遷移は止める
    current?.abort();
    const controller = (current = new AbortController());
    const signal = eventSignal ? AbortSignal.any([controller.signal, eventSignal]) : controller.signal;

    // まずは前の画面のまま、遷移中であることだけを知らせる
    if (!state.navigating) publish({ navigating: true });

    // Hono はマッチングとガード（middleware）だけをする。POST なら action も動く
    const req = new Request(url, { ...init, signal });
    const res = await fetchRoute(req);
    if (signal.aborted) return false; // 待っている間に古くなったら知らせない

    const afterAction = revalidate || req.method === "POST";

    // リダイレクト: 今の履歴の項目を Location 先で置き換える遷移を、新しく始める（この遷移はそこで止まる）
    const location = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url).href;
      navigation.navigate(next, { history: "replace", info: { revalidate: afterAction } satisfies NavigateInfo });
      return false;
    }

    const match = matches.get(req);
    if (!match) {
      // action がリダイレクトしなかったときは、同じ URL を GET で読み直す
      if (req.method === "POST") return navigate(url, undefined, true, eventSignal);
      // どのルートにも当たらず、_404 もないとき
      const { pathname, search } = new URL(url);
      publish({ matches: [], params: {}, location: { pathname, search }, navigating: false });
      return true;
    }

    const { route, params } = match;

    // 段ごとに search params を検証する
    const validated = await Promise.all(route.segments.map((segment) => validateSearchOf(segment, url)));
    if (signal.aborted) return false;

    // action のあとは、キャッシュを全部捨てて取り直す。そうでなければ、長く使われなかったものだけ捨てる
    if (afterAction) cache.clear();
    for (const entries of cache.values()) {
      for (const [key, loading] of entries) if (loading.at && Date.now() - loading.at > GC_MS) entries.delete(key);
    }

    // 段ごとの状態を作る。
    // 1. 前の画面と同じ段で、その段の params も同じなら、データを使い回す
    // 2. キャッシュが新しければ、それを使う。取得の途中なら、その完了を待つ
    // 3. キャッシュが古ければ、それで描いて、裏で取り直す（refetches）
    // 4. どれでもなければ、loader を呼ぶ
    const loadings: (Loading | undefined)[] = [];
    const refetches: (Loading | undefined)[] = [];
    let next = route.segments.map((segment, i): SegmentState => {
      const v = validated[i];
      // search params が通らなければ、その段のエラーにする
      if (!v.ok) return { segment, status: "error", search: undefined, data: undefined, error: v.error };
      const prev = afterAction ? undefined : reusable(segment, params, v.search);
      if (prev) return prev;
      if (!segment.loader) return { segment, status: "success", search: v.search, data: undefined, error: undefined };

      const hit = cached(segment, params, v.search);
      if (hit?.settled?.ok) {
        const freshMs = hit.preload ? Math.max(staleTime, PRELOAD_STALE_MS) : staleTime;
        if (!fresh(hit, freshMs)) refetches[i] = startLoad(match, segment, req, v.search);
        hit.preload = false; // 遷移で使ったら、ふつうのキャッシュと同じ扱いにする
        return { segment, status: "success", search: v.search, data: hit.settled.data, error: undefined };
      }
      if (hit) hit.preload = false;
      loadings[i] = hit ?? startLoad(match, segment, req, v.search);
      return { segment, status: "pending", search: v.search, data: undefined, error: undefined };
    });

    // 新しい画面に切り替えてよいか。外側から見て最初の未完了の段が Pending を持っていれば、それを出せる。
    // 持っていなければ、前の画面のまま待つ
    const showable = (ms: SegmentState[]) => {
      const first = ms.find((m) => m.status !== "success");
      return !first || first.status === "error" || Boolean(first.segment.Pending);
    };
    const show = () => {
      if (showable(next)) {
        const { pathname, search } = new URL(url);
        publish({ matches: next, params, location: { pathname, search }, navigating: next.some((m) => m.status === "pending") });
      }
    };
    show();

    // 裏で取り直したものは、届いたら差し替える。失敗したら、古いデータのままにする
    refetches.forEach((loading, i) =>
      loading?.promise.then(
        (data) => {
          if (signal.aborted) return;
          next = next.map((n, j) => (j === i ? { ...n, data } : n));
          show();
        },
        () => {},
      ),
    );

    // loader は全部同時に呼んである。届いたものから順に知らせる。
    // loader には同じ request を渡しているので、request.signal で中断に気づける
    await Promise.all(
      next.map(async (m, i) => {
        if (m.status !== "pending") return;
        let result: Partial<SegmentState>;
        try {
          result = { status: "success", data: await loadings[i]?.promise };
        } catch (error) {
          result = { status: "error", error };
        }
        if (signal.aborted) return; // 中断で投げられたものはエラーではない
        next = next.map((n, j) => (j === i ? { ...n, ...result } : n));
        show();
      }),
    );
    return !signal.aborted;
  }

  // ① ページの中で起きる遷移（リンクのクリック、フォームの送信、戻る・進む、navigation.navigate()）を横取りする → ②。
  // 新しいタブで開く操作では navigate イベント自体が来ない。別オリジンへの遷移は canIntercept が false になる。
  // 同じページの #hash への移動と、ダウンロードのリンクはブラウザに任せる
  navigation.addEventListener("navigate", (e) => {
    if (!e.canIntercept || e.hashChange || e.downloadRequest !== null) return;
    const info = e.info as NavigateInfo | undefined;
    e.intercept({
      // 新しい画面を描き終わるまで、スクロールさせない
      scroll: "manual",
      async handler() {
        // POST のフォームなら、送信した中身が e.formData に入っている
        const init = e.formData ? { method: "POST", body: e.formData } : undefined;
        if (!(await navigate(e.destination.url, init, info?.revalidate, e.signal))) return;
        // 描画が DOM に反映されるのを待ってから、ブラウザにスクロールさせる。
        // 戻る・進むならその項目を離れたときの位置に、それ以外なら一番上（URL に #hash があればそこ）に移る
        await new Promise(requestAnimationFrame);
        if (info?.resetScroll !== false) e.scroll();
      },
    });
  });

  // リンクにマウスを乗せて 50ms たったら（またはフォーカスしたら）、preload する
  const linkOf = (target: EventTarget | null) => {
    const a = (target as Element | null)?.closest?.("a");
    return a && a.origin === location.origin && a.href !== location.href ? a : null;
  };
  let preloadTimer: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener("mouseover", (e) => {
    const a = linkOf(e.target);
    if (!a) return;
    clearTimeout(preloadTimer);
    preloadTimer = setTimeout(() => preload(a.href), 50);
  });
  document.addEventListener("mouseout", (e) => {
    if (linkOf(e.target)) clearTimeout(preloadTimer);
  });
  document.addEventListener("focusin", (e) => {
    const a = linkOf(e.target);
    if (a) preload(a.href);
  });

  // 最初の表示。navigate イベントは来ないので、自分で呼ぶ
  navigate(location.href);

  return {
    navigate(to, { replace = false, resetScroll = true } = {}) {
      const url = new URL(to, location.href).href;
      navigation.navigate(url, { history: replace ? "replace" : "push", info: { resetScroll } satisfies NavigateInfo });
    },
    subscribe(listener) {
      listeners.add(listener);
      if (started) listener(state);
      return () => listeners.delete(listener);
    },
  };
}
