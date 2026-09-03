---
id: de-04
title: DDD 入門 (エンティティ・値オブジェクト・集約)
summary: 業務の言葉をコードにする。同一性を持つエンティティ、値で比較する値オブジェクト、整合性の単位である集約
minutes: 14
---
## DDD の核心は「言葉」

ドメイン駆動設計 (DDD) の道具は多いですが、核心は 1 つです。**業務の人が使う言葉を、そのままコードの名前にする** (ユビキタス言語)。

「請求書を発行する」を `invoice.issue()`、「合格」を `lesson_progress.passed` と書く。`update_status(2)` のような技術の言葉で業務を書かない。これだけで、仕様の会話とコードのずれが減ります。

## エンティティと値オブジェクト

| | エンティティ | 値オブジェクト |
|---|---|---|
| 同一性 | ID で識別。属性が変わっても同じもの | 値が同じなら同じもの |
| 例 | ユーザー、請求書、レッスン進捗 | 金額、期間、メールアドレス、正答率 |
| 可変性 | 状態が変わる | 不変。変えるなら新しく作る |

```python
@dataclass(frozen=True)
class Money:                       # 値オブジェクト
    amount: int
    currency: str = "JPY"
    def __post_init__(self):
        if self.amount < 0: raise ValueError("negative")
    def __add__(self, other: "Money") -> "Money":
        if self.currency != other.currency: raise ValueError("currency mismatch")
        return Money(self.amount + other.amount, self.currency)

@dataclass
class Invoice:                     # エンティティ
    id: int
    lines: list["InvoiceLine"]
    status: Literal["draft", "issued", "paid"] = "draft"

    @property
    def total(self) -> Money:
        return sum((l.subtotal for l in self.lines), Money(0))

    def issue(self) -> None:
        if self.status != "draft": raise InvalidTransition("already issued")
        if not self.lines: raise ValueError("no lines")
        self.status = "issued"
```

値オブジェクトにすると、「負の金額」「通貨違いの足し算」のような不正が **生成時と演算時に** 弾かれ、int を持ち回る設計より安全です。

## 集約: 整合性の単位

`Invoice` と `InvoiceLine` は、合計金額や「発行後は変更不可」といったルールを **一緒に** 守る必要があります。この塊が **集約** で、外から触ってよい入口は 1 つ (**集約ルート** = Invoice) です。

```python
invoice.add_line(item, qty)        # OK: ルート経由。発行済みなら拒否できる
invoice.lines.append(line)         # NG: ルールを迂回している
```

集約の設計指針:

- 1 トランザクションで 1 集約を更新する
- 集約は小さく。「注文と注文明細」は 1 つ、「注文と顧客」は別 (顧客は ID で参照)
- 集約をまたぐ整合性は、即時ではなくイベントで (次のレッスン)

## Repository は集約ごと

前のレッスンの Repository は、集約ルート 1 つに 1 つです。`InvoiceRepository.get(id)` は明細ごと返し、`save(invoice)` は明細ごと保存します。`InvoiceLineRepository` は作りません。

## ドメインサービス

「2 つの集約にまたがる計算」や「どのエンティティにも属さないルール」は、状態を持たない関数にします。

```python
def transfer_points(src: Account, dst: Account, amount: Money) -> None:
    src.withdraw(amount); dst.deposit(amount)
```

## 状態遷移を明示する

`status` を文字列で持ち、`if status == "issued"` を散らすと漏れます。遷移をメソッドにし、許されない遷移は例外にします。

```
draft ──issue()──▶ issued ──pay()──▶ paid
  └──cancel()──▶ cancelled
```

Python なら `Enum` + メソッド、複雑なら状態遷移表を dict で持ちます。

## Django での DDD

Django の Model はエンティティです。ルールはモデルのメソッドに置き、view や services から `invoice.issue()` と呼びます。値オブジェクトは dataclass で作り、モデルのプロパティで組み立てて返します (`@property def total(self) -> Money`)。ORM の `QuerySet` を Repository と見なせば、ほぼそのまま DDD の形になります。

## やりすぎない

DDD の用語 (境界づけられたコンテキスト、ドメインイベント、CQRS) を全部入れる必要はありません。

- 業務の言葉で名前を付ける
- 不正な値は値オブジェクトで作れなくする
- ルールは集約ルートのメソッドに置き、迂回させない

この 3 つで大半の効果が出ます。

## まとめ

- 業務の言葉をコードの名前に
- エンティティは ID、値オブジェクトは値で同一性
- 集約 = 整合性の単位。ルート経由でしか触らない、1 トランザクション 1 集約
- 状態遷移はメソッドで明示

## やってみる

**ゴール:** 値オブジェクトと集約ルートで、不正な操作をコードで防ぐ。

1. `invoice.py` に `Money` (frozen dataclass、負の値と通貨違いを拒否) と `Invoice` (lines、status、`add_line`、`issue`、`total`) を書く
2. `test_invoice.py`:
   - `Money(-1)` が ValueError
   - `Money(100) + Money(1, "USD")` が ValueError
   - 明細 2 行で `total` が合う
   - `issue()` 後の `add_line()` が例外
   - `issue()` を 2 回で例外
3. `invoice.lines.append(...)` で迂回できてしまう問題を、`lines` を `_lines` にして読み取り専用のプロパティで返す形に直す
4. `Invoice` の `status` を `Enum` にし、遷移を `_TRANSITIONS = {Status.DRAFT: {Status.ISSUED, Status.CANCELLED}, ...}` の表で検証する

**確認:** 不正な金額・遷移・迂回がテストで落ちる。業務の言葉 (issue / pay) がメソッド名になっている。
