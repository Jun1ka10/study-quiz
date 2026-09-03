---
id: be-11
title: バッチ処理の実装 (management command / APScheduler / Job)
summary: Django の管理コマンド、FastAPI アプリ内のスケジューラ、コンテナの Job。冪等・再開可能・観測可能なバッチの書き方
minutes: 12
---
## バッチの置き場

| 方式 | 起動 | 向き | 注意 |
|---|---|---|---|
| Django management command + cron / timer | OS のスケジューラ | VM 1 台の Django | 多重起動と TZ |
| APScheduler (アプリ内) | Web プロセスの中 | 小規模、手軽 | 複数インスタンスで重複、プロセス再起動で消える |
| Cloud Run Job + Scheduler / ECS Scheduled Task | クラウド | サーバーレス構成 | 冪等、タイムアウト |
| キュー (Celery / RQ / Pub/Sub) + ワーカー | イベント駆動 | 非同期処理、リトライ | 基盤 (Redis 等) が要る |

「定期」は cron / Scheduler、「リクエストから切り離した後処理」はキュー、と分けます。

## Django: management command

```python
# app/management/commands/close_month.py
from django.core.management.base import BaseCommand

class Command(BaseCommand):
    help = "月次締め"

    def add_arguments(self, parser):
        parser.add_argument("--month", default=None)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        month = opts["month"] or previous_month()
        n = close_month(month, dry_run=opts["dry_run"])
        self.stdout.write(self.style.SUCCESS(f"closed {month}: {n} invoices"))
```

`python manage.py close_month --month 2026-08 --dry-run`。Django の設定と ORM がそのまま使え、cron からはこれを呼びます。**ロジックは services に置き、コマンドは薄く** (引数を受けて呼ぶだけ)。テストは services を直接。

## FastAPI: 別エントリポイント

Web と同じコードベースで、別の入口を作ります。

```python
# src/app/jobs/daily_digest.py
def main() -> int:
    settings = Settings()
    with SessionLocal() as db:
        sent = send_digests(db, now=datetime.now(timezone.utc))
    log.info("digest done", extra={"extra_fields": {"sent": sent}})
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

Cloud Run Job の `command` を `python -m app.jobs.daily_digest` にします。同じイメージ、同じ設定、同じモデル。

## APScheduler (アプリ内)

```python
from apscheduler.schedulers.background import BackgroundScheduler
sched = BackgroundScheduler(timezone="Asia/Tokyo")
sched.add_job(send_digests, "cron", hour=8, id="digest", replace_existing=True, max_instances=1)
sched.start()
```

- 1 プロセスで動く前提。Cloud Run のように 0〜N 台に変動する環境では **重複実行か未実行** になる。使うなら 1 台固定のプロセスで
- 手軽さの代わりに、実行履歴・失敗通知・再実行が自前になる。早めに Job + Scheduler へ

## バッチの作法

### 冪等

```python
# NG: 走るたびに増える
db.execute(insert(MonthlyReport).values(month=m, total=total))
# OK: 同じ月は上書き
db.execute(insert(MonthlyReport).values(month=m, total=total).on_conflict_do_update(index_elements=["month"], set_={"total": total}))
```

通知は「送信済み」を **先に記録** してから送る (送ってから記録だと、記録前に落ちて再実行で二重送信)。

### 再開可能

10 万件を 1 トランザクションで処理すると、途中で落ちたら全部やり直しで、ロックも長い。

```python
for batch in batched(pending_ids(), 500):
    with db.begin():
        process(batch)
        mark_done(batch)
```

500 件ずつコミット。落ちても続きから。

### 観測可能

- 開始 / 終了 / 件数 / 所要時間をログ (構造化)
- 失敗は非 0 で終了 (Job / cron が失敗と認識する)。例外を握りつぶして 0 で終わらない
- 「定刻に走らなかった」の検知 (ハートビート、最終成功時刻のメトリクス)
- `--dry-run` で「何をするか」だけ出せるように。本番で初回に必ず使う

### 時刻

「前日分」は **どのタイムゾーンの前日か** を決めて固定する (JST の 0:00〜24:00 なら、UTC で 15:00〜15:00)。境界の取りこぼしと重複を避けるため、`>= start AND < end` の半開区間で。

### 同時実行

- OS の cron なら `flock`。Job は Scheduler が同時起動しない設定に
- DB 側で **advisory lock** (`pg_try_advisory_lock(12345)`) を取れば、どこから起動しても 1 つだけ走る

## テスト

- ロジック (services) を純粋関数に近づけ、`now` と repo を注入してユニットテスト
- コマンド / エントリポイントは薄いので、1 本だけ「呼べて終了コード 0」を確認
- 冪等性のテスト: 2 回呼んで結果が同じ

## まとめ

- Django は management command、FastAPI は `python -m app.jobs.x`。ロジックは services に
- APScheduler は 1 台固定のときだけ。基本は Job + Scheduler
- 冪等 (UPSERT、送信済みを先に記録)、小さくコミット、失敗は非 0、dry-run
- 時刻は TZ を決めて半開区間、同時実行は flock / advisory lock

## やってみる

**ゴール:** 冪等で再開可能なバッチを書き、2 回実行しても壊れないことを確かめる。

1. be-08 の PostgreSQL に `daily_stats(day date primary key, total int, correct int)` を作る
2. Python で `attempts` から「指定日 (JST) の total と correct」を集計し、`INSERT ... ON CONFLICT (day) DO UPDATE` で書くスクリプト `daily_stats.py --day 2026-09-02 [--dry-run]` を書く。境界は `>= '2026-09-02 00:00+09' AND < '2026-09-03 00:00+09'`
3. 2 回実行して行が 1 つのまま値が同じことを確認
4. 途中で `raise` を入れて非 0 で終わるようにし、`echo $?` で確認。握りつぶした場合との違いを見る
5. `SELECT pg_try_advisory_lock(42)` を先頭で取り、2 つのターミナルで同時に起動して片方がスキップされるのを見る
6. Django があれば同じロジックを management command にして `--dry-run` を付ける

**確認:** 2 回走っても同じ。途中で落ちたら非 0。同時起動で 1 つだけ走った。
