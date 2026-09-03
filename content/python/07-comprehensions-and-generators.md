---
id: py-07
title: 内包表記とジェネレータ
summary: リスト・辞書・集合の内包表記、ジェネレータで大きなデータをメモリに載せずに処理する、itertools
minutes: 10
questions:
  - id: py-l07-1
    difficulty: 1
    question: "`{x: len(x) for x in [\"a\", \"bb\"]}` の結果は?"
    choices: ["[1, 2]", "{\"a\": 1, \"bb\": 2}", "{1, 2}", "エラー"]
    answer: 1
    explanation: "`{k: v for ...}` は辞書内包表記。`{x for ...}` (コロン無し) は set。"
  - id: py-l07-2
    difficulty: 2
    question: "`sum(x * x for x in range(10**8))` が `sum([x * x for x in range(10**8)])` より優れている点は?"
    choices:
      - "速い"
      - "1 億要素のリストをメモリに作らず、1 つずつ生成して足すのでメモリをほぼ使わない"
      - "結果が違う"
      - "違いは無い"
    answer: 1
    explanation: "丸括弧 (または関数呼び出しの中で括弧省略) はジェネレータ式。遅延評価で 1 要素ずつ流れる。"
  - id: py-l07-3
    difficulty: 2
    question: "ジェネレータを 2 回 for で回すとどうなる?"
    choices:
      - "2 回とも同じ結果"
      - "2 回目は何も出ない (使い切り)"
      - "エラー"
      - "2 回目は逆順"
    answer: 1
    explanation: "ジェネレータは状態を持つイテレータで、最後まで進むと終わり。もう一度使うなら作り直すか list に変換しておく。"
  - id: py-l07-4
    difficulty: 2
    question: "内包表記を使うべきでないのは?"
    choices:
      - "1 行の変換やフィルタ"
      - "副作用 (print や append) を起こす目的で書くとき"
      - "辞書を作るとき"
      - "条件付きで要素を選ぶとき"
    answer: 1
    explanation: "`[print(x) for x in xs]` は結果のリストを捨てるだけで意図が伝わらない。副作用は普通の for で書く。ネストが 2 段を超える場合も for に戻す。"
---
## 内包表記

for ループで「変換して集める」をまとめて書く構文です。

```python
squares = [x * x for x in range(5)]                 # [0, 1, 4, 9, 16]
evens = [x for x in range(10) if x % 2 == 0]        # フィルタ
labels = ["even" if x % 2 == 0 else "odd" for x in range(3)]   # 三項演算子

by_id = {u.id: u for u in users}                    # 辞書
names = {u.name for u in users}                     # set (重複除去)
pairs = [(x, y) for x in range(2) for y in range(2)]   # ネスト (外側が先)
```

| 括弧 | 結果 |
|---|---|
| `[ ]` | list |
| `{k: v}` | dict |
| `{ }` | set |
| `( )` | ジェネレータ (後述) |

## 使いどころと限界

- **1 行で読めるならOK**。「何を集めているか」がすぐ分かる
- **副作用のために使わない**。`[print(x) for x in xs]` は for で書く
- **ネストは 2 段まで**。それ以上は for か関数に分ける
- 複雑な条件は `if` 部分を関数にする: `[x for x in xs if is_valid(x)]`

## ジェネレータ: 1 つずつ作る

リスト内包表記は全要素をメモリに作ります。1 億件なら数 GB です。**ジェネレータ** は要求されたときに 1 つずつ作ります。

```python
gen = (x * x for x in range(10**8))     # この時点では何も計算していない
sum(gen)                                # 1 つずつ流れる。メモリはほぼ使わない
sum(x * x for x in range(10**8))        # 関数呼び出しの中なら括弧を省略できる
```

関数で書くなら `yield` です。

```python
def read_lines(path):
    with open(path) as f:
        for line in f:
            yield line.rstrip("\n")      # ここで一時停止し、次を要求されたら再開

for line in read_lines("huge.log"):      # ファイル全体を読み込まずに 1 行ずつ
    if "ERROR" in line:
        print(line)
```

- `yield` があると関数はジェネレータ関数になり、呼び出しても中身は走らず、ジェネレータオブジェクトが返る
- for で回す (`next()` される) たびに次の `yield` まで進む
- **使い切り**。2 回回したいなら作り直すか `list()` に固める

## パイプラインにする

ジェネレータをつなぐと、大きなデータを段階的に処理できます。

```python
lines = read_lines("access.log")
errors = (l for l in lines if " 500 " in l)
paths = (l.split()[6] for l in errors)
from collections import Counter
Counter(paths).most_common(10)          # ここで初めて全体が流れる
```

各段が 1 行ずつ受け渡すので、ファイルが 10GB でもメモリは一定です。

## itertools と組み込み

```python
from itertools import islice, chain, groupby, batched

islice(gen, 10)                 # 先頭 10 個だけ
chain(xs, ys)                   # 連結
batched(xs, 100)                # 100 個ずつのまとまり (3.12+)。DB のバルク insert に
enumerate(xs), zip(xs, ys)      # 添字 / 並走
any(x > 0 for x in xs), all(...)   # 短絡評価。最初に決まった時点で止まる
```

`any` / `all` / `sum` / `max` にジェネレータ式を渡すのが定番です。

## まとめ

- 変換とフィルタは内包表記。副作用と深いネストは for
- 括弧で list / dict / set / ジェネレータが決まる
- 大きなデータは `yield` で 1 つずつ。使い切りに注意
- ジェネレータをつないでパイプライン
