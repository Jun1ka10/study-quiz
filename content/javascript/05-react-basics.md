---
id: js-05
title: React の基本
summary: コンポーネント、JSX、props、state。「状態が変わると画面が描き直される」を体で覚える
minutes: 12
exercise: |
  **ゴール:** React コンポーネントで state を更新して再描画を見る。

  1. `npm create vite@latest rdemo -- --template react-ts && cd rdemo && npm i && npm run dev`
  2. `src/App.tsx` を置き換え:
     ```tsx
     import { useState } from "react";
     export default function App() {
       const [items, setItems] = useState<string[]>([]);
       const [text, setText] = useState("");
       return (<div>
         <input value={text} onChange={(e) => setText(e.target.value)} />
         <button onClick={() => { setItems([...items, text]); setText(""); }} disabled={!text}>追加</button>
         <ul>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
       </div>);
     }
     ```
  3. ブラウザで動かす。次に `setItems([...items, text])` を `items.push(text)` に変え、画面が変わらないことを確認

  **確認:** 新しい配列を set したときだけ再描画される。
questions:
  - id: js-l05-1
    difficulty: 1
    question: "React のコンポーネントとは?"
    choices:
      - "HTML ファイル"
      - "props を受け取って JSX (画面の一部) を返す関数"
      - "CSS のクラス"
      - "サーバーのエンドポイント"
    answer: 1
    explanation: "`function Card({ title }) { return <div>{title}</div>; }`。部品として組み合わせて画面を作る。"
  - id: js-l05-2
    difficulty: 1
    question: "props と state の違いは?"
    choices:
      - "同じ"
      - "props は親から渡される読み取り専用、state はコンポーネント自身が持ち変更できる値"
      - "state は親から渡す"
      - "props は変更できる"
    answer: 1
    explanation: "props は上から下へ流れる入力。state は useState で持ち、setState で更新すると再描画される。"
  - id: js-l05-3
    difficulty: 2
    question: "`const [items, setItems] = useState([]);` のあと `items.push(x)` しても画面が変わらない理由は?"
    choices:
      - "push は使えない"
      - "同じ配列を直接変更しても React は変化に気づかない。`setItems([...items, x])` で新しい配列を渡す"
      - "useState は配列を持てない"
      - "再読み込みが必要"
    answer: 1
    explanation: "React は setState に渡された値が前と別物かで再描画を決める。state はイミュータブルに扱う。"
  - id: js-l05-4
    difficulty: 2
    question: "リストを `items.map(item => <li>{item.name}</li>)` で描いたら警告が出た。足りないものは?"
    choices: ["id 属性", "各要素に一意な `key` prop", "index", "class"]
    answer: 1
    explanation: "`<li key={item.id}>`。React が要素の対応を追うために要る。配列の index を key にすると並び替えや削除で崩れる。"
---
## コンポーネント = 画面の部品を返す関数

```tsx
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function App() {
  return (
    <Card title="今日の復習">
      <p>12 問</p>
    </Card>
  );
}
```

- 関数名は大文字始まり
- 戻り値が **JSX** (HTML に似た構文。中身は JS の式)
- `{}` の中に JS の式を書ける。`class` は `className`

## props: 親から子へ

props は親が子に渡す入力で、子からは変更できません。データは上から下へ流れます。

```tsx
<Card title="AWS" count={12} onSelect={() => open("aws")} />
```

関数も渡せるので、「子でクリックされたら親に知らせる」は `onSelect` のようなコールバック props で行います。

## state: 自分で持つ値

```tsx
import { useState } from "react";

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

`useState` は「今の値」と「更新関数」の組を返します。**更新関数を呼ぶと React がその部分を描き直します。** 変数を直接書き換えても画面は変わりません。

## state はイミュータブルに扱う

```tsx
const [items, setItems] = useState<Item[]>([]);

items.push(newItem);              // NG: 同じ配列のままなので再描画されない
setItems([...items, newItem]);    // OK: 新しい配列

setUser({ ...user, name: "新しい名前" });          // オブジェクトも同じ
setItems(items.filter((i) => i.id !== id));       // 削除
setItems(items.map((i) => (i.id === id ? { ...i, done: true } : i)));   // 更新
```

React は「前と別のオブジェクトか」で変化を検出します。スプレッドで新しく作るのが基本形です。

## 条件とリスト

```tsx
{loading ? <Spinner /> : <Table rows={rows} />}
{error && <p className="error">{error}</p>}

<ul>
  {items.map((item) => (
    <li key={item.id}>{item.name}</li>
  ))}
</ul>
```

リストの各要素には一意な `key` が要ります。index を key にすると、削除や並び替えで state が別の行にくっつくバグが起きます。

## フォーム

```tsx
const [name, setName] = useState("");

<input value={name} onChange={(e) => setName(e.target.value)} />
<button onClick={() => save(name)} disabled={!name}>保存</button>
```

入力値を state に持ち、`value` で表示する「制御されたコンポーネント」が基本です。

## 考え方の転換

DOM 操作では「この要素のテキストを変える」と命令しました。React では「**state がこうなら画面はこう**」と宣言し、state を更新するだけで画面が追従します。画面を直接いじらないのが最大の違いです。

## まとめ

- コンポーネント = props を受けて JSX を返す関数
- props は下へ、コールバックで上へ
- state は `useState`、更新は必ず新しい値を `set`
- リストには `key`
