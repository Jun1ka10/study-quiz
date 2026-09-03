---
id: js-02
title: 非同期処理と fetch
summary: Promise / async / await と、API を呼ぶ fetch。画面が API を叩く仕組み
minutes: 12
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

「ボタンを無効化 → 呼ぶ → 描画 → 失敗なら知らせる → 元に戻す」。Django テンプレート内の JS はこの形の繰り返しです。

## まとめ

- 非同期の結果は Promise。`async` / `await` で同期っぽく書く
- `fetch` → `res.ok` を確認 → `res.json()`
- POST は `method` + `headers` + `JSON.stringify(body)`
- 複数を並行に待つなら `Promise.all`

## やってみる

**ゴール:** fetch で公開 API を呼び、ok 判定と並行呼び出しを体験する。

1. ブラウザのコンソールで:
   ```javascript
   const r = await fetch("https://httpbin.org/status/404"); r.ok, r.status
   const d = await (await fetch("https://httpbin.org/json")).json(); d
   console.time("seq"); await fetch("https://httpbin.org/delay/1"); await fetch("https://httpbin.org/delay/1"); console.timeEnd("seq")
   console.time("par"); await Promise.all([fetch("https://httpbin.org/delay/1"), fetch("https://httpbin.org/delay/1")]); console.timeEnd("par")
   ```
2. POST も 1 回:
   ```javascript
   (await (await fetch("https://httpbin.org/post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: 1 }) })).json()).json
   ```

**確認:** 404 でも例外にならず `ok` が false。並行は直列の約半分の時間。
