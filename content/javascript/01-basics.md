---
id: js-01
title: JavaScript の基本
summary: 変数・関数・配列・オブジェクト。Python との違いを軸に押さえる
minutes: 12
exercise: |
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
questions:
  - id: js-l01-1
    difficulty: 1
    question: "現代の JavaScript で、再代入しない変数の宣言に使うのは?"
    choices: ["var", "let", "const", "def"]
    answer: 2
    explanation: "基本は const。再代入が要るときだけ let。var は関数スコープで巻き上げがあるので使わない。"
  - id: js-l01-2
    difficulty: 1
    question: "`\"1\" == 1` と `\"1\" === 1` の結果は?"
    choices: ["両方 true", "両方 false", "== は true、=== は false", "== は false、=== は true"]
    answer: 2
    explanation: "== は型変換してから比較するので true。=== は型も見るので false。常に === を使う。"
  - id: js-l01-3
    difficulty: 2
    question: "`[1, 2, 3].map(x => x * 2)` の結果は?"
    choices: ["[2, 4, 6]", "6", "[1, 2, 3]", "undefined"]
    answer: 0
    explanation: "map は各要素に関数を適用した新しい配列を返す。Python の `[x * 2 for x in xs]` に相当。"
  - id: js-l01-4
    difficulty: 2
    question: "`const { name, age } = user;` は何をしている?"
    choices:
      - "user に name と age を追加"
      - "user の name と age プロパティを同名の変数に取り出す (分割代入)"
      - "user を name と age で比較"
      - "文法エラー"
    answer: 1
    explanation: "分割代入 (destructuring)。配列なら `const [a, b] = arr;`。React の props でも多用される。"
  - id: js-l01-5
    difficulty: 2
    question: "`const nums = [1, 2]; nums.push(3);` はエラーになる?"
    choices:
      - "なる。const は変更できない"
      - "ならない。const は再代入を禁じるだけで、中身の変更はできる"
      - "なる。push は const 配列に使えない"
      - "ならないが警告が出る"
    answer: 1
    explanation: "const は「変数が指す先」を固定する。配列やオブジェクトの中身は変えられる。`nums = [4]` は TypeError。"
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
