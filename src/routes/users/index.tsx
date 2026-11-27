import type { Context } from "hono";

export const GET = (c: Context) => c.render(<p>ユーザーを選択してください</p>);
