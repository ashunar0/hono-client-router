import type { Context } from "hono";
import { fetchUser } from "../../../lib/users";

export const GET = async (c: Context) => {
  // ルーターが Request に載せた signal を受け取る（React Router の request.signal と同じ）
  const user = await fetchUser(c.req.param("id")!, c.req.raw.signal);
  return c.render(
    <>
      <h1>{user.name}</h1>
      <p>ID: {user.id}</p>
    </>,
  );
};
