// hono/jsx で描画するための adapter。ルーティングは router.ts に任せる
import type { Child, FC } from "hono/jsx";
import { createContext, render, useContext, useState } from "hono/jsx/dom";
import type { Href, Router, RouterState, SegmentState } from "./router";

const NavigatingContext = createContext(false);
const LocationContext = createContext<RouterState["location"]>({ pathname: "", search: "" });
const RouterContext = createContext<Router | null>(null);

// 遷移の途中なら true。コンポーネントの中で読む
export const useNavigating = () => useContext(NavigatingContext);

// コードから遷移する関数を返す。navigate(href("/users", { search: { page: 2 } }), { replace: true }) のように使う
export function useNavigate() {
  const router = useContext(RouterContext);
  if (!router) throw new Error("useNavigate() は mountRouter() の中で使う");
  return router.navigate;
}

// リンク。今いるページを指していれば aria-current="page" を付ける。
// 初期値では配下のページにいても付く（/users/1 にいるとき /users のリンクにも付く）。end を付けると完全に一致したときだけ。
// "/" は常に完全に一致したときだけ
export function Link({ to, end = false, children }: { to: Href; end?: boolean; children?: Child }) {
  const { pathname } = useContext(LocationContext);
  const target = new URL(to, location.href).pathname;
  const active = end || target === "/" ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);
  return (
    <a href={to} aria-current={active ? "page" : undefined}>
      {children}
    </a>
  );
}

type SegmentComponent = FC<{ data: unknown; search: unknown; children?: Child }>;

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
  return (
    <Component data={m.data} search={m.search}>
      {renderFrom(matches, i + 1, failure)}
    </Component>
  );
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
      <RouterContext.Provider value={router}>
        <LocationContext.Provider value={state.location}>
          <NavigatingContext.Provider value={state.navigating}>{renderMatches(state.matches)}</NavigatingContext.Provider>
        </LocationContext.Provider>
      </RouterContext.Provider>
    );
  }
  render(<App />, root);

  router.subscribe((state) => setState(state));
}
