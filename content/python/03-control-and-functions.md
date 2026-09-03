---
id: py-03
title: 制御構文と関数
summary: if / for / while と、関数の定義。デフォルト引数の罠
minutes: 10
exercise: |
  **ゴール:** デフォルト引数の罠を再現して直す。

  1. ファイル `trap.py` を作る
     ```python
     def add(x, acc=[]):
         acc.append(x)
         return acc
     print(add(1)); print(add(2))
     ```
  2. `python3 trap.py` で `[1, 2]` が出るのを見る
  3. `acc=None` にして関数内で `if acc is None: acc = []` を足し、`[1]` `[2]` になるのを確認
  4. `for i, x in enumerate(["a", "b"]): print(i, x)` を末尾に足して実行

  **確認:** 直す前後で出力が変わった理由を一言で言える。
questions:
  - id: py-l03-1
    difficulty: 1
    question: "`for i in range(3):` で `i` が取る値は?"
    choices: ["1, 2, 3", "0, 1, 2", "0, 1, 2, 3", "1, 2"]
    answer: 1
    explanation: "range(n) は 0 から n-1 まで。range(1, 4) なら 1, 2, 3。"
  - id: py-l03-2
    difficulty: 1
    question: "リストの要素と添字を同時に取り出す組み込み関数は?"
    choices: ["zip", "enumerate", "range", "map"]
    answer: 1
    explanation: "`for i, x in enumerate(items):`。zip は複数のリストを並べて回す。"
  - id: py-l03-3
    difficulty: 2
    question: "次のコードの 2 回目の出力は?\n\n```python\ndef add(x, acc=[]):\n    acc.append(x)\n    return acc\n\nprint(add(1))\nprint(add(2))\n```"
    choices: ["[2]", "[1, 2]", "[1]", "エラー"]
    answer: 1
    explanation: "デフォルト引数は定義時に 1 回だけ作られ、呼び出し間で共有される。ミュータブルなデフォルト値は `None` にして関数内で初期化する。"
  - id: py-l03-4
    difficulty: 2
    question: "`def greet(name, *, loud=False):` の `*` の意味は?"
    choices:
      - "可変長引数を受け取る"
      - "これ以降の引数はキーワード指定でしか渡せない"
      - "loud が必須になる"
      - "文法エラー"
    answer: 1
    explanation: "`*` 単独はキーワード専用引数の区切り。`greet(\"a\", True)` はエラーで `greet(\"a\", loud=True)` と書く必要がある。読みやすさのために使う。"
---
## if / elif / else

```python
if score >= 80:
    grade = "A"
elif score >= 60:
    grade = "B"
else:
    grade = "C"
```

ブロックはインデント (スペース 4 つ) で表します。`and` / `or` / `not` で条件をつなぎます。

## for

Python の for は「コレクションの要素を 1 つずつ取り出す」ループです。

```python
for item in ["a", "b", "c"]:
    print(item)

for i in range(3):          # 0, 1, 2
    print(i)

for i, item in enumerate(["a", "b"]):   # 添字と要素
    print(i, item)

for k, v in {"x": 1}.items():           # dict
    print(k, v)
```

`break` でループを抜け、`continue` で次の周へ進みます。

## while

条件が真の間繰り返します。回数が決まっていないときに使います。

```python
n = 0
while n < 3:
    n += 1
```

## 関数

```python
def area(width, height=1.0):
    """長方形の面積を返す"""
    return width * height

area(3)              # 3.0
area(3, 2)           # 6
area(width=3, height=2)   # キーワード引数
```

- `return` が無い関数は `None` を返す
- 最初の文字列は docstring で、関数の説明になる

## デフォルト引数の罠

デフォルト値は **関数を定義した時に 1 回だけ** 作られます。リストや辞書をデフォルトにすると、呼び出しをまたいで同じものが使い回されます。

```python
def add(x, acc=[]):      # NG
    acc.append(x)
    return acc

add(1)   # [1]
add(2)   # [1, 2]  ← 前回のが残っている
```

正しくは `None` を既定にして中で作ります。

```python
def add(x, acc=None):
    if acc is None:
        acc = []
    acc.append(x)
    return acc
```

## 可変長引数とキーワード専用引数

```python
def log(*args, **kwargs):     # 任意個の位置引数 / キーワード引数
    print(args, kwargs)

def greet(name, *, loud=False):   # * 以降はキーワードでしか渡せない
    ...
greet("Kato", loud=True)
```

## まとめ

- for はコレクションを回す。添字が要るなら `enumerate`
- 関数のデフォルト値にミュータブルを置かない
- `*` でキーワード専用にすると呼び出しが読みやすくなる
