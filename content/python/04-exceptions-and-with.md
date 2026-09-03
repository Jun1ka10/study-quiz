---
id: py-04
title: 例外処理と with
summary: try / except の正しい使い方と、リソースを確実に閉じる with 文
minutes: 8
exercise: |
  **ゴール:** 例外の型を絞り、with で確実に閉じる。

  1. `python3` で `int("abc")` と `{}["k"]` と `open("none.txt")` を打ち、それぞれの例外名をメモ
  2. ファイル `safe.py`:
     ```python
     def to_int(s):
         try:
             return int(s)
         except ValueError:
             return None
         finally:
             print("done")
     print(to_int("12"), to_int("abc"))
     ```
  3. `with open("safe.py") as f: print(len(f.read()))` を末尾に足し、`f.closed` を print して True を確認

  **確認:** finally が両方の呼び出しで走った。`f.closed` が True。
questions:
  - id: py-l04-1
    difficulty: 1
    question: "`try / except / else / finally` のうち、例外の有無に関係なく必ず実行されるのは?"
    choices: ["except", "else", "finally", "try"]
    answer: 2
    explanation: "finally は常に実行される。else は例外が出なかったときだけ。"
  - id: py-l04-2
    difficulty: 2
    question: "`except Exception:` と `except:` (裸の except) の違いは?"
    choices:
      - "違いはない"
      - "裸の except は KeyboardInterrupt や SystemExit まで捕まえてしまう"
      - "裸の except の方が速い"
      - "Exception は ValueError しか捕まえない"
    answer: 1
    explanation: "裸の except は BaseException をすべて捕まえるので Ctrl+C も止められなくなる。最低でも `except Exception:`、できれば具体的な例外を書く。"
  - id: py-l04-3
    difficulty: 1
    question: "`with open(\"f.txt\") as fp:` を使う主な理由は?"
    choices:
      - "読み込みが速くなる"
      - "ブロックを抜けたら例外が起きても必ずファイルが閉じられる"
      - "ファイルが無ければ作ってくれる"
      - "文字コードを自動判定する"
    answer: 1
    explanation: "with はコンテキストマネージャの `__exit__` を必ず呼ぶ。close の書き忘れや例外時の閉じ忘れを防ぐ。"
  - id: py-l04-4
    difficulty: 2
    question: "独自の例外クラスを作るときの基本形は?"
    choices:
      - "class MyError: pass"
      - "class MyError(Exception): pass"
      - "def MyError(): raise"
      - "MyError = Exception"
    answer: 1
    explanation: "Exception を継承する。呼び出し側は `except MyError:` で自分の例外だけを狙って捕まえられる。"
---
## 例外とは

実行中に起きたエラーは例外 (exception) として投げられ、捕まえなければプログラムは止まります。

```python
int("abc")        # ValueError: invalid literal for int()
{}["x"]           # KeyError: 'x'
open("no.txt")    # FileNotFoundError
```

## try / except

```python
try:
    n = int(text)
except ValueError:
    print("数値ではありません")
    n = 0
```

ポイントは **捕まえる例外を具体的に書く** こと。`except Exception:` はバグまで隠してしまい、裸の `except:` は Ctrl+C すら効かなくなります。

複数の例外をまとめて受けることもできます。

```python
except (ValueError, TypeError) as e:
    print(f"変換失敗: {e}")
```

## else / finally

```python
try:
    fp = open(path)
except FileNotFoundError:
    ...                     # 失敗したとき
else:
    ...                     # 成功したときだけ
finally:
    ...                     # どちらでも必ず (後片付け)
```

## 例外を投げる

```python
def withdraw(balance, amount):
    if amount > balance:
        raise ValueError("残高不足")
    return balance - amount
```

自分の例外を定義するときは `Exception` を継承します。

```python
class InsufficientBalance(Exception):
    pass
```

## with 文

ファイル・DB 接続・ロックなど「使い終わったら必ず閉じるもの」は with で扱います。

```python
with open("data.txt", encoding="utf-8") as fp:
    text = fp.read()
# ここで fp は閉じている。途中で例外が出ても閉じる
```

with が無いと `close()` を自分で呼ぶ必要があり、例外が出た経路で閉じ忘れが起きます。

## まとめ

- 例外は具体的な型で捕まえる。裸の `except:` は書かない
- 後片付けは `finally`、成功時だけの処理は `else`
- 閉じる必要があるものは `with`
