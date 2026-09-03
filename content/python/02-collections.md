---
id: py-02
title: リスト・タプル・辞書・セット
summary: 4 つのコレクションの使い分けと、ミュータブル / イミュータブルの違い
minutes: 10
questions:
  - id: py-l02-1
    difficulty: 1
    question: "「順序があり、あとから要素を追加・変更できる」コレクションは?"
    choices: ["tuple", "list", "set", "frozenset"]
    answer: 1
    explanation: "list は順序付きで変更可能。tuple は順序付きだが変更不可。set は順序なし。"
  - id: py-l02-2
    difficulty: 1
    question: "`d = {\"a\": 1}` のとき、キー `\"b\"` が無くてもエラーにならずに `None` を返す書き方は?"
    choices: ["d[\"b\"]", "d.get(\"b\")", "d.b", "d(\"b\")"]
    answer: 1
    explanation: "`d[\"b\"]` は KeyError。`d.get(\"b\")` は無ければ None (第 2 引数で既定値も指定できる)。"
  - id: py-l02-3
    difficulty: 2
    question: "次のコードの出力は?\n\n```python\na = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)\n```"
    choices: ["[1, 2, 3]", "[1, 2, 3, 4]", "[4]", "エラー"]
    answer: 1
    explanation: "`b = a` は同じリストに別名を付けただけ。コピーしたいなら `b = a.copy()` や `b = list(a)`。"
  - id: py-l02-4
    difficulty: 2
    question: "重複を取り除きたい。最も簡単なのは?"
    choices: ["list(set(items))", "items.unique()", "items.distinct()", "for 文で 1 つずつ比較する"]
    answer: 0
    explanation: "set は重複を持てないので、set に通してから list に戻す。ただし順序は保証されない。順序も保ちたいなら `list(dict.fromkeys(items))`。"
---
## 4 つのコレクション

| 型 | 書き方 | 順序 | 変更 | 重複 | 用途 |
|---|---|---|---|---|---|
| `list` | `[1, 2, 3]` | あり | できる | 可 | 並び。一番よく使う |
| `tuple` | `(1, 2, 3)` | あり | できない | 可 | 固定の組。関数の複数戻り値 |
| `dict` | `{"a": 1}` | あり (挿入順) | できる | キーは不可 | キーで引く |
| `set` | `{1, 2, 3}` | なし | できる | 不可 | 重複除去、集合演算 |

## list

```python
items = ["a", "b"]
items.append("c")       # 末尾に追加
items[0]                # "a"
items[-1]               # "c"  (末尾)
items[1:]               # ["b", "c"]  (スライス)
len(items)              # 3
"a" in items            # True
```

## dict

```python
user = {"name": "Kato", "age": 30}
user["name"]            # "Kato"
user["email"]           # KeyError!
user.get("email")       # None  (安全)
user.get("email", "-")  # "-"   (既定値)
user["email"] = "k@example.com"   # 追加

for key, value in user.items():
    print(key, value)
```

## tuple

変更できないので、「この 3 つはセット」と伝えたいときに使います。関数から複数の値を返すときにも自然に出てきます。

```python
def min_max(xs):
    return min(xs), max(xs)     # tuple を返す

lo, hi = min_max([3, 1, 2])     # アンパック
```

## set

```python
tags = {"python", "aws", "python"}
len(tags)               # 2  (重複は消える)
{1, 2, 3} & {2, 3, 4}   # {2, 3}  積集合
{1, 2, 3} | {2, 3, 4}   # {1, 2, 3, 4}  和集合
```

## ミュータブルとイミュータブル

list / dict / set は **ミュータブル** (中身を変えられる)、tuple / str / int は **イミュータブル** (変えられない)。

ミュータブルな値を別の変数に入れても、コピーにはなりません。

```python
a = [1, 2, 3]
b = a           # 同じものを指す
b.append(4)
a               # [1, 2, 3, 4]  ← a も変わる!

c = a.copy()    # 別物を作るならコピー
```

この性質は関数の引数でも同じです。関数の中でリストを変更すると呼び出し元にも影響します。

## まとめ

- 並びは list、固定の組は tuple、キーで引くなら dict、重複除去は set
- dict の安全な参照は `get()`
- 代入はコピーではない。別物が欲しければ `copy()`
