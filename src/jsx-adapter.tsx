// hono/jsx で描画するための adapter。ルーティングは router.ts に任せる
import type { Child, FC } from "hono/jsx";
import { createContext, render, useContext, useState } from "hono/jsx/dom";
import type { Router, RouterState, SegmentState } from "./router";

const NavigatingContext = createContext(false);

// 遷移の途中なら true。コンポーネントの中で読む
export const useNavigating = () => useContext(NavigatingContext);

type SegmentComponent = FC<{ data: unknown; children?: Child }>;

// i 番目の段から内側を描く。外側の段のコンポーネントが、内側を children として包む。
// まだデータが届いていない段では、その段の Pending を出して、それより内側は描かない
function renderFrom(matches: SegmentState[], i: number): Child {
  const m = matches[i];
  if (!m) return null;
  const Pending = m.segment.Pending as FC | undefined;
  const Component = m.segment.Component as SegmentComponent | undefined;

  if (m.status === "pending") return Pending ? <Pending /> : null;
  if (m.status === "error") return <p>エラーが発生しました：{String(m.error)}</p>;
  if (!Component) return renderFrom(matches, i + 1);
  return <Component data={m.data}>{renderFrom(matches, i + 1)}</Component>;
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
        {renderFrom(state.matches, 0)}
      </NavigatingContext.Provider>
    );
  }
  render(<App />, root);

  router.subscribe((state) => setState(state));
}
