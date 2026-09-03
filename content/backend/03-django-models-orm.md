---
id: be-03
title: Django モデルと ORM
summary: モデル定義、マイグレーション、QuerySet。N+1 を避ける select_related / prefetch_related
minutes: 14
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
| `UUIDField` | 主キーを UUID にしたいとき |

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

## やってみる

**ゴール:** モデルを作り、マイグレーションと N+1 を見る。

1. `members/models.py`:
   ```python
   from django.db import models
   class Client(models.Model):
       name = models.CharField(max_length=100)
   class Invoice(models.Model):
       client = models.ForeignKey(Client, on_delete=models.PROTECT)
       amount = models.IntegerField()
   ```
2. `uv run python manage.py makemigrations && uv run python manage.py migrate`。生成されたファイルを開く
3. `uv run python manage.py shell`:
   ```python
   from members.models import *
   c = Client.objects.create(name="A"); [Invoice.objects.create(client=c, amount=i) for i in range(5)]
   from django.db import connection, reset_queries
   from django.conf import settings; settings.DEBUG = True
   reset_queries(); [i.client.name for i in Invoice.objects.all()]; len(connection.queries)
   reset_queries(); [i.client.name for i in Invoice.objects.select_related("client")]; len(connection.queries)
   ```

**確認:** クエリ数が 6 → 1 になった。
