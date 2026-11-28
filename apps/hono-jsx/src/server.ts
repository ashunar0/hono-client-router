/// <reference types="vite/client" />
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { pages } from "@hcr/core/server";
import { createContext } from "./context";
import { app } from "./routes.gen";

// ブラウザのルーターの入口。dev では Vite が src/main.tsx をそのまま返し、ビルドしたあとは dist/static/client.js になる
const client = import.meta.env.PROD ? "/static/client.js" : "/src/main.tsx";

// ブラウザでルーターを動かす HTML。どのページを開いても、これを返す
const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>hono client router</title>
    <style>
      a[aria-current="page"] { font-weight: bold; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${client}"></script>
  </body>
</html>`;

const server = new Hono();

// API を足すなら、ここに server.route("/api", api) のように書く

// ページを開いたときは、ブラウザと同じ app でルートを判定して、404 やリダイレクトを最初から返す。
// context は、リクエストの cookie を読み書きするものを、リクエストごとに作る
server.get(
  "*",
  pages(app, {
    html,
    context: (c) =>
      createContext({
        get: () => getCookie(c, "session"),
        set: (value) => setCookie(c, "session", value, { path: "/", sameSite: "Lax" }),
      }),
  }),
);

export default server;
