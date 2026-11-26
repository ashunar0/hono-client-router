// hono/jsx で描画するための adapter。ルーティングは router.ts に任せる
import type { Context, MiddlewareHandler } from "hono";
import type { Child, FC } from "hono/jsx";
import { render, useState } from "hono/jsx/dom";
import { putView, type Router } from "./router";

// c.render() に JSX を渡せるようにする
declare module "hono" {
  interface ContextRenderer {
    (content: Child): Response | Promise<Response>;
  }
}

function show(c: Context, view: Child) {
  putView(c.req.raw, view);
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

// router の view を root に描画する
export function mountRouter(router: Router<Child>, root: HTMLElement) {
  // 画面全体。state を更新すると、hono/jsx/dom が差分だけ書き換える
  let setView: (view: Child) => void = () => {};
  function App() {
    const [view, set] = useState<Child>(null);
    setView = set;
    return <>{view}</>;
  }
  render(<App />, root);

  router.subscribe((view) => setView(view));
}
