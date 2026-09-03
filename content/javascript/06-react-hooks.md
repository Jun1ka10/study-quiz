---
id: js-06
title: React の hooks
summary: useEffect で API を呼ぶ、依存配列、クリーンアップ、カスタム hook。バグの温床を先に潰す
minutes: 12
questions:
  - id: js-l06-1
    difficulty: 1
    question: "画面の初回表示時に 1 回だけ API を呼びたい。正しい書き方は?"
    choices:
      - "コンポーネント関数の本体で直接 fetch する"
      - "useEffect(() => { fetch... }, []) と依存配列を空にする"
      - "useEffect(() => { fetch... }) と依存配列を書かない"
      - "useState の初期値で fetch する"
    answer: 1
    explanation: "本体で fetch すると描画のたびに呼ばれる。依存配列 [] は「マウント時に 1 回」。省略すると毎描画。"
  - id: js-l06-2
    difficulty: 2
    question: "`useEffect(() => { load(id); }, [])` で、id が変わっても再取得されない。直し方は?"
    choices:
      - "依存配列に id を入れる: `[id]`"
      - "useState に変える"
      - "setInterval で監視"
      - "直せない"
    answer: 0
    explanation: "依存配列は「この値が変わったら effect をやり直す」。effect 内で使う値は依存に入れる (eslint の react-hooks/exhaustive-deps が教えてくれる)。"
  - id: js-l06-3
    difficulty: 2
    question: "useEffect の中で `return () => { ... }` する目的は?"
    choices:
      - "値を返す"
      - "クリーンアップ。次の effect 実行前やアンマウント時に、タイマー解除や購読解除を行う"
      - "エラー処理"
      - "再描画の抑止"
    answer: 1
    explanation: "setInterval や addEventListener を effect で始めたら、戻り値の関数で止める。忘れるとメモリリークや二重実行になる。"
  - id: js-l06-4
    difficulty: 2
    question: "hooks を呼ぶ場所のルールとして正しいのは?"
    choices:
      - "if 文の中で条件付きで呼んでよい"
      - "コンポーネント関数 (またはカスタム hook) のトップレベルで、毎回同じ順序で呼ぶ"
      - "ループの中で呼ぶ"
      - "どこでもよい"
    answer: 1
    explanation: "React は呼び出し順で hook を対応付ける。条件やループの中で呼ぶと順序がずれて壊れる。"
---
## hooks とは

`use` で始まる関数です。関数コンポーネントに「state を持つ」「副作用を起こす」といった能力を足します。前のレッスンの `useState` も hook です。

ルールは 1 つ。**コンポーネントのトップレベルで、毎回同じ順序で呼ぶ。** if やループの中で呼んではいけません。

## useEffect: 描画の後に何かする

API 呼び出し、タイマー、DOM への直接アクセスなど、描画そのものではない処理 (副作用) は `useEffect` に書きます。

```tsx
import { useEffect, useState } from "react";

function ActorList() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/actors")
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setActors(data); })
      .finally(() => setLoading(false));
    return () => { cancelled = true; };     // クリーンアップ
  }, []);                                    // 依存配列: 空 = マウント時に 1 回

  if (loading) return <p>読み込み中</p>;
  return <ul>{actors.map((a) => <li key={a.id}>{a.name}</li>)}</ul>;
}
```

## 依存配列

| 書き方 | 意味 |
|---|---|
| `useEffect(fn)` | 毎回の描画後 (ほぼ使わない) |
| `useEffect(fn, [])` | 最初の 1 回だけ |
| `useEffect(fn, [id])` | id が変わるたび |

**effect の中で使う値は依存配列に入れます。** 入れ忘れると古い値を見続けるバグになります。eslint の `react-hooks/exhaustive-deps` が警告してくれるので、無視せず直します。

## クリーンアップ

effect で始めたものは、戻り値の関数で止めます。

```tsx
useEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}, []);

useEffect(() => {
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, []);
```

開発モードでは React が effect を 2 回実行して、クリーンアップ漏れをあぶり出します。「2 回 API が呼ばれる」のは仕様で、本番では 1 回です。

## その他の主要 hook

```tsx
const inputRef = useRef<HTMLInputElement>(null);       // DOM 参照 / 再描画を起こさない値
inputRef.current?.focus();

const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);   // 重い計算をキャッシュ

const onSave = useCallback(() => save(draft), [draft]);   // 関数の同一性を保つ (子の再描画抑制)
```

`useMemo` / `useCallback` は最適化用で、最初から書く必要はありません。遅いと分かってから使います。

## カスタム hook: ロジックの再利用

「API から取ってきて loading / error / data を持つ」は何度も出てくるので、hook にくくり出します。

```tsx
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  return { data, error, loading };
}

// 使う側
const { data: actors, loading } = useFetch<Actor[]>("/api/actors");
```

hook の中で hook を呼べます。名前は `use` で始めます。

## まとめ

- hooks はトップレベルで同じ順序
- 副作用は `useEffect`。依存配列に使う値を全部入れる
- 始めたものはクリーンアップで止める
- 繰り返すロジックはカスタム hook に
