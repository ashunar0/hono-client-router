import type { Hono } from "hono";

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

// ---- ルートの定義 ----

// routes.gen.ts が declare module で routes を書き足す（ルートのパス → そのルートの search params）
export interface Register {}
type Routes = Register extends { routes: infer R } ? R : Record<string, Record<never, never>>;
export type RoutePath = keyof Routes & string;

// "/users/:id" → { id: string }。catch-all の ":path{.+}" も path になる
type ParamsOf<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? { [K in StripPattern<Name>]: string } & ParamsOf<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? { [K in StripPattern<Name>]: string }
    : {};
type StripPattern<Name extends string> = Name extends `${infer N}{${string}}` ? N : Name;

// loader と action が受け取るもの。request.signal は、遷移が古くなったら abort される。
// search は、その段の validateSearch で検証したもの（S に typeof validateSearch を渡すと型が付く）
export type LoaderArgs<P extends string = string, S = undefined> = {
  params: ParamsOf<P>;
  request: Request;
  search: OutputOf<S>;
};
export type ActionArgs<P extends string = string> = { params: ParamsOf<P>; request: Request };

// ルーターの側から見た loader の引数。ページごとの LoaderArgs<"/users/:id", ...> をどれも受け入れられるように、
// 型引数を使わずに書く（型引数で比べると、search の型が合わないと判定されてしまう）
type AnyLoaderArgs = { params: Record<string, string>; request: Request; search: unknown };

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
): string {
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
  return query ? `${pathname}?${query}` : pathname;
}

// action から返すリダイレクト
export const redirect = (url: string) => new Response(null, { status: 302, headers: { Location: url } });

// ---- Hono から「どのルートに当たったか」を受け取る ----

type Match = { route: Route; params: Record<string, string> };

// Hono のハンドラが置いていく、当たったルートの置き場（Response とは別の「裏口」）
const matches = new WeakMap<Request, Match>();

export function putMatch(req: Request, route: Route, params: Record<string, string>) {
  matches.set(req, { route, params });
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
  navigating: boolean; // 遷移の途中か
};

export type Router = {
  // 状態が変わるたびに受け取る。登録した時点で状態があれば、すぐに 1 回呼ぶ
  subscribe(listener: (state: RouterState) => void): () => void;
};

