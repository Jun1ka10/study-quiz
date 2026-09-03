---
id: de-02
title: SOLID 原則
summary: 5 つの原則を「何を防ぐための道具か」で理解する
minutes: 12
exercise: |
  **ゴール:** if 分岐を Protocol + 実装クラスに置き換える (OCP / DIP)。

  1. `notify.py`:
     ```python
     def notify(msg, kind):
         if kind == "email": print("email:", msg)
         elif kind == "slack": print("slack:", msg)
     ```
  2. これを書き換える:
     ```python
     from typing import Protocol
     class Notifier(Protocol):
         def send(self, msg: str) -> None: ...
     class Email:
         def send(self, msg): print("email:", msg)
     class Slack:
         def send(self, msg): print("slack:", msg)
     def notify(msg: str, n: Notifier): n.send(msg)
     notify("hi", Slack())
     ```
  3. `Sms` クラスを追加する。`notify` を触らずに済むことを確認

  **確認:** 手段を足すときに既存の関数を変更しなかった。
questions:
  - id: de-l02-1
    difficulty: 1
    question: "単一責任の原則 (SRP) の正しい言い方は?"
    choices:
      - "クラスは 1 つのメソッドだけ持つ"
      - "クラスを変更する理由は 1 つだけであるべき"
      - "1 ファイル 1 クラス"
      - "関数は 10 行以内"
    answer: 1
    explanation: "責務 = 変更理由。複数の理由で変更されるクラスは分ける。"
  - id: de-l02-2
    difficulty: 2
    question: "オープン・クローズドの原則 (OCP) を満たしているのは?"
    choices:
      - "新しい通知手段を足すたびに if 分岐を追加する"
      - "Notifier インターフェースを定義し、新しい通知手段は実装クラスを追加するだけにする"
      - "全通知処理を 1 つの関数にまとめる"
      - "通知手段を増やさない"
    answer: 1
    explanation: "既存コードを変更せず (closed)、新しいクラスを足すことで拡張 (open) できる形。"
  - id: de-l02-3
    difficulty: 2
    question: "依存性逆転の原則 (DIP) で、ビジネスロジックが依存すべきものは?"
    choices: ["具体的な DB ライブラリ", "抽象 (インターフェース)", "HTTP フレームワーク", "設定ファイル"]
    answer: 1
    explanation: "上位 (ロジック) も下位 (DB 等) も抽象に依存する。実装は外から差し込む。"
  - id: de-l02-4
    difficulty: 3
    question: "インターフェース分離の原則 (ISP) に違反しているのは?"
    choices:
      - "巨大な Storage インターフェースを実装するために、使わないメソッドまで空実装している"
      - "Reader と Writer を別インターフェースに分けている"
      - "1 つのクラスが 2 つの小さいインターフェースを実装している"
      - "インターフェースにメソッドが 1 つしかない"
    answer: 0
    explanation: "使わないメソッドを強制されるのが ISP 違反。利用側ごとに小さいインターフェースに分ける。"
---
SOLID は 5 つの原則の頭文字です。暗記より「それぞれ何の問題を防ぐか」で覚えます。

## S: 単一責任 (Single Responsibility)

**クラスを変更する理由は 1 つだけ。**

```python
# NG: 帳票の計算と PDF 出力と保存が同居
class Report:
    def calculate(self): ...
    def render_pdf(self): ...
    def save_to_s3(self): ...
```

計算ルールの変更、PDF レイアウトの変更、保存先の変更、3 つの理由でこのクラスが変わります。3 つに分けます。

## O: オープン・クローズド (Open/Closed)

**拡張に対して開き、修正に対して閉じる。** 新しい振る舞いを足すときに既存コードを書き換えなくて済む形にします。

```python
# NG: 手段が増えるたびに関数を書き換える
def notify(order, kind):
    if kind == "email": ...
    elif kind == "slack": ...

# OK: 抽象に対してプログラムし、実装を足す
class Notifier(Protocol):
    def notify(self, order): ...

class EmailNotifier: ...
class SlackNotifier: ...
```

## L: リスコフの置換 (Liskov Substitution)

**親クラスの代わりに子クラスを使っても壊れない。** 子で「このメソッドは使えません」と例外を投げる、戻り値の意味を変える、といった継承は置換できないので NG です。継承は「is-a」が本当に成り立つときだけ使い、迷ったら委譲 (持つ) にします。

## I: インターフェース分離 (Interface Segregation)

**使わないメソッドに依存させない。** 巨大なインターフェースを 1 つ作ると、実装側は使わないメソッドまで書かされ、利用側は無関係な変更の影響を受けます。利用側ごとに小さく分けます。

## D: 依存性逆転 (Dependency Inversion)

**上位モジュールも下位モジュールも抽象に依存する。**

```python
# NG: ロジックが DB ライブラリを直接 import
class OrderService:
    def __init__(self):
        self.db = psycopg2.connect(...)

# OK: 抽象 (Repository) に依存し、実装は外から渡す
class OrderService:
    def __init__(self, repo: OrderRepository):
        self.repo = repo
```

「逆転」と呼ぶのは、普通は上位が下位を呼ぶ方向に依存が向くところを、抽象を間に置くことで下位 (実装) が抽象に依存する向きに変わるからです。

## 5 つの関係

SRP と ISP は「分ける」、OCP と DIP は「抽象に依存する」、LSP は「その抽象を裏切らない」。どれも前のレッスンの高凝集・疎結合を実現する具体的な手段です。

## まとめ

- S: 変更理由は 1 つ
- O: 足すときに既存を触らない
- L: 子は親の代わりになれる
- I: 使わないものに依存しない
- D: 抽象に依存し、実装は注入する
