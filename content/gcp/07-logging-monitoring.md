---
id: gcp-07
title: "Cloud Logging / Monitoring とアラート"
summary: "ログの検索、ログベースのメトリクス、アラートポリシーと通知チャネル、ダッシュボード。壊れたら気づく仕組み"
minutes: 12
exercise: |
  **ゴール:** Cloud Run のログをフィールドで絞り、5xx のアラートを作って実際に鳴らす。

  1. gcp-02 の demo (FastAPI) に `/boom` (`raise HTTPException(500)`) と、py-10 の JSON ログを足して再デプロイ
  2. 数回 `/boom` を叩き、Logs Explorer で `resource.type="cloud_run_revision" AND severity>=ERROR` と `jsonPayload.request_id="..."` で絞る
  3. 通知チャネル: `gcloud monitoring channels create --display-name=me --type=email --channel-labels=email_address=you@example.com`
  4. アラート: Monitoring → Alerting → Create policy → メトリクス `Cloud Run Revision / Request count`、フィルタ `response_code_class = 5xx`、条件「5 分間で 5 以上」、通知チャネルに上のメール
  5. `/boom` を 10 回叩いて 5〜10 分待つ。メールが来る。止まる (resolved) まで見る
  6. 終わったらアラートポリシーと demo を削除

  **確認:** ログを request_id で 1 リクエストに絞れた。アラートが届き、収束通知も来た。
questions:
  - id: gcp-l07-1
    difficulty: 1
    question: "Cloud Run のアプリのログを Cloud Logging に送るために必要なことは?"
    choices:
      - "エージェントのインストール"
      - "何もしない。stdout / stderr に書いたものが自動で収集される。1 行 1 JSON なら jsonPayload として構造化される"
      - "ログ API を呼ぶ"
      - "ファイルに書く"
    answer: 1
    explanation: "`severity` フィールドがあればレベルも認識される。ファイルに書くとコンテナと一緒に消える。"
  - id: gcp-l07-2
    difficulty: 2
    question: "「ERROR ログが 5 分で 10 件超えたら通知」を作るには?"
    choices:
      - "できない"
      - "ログベースのメトリクス (counter) をフィルタ `severity>=ERROR` で作り、それを対象にアラートポリシーを作る"
      - "ログを毎分読む"
      - "メールでログを送る"
    answer: 1
    explanation: "ログ → メトリクス → アラート の 3 段。Terraform では google_logging_metric + google_monitoring_alert_policy。"
  - id: gcp-l07-3
    difficulty: 2
    question: "アラートの閾値を決めるときの考え方として適切なのは?"
    choices:
      - "できるだけ敏感に (1 件でも鳴らす)"
      - "ユーザー影響が出る水準 (エラー率 2%、p95 2 秒など) で鳴らす。鳴りすぎるアラートは無視されるようになり、本当の障害を見逃す"
      - "鳴らさない"
      - "毎日決まった時間に鳴らす"
    answer: 1
    explanation: "「対応が必要なときだけ鳴る」が原則。鳴ったが何もしなかったアラートは閾値を見直す。"
  - id: gcp-l07-4
    difficulty: 1
    question: "ログの保持と課金で気をつけることは?"
    choices:
      - "無制限で無料"
      - "取り込み量で課金される。DEBUG を本番で出さない、巨大な本文を出さない、不要なログは除外フィルタで捨てる"
      - "保持は 1 日"
      - "気にしなくてよい"
    answer: 1
    explanation: "既定 30 日保持。長期保存が要るものはシンクで GCS / BigQuery へ。"
---
## 3 つの層

| 層 | 問い | 道具 |
|---|---|---|
| ログ | 何が起きたか (個々の出来事) | Cloud Logging |
| メトリクス | どのくらい起きているか (数値の時系列) | Cloud Monitoring |
| アラート | 対応が必要か | アラートポリシー + 通知チャネル |

## Cloud Logging

Cloud Run / GKE / Cloud Functions は **stdout / stderr が自動で収集** されます。1 行 1 JSON で出すと `jsonPayload` として構造化され、`severity` も認識されます (Python の logging のレッスン)。

