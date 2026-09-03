---
id: gcp-05
title: Cloud Run Jobs と Cloud Scheduler
summary: HTTP を待たずに実行して終わるバッチの器と、それを定期起動する仕組み。migration・日次集計・リマインダーの置き場
minutes: 10
---
## Service と Job

| | Service | Job |
|---|---|---|
| 起動 | HTTP リクエスト | `execute` (手動 / Scheduler / API) |
| 寿命 | 常駐 (0 台にスケールイン可) | 処理が終わったら終了 |
| 上限 | 1 リクエスト 60 分 | 1 タスク 24 時間 |
| 用途 | API、Web | migration、集計、通知、インポート |

「HTTP エンドポイントを叩いてバッチを走らせる」は、タイムアウト・二重起動・認証の面で筋が悪い。**処理して終わるものは Job** にします。

## Job の作り方

Service と同じイメージを使い、`command` だけ変えるのが楽です。

```bash
gcloud run jobs create migrate \
  --image asia-northeast1-docker.pkg.dev/PROJECT/app/api:abc1234 \
  --region asia-northeast1 \
  --service-account migrate-runner@PROJECT.iam.gserviceaccount.com \
  --set-secrets MIGRATION_DATABASE_URL=migration-db-url:latest \
  --command alembic --args upgrade,head \
  --max-retries 0 --task-timeout 10m

gcloud run jobs execute migrate --region asia-northeast1 --wait      # --wait で終了まで待ち、失敗なら非 0
```

- `--max-retries`: 失敗時の再試行。migration は 0 (二重実行を避ける)、集計は 1〜3
- `--tasks N`: 並列タスク数。`CLOUD_RUN_TASK_INDEX` で分担できる
- 実行ごとに「実行 (execution)」が作られ、ログとステータスが残る

## 冪等に作る

再試行と手動再実行があるので、**2 回走っても壊れない** 前提で書きます。

- 集計は「その日の分を UPSERT」(INSERT で足さない)
- 通知は「送信済みテーブル」に記録してから送る (送信 → 記録だと再実行で二重送信)
- 処理対象を「未処理フラグ」で選び、処理後にフラグを立てる。1 件ずつコミット

## Cloud Scheduler

cron の代わりです。VM の crontab と違い、マシンが無くても動き、実行履歴と失敗通知があります。

```bash
gcloud scheduler jobs create http daily-digest \
  --location asia-northeast1 \
  --schedule "0 8 * * *" --time-zone "Asia/Tokyo" \
  --uri "https://asia-northeast1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT/jobs/daily-digest:run" \
  --http-method POST \
  --oauth-service-account-email scheduler@PROJECT.iam.gserviceaccount.com
```

- `--time-zone` を必ず付ける (省略で UTC)
- Scheduler 用 SA に Job の `roles/run.invoker`
- Service を叩くなら `--oidc-service-account-email` で ID トークン

## Terraform

```hcl
resource "google_cloud_run_v2_job" "digest" {
  name     = "daily-digest"
  location = "asia-northeast1"
  template {
    template {
      service_account = google_service_account.digest.email
      containers {
        image   = var.image
        command = ["python", "-m", "study_quiz_server.jobs.digest"]
      }
      max_retries = 1
    }
  }
}

resource "google_cloud_scheduler_job" "digest" {
  name      = "daily-digest"
  schedule  = "0 8 * * *"
  time_zone = "Asia/Tokyo"
  http_target {
    http_method = "POST"
    uri         = "https://asia-northeast1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/daily-digest:run"
    oauth_token { service_account_email = google_service_account.scheduler.email }
  }
}
```

## デプロイの流れに組み込む

CI/CD では「イメージ push → `jobs update migrate --image` → `execute --wait` → 成功したら `services update api --image`」の順にします。migration が失敗したら API を更新しない、が自然に表現できます。

## まとめ

- 処理して終わるものは Job。Service に無理をさせない
- 再試行前提で冪等に。migration は retries 0
- 定期起動は Scheduler。time-zone と invoker を忘れない
- CI では migration Job の成功を待ってから Service を更新

## やってみる

**ゴール:** Job を作って手動実行し、Scheduler で 5 分おきに起動する (確認後に消す)。

1. `job.py` に `import os, datetime; print("digest", datetime.datetime.now(), os.environ.get("MODE"))` を書き、dk-02 の形でイメージ化して Artifact Registry へ push
2. `gcloud run jobs create demo-job --image ... --region asia-northeast1 --set-env-vars MODE=manual --max-retries 1 --task-timeout 5m`
3. `gcloud run jobs execute demo-job --region asia-northeast1 --wait` → `gcloud logging read 'resource.type="cloud_run_job"' --limit 5`
4. Scheduler 用の SA を作り `roles/run.invoker` を Job に付与: `gcloud run jobs add-iam-policy-binding demo-job --member=serviceAccount:sched@... --role=roles/run.invoker --region asia-northeast1`
5. `gcloud scheduler jobs create http demo-sched --schedule="*/5 * * * *" --time-zone=Asia/Tokyo --uri="https://asia-northeast1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$(gcloud config get project)/jobs/demo-job:run" --http-method=POST --oauth-service-account-email=sched@...`
6. 10 分待ってログに 2 回出るのを確認 → scheduler / job を削除

**確認:** Job は実行して終了する (常駐しない)。Scheduler は OAuth で Job を叩いた。
