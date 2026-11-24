import type { Context, Hono, MiddlewareHandler } from "hono";
import type { Child, FC } from "hono/jsx";
import { render as mount, useState } from "hono/jsx/dom";

// c.render() に JSX を渡せるようにする
declare module "hono" {
  interface ContextRenderer {
    (content: Child): Response | Promise<Response>;
  }
}

// ハンドラが描画したい JSX の置き場（Response とは別の「裏口」）
const views = new WeakMap<Request, Child>();

function show(c: Context, view: Child) {
  views.set(c.req.raw, view);
  return c.body(null);
}

// 全ルートで c.render(<JSX />) を使えるようにする middleware
export function jsxRenderer(): MiddlewareHandler {
  return async (c, next) => {
    c.setRenderer((content) => show(c, content));
    await next();
  };
}

// c.render() の中身を Layout で包む middleware
export function layout(Layout: FC<{ children?: Child }>): MiddlewareHandler {
  return async (c, next) => {
    c.setRenderer((content) => show(c, <Layout>{content}</Layout>));
    await next();
  };
}

// app を root に描画して、ナビゲーションを横取りし始める
export function startRouter(app: Hono, root: HTMLElement) {
  // 画面全体。state を更新すると、hono/jsx/dom が差分だけ書き換える
  let setView: (view: Child) => void = () => {};
  function App() {
    const [view, set] = useState<Child>(null);
    setView = set;
    return <>{view}</>;
  }
  mount(<App />, root);

  // いま進行中の遷移
  let current: AbortController | undefined;

  // ② URL を Hono に渡して、ハンドラが置いた JSX を描画する
  async function render(url: string, init?: RequestInit) {
    // 新しい遷移が始まったら、古い遷移は止める
    current?.abort();
    const controller = (current = new AbortController());
    const { signal } = controller;

    const req = new Request(url, { ...init, signal });
    const res = await app.fetch(req);
    if (signal.aborted) return; // 待っている間に古くなったら描画しない

    // リダイレクト: Location 先に履歴を置き換えて、描画し直す
    const location = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url).href;
      history.replaceState(null, "", next);
      return render(next);
    }

    setView(views.get(req) ?? null);
  }

  // ① <a> のクリックを横取りする → ③ pushState → ②
  document.addEventListener("click", (e) => {
    // 新しいタブで開く操作（Ctrl/Cmd クリックなど）はブラウザに任せる
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = (e.target as Element).closest("a");
    if (!a || a.origin !== location.origin) return;

    e.preventDefault();
    history.pushState(null, "", a.href);
    render(a.href);
  });

  // フォーム送信も横取りする → ③ pushState → ②（POST で）
  document.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (form.method !== "post" || new URL(form.action).origin !== location.origin) return;

    e.preventDefault();
    history.pushState(null, "", form.action);
    render(form.action, { method: "POST", body: new FormData(form) });
  });

  // ④ 戻る・進む → ②（pushState はしない）
  window.addEventListener("popstate", () => render(location.href));

  // 最初の表示
  render(location.href);
}
