import type { Hono } from "hono";

// ハンドラが描画したいもの（view）の置き場（Response とは別の「裏口」）
const views = new WeakMap<Request, unknown>();

// ハンドラ側から view を置く。何を置くかは描画側（adapter）が決める
export function putView(req: Request, view: unknown) {
  views.set(req, view);
}

export type RouterState<View> = {
  view: View | null; // いま出している画面
  navigating: boolean; // 遷移の途中か（Hono の答えを待っている間は true）
};

export type Router<View> = {
  // 状態が変わるたびに受け取る。登録した時点で状態があれば、すぐに 1 回呼ぶ
  subscribe(listener: (state: RouterState<View>) => void): () => void;
};

// ルーティングだけを担当する。画面に何をどう描くかは知らない
export function createRouter<View>(app: Hono): Router<View> {
  const listeners = new Set<(state: RouterState<View>) => void>();
  let state: RouterState<View> | undefined;

  function publish(next: RouterState<View>) {
    state = next;
    for (const listener of listeners) listener(next);
  }

  // いま進行中の遷移
  let current: AbortController | undefined;

  // ② URL を Hono に渡して、ハンドラが置いた view を知らせる
  async function navigate(url: string, init?: RequestInit) {
    // 新しい遷移が始まったら、古い遷移は止める
    current?.abort();
    const controller = (current = new AbortController());
    const { signal } = controller;

    // 前の画面は出したまま、遷移中であることだけを知らせる
    if (!state?.navigating) publish({ view: state?.view ?? null, navigating: true });

    const req = new Request(url, { ...init, signal });
    const res = await app.fetch(req);
    if (signal.aborted) return; // 待っている間に古くなったら知らせない

    // リダイレクト: Location 先に履歴を置き換えて、遷移し直す
    const location = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url).href;
      history.replaceState(null, "", next);
      return navigate(next);
    }

    publish({ view: (views.get(req) as View | undefined) ?? null, navigating: false });
  }

  // ① <a> のクリックを横取りする → ③ pushState → ②
  document.addEventListener("click", (e) => {
    // 新しいタブで開く操作（Ctrl/Cmd クリックなど）はブラウザに任せる
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = (e.target as Element).closest("a");
    if (!a || a.origin !== location.origin) return;

    e.preventDefault();
    history.pushState(null, "", a.href);
    navigate(a.href);
  });

  // フォーム送信も横取りする → ③ pushState → ②（POST で）
  document.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (form.method !== "post" || new URL(form.action).origin !== location.origin) return;

    e.preventDefault();
    history.pushState(null, "", form.action);
    navigate(form.action, { method: "POST", body: new FormData(form) });
  });

  // ④ 戻る・進む → ②（pushState はしない）
  window.addEventListener("popstate", () => navigate(location.href));

  // 最初の表示
  navigate(location.href);

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (state) listener(state);
      return () => listeners.delete(listener);
    },
  };
}
