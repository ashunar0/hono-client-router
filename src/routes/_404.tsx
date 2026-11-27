import type { Context } from "hono";

export default (c: Context) => {
  c.status(404);
  return c.render(
    <>
      <h1>404 Not Found</h1>
      <p><a href="/">Home に戻る</a></p>
    </>,
  );
};
