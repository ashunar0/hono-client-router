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

  // ② URL を Hono に渡して、ハンドラが置いた view を知らせる。描いたら scrollTop の位置にスクロールする
  async function navigate(url: string, init?: RequestInit, scrollTop = 0) {
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
      history.replaceState({ key: currentKey }, "", next);
      return navigate(next);
    }

    publish({ view: (views.get(req) as View | undefined) ?? null, navigating: false });
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
      if (state) listener(state);
      return () => listeners.delete(listener);
    },
  };
}
