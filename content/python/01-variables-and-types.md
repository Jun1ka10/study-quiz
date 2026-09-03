---
id: py-01
title: 変数と基本の型
summary: 数値・文字列・真偽値と、型の変換。f-string で表示する
minutes: 8
exercise: |
  **ゴール:** 型と f-string を REPL で体感する。

  1. `python3` で対話モードに入る
  2. 次を 1 行ずつ打って結果を見る
     ```python
     7 / 2, 7 // 2, type(7 / 2)
     "12" + 3          # エラーになる
     int("12") + 3
     f"{0.8765:.1%}"
     bool(""), bool("False"), bool([0])
     ```
  3. `x = 3` のあと `x = "three"` と入れ直し、`type(x)` を見る

  **確認:** 割り算の結果が float になること、`"False"` が真であることを自分の目で見た。
questions:
  - id: py-l01-1
    difficulty: 1
    question: "`x = 7 / 2` のあと、`x` の型は?"
    choices: ["int", "float", "str", "bool"]
    answer: 1
    explanation: "`/` は常に float を返す。整数の商が欲しいときは `//`。"
  - id: py-l01-2
    difficulty: 1
    question: "`int(\"12\") + 3` の結果は?"
    choices: ["\"123\"", "15", "エラー", "\"15\""]
    answer: 1
    explanation: "`int(\"12\")` で文字列を整数 12 に変換してから足すので 15。変換しないと `\"12\" + 3` は TypeError。"
  - id: py-l01-3
    difficulty: 1
    question: "`name = \"Kato\"` のとき `f\"Hello, {name}!\"` は?"
    choices: ["Hello, name!", "Hello, {name}!", "Hello, Kato!", "エラー"]
    answer: 2
    explanation: "f-string は `{}` の中を式として評価して埋め込む。"
  - id: py-l01-4
    difficulty: 2
    question: "次のうち `False` になるものは?"
    choices: ["bool(\"False\")", "bool(1)", "bool(\"\")", "bool([0])"]
    answer: 2
    explanation: "空文字列・空リスト・0・None は偽。`\"False\"` は空でない文字列なので真。`[0]` も要素が 1 つあるので真。"
---
## 変数は「名前を付ける」だけ

Python の変数は宣言不要で、値に名前を付けるだけです。型は値の側にあり、変数には付いていません。

```python
age = 30          # int
price = 19.8      # float
name = "Kato"     # str
active = True     # bool
```

同じ変数に別の型を入れ直すこともできますが、読みにくくなるので実務では避けます。

## よく使う 4 つの型

| 型 | 例 | 用途 |
|---|---|---|
| `int` | `3`, `-10` | 個数、ID |
| `float` | `3.14`, `1e-3` | 計算結果、金額 (厳密さが要るなら `decimal`) |
| `str` | `"hello"` | 文字列 |
| `bool` | `True` / `False` | 条件 |

`type(x)` で型を確認できます。

## 演算の注意点

```python
7 / 2    # 3.5   ← 割り算は常に float
7 // 2   # 3     ← 切り捨て除算
7 % 2    # 1     ← 余り
2 ** 10  # 1024  ← べき乗
```

文字列と数値は自動で混ざりません。

```python
"12" + 3        # TypeError
int("12") + 3   # 15
str(12) + "3"   # "123"
```

## f-string で表示する

`f"..."` の中の `{}` に式を書くと、その値が埋め込まれます。

```python
name = "Kato"
score = 0.8765
print(f"{name} さんの正答率は {score:.1%} です")
# Kato さんの正答率は 87.7% です
```

`:.1%` のような書式指定で桁数や % 表示を制御できます。

## 真偽値の落とし穴

`if x:` のように書いたとき、次の値は **偽** として扱われます。

- `False`, `None`, `0`, `0.0`
- 空の文字列 `""`、空のリスト `[]`、空の辞書 `{}`

それ以外はすべて真です。`"False"` という文字列は空でないので真、という点に注意してください。

## まとめ

- 変数は値に名前を付けるだけ。型は値が持つ
- `/` は float、`//` は切り捨て
- 文字列と数値は `int()` / `str()` で明示的に変換する
- 表示は f-string
- 空・0・None は偽
