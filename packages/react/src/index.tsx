// React で描画するための adapter。ルーティングは core（@hcr/core）に任せる。
// 中身は @hcr/hono-jsx と同じで、hono/jsx/dom の代わりに React の仕組みを使っているだけ
import { type ComponentType, createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Href, Router, RouterState, SegmentState } from "@hcr/core";

// core のものも、ここから使えるようにする（@tanstack/react-router が core のものを export し直しているのと同じ）
export { createRouter, href, redirect } from "@hcr/core";
export type { Href, Middleware } from "@hcr/core";

// レイアウトの children の型を core に教える（生成した Route.ComponentProps が使う）
declare module "@hcr/core" {
  interface Register {
    child: ReactNode;
  }
}

const NavigatingContext = createContext(false);
const LocationContext = createContext<RouterState["location"]>({ pathname: "", search: "" });
const RouterContext = createContext<Router | null>(null);

// 遷移の途中なら true
export const useNavigating = () => useContext(NavigatingContext);

// コードから遷移する関数を返す
export function useNavigate() {
  const router = useContext(RouterContext);
  if (!router) throw new Error("useNavigate() は mountRouter() の中で使う");
  return router.navigate;
}

// リンク。今いるページを指していれば aria-current="page" を付ける
export function Link({ to, end = false, children }: { to: Href; end?: boolean; children?: ReactNode }) {
  const { pathname } = useContext(LocationContext);
  const target = new URL(to, location.href).pathname;
  const active = end || target === "/" ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);
  return (
    <a href={to} aria-current={active ? "page" : undefined}>
      {children}
    </a>
  );
}

type SegmentComponent = ComponentType<{ data: unknown; search: unknown; children?: ReactNode }>;

// 失敗した段と、そのエラーを出す段（いちばん近い ErrorComponent を持つ段。なければ -1）
function errorBoundaryOf(matches: SegmentState[]) {
  const failed = matches.findIndex((m) => m.status === "error");
  if (failed === -1) return null;
  let boundary = failed;
  while (boundary >= 0 && !matches[boundary].segment.ErrorComponent) boundary--;
  return { error: matches[failed].error, boundary };
}

// i 番目の段から内側を描く
function renderFrom(matches: SegmentState[], i: number, failure: ReturnType<typeof errorBoundaryOf>): ReactNode {
  const m = matches[i];
  if (!m) return null;
  const Pending = m.segment.Pending as ComponentType | undefined;
  const ErrorComponent = m.segment.ErrorComponent as ComponentType<{ error: unknown }> | undefined;
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

function renderMatches(matches: SegmentState[]): ReactNode {
  const failure = errorBoundaryOf(matches);
  if (failure && failure.boundary === -1) return <p>エラーが発生しました：{String(failure.error)}</p>;
  return renderFrom(matches, 0, failure);
}

// router の状態を root に描画する
export function mountRouter(router: Router, root: HTMLElement) {
  function App() {
    const [state, setState] = useState<RouterState | null>(null);
    useEffect(() => router.subscribe(setState), []);
    if (!state) return null;
    return (
      <RouterContext.Provider value={router}>
        <LocationContext.Provider value={state.location}>
          <NavigatingContext.Provider value={state.navigating}>{renderMatches(state.matches)}</NavigatingContext.Provider>
        </LocationContext.Provider>
      </RouterContext.Provider>
    );
  }
  createRoot(root).render(<App />);
}
