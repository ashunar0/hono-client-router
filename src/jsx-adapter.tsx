// hono/jsx で描画するための adapter。ルーティングは router.ts に任せる
import type { Child, FC } from "hono/jsx";
import { createContext, render, useContext, useState } from "hono/jsx/dom";
import type { Router, RouterState } from "./router";

const NavigatingContext = createContext(false);

// 遷移の途中なら true。コンポーネントの中で読む
export const useNavigating = () => useContext(NavigatingContext);

type Layout = FC<{ children?: Child }>;

// router の状態から、レイアウトの中に Pending / Component / エラーのどれかを描く
function View({ state }: { state: RouterState }) {
  if (!state.match) return null;
  const { route } = state.match;
  const Pending = route.Pending as FC | undefined;
  const Component = route.Component as FC<{ data: unknown }> | undefined;

  let content: Child = null;
  if (state.status === "pending" && Pending) content = <Pending />;
  else if (state.status === "error") content = <p>エラーが発生しました：{String(state.error)}</p>;
  else if (state.status === "success" && Component) content = <Component data={state.data} />;

  // 内側のレイアウトから順に包む。外側のレイアウトほど外に来る
  return (route.layouts as Layout[]).reduceRight<Child>((children, Layout) => <Layout>{children}</Layout>, content);
}

// router の状態を root に描画する
export function mountRouter(router: Router, root: HTMLElement) {
  // 画面全体。state を更新すると、hono/jsx/dom が差分だけ書き換える
  let setState: (state: RouterState) => void = () => {};
  function App() {
    const [state, set] = useState<RouterState | null>(null);
    setState = set;
    if (!state) return null;
    return (
      <NavigatingContext.Provider value={state.navigating}>
        <View state={state} />
      </NavigatingContext.Provider>
    );
  }
  render(<App />, root);

  router.subscribe((state) => setState(state));
}