// ルーティングだけを担当する。画面に何をどう描くかは知らない
export function createRouter(app: Hono): Router {
  const listeners = new Set<(state: RouterState) => void>();
  let state: RouterState = { matches: [], params: {}, navigating: false };
  let started = false;

  function publish(next: Partial<RouterState>) {
    state = { ...state, ...next };
    started = true;
    for (const listener of listeners) listener(state);
  }

  // スクロール位置の復元はブラウザに任せない。ブラウザは popstate の直後に戻そうとするが、
  // その時点ではまだ新しい画面を描いていないので、位置がずれる
  history.scrollRestoration = "manual";

  // 履歴の項目ごとに key を付けて、離れるときのスクロール位置を覚えておく
  const positions = new Map<string, number>();
  const newKey = () => crypto.randomUUID();
  let currentKey: string = history.state?.key ?? newKey();
  history.replaceState({ key: currentKey }, "");

  // 新しい履歴の項目に移る。今の項目の位置を覚えてから積む
  function push(url: string) {
    positions.set(currentKey, scrollY);
    currentKey = newKey();
    history.pushState({ key: currentKey }, "", url);
  }

  // いま進行中の遷移
  let current: AbortController | undefined;

  // ---- loader の呼び出しと preload ----

  // loader 1 回ぶんの呼び出し。終わったら結果が settled に入る（終わっていれば、待たずに使える）
  type Loading = { promise: Promise<unknown>; settled?: { ok: true; data: unknown } | { ok: false; error: unknown } };

  function startLoad(segment: Segment, params: Record<string, string>, request: Request, search: unknown): Loading {
    const loading: Loading = { promise: Promise.resolve().then(() => segment.loader?.({ params, request, search })) };
    loading.promise.then(
      (data) => (loading.settled = { ok: true, data }),
      (error) => (loading.settled = { ok: false, error }),
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

  // preload した loader の呼び出しを、URL ごとに取っておく。30 秒たったら使わない
  const PRELOAD_FRESH_MS = 30_000;
  const preloads = new Map<string, { at: number; loads: Map<Segment, Loading> }>();
  const preloading = new Set<string>();

  // その URL の loader を先に呼んでおく。リンクにマウスを乗せたときに使う
  async function preload(url: string) {
    const hit = preloads.get(url);
    if ((hit && Date.now() - hit.at < PRELOAD_FRESH_MS) || preloading.has(url)) return;
    preloading.add(url);
    try {
      // ガードも通す。リダイレクトになるなら、何も取っておかない
      const req = new Request(url);
      const res = await app.fetch(req);
      const match = matches.get(req);
      if ((res.status >= 300 && res.status < 400) || !match) return;

      const entry = { at: Date.now(), loads: new Map<Segment, Loading>() };
      for (const segment of match.route.segments) {
        if (!segment.loader) continue;
        // search params が通らない段と、遷移しても使い回される段は、取りに行かない
        const validated = await validateSearchOf(segment, url);
        if (!validated.ok || reusable(segment, match.params, validated.search)) continue;
        const loading = startLoad(segment, match.params, req, validated.search);
        // 失敗した preload は取っておかない。クリックしたときに取り直す
        loading.promise.catch(() => preloads.get(url) === entry && preloads.delete(url));
        entry.loads.set(segment, loading);
      }
      preloads.set(url, entry);
    } finally {
      preloading.delete(url);
    }
  }

  // ② Hono にどのルートかを聞いて、loader を呼び、結果を知らせる。描いたら scrollTop の位置にスクロールする。
  // revalidate が true なら、レイアウトのデータも使い回さずに取り直す（action のあと）
  async function navigate(url: string, init?: RequestInit, scrollTop = 0, revalidate = false) {
    // 新しい遷移が始まったら、古い遷移は止める
    current?.abort();
    const controller = (current = new AbortController());
    const { signal } = controller;

    // まずは前の画面のまま、遷移中であることだけを知らせる
    if (!state.navigating) publish({ navigating: true });

    // Hono はマッチングとガード（middleware）だけをする。POST なら action も動く
    const req = new Request(url, { ...init, signal });
    const res = await app.fetch(req);
    if (signal.aborted) return; // 待っている間に古くなったら知らせない

    const afterAction = revalidate || req.method === "POST";

    // リダイレクト: Location 先に履歴を置き換えて、遷移し直す
    const location = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url).href;
      history.replaceState({ key: currentKey }, "", next);
      return navigate(next, undefined, 0, afterAction);
    }

    const match = matches.get(req);
    if (!match) {
      // action がリダイレクトしなかったときは、同じ URL を GET で読み直す
      if (req.method === "POST") return navigate(url, undefined, scrollTop, true);
      // どのルートにも当たらず、_404 もないとき
      return publish({ matches: [], params: {}, navigating: false });
    }

    const { route, params } = match;

    // 段ごとに search params を検証する
    const validated = await Promise.all(route.segments.map((segment) => validateSearchOf(segment, url)));
    if (signal.aborted) return;

    // action のあとは、preload したものも含めて全部取り直す
    if (afterAction) preloads.clear();
    const hit = preloads.get(url);
    const preloaded = !afterAction && hit && Date.now() - hit.at < PRELOAD_FRESH_MS ? hit : undefined;

    // 段ごとの状態を作る。
    // 1. 前の画面と同じ段で、その段の params も同じなら、データを使い回す
    // 2. preload してあれば、その呼び出しを使う。もう届いていれば、待たずに success にする
    // 3. どちらでもなければ、loader を呼ぶ
    const loadings: (Loading | undefined)[] = [];
    let next = route.segments.map((segment, i): SegmentState => {
      const v = validated[i];
      // search params が通らなければ、その段のエラーにする
      if (!v.ok) return { segment, status: "error", search: undefined, data: undefined, error: v.error };
      const prev = afterAction ? undefined : reusable(segment, params, v.search);
      if (prev) return prev;
      if (!segment.loader) return { segment, status: "success", search: v.search, data: undefined, error: undefined };

      const loading = preloaded?.loads.get(segment) ?? startLoad(segment, params, req, v.search);
      loadings[i] = loading;
      if (loading.settled?.ok) return { segment, status: "success", search: v.search, data: loading.settled.data, error: undefined };
      return { segment, status: "pending", search: v.search, data: undefined, error: undefined };
    });

    // 新しい画面に切り替えてよいか。外側から見て最初の未完了の段が Pending を持っていれば、それを出せる。
    // 持っていなければ、前の画面のまま待つ
    const showable = (ms: SegmentState[]) => {
      const first = ms.find((m) => m.status !== "success");
      return !first || first.status === "error" || Boolean(first.segment.Pending);
    };
    const show = () => {
      if (showable(next)) publish({ matches: next, params, navigating: next.some((m) => m.status === "pending") });
    };
    show();

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
    if (signal.aborted) return;

    // 描画が DOM に反映されるのを待ってからスクロールする
    requestAnimationFrame(() => scrollTo(0, scrollTop));
  }

  // ① <a> のクリックを横取りする → ③ pushState → ②
  document.addEventListener("click", (e) => {
    // 新しいタブで開く操作（Ctrl/Cmd クリックなど）はブラウザに任せる
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = (e.target as Element).closest("a");
    if (!a || a.origin !== location.origin) return;

    e.preventDefault();
    push(a.href);
    navigate(a.href);
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

  // フォーム送信も横取りする → ③ pushState → ②（POST で）
  document.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (form.method !== "post" || new URL(form.action).origin !== location.origin) return;

    e.preventDefault();
    push(form.action);
    navigate(form.action, { method: "POST", body: new FormData(form) });
  });

  // ④ 戻る・進む → ②（pushState はしない）。その項目を離れたときの位置に戻す
  window.addEventListener("popstate", (e) => {
    // この時点で URL はもう変わっているが、スクロールはまだ前の項目のまま
    positions.set(currentKey, scrollY);
    currentKey = e.state?.key ?? newKey();
    navigate(location.href, undefined, positions.get(currentKey) ?? 0);
  });

  // 最初の表示
  navigate(location.href, undefined, scrollY);

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (started) listener(state);
      return () => listeners.delete(listener);
    },
  };
}
