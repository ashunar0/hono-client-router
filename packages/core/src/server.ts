import type { Context, Handler, Hono } from "hono";
import type { ContentfulStatusCode, RedirectStatusCode } from "hono/utils/http-status";
import { matchOf, type RouterContext } from "./router";

// pages() の 2 つ目の引数。
// context は、ブラウザで createRouter に渡すものと同じ形のものを、リクエストごとに作って返す（ログイン状態は人によって違うから）。
// Register に context を書き足したら、context は必須
type PagesOptions = {
  html: string; // ブラウザでルーターを動かす HTML。どのページでも同じものを返す
} & (undefined extends RouterContext
  ? { context?: (c: Context) => RouterContext }
  : { context: (c: Context) => RouterContext });

// ページを開いたとき（GET）に、ブラウザと同じ app でルートを判定して、正しいステータスで HTML を返す。
// loader も画面も動かさない。それはブラウザのルーターがやる
// - middleware がリダイレクトした → そのリダイレクトを返す（HTML は返さない）
// - _404.tsx に当たった、またはどのルートにも当たらなかった → 404 で HTML を返す
// - middleware がほかのステータスを返した → そのステータスで HTML を返す
// - ページに当たった → 200 で HTML を返す
export function pages(app: Hono, options: PagesOptions): Handler {
  return async (c) => {
    // ルートの判定だけなので、本文はいらない
    const req = new Request(c.req.url, { headers: c.req.raw.headers });
    const res = await app.fetch(req, options.context?.(c) as object | undefined);

    const location = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && location) return c.redirect(location, res.status as RedirectStatusCode);

    const match = matchOf(req);
    const status = match ? (match.route.notFound ? 404 : 200) : res.status;
    return c.html(options.html, status as ContentfulStatusCode);
  };
}
