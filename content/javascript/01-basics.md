---
id: js-01
title: JavaScript の基本
summary: 変数・関数・配列・オブジェクト。Python との違いを軸に押さえる
minutes: 12
---
## 変数

```javascript
const name = "Kato";   // 再代入しない (基本これ)
let count = 0;         // 再代入する
count += 1;
```

`const` は「別のものを代入できない」だけで、配列やオブジェクトの中身は変えられます。`var` は古い書き方で使いません。

## 型と比較

数値 (`number`)、文字列、真偽値、`null`、`undefined`、オブジェクト、配列 (オブジェクトの一種)。

```javascript
typeof 1          // "number"  (整数と小数の区別は無い)
typeof "a"        // "string"
typeof undefined  // "undefined"
typeof null       // "object"  (歴史的な事故)
```

比較は **必ず `===`** を使います。`==` は型変換してしまい、`"1" == 1` が true になります。

## 関数

```javascript
function add(a, b) {
  return a + b;
}

const add = (a, b) => a + b;            // アロー関数 (1 式なら return 省略)
const greet = (name) => {
  return `Hello, ${name}`;              // テンプレート文字列 (Python の f-string)
};
```

現代のコードはアロー関数が主流です。特にコールバック (`map` や `onClick`) はほぼアロー関数で書きます。

## 配列

```javascript
const xs = [3, 1, 2];
xs.length                   // 3
xs.push(4)                  // 末尾に追加
xs.map(x => x * 2)          // [6, 2, 4, 8]  新しい配列
xs.filter(x => x > 1)       // [3, 2, 4]
xs.find(x => x > 1)         // 3  (最初の 1 つ)
xs.includes(2)              // true
xs.forEach(x => console.log(x))
[...xs, 5]                  // スプレッドでコピー + 追加
```

Python の内包表記に当たるのが `map` / `filter` です。`for (const x of xs)` で普通のループも書けます。

## オブジェクト

Python の dict に近いですが、キーは文字列で `.` でアクセスします。

```javascript
const user = { name: "Kato", age: 30 };
user.name                   // "Kato"
user["name"]                // 同じ
user.email                  // undefined (エラーにならない)
user.email = "k@example.com";   // 追加

const { name, age } = user;         // 分割代入
const updated = { ...user, age: 31 };   // スプレッドでコピー + 上書き
Object.keys(user)                    // ["name", "age", "email"]
```

`user.address.city` のように途中が `undefined` だと TypeError になるので、`user.address?.city` (オプショナルチェーン) を使います。

## Python との対応表

| Python | JavaScript |
|---|---|
| `None` | `null` / `undefined` |
| `True` / `False` | `true` / `false` |
| `f"{x}"` | `` `${x}` `` |
| `[x*2 for x in xs]` | `xs.map(x => x*2)` |
| `d.get("k")` | `d.k` / `d?.k` |
| `len(xs)` | `xs.length` |
| `print` | `console.log` |

## まとめ

- `const` が基本、`let` は再代入するときだけ
- 比較は `===`
- 関数はアロー関数、文字列はテンプレート文字列
- 配列は `map` / `filter` / `find`、オブジェクトは分割代入とスプレッド

## やってみる

**ゴール:** ブラウザのコンソールで JS の型と配列操作を触る。

1. ブラウザで任意のページを開き、開発者ツール (F12) → Console
2. 1 行ずつ:
   ```javascript
   "1" == 1, "1" === 1
   const xs = [3, 1, 2]; xs.push(4); xs
   xs.map(x => x * 2); xs.filter(x => x > 1); xs.find(x => x > 1)
   const user = { name: "Kato", age: 30 }; const { name } = user; name
   ({ ...user, age: 31 })
   user.address?.city
   ```
3. `const n = 1; n = 2;` でエラーを見る

**確認:** `==` と `===` の違い、`const` でも `push` できること。
