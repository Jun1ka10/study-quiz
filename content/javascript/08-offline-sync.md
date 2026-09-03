---
id: js-08
title: "オフライン同期 (キューと冪等性)"
summary: "オフラインでも操作を受け付け、つながったら送る。送信待ちキュー、client_id による重複防止、競合の扱い"
minutes: 12
exercise: |
  **ゴール:** 送信待ちキューを localStorage に作り、オフラインで積んでオンラインで流す。

  1. ブラウザのコンソールで:
     ```javascript
     const Q = { load: () => JSON.parse(localStorage.getItem("q") || "[]"), save: (a) => localStorage.setItem("q", JSON.stringify(a)) };
     const enqueue = (item) => Q.save([...Q.load(), { client_id: crypto.randomUUID(), ...item }]);
     const flush = async () => { for (const it of Q.load()) { const r = await fetch("https://httpbin.org/post", { method: "POST", body: JSON.stringify(it) }); if (r.ok) Q.save(Q.load().filter((x) => x.client_id !== it.client_id)); } };
     window.addEventListener("online", flush);
     ```
  2. Network を Offline にして `enqueue({ q: "q1", ok: true }); enqueue({ q: "q2", ok: false }); Q.load().length` → 2
  3. Online に戻して (online イベントが発火) `Q.load().length` → 0。発火しなければ `await flush()`
  4. `flush` の途中で 1 件失敗させた場合 (URL を壊す) にキューが残ることを確認

  **確認:** オフラインで積み、オンラインで消えた。失敗分は残った。同じ client_id が 2 回送られ得ることを理解した。
questions:
  - id: js-l08-1
    difficulty: 1
    question: "オフライン時に行った操作 (回答など) を失わないための基本構造は?"
    choices:
      - "オフラインでは操作を禁止する"
      - "ローカルの永続ストレージ (localStorage / IndexedDB) に送信待ちキューとして積み、オンライン復帰時に順に送る"
      - "メモリに持つ"
      - "サーバーが後で取りに来る"
    answer: 1
    explanation: "メモリだとタブを閉じたら消える。永続化し、`online` イベントと起動時に flush する。"
  - id: js-l08-2
    difficulty: 2
    question: "同じ回答が 2 回サーバーに届き得るのはなぜ? どう防ぐ?"
    choices:
      - "起きない"
      - "送信は成功したが応答が届く前に切断されると、クライアントは失敗と判断して再送する。各操作にクライアント生成の一意 ID を付け、サーバーで重複を無視する (冪等性)"
      - "サーバーが 2 回処理する"
      - "タイムスタンプで防ぐ"
    answer: 1
    explanation: "`client_id` (UUID) をユニーク制約にし `ON CONFLICT DO NOTHING`。再送しても 1 行のまま。"
  - id: js-l08-3
    difficulty: 2
    question: "端末 A と端末 B で同じレッスンの進捗を別々に更新した。サーバーでの妥当な扱いは?"
    choices:
      - "後から来た方で上書き"
      - "「積むだけ」のイベント (回答) は全部受け入れ、状態 (合格 / 期限) はイベントから再計算する。上書きの競合を設計で消す"
      - "エラーにする"
      - "先に来た方を捨てる"
    answer: 1
    explanation: "状態を PUT で上書きすると競合する。イベントを追記し、状態はサーバーが導出すれば、順序が入れ替わっても壊れない。"
  - id: js-l08-4
    difficulty: 1
    question: "キューを流すタイミングとして適切なのは?"
    choices:
      - "1 秒ごとに常に"
      - "起動時、`online` イベント時、操作直後 (オンラインなら即)。失敗したら残して次の機会に"
      - "ユーザーが手動で押したときだけ"
      - "オフラインのときだけ"
    answer: 1
    explanation: "常時ポーリングは無駄。イベント駆動で、失敗しても消さない (次で再送) のが基本。"
---
## 問題の形

スマホでオフラインのまま 10 問解いた。つながったときにそれをサーバーに反映したい。ただし

- 途中で切れても失わない
- 同じ回答を二重に記録しない
- 別の端末で解いた分と矛盾しない

## 送信待ちキュー

操作は **まずローカルに記録** し、送信は別の仕事にします。

```javascript
const QUEUE_KEY = "sync.queue";
const loadQueue = () => JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
const saveQueue = (q) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

function recordAttempt(questionId, result) {
  applyLocally(questionId, result);                       // 画面と localStorage は即更新
  saveQueue([...loadQueue(), { client_id: crypto.randomUUID(), question_id: questionId, result, at: Date.now() }]);
  flush();                                                // オンラインなら即送る
}

let flushing = false;
async function flush() {
  if (flushing || !navigator.onLine || !token) return;
  flushing = true;
  try {
    for (const item of loadQueue()) {
      const res = await fetch(`${API}/attempts`, { method: "POST", headers: authHeaders(), body: JSON.stringify(item) });
      if (res.ok || res.status === 409) saveQueue(loadQueue().filter((x) => x.client_id !== item.client_id));
      else if (res.status >= 500) break;                // サーバー障害。次の機会に
      else saveQueue(loadQueue().filter((x) => x.client_id !== item.client_id));   // 4xx は直らない。捨ててログ
    }
  } finally { flushing = false; }
}
window.addEventListener("online", flush);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && flush());
flush();   // 起動時
```

- 永続ストレージに積む (メモリだと消える)
- 二重 flush を防ぐフラグ
- 成功と 409 (既に処理済み) で消す、5xx は止めて次回、4xx は捨てる

## 冪等性: 二重送信を無害にする

送信は成功したのに応答が届く前に切れると、クライアントは失敗と思って再送します。**同じ操作が 2 回届く前提** で設計します。

- クライアントが `client_id` (UUID) を生成して付ける
- サーバーは `client_id` にユニーク制約を張り、`INSERT ... ON CONFLICT (client_id) DO NOTHING`
- 2 回目は何も起きず、200 か 409 を返す

これで再送は安全になります。「先に SELECT して存在確認」では同時到着で漏れるので、DB の制約に任せます。

## 競合: 複数端末

「レッスン合格」を端末 A と B が別々に PUT すると、後勝ちで片方が消えます。避け方は **状態を送らず、イベントを送る**。

- 送るのは「q1 に正解した (時刻)」という事実だけ。順序が入れ替わっても全部受け入れられる
- 「合格した」「次回期限」といった状態は、サーバーがイベントから計算する
- クライアントはサーバーの状態を GET して自分を上書きする (サーバーが正)

どうしても状態を送るなら、`updated_at` を付けて古い方を捨てる (last-write-wins) か、バージョン番号で楽観ロック (`If-Match`) にします。

## 起動時の同期

1. flush (溜まっていた送信)
2. `GET /review`、`GET /progress` でサーバーの状態を取り、ローカルを上書き
3. 失敗したらローカルのまま動く (オフラインでも使える)

「サーバーが正、ローカルはキャッシュ + 送信待ち」と役割を決めると迷いません。

## まとめ

- 操作は即ローカル反映 + キューに積む。送信は別仕事
- キューは永続化し、起動時 / online / 前面復帰で flush
- client_id + DB のユニーク制約で二重送信を無害化
- 状態でなくイベントを送り、状態はサーバーが導出
