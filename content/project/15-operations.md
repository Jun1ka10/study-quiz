---
id: step-15
title: "運用: ログ・監視・毎日の復習リマインダー"
summary: "構造化ログ、エラー率のアラート、Cloud Scheduler + Cloud Run Job で「今日の復習が N 問あります」を毎朝通知する"
phase: "5. 仕上げ"
prereqs: [gcp-02, infra-01, be-06]
minutes: 120
---
## ゴール

「動いているか分かる」「壊れたら気づく」「毎日使う理由がある」の 3 つ。

## 手順

1. **構造化ログ**: API のログを JSON (1 行 1 レコード、`severity`、`request_id`、`user_id`、`path`、`latency_ms`) にする。Cloud Logging がフィールドとして解釈し、`jsonPayload.user_id="42"` で検索できる。`Authorization` や本文は **出さない**
2. **リクエスト ID**: ミドルウェアで `X-Request-Id` を発行してレスポンスに返し、ログに入れる。障害の問い合わせで「その ID のログを見る」ができる
3. **メトリクスとアラート** (Terraform): Cloud Run の 5xx 率が 5 分間 2% 超で通知、レイテンシ p95 が 2 秒超で通知。通知先はメール (`google_monitoring_notification_channel`)。わざと 500 を返すエンドポイントを一時的に作って、アラートが届くことを確認して消す
4. **バッチ**: `POST /internal/daily-digest` ではなく、Cloud Run **Job** `daily-digest` を作る。全ユーザーの `review_schedule` から `due_at <= now` を数え、通知する。Cloud Scheduler で毎朝 8:00 JST に `gcloud run jobs execute` を叩く (Scheduler → Job は OIDC で認証)
5. **通知先**: まずはメール (SendGrid や SES の無料枠) か チャットの Webhook。**Web Push** に進む場合は、PWA に購読 (`PushManager.subscribe`) と `push` イベントを足し、購読情報を `push_subscriptions` テーブルに保存、Job から `pywebpush` で送る (VAPID 鍵は Secret Manager)
6. **ダッシュボード**: Cloud Monitoring に「リクエスト数 / 5xx / p95 / DB 接続数」を並べたダッシュボードを Terraform で作る
7. **バックアップ**: Cloud SQL の自動バックアップとポイントインタイムリカバリを Terraform で有効化。1 回リストアを試す

## できたか確認

- ログを `jsonPayload.request_id` で 1 リクエスト分に絞れる
- 500 を出したらアラートメールが来た
- 毎朝の通知が届く (スマホで受け取れたら、このプロジェクトの最初の願いが叶っている)
- バックアップからのリストアを一度やった

## ここでの学び

運用は「見える化」と「自動化」。ここまで来ると、このアプリは学習教材ではなく、あなたが毎日使い、壊れたら直せるサービスになっている。次に作るものは、この形をなぞればよい。
