---
id: py-03
title: 制御構文と関数
summary: if / for / while と、関数の定義。デフォルト引数の罠
minutes: 10
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

## やってみる

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