### Logs Explorer で絞る

```
resource.type="cloud_run_revision"
resource.labels.service_name="api"
severity>=ERROR
jsonPayload.request_id="3f1a9c"
jsonPayload.user_id=42
timestamp>="2026-09-03T00:00:00Z"
httpRequest.status>=500
```

- Cloud Run のリクエストログ (`httpRequest`) は自動で出る。アプリのログと `trace` で紐づく
- 保存したクエリ、ログのフィールドでの集計 (どのパスがエラーを出しているか) が画面でできる

### 保持と費用

取り込み量で課金、既定 30 日保持。

- 本番で DEBUG を出さない、リクエスト本文を丸ごと出さない
- 除外フィルタでヘルスチェックのアクセスログなどを捨てる
- 長期保存はシンクで GCS / BigQuery へ (監査ログは長めに)

## ログベースのメトリクス

「ERROR の件数」「特定のログの出現回数」を数値の時系列にします。

```hcl
resource "google_logging_metric" "api_errors" {
  name   = "api/errors"
  filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"api\" AND severity>=ERROR"
  metric_descriptor { metric_kind = "DELTA"  value_type = "INT64" }
}
```

## Cloud Monitoring のメトリクス

Cloud Run は何もしなくても次が取れます。

- リクエスト数 (ステータスクラス別)、レイテンシ (p50 / p95 / p99)
- インスタンス数、CPU / メモリ使用率、コンテナ起動時間
- Cloud SQL: CPU、接続数、ディスク

Metrics Explorer で眺め、ダッシュボードに並べます。「リクエスト数 / 5xx 率 / p95 / インスタンス数 / DB 接続数」の 5 枚があれば大半の異常は見えます。

## アラート

```hcl
resource "google_monitoring_notification_channel" "email" {
  display_name = "oncall"
  type         = "email"
  labels       = { email_address = "oncall@example.com" }
}

resource "google_monitoring_alert_policy" "api_5xx" {
  display_name = "api 5xx rate"
  combiner     = "OR"
  conditions {
    display_name = "5xx > 2% for 5m"
    condition_monitoring_query_language {
      query    = <<-EOT
        fetch cloud_run_revision
        | metric 'run.googleapis.com/request_count'
        | filter resource.service_name == 'api'
        | align rate(5m)
        | { filter metric.response_code_class == '5xx' ; ident }
        | ratio | condition ratio > 0.02
      EOT
      duration = "300s"
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}
```

### 何をアラートにするか

| 対象 | 例 |
|---|---|
| エラー率 | 5xx が 2% 超 (5 分) |
| レイテンシ | p95 が 2 秒超 |
| 可用性 | アップタイムチェック (外から /healthz を叩く) が失敗 |
| 飽和 | Cloud SQL 接続数 80%、ディスク 85% |
| バッチ | Job が失敗した、定刻に実行されなかった |

**鳴ったら必ず対応するものだけ** をアラートにします。鳴っても放置するものが混ざると、全部が無視されるようになります。鳴ったが何もしなかったら閾値を上げるか消す。

## 通知チャネル

メール、Slack、PagerDuty、Webhook。最初はメールで十分ですが、夜間に気づく必要があるなら電話が鳴るもの (PagerDuty など) に。

## アップタイムチェック

Google の外部拠点から `/healthz` を定期的に叩き、失敗で通知。「アプリは動いているが DNS / 証明書 / LB が壊れている」を検出できます。

## トレース

Cloud Trace でリクエスト 1 つの内訳 (DB 何 ms、外部 API 何 ms) が見えます。OpenTelemetry で計装します。遅い理由を探すときの道具。

## まとめ

- stdout に JSON で出すだけで構造化ログになる。request_id で追う
- ログ → メトリクス → アラートの 3 段
- アラートは「対応が必要なときだけ」。エラー率・p95・アップタイム・飽和・バッチ失敗
- ダッシュボードは 5 枚で十分。費用は取り込み量
