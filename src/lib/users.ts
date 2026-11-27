// API から取ってくるふり（0〜2 秒かかる）
// 本物の fetch(url, { signal }) なら、abort 時の中断は fetch が自動でやってくれる
export function fetchUser(id: string, signal: AbortSignal) {
  return new Promise<{ id: string; name: string }>((resolve, reject) => {
    const timer = setTimeout(() => resolve({ id, name: `ユーザー${id}` }), Math.random() * 2000);
    signal.addEventListener("abort", () => {
      console.log(`User ${id} の取得を中断した`);
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}
