---
id: py-02
title: リスト・タプル・辞書・セット
summary: 4 つのコレクションの使い分けと、ミュータブル / イミュータブルの違い
minutes: 10
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

## やってみる

**ゴール:** 代入がコピーではないことを確かめる。

1. `python3` で:
   ```python
   a = [1, 2, 3]; b = a; b.append(4); a
   c = a.copy(); c.append(5); a, c
   d = {"x": 1}; d.get("y"), d.get("y", 0)
   list(set([3, 1, 3, 2]))
   ```
2. 関数に list を渡して中で append し、呼び出し元の list が変わることを確認する
   ```python
   def add(xs): xs.append(99)
   nums = [1]; add(nums); nums
   ```

**確認:** `b = a` では `a` も変わり、`copy()` なら変わらない。
