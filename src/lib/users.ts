// API から取ってくるふり（0〜2 秒かかる）。1〜3 以外の id は失敗する
// 本物の fetch(url, { signal }) なら、abort 時の中断は fetch が自動でやってくれる
export function fetchUser(id: string, signal: AbortSignal) {
  return new Promise<{ id: string; name: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (["1", "2", "3"].includes(id)) resolve({ id, name: `ユーザー${id}` });
      else reject(new Error(`ユーザー${id} は見つかりません`));
    }, Math.random() * 2000);
    signal.addEventListener("abort", () => {
      console.log(`User ${id} の取得を中断した`);
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

// ユーザー一覧を取ってくるふり（1 秒かかる）
export function fetchUsers(signal: AbortSignal) {
  return new Promise<{ id: string; name: string }[]>((resolve, reject) => {
    const timer = setTimeout(
      () => resolve(["1", "2", "3"].map((id) => ({ id, name: `ユーザー${id}` }))),
      1000,
    );
    signal.addEventListener("abort", () => {
      console.log("ユーザー一覧の取得を中断した");
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}
