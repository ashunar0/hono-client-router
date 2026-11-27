import type { Context } from "hono";

export const GET = (c: Context) => c.render(<h1>Admin</h1>);
