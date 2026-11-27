import type { Context } from "hono";
import { href } from "../router";

export default (c: Context) => {
  c.status(404);
  return c.render(
    <>
      <h1>404 Not Found</h1>
      <p><a href={href("/")}>Home に戻る</a></p>
    </>,
  );
};
