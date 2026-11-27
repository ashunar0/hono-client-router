// API から取ってくるふり（0〜2 秒かかる）。1〜9 以外の id は失敗する
// 本物の fetch(url, { signal }) なら、abort 時の中断は fetch が自動でやってくれる
export function fetchUser(id: string, signal: AbortSignal) {
  return new Promise<{ id: string; name: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (/^[1-9]$/.test(id)) resolve({ id, name: `ユーザー${id}` });
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

// ユーザーの一覧を 1 ページぶん取ってくるふり（0.3 秒かかる）。全 9 人を、名前に q を含む人に絞って 3 人ずつ
export function fetchUserPage(page: number, q: string, signal: AbortSignal) {
  const perPage = 3;
  return new Promise<{ page: number; totalPages: number; users: { id: string; name: string }[] }>((resolve, reject) => {
    const timer = setTimeout(() => {
      const all = Array.from({ length: 9 }, (_, i) => ({ id: String(i + 1), name: `ユーザー${i + 1}` }));
      const hits = all.filter((user) => user.name.includes(q));
      resolve({
        page,
        totalPages: Math.max(1, Math.ceil(hits.length / perPage)),
        users: hits.slice((page - 1) * perPage, page * perPage),
      });
    }, 300);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}
