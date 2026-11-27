// hono/jsx で描画するための adapter。ルーティングは router.ts に任せる
import type { Child, FC } from "hono/jsx";
import { createContext, render, useContext, useState } from "hono/jsx/dom";
import type { Router, RouterState, SegmentState } from "./router";

const NavigatingContext = createContext(false);

// 遷移の途中なら true。コンポーネントの中で読む
export const useNavigating = () => useContext(NavigatingContext);

type SegmentComponent = FC<{ data: unknown; children?: Child }>;

// 失敗した段と、そのエラーを出す段。出す段は、失敗した段から外側に向かっていちばん近い ErrorComponent を持つ段。
// どの段も持っていなければ -1
function errorBoundaryOf(matches: SegmentState[]) {
  const failed = matches.findIndex((m) => m.status === "error");
  if (failed === -1) return null;
  let boundary = failed;
  while (boundary >= 0 && !matches[boundary].segment.ErrorComponent) boundary--;
  return { error: matches[failed].error, boundary };
}

// i 番目の段から内側を描く。外側の段のコンポーネントが、内側を children として包む。
// まだデータが届いていない段では、その段の Pending を出して、それより内側は描かない。
// エラーを出す段では、その段のコンポーネントの代わりに ErrorComponent を出す
function renderFrom(matches: SegmentState[], i: number, failure: ReturnType<typeof errorBoundaryOf>): Child {
  const m = matches[i];
  if (!m) return null;
  const Pending = m.segment.Pending as FC | undefined;
  const ErrorComponent = m.segment.ErrorComponent as FC<{ error: unknown }> | undefined;
  const Component = m.segment.Component as SegmentComponent | undefined;

  if (failure && failure.boundary === i && ErrorComponent) return <ErrorComponent error={failure.error} />;
  if (m.status === "pending") return Pending ? <Pending /> : null;
  if (!Component) return renderFrom(matches, i + 1, failure);
  return <Component data={m.data}>{renderFrom(matches, i + 1, failure)}</Component>;
}

// 画面全体を描く。どの段も ErrorComponent を持たないエラーなら、決まった表示を出す
function renderMatches(matches: SegmentState[]): Child {
  const failure = errorBoundaryOf(matches);
  if (failure && failure.boundary === -1) return <p>エラーが発生しました：{String(failure.error)}</p>;
  return renderFrom(matches, 0, failure);
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
        {renderMatches(state.matches)}
      </NavigatingContext.Provider>
    );
  }
  render(<App />, root);

  router.subscribe((state) => setState(state));
}
