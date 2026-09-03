---
id: js-03
title: DOM 操作とイベント
summary: 要素の取得・書き換え・追加と、クリックや送信への反応。フレームワーク無しで画面を動かす基本
minutes: 10
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

## やってみる

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
