---
id: py-05
title: クラスと dataclass
summary: class の基本、self、__init__、dataclass で楽をする、継承より委譲
minutes: 12
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

## やってみる

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
