---
id: js-03
title: DOM 操作とイベント
summary: 要素の取得・書き換え・追加と、クリックや送信への反応。フレームワーク無しで画面を動かす基本
minutes: 10
exercise: |
  **ゴール:** 素の HTML + JS で、追加した行にもイベント委譲でクリックを効かせる。

  1. `dom.html`:
     ```html
     <input id="t"><button id="add">追加</button>
     <ul id="list"></ul>
     <script>
       const list = document.querySelector("#list");
       document.querySelector("#add").addEventListener("click", () => {
         const li = document.createElement("li");
         li.textContent = document.querySelector("#t").value;   // innerHTML にしない
         list.appendChild(li);
       });
       list.addEventListener("click", (e) => { if (e.target.closest("li")) e.target.remove(); });
     </script>
     ```
  2. ブラウザで開き、追加した行をクリックして消えることを確認
  3. 入力に `<b>x</b>` を入れて追加。太字にならないことを確認。`textContent` を `innerHTML` に変えて違いを見る

  **確認:** 後から追加した li にもクリックが効く。innerHTML だとタグが解釈される。
questions:
  - id: js-l03-1
    difficulty: 1
    question: "CSS セレクタで最初に一致する要素を 1 つ取得するメソッドは?"
    choices: ["document.getElement(\".btn\")", "document.querySelector(\".btn\")", "document.find(\".btn\")", "document.select(\".btn\")"]
    answer: 1
    explanation: "querySelector は 1 つ、querySelectorAll は一致する全部 (NodeList)。id なら getElementById もある。"
  - id: js-l03-2
    difficulty: 2
    question: "ユーザーが入力した文字列を画面に出すとき、`el.innerHTML = text` が危険な理由は?"
    choices:
      - "遅いから"
      - "text に `<script>` や `<img onerror=...>` が含まれると実行される (XSS)"
      - "改行が消えるから"
      - "危険ではない"
    answer: 1
    explanation: "文字列として出すなら `textContent` を使う。innerHTML は自分で組み立てた安全な HTML にだけ使う。"
  - id: js-l03-3
    difficulty: 1
    question: "フォーム送信時にページ遷移を止めて JS で処理したい。イベントハンドラで呼ぶものは?"
    choices: ["event.stop()", "event.preventDefault()", "return true", "event.cancel()"]
    answer: 1
    explanation: "submit イベントの既定動作 (ページ遷移) を止めるのが preventDefault。リンクのクリックでも同じ。"
  - id: js-l03-4
    difficulty: 2
    question: "あとから動的に追加される行にもクリック処理を効かせたい。良い方法は?"
    choices:
      - "追加するたびに addEventListener を付け直す"
      - "親要素に 1 つリスナーを付け、event.target で押された要素を判定する (イベント委譲)"
      - "setInterval で監視する"
      - "不可能"
    answer: 1
    explanation: "イベントは親へ伝播 (バブリング) するので、親で受ければ後から増えた子にも効く。`event.target.closest('.row')` で対象を特定する。"
---
## DOM とは

ブラウザは HTML を **DOM** (Document Object Model) というツリーにして持っています。JS からこのツリーを読み書きすると画面が変わります。React や Next.js も最終的にはこれをやっています。

## 要素を取得する

```javascript
const btn = document.querySelector("#save");          // 最初の 1 つ
const rows = document.querySelectorAll("table tr");    // 全部 (NodeList)
const form = document.getElementById("member-form");

rows.forEach((tr) => console.log(tr.textContent));
```

## 読む・書く

```javascript
el.textContent = "保存しました";     // 文字列として (安全)
el.innerHTML = "<b>太字</b>";       // HTML として (自分で組んだものだけ)
el.value                            // input / select の値
el.classList.add("hidden");         // クラスの付け外し
el.classList.toggle("open");
el.dataset.id                       // data-id="..." 属性
el.hidden = true;                   // 表示 / 非表示
el.setAttribute("aria-busy", "true");
```

**ユーザー入力や API の値を innerHTML に入れてはいけません。** `<script>` や `onerror` が実行される XSS になります。文字列は `textContent`。

## 作る・消す

```javascript
const li = document.createElement("li");
li.textContent = item.name;
list.appendChild(li);              // 末尾に追加
list.prepend(li);                  // 先頭
li.remove();                       // 削除
list.replaceChildren();            // 全部消す
```

## イベント

```javascript
btn.addEventListener("click", (event) => {
  console.log("clicked", event.target);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();          // ページ遷移を止める
  const data = new FormData(form);
  await fetch("/api/members/", { method: "POST", body: data });
});

input.addEventListener("input", (e) => {    // 1 文字ごと
  preview.textContent = e.target.value;
});
```

| イベント | いつ |
|---|---|
| `click` | クリック / タップ |
| `submit` | フォーム送信 |
| `input` / `change` | 入力中 / 確定時 |
| `keydown` | キー押下 |
| `DOMContentLoaded` | HTML の読み込み完了 |

## イベント委譲

行を後から追加するテーブルで、行ごとにリスナーを付けるのは面倒で漏れます。イベントは親へ伝わる (バブリング) ので、親で 1 回受けます。

```javascript
table.addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-id]");
  if (!row) return;
  openDetail(row.dataset.id);
});
```

## HTML に script を置く場所

`<script>` を `<head>` に置くと、まだ要素が無い状態で実行されて `querySelector` が null を返します。`</body>` の直前に置くか、`defer` を付けます。

```html
<script src="app.js" defer></script>
```

## まとめ

- 取得は `querySelector`、書くのは `textContent` (innerHTML は自分の HTML だけ)
- 反応は `addEventListener`。フォームは `preventDefault`
- 増える要素には親でイベント委譲
- script は `defer` か body の最後
