---
id: js-02
title: 非同期処理と fetch
summary: Promise / async / await と、API を呼ぶ fetch。mokujitsu の画面が API を叩く仕組み
minutes: 12
questions:
  - id: js-l02-1
    difficulty: 1
    question: "`fetch(url)` が返すものは?"
    choices: ["レスポンスの JSON", "レスポンスの文字列", "Response に解決する Promise", "true / false"]
    answer: 2
    explanation: "fetch は Promise を返す。`await fetch(url)` で Response を得て、さらに `await res.json()` で本文を取り出す。"
  - id: js-l02-2
    difficulty: 2
    question: "次のコードの問題は?\n\n```javascript\nconst res = await fetch(\"/api/items\");\nconst data = await res.json();\n```"
    choices:
      - "問題ない"
      - "404 や 500 でも例外にならず、エラー本文を JSON として読もうとする"
      - "await は 2 回使えない"
      - "fetch には URL を渡せない"
    answer: 1
    explanation: "fetch はネットワークエラー以外では reject しない。`if (!res.ok) throw new Error(res.status)` を挟む。"
  - id: js-l02-3
    difficulty: 2
    question: "POST で JSON を送るときに必要なものは?"
    choices:
      - "method: \"POST\" と body: JSON.stringify(data) と Content-Type ヘッダー"
      - "method: \"POST\" だけ"
      - "body にオブジェクトをそのまま渡す"
      - "fetch では POST できない"
    answer: 0
    explanation: "body は文字列にする必要があり、サーバーが JSON と分かるよう `Content-Type: application/json` を付ける。"
  - id: js-l02-4
    difficulty: 2
    question: "3 つの API を並行して呼び、全部揃ってから処理したい。"
    choices:
      - "await を 3 回順番に書く"
      - "Promise.all([fetch(a), fetch(b), fetch(c)]) を await する"
      - "setTimeout で待つ"
      - "fetch を 1 回にまとめる"
    answer: 1
    explanation: "順番に await すると直列になり合計時間が伸びる。Promise.all で同時に投げて全部待つ。Python の asyncio.gather に相当。"
---
## なぜ非同期か

ブラウザの JavaScript は 1 スレッドです。API 呼び出しの完了を待っている間に画面が固まらないよう、時間のかかる処理は **非同期** で行い、終わったら続きを実行します。

## Promise と async / await

非同期処理の結果を表すのが **Promise** です。「まだ無いが、いずれ値になるか失敗する」箱。

```javascript
// 昔の書き方
fetch(url).then(res => res.json()).then(data => console.log(data));

// 今の書き方
async function load() {
  const res = await fetch(url);
  const data = await res.json();
  console.log(data);
}
```

- `async` を付けた関数は Promise を返す
- `await` は Promise が解決するまで待ち、値を取り出す。async 関数の中でだけ使える
- 失敗は `try / catch` で捕まえる

Python の asyncio とほぼ同じ形です。

## fetch で API を呼ぶ

```javascript
async function getItems() {
  const res = await fetch("/api/items/");
  if (!res.ok) {                          // 404 や 500 でも例外にならない!
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json();
}
```

`fetch` はネットワークエラー以外では reject しません。ステータスの確認を必ず入れます。

### POST で JSON を送る

```javascript
const res = await fetch("/api/items/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "new item" }),
});
```

Django に送るときは CSRF トークンも要ります (Django のレッスンで扱います)。

```javascript
headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken }
```

## 並行して待つ

```javascript
// 直列: 合計時間 = a + b + c
const a = await fetch(urlA);
const b = await fetch(urlB);

// 並行: 合計時間 = 最も遅い 1 つ
const [resA, resB, resC] = await Promise.all([fetch(urlA), fetch(urlB), fetch(urlC)]);
```

## 画面に反映する典型形

```javascript
button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    const items = await getItems();
    list.innerHTML = items.map(i => `<li>${i.name}</li>`).join("");
  } catch (e) {
    alert("読み込みに失敗しました");
  } finally {
    button.disabled = false;
  }
});
```

「ボタンを無効化 → 呼ぶ → 描画 → 失敗なら知らせる → 元に戻す」。mokujitsu のテンプレート内 JS はこの形の繰り返しです。

## まとめ

- 非同期の結果は Promise。`async` / `await` で同期っぽく書く
- `fetch` → `res.ok` を確認 → `res.json()`
- POST は `method` + `headers` + `JSON.stringify(body)`
- 複数を並行に待つなら `Promise.all`
