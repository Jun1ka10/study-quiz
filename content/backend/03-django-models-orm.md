---
id: be-03
title: Django モデルと ORM
summary: モデル定義、マイグレーション、QuerySet。N+1 を避ける select_related / prefetch_related
minutes: 14
questions:
  - id: be-l03-1
    difficulty: 1
    question: "モデルにフィールドを追加した。DB に反映する手順は?"
    choices:
      - "runserver すれば自動で反映される"
      - "makemigrations でマイグレーションファイルを作り、migrate で適用する"
      - "SQL を手で書いて ALTER TABLE する"
      - "DB を作り直す"
    answer: 1
    explanation: "マイグレーションファイルは Git に入れる。他の環境でも migrate するだけで同じスキーマになる。"
  - id: be-l03-2
    difficulty: 1
    question: "`Member.objects.filter(active=True)` が返すものは?"
    choices:
      - "条件に合う最初の 1 件"
      - "遅延評価される QuerySet (この時点では SQL は発行されない)"
      - "件数"
      - "list"
    answer: 1
    explanation: "QuerySet は for で回す・list() する・count() するなど、必要になった時点で SQL が発行される。filter は連鎖できる。"
  - id: be-l03-3
    difficulty: 2
    question: "次のコードの問題は?\n\n```python\nfor invoice in Invoice.objects.all():\n    print(invoice.client.name)\n```"
    choices:
      - "問題ない"
      - "請求書 1 件ごとに client を取る SQL が飛ぶ (N+1 問題)"
      - "client は取れない"
      - "all() は使えない"
    answer: 1
    explanation: "外部キー先は必要になった時に 1 件ずつ取りに行く。`Invoice.objects.select_related(\"client\")` で JOIN して 1 回にする。"
  - id: be-l03-4
    difficulty: 2
    question: "`get()` で該当が無いときと、2 件以上あるときはそれぞれどうなる?"
    choices:
      - "None を返す / 最初の 1 件"
      - "DoesNotExist 例外 / MultipleObjectsReturned 例外"
      - "空リスト / リスト"
      - "エラーにならない"
    answer: 1
    explanation: "get は「ちょうど 1 件」を期待する。無いかもしれないなら `filter(...).first()` (無ければ None)。ビューでは `get_object_or_404`。"
---
## モデル = テーブルの定義

```python
import uuid
from django.db import models

class Client(models.Model):
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class Invoice(models.Model):
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="invoices")
    amount = models.IntegerField()
    issued_on = models.DateField()
    paid = models.BooleanField(default=False)
```

| フィールド | 用途 |
|---|---|
| `CharField(max_length=)` | 短い文字列 |
| `TextField` | 長い文字列 |
| `IntegerField` / `DecimalField` | 数値 (金額は Decimal が無難) |
| `BooleanField` | 真偽 |
| `DateField` / `DateTimeField` | 日付 / 日時 |
| `ForeignKey` | 多対 1。`on_delete` は必須 |
| `ManyToManyField` | 多対多 |
| `UUIDField` | mokujitsu は主キーに UUID を使っている |

`on_delete` は「参照先が消えたらどうするか」。`CASCADE` (一緒に消す) は便利ですが、請求書のように消えて困るものは `PROTECT` にします。

## マイグレーション

モデルを変えたら 2 コマンドです。

```bash
python manage.py makemigrations    # 差分から members/migrations/0012_xxx.py を生成
python manage.py migrate           # DB に適用
```

マイグレーションファイルは **Git に入れます**。他の環境 (同僚の PC、本番) では `migrate` だけで同じスキーマになります。

## QuerySet で読む

```python
Client.objects.all()                          # 全件
Client.objects.filter(name__startswith="株式") # 条件
Client.objects.exclude(invoices__isnull=True)  # 除外
Client.objects.get(pk=1)                      # ちょうど 1 件 (無ければ DoesNotExist)
Client.objects.filter(pk=1).first()           # 無ければ None
Invoice.objects.filter(paid=False).order_by("-issued_on")[:10]
Invoice.objects.filter(client__name="A社")     # 関連をたどる (__ でつなぐ)
Invoice.objects.filter(paid=False).count()
Invoice.objects.filter(paid=False).aggregate(total=Sum("amount"))
```

QuerySet は **遅延評価** です。`filter` を連ねても SQL は飛ばず、for で回す・`list()`・`count()` の時点で 1 回だけ発行されます。

## 書く

```python
c = Client.objects.create(name="A社")          # INSERT
c.name = "A社 (改名)"
c.save()                                       # UPDATE
Invoice.objects.filter(paid=False).update(paid=True)   # まとめて UPDATE (save() は呼ばれない)
c.delete()
```

## N+1 問題

```python
for invoice in Invoice.objects.all():      # SELECT * FROM invoice  (1 回)
    print(invoice.client.name)             # SELECT * FROM client WHERE id=? (N 回!)
```

100 件なら 101 回 SQL が飛びます。関連を先に読んでおきます。

```python
Invoice.objects.select_related("client")       # ForeignKey → JOIN で 1 回
Client.objects.prefetch_related("invoices")    # 逆参照 / 多対多 → 2 回にまとめる
```

「一覧画面が遅い」の原因はだいたいこれです。開発中は django-debug-toolbar で SQL の回数を見ます。

## トランザクション

複数の書き込みを「全部成功か全部なし」にしたいときは `transaction.atomic()`。

```python
from django.db import transaction

with transaction.atomic():
    invoice.paid = True
    invoice.save()
    PaymentRecord.objects.create(invoice=invoice, amount=invoice.amount)
```

## まとめ

- モデル = テーブル。`on_delete` は消えて困るものに PROTECT
- 変更は makemigrations → migrate。マイグレーションは Git に
- QuerySet は遅延評価。`get` は 1 件、無いかもなら `first()`
- 関連をループで触るなら `select_related` / `prefetch_related`
