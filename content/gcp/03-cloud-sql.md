---
id: gcp-03
title: Cloud SQL と Private IP
summary: マネージド PostgreSQL の作り方、Private IP で VPC 内からだけ繋ぐ、Cloud Run からの接続、バックアップと PITR
minutes: 12
---
## Cloud SQL とは

マネージドの PostgreSQL / MySQL です。VM に自分で入れる場合と比べて

- 自動バックアップ、パッチ適用、監視、高可用性構成 (別ゾーンのスタンバイ) が設定だけで付く
- 代わりにインスタンスが動いている間ずっと課金 (最小の `db-f1-micro` でも月数千円)

「DB を自分で運用しない」ための選択です。開発用は compose の PostgreSQL、本番だけ Cloud SQL、が一般的です。

## 作るときに決めること

| 項目 | 推奨 |
|---|---|
| バージョン | PostgreSQL 16 |
| リージョン | アプリと同じ (asia-northeast1) |
| ティア | 最初は小さく。後で変えられる |
| IP | **Private IP のみ** (パブリック IP を付けない) |
| 高可用性 | 本番は有効 (料金 2 倍)。開発は無効 |
| 自動バックアップ + PITR | 本番は必ず |
| SSL | 必須にする |
| 削除保護 | 本番は有効 |

## Private IP で繋ぐ

パブリック IP を付けないと、インターネットからは到達できません。VPC 内のリソースからだけ繋げます。

```
Cloud Run ──(VPC egress)──▶ VPC ──(private services access)──▶ Cloud SQL (10.x.x.x)
```

準備するもの:

1. **Private services access**: VPC と Google のマネージドサービス網をピアリングする (IP 範囲を予約して接続。プロジェクトで 1 回)
2. **Cloud Run の VPC 接続**: Direct VPC egress (`--network` `--subnet`) か Serverless VPC Access コネクタ
3. サービスアカウントに `roles/cloudsql.client`

接続文字列は普通の `postgresql://user:pass@10.x.x.x:5432/db`。パスワードは Secret Manager から環境変数へ。

## Cloud SQL Auth Proxy

ローカルの PC から Private IP の DB に繋ぎたいときは、IAM 認証でトンネルを張る **Auth Proxy** を使います。

```bash
cloud-sql-proxy --private-ip PROJECT:REGION:INSTANCE --port 5433
psql -h 127.0.0.1 -p 5433 -U app_user study
```

(Private IP へは VPC 内の踏み台か VPN が要る。パブリック IP + Auth Proxy なら PC から直接繋げるが、その分入口が増える。)

## ユーザーとロール

`postgres` は管理用。アプリ用には最小権限のロールを別に作ります (セキュリティのレッスン)。

```sql
create role app_user login password '...';
grant connect on database study to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
```

migration は owner (`postgres` か専用の `migrator`) で、リクエスト処理は `app_user` で。RLS はこの分離があって初めて効きます。

## バックアップと復元

- **自動バックアップ**: 毎日。保持 7 日 (設定で延長)
- **PITR**: トランザクションログを保持し、任意の時点に復元できる。「誤って DELETE した 3 分前」に戻せる
- 復元は **別インスタンスとして** 行い、確認してから切り替えるか必要なデータだけ移す
- 一度は実際に復元を試す。試していないバックアップは無いのと同じ

## 監視で見るもの

CPU、メモリ、ストレージ使用率 (自動拡張を有効に)、接続数 (上限に近づいたらプールを見直す)、レプリケーション遅延 (HA / リードレプリカ時)。

## Terraform

```hcl
resource "google_sql_database_instance" "main" {
  name             = "study-pg"
  database_version = "POSTGRES_16"
  region           = "asia-northeast1"
  deletion_protection = true
  settings {
    tier = "db-f1-micro"
    ip_configuration {
      ipv4_enabled    = false                       # パブリック IP なし
      private_network = google_compute_network.vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }
  }
  depends_on = [google_service_networking_connection.private]
}
```

## まとめ

- 運用を買う。課金は常時
- Private IP のみ + Cloud Run の VPC egress + cloudsql.client
- アプリ用ロールは別。migration は owner
- バックアップ + PITR は本番必須。一度は復元を試す

## やってみる

**ゴール:** Cloud SQL を最小構成で作り、Cloud Run から Private IP で繋ぐ (作ったら消す。数十円程度)。

1. `gcloud services enable sqladmin.googleapis.com servicenetworking.googleapis.com vpcaccess.googleapis.com`
2. Private サービスアクセスの準備 (初回のみ): `gcloud compute addresses create google-managed-services-default --global --purpose=VPC_PEERING --prefix-length=16 --network=default` → `gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com --ranges=google-managed-services-default --network=default`
3. `gcloud sql instances create demo-pg --database-version=POSTGRES_16 --tier=db-f1-micro --region=asia-northeast1 --network=default --no-assign-ip --edition=ENTERPRISE`
4. `gcloud sql users set-password postgres --instance=demo-pg --password=<強いもの>`、`gcloud sql databases create study --instance=demo-pg`
5. `gcloud sql instances describe demo-pg --format="value(ipAddresses)"` で Private IP しか無いことを確認
6. Cloud Run (gcp-02 の demo) を `--network=default --subnet=default --vpc-egress=private-ranges-only` で再デプロイし、環境変数 `DATABASE_URL` に Private IP を入れて `/healthz` で DB に `select 1` するように改造して確認
7. `gcloud sql instances delete demo-pg`

**確認:** パブリック IP が無い状態で Cloud Run から接続できた。
