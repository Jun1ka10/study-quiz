---
id: py-05
title: クラスと dataclass
summary: class の基本、self、__init__、dataclass で楽をする、継承より委譲
minutes: 12
exercise: |
  **ゴール:** dataclass を書いて default_factory の必要性を見る。

  1. `model.py`:
     ```python
     from dataclasses import dataclass, field
     @dataclass
     class Invoice:
         id: int
         amount: int
         tags: list[str] = field(default_factory=list)
         @property
         def total(self): return int(self.amount * 1.1)
     a = Invoice(1, 1000); b = Invoice(2, 500)
     a.tags.append("x"); print(a, b, a.total)
     ```
  2. `field(default_factory=list)` を `[]` に変えて実行し、エラーを読む
  3. `@dataclass(frozen=True)` にして `a.amount = 1` を試す

  **確認:** `b.tags` が空のまま。frozen で代入がエラーになる。
questions:
  - id: py-l05-1
    difficulty: 1
    question: "メソッドの第 1 引数 `self` は何か?"
    choices: ["クラス自身", "そのメソッドを呼び出したインスタンス", "予約語で省略できる", "親クラス"]
    answer: 1
    explanation: "`obj.method(x)` は `Class.method(obj, x)` と同じ。self は慣習名で、インスタンスの属性に `self.name` でアクセスする。"
  - id: py-l05-2
    difficulty: 1
    question: "`@dataclass` を付けると自動生成されるものは?"
    choices: ["__init__ / __repr__ / __eq__", "DB テーブル", "JSON 変換", "スレッド"]
    answer: 0
    explanation: "フィールド定義からコンストラクタ・表示・比較が生える。定型コードが消え、フィールドの追加漏れも減る。"
  - id: py-l05-3
    difficulty: 2
    question: "次の dataclass の問題は?\n\n```python\n@dataclass\nclass Order:\n    items: list = []\n```"
    choices:
      - "問題ない"
      - "ミュータブルなデフォルト値はエラーになる。`field(default_factory=list)` を使う"
      - "list は使えない"
      - "型ヒントが要らない"
    answer: 1
    explanation: "関数のデフォルト引数と同じ罠を防ぐため、dataclass は ValueError を出す。default_factory はインスタンスごとに新しい list を作る。"
  - id: py-l05-4
    difficulty: 2
    question: "「継承より委譲 (composition)」が勧められる理由は?"
    choices:
      - "継承は遅い"
      - "継承は親の実装に強く結合し、変更が子に波及する。必要な機能を持つオブジェクトを属性として持つ方が疎結合"
      - "Python は継承できない"
      - "委譲の方が短い"
    answer: 1
    explanation: "`class Report(Emailer)` より `class Report: def __init__(self, emailer)`。is-a が本当に成り立つときだけ継承する。"
---
## クラスの基本

```python
class BankAccount:
    def __init__(self, owner: str, balance: int = 0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount: int) -> None:
        if amount <= 0:
            raise ValueError("amount must be positive")
        self.balance += amount

    def __repr__(self) -> str:
        return f"BankAccount({self.owner!r}, {self.balance})"

acct = BankAccount("Kato")
acct.deposit(100)
acct.balance        # 100
```

- `__init__` はコンストラクタ。`self.xxx = ...` で属性を作る
- `self` はインスタンス自身。`acct.deposit(100)` は `BankAccount.deposit(acct, 100)` の糖衣
- `__repr__` を書いておくとデバッグ出力が読める

## dataclass: データを持つクラスの定型を消す

```python
from dataclasses import dataclass, field

@dataclass
class Invoice:
    id: int
    client: str
    amount: int
    paid: bool = False
    tags: list[str] = field(default_factory=list)    # ミュータブルは default_factory

inv = Invoice(1, "A社", 10000)
inv                      # Invoice(id=1, client='A社', amount=10000, paid=False, tags=[])
inv == Invoice(1, "A社", 10000)   # True (値で比較)
```

`__init__` / `__repr__` / `__eq__` が自動で生えます。オプション:

- `@dataclass(frozen=True)`: 属性を変更不可にする。ハッシュ可能になり dict のキーや set に入れられる
- `@dataclass(slots=True)`: メモリ削減、属性名のタイポを防ぐ
- `field(default_factory=list)`: `[]` を直接書くとエラー (関数のデフォルト引数の罠と同じ理由)

「データの入れ物」は dataclass、外部入力の検証が要るなら Pydantic (後のレッスン)、と使い分けます。

## プロパティとクラスメソッド

```python
@dataclass
class Invoice:
    amount: int
    tax_rate: float = 0.1

    @property
    def total(self) -> int:              # 属性のように読める計算値
        return int(self.amount * (1 + self.tax_rate))

    @classmethod
    def from_dict(cls, d: dict) -> "Invoice":   # 別の作り方 (ファクトリ)
        return cls(amount=d["amount"])

    @staticmethod
    def validate_amount(x: int) -> bool:        # self も cls も使わない補助関数
        return x > 0

inv.total                # () 無しで呼べる
Invoice.from_dict({"amount": 100})
```

## 継承と委譲

```python
class Animal:
    def speak(self) -> str: raise NotImplementedError

class Dog(Animal):
    def speak(self) -> str: return "wan"
```

継承は「Dog **is a** Animal」が本当に成り立つときに使います。「機能を借りたいだけ」で継承すると、親の変更が子を壊し、多重継承で何が呼ばれるか分からなくなります。

```python
# NG: 機能を借りるための継承
class Report(EmailSender):
    ...

# OK: 委譲。必要なものを持つ
class Report:
    def __init__(self, sender: EmailSender):
        self.sender = sender
    def send(self):
        self.sender.send(self.render())
```

委譲は疎結合で、テストでは `sender` に偽物を渡せます。

## Protocol: 継承なしの型

「`send()` を持っていれば何でもよい」を型で表すのが `Protocol` です。

```python
from typing import Protocol

class Sender(Protocol):
    def send(self, body: str) -> None: ...

class Report:
    def __init__(self, sender: Sender): ...     # EmailSender でも SlackSender でも FakeSender でも可
```

継承関係が無くてもメソッドの形が合えば通ります。設計のレッスンの DIP をそのまま Python で書く道具です。

## まとめ

- `__init__` で属性、`self` はインスタンス、`__repr__` は書く
- データの入れ物は `@dataclass`。ミュータブルは `default_factory`
- 計算値は `@property`、別の作り方は `@classmethod`
- 継承は is-a のときだけ。機能を借りるなら委譲、型は `Protocol`
