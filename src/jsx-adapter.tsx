// hono/jsx で描画するための adapter。ルーティングは router.ts に任せる
import type { MiddlewareHandler } from "hono";
import type { Child, FC } from "hono/jsx";
import { createContext, render, useContext, useState } from "hono/jsx/dom";
import { putView, type Router, type RouterState } from "./router";

declare module "hono" {
  // c.render() に JSX を渡せるようにする
  interface ContextRenderer {
    (content: Child): Response | Promise<Response>;
  }
  // ここまでに通ったレイアウトで包む関数
  interface ContextVariableMap {
    wrap: (content: Child) => Child;
  }
}

// 全ルートで c.render(<JSX />) を使えるようにする middleware
export function jsxRenderer(): MiddlewareHandler {
  return async (c, next) => {
    c.setRenderer((content) => {
      const wrap = c.get("wrap") ?? ((content: Child) => content);
      putView(c.req.raw, wrap(content));
      return c.body(null);
    });
    await next();
  };
}

// c.render() の中身を Layout で包む middleware。重ねると、先に通ったものが外側になる
export function layout(Layout: FC<{ children?: Child }>): MiddlewareHandler {
  return async (c, next) => {
    const outer = c.get("wrap") ?? ((content: Child) => content);
    c.set("wrap", (content) => outer(<Layout>{content}</Layout>));
    await next();
  };
}

const NavigatingContext = createContext(false);

// 遷移の途中なら true。コンポーネントの中で読む
export const useNavigating = () => useContext(NavigatingContext);

// router の状態を root に描画する
export function mountRouter(router: Router<Child>, root: HTMLElement) {
  // 画面全体。state を更新すると、hono/jsx/dom が差分だけ書き換える
  let setState: (state: RouterState<Child>) => void = () => {};
  function App() {
    const [state, set] = useState<RouterState<Child>>({ view: null, navigating: false });
    setState = set;
    return <NavigatingContext.Provider value={state.navigating}>{state.view}</NavigatingContext.Provider>;
  }
  render(<App />, root);

  router.subscribe((state) => setState(state));
}
