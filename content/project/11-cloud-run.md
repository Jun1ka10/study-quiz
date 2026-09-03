---
id: step-11
title: "Cloud Run + Cloud SQL + Secret Manager にデプロイする"
summary: "手動 (gcloud) で一度本番に載せ、構成を体で覚える。次のステップでこれを Terraform に写す"
phase: "4. 運用"
prereqs: [gcp-02, gcp-03, gcp-04, gcp-05]
minutes: 120
---
## ゴール

API と管理画面を Cloud Run で動かし、DB は Cloud SQL (PostgreSQL)、秘密は Secret Manager。まず **手で** 作る。手順を全部メモに残す (次のステップの Terraform の仕様書になる)。

## 手順

1. プロジェクトを作り、API を有効化: `run`、`sqladmin`、`secretmanager`、`artifactregistry`
2. Artifact Registry にリポジトリを作り、`gcloud auth configure-docker asia-northeast1-docker.pkg.dev`。API と admin のイメージを build & push
3. Cloud SQL (PostgreSQL 16、最小インスタンス、**Private IP**、パブリック IP 無し)。DB `study` と 2 ユーザー (`migrator`、`app_user`) を作る
4. Secret Manager に `jwt-secret`、`db-password-app`、`db-password-migrator` を登録
5. サービスアカウントを 2 つ: `api-runner` (secretAccessor、cloudsql.client)、`migrate-runner` (同 + migrator の secret)。**既定のサービスアカウントは使わない**
6. Cloud Run **Job** `migrate` を作り (`alembic upgrade head`、`migrate-runner`、Cloud SQL 接続、secret を環境変数に)、`gcloud run jobs execute migrate --wait`
7. Cloud Run **Service** `api` (`api-runner`、`--set-secrets`、`--add-cloudsql-instances`、認証は `--allow-unauthenticated` だが API 自体が JWT で守る)
8. Cloud Run Service `admin` (`--allow-unauthenticated`、環境変数 `API_URL` に api の URL)
9. PWA の CORS 許可リストに admin と GitHub Pages のオリジンを足して再デプロイ
10. スマホの PWA からログインし、回答が Cloud SQL に入ることを確認 (`gcloud sql connect` か Cloud Run Job で `psql`)
11. **メモ**: 使ったコマンドと設定値を `docs/deploy-manual.md` に全部残す

## できたか確認

- スマホから解いた回答が Cloud SQL の attempts にある
- Cloud SQL にパブリック IP が無い
- `gcloud run services describe api` の serviceAccount が `api-runner`

## ここでの学び

一度手で作ると、Terraform の各リソースが「何のためにあるか」が読める。逆に最初から Terraform を写経すると、壊れたときに何を見ればいいか分からない。
