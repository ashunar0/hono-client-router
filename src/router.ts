import type { Hono } from "hono";

// ---- ルートの定義 ----

// routes.gen.ts が declare module で routes を書き足す（ルートのパスの一覧）
export interface Register {}
export type RoutePath = Register extends { routes: infer R extends string } ? R : string;

// "/users/:id" → { id: string }。catch-all の ":path{.+}" も path になる
type ParamsOf<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? { [K in StripPattern<Name>]: string } & ParamsOf<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? { [K in StripPattern<Name>]: string }
    : {};
type StripPattern<Name extends string> = Name extends `${infer N}{${string}}` ? N : Name;

// loader と action が受け取るもの。request.signal は、遷移が古くなったら abort される
export type LoaderArgs<P extends string = string> = { params: ParamsOf<P>; request: Request };
export type ActionArgs<P extends string = string> = LoaderArgs<P>;

// ページのファイル（index.tsx）とレイアウト（_layout.tsx）が export するもの。画面のコンポーネントは default export。
// コンポーネントは adapter が描くので、ここでは中身を知らない
export type RouteModule = {
  loader?(args: LoaderArgs): unknown;
  action?(args: ActionArgs): Response | Promise<Response>;
  Pending?: unknown;
  ErrorComponent?: unknown;
  default?: unknown;
};

// ルートの 1 段。全体のレイアウト、/users のレイアウト、ページ、のように外側から並ぶ
export type Segment = {
  paramNames: string[]; // この段までの params の名前。変わらなければ、データを使い回せる
  loader?(args: LoaderArgs): unknown;
  Pending?: unknown;
  ErrorComponent?: unknown; // この段か、内側の段の loader が失敗したときに、この段の場所に出す
  Component?: unknown;
};

// ファイルの中身から段を作る。routes.gen.ts が使う
export const toSegment = (paramNames: string[], module: RouteModule): Segment => ({
  paramNames,
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

// ルートのパスと params から URL を作る。存在しないパスや、足りない params は型エラーになる
// P を RoutePath で縛らないのは、一覧にないパスのとき「引数の数が違う」ではなく
// 「そのパスは一覧にない」というエラーにするため
export function href<P extends string>(
  path: P extends RoutePath ? P : RoutePath,
  ...[params]: P extends RoutePath ? (keyof ParamsOf<P> extends never ? [] : [ParamsOf<P>]) : [params?: unknown]
): string {
  return path.replace(/:(\w+)(\{[^}]*\})?/g, (_, name: string) => {
    const value = (params as Record<string, string>)[name];
    // catch-all（{.+}）の値は a/b/c のようにスラッシュを含むので、段ごとにエンコードする
    return value.split("/").map(encodeURIComponent).join("/");
  });
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

  function startLoad(segment: Segment, params: Record<string, string>, request: Request): Loading {
    const loading: Loading = { promise: Promise.resolve().then(() => segment.loader?.({ params, request })) };
    loading.promise.then(
      (data) => (loading.settled = { ok: true, data }),
      (error) => (loading.settled = { ok: false, error }),
    );
    return loading;
  }

  // 前の画面の段のデータを、そのまま使い回せるか。同じ段で、その段の params も同じならよい
  const reusable = (segment: Segment, params: Record<string, string>) => {
    const prev = state.matches.find((m) => m.segment === segment);
    const sameParams = segment.paramNames.every((name) => state.params[name] === params[name]);
    return prev?.status === "success" && sameParams ? prev : undefined;
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
        // loader がない段と、遷移しても使い回される段は、取りに行かない
        if (!segment.loader || reusable(segment, match.params)) continue;
        const loading = startLoad(segment, match.params, req);
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
      const prev = afterAction ? undefined : reusable(segment, params);
      if (prev) return prev;
      if (!segment.loader) return { segment, status: "success", data: undefined, error: undefined };

      const loading = preloaded?.loads.get(segment) ?? startLoad(segment, params, req);
      loadings[i] = loading;
      if (loading.settled?.ok) return { segment, status: "success", data: loading.settled.data, error: undefined };
      return { segment, status: "pending", data: undefined, error: undefined };
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
