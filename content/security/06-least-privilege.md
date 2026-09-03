---
id: sec-06
title: 最小権限
summary: IAM ロール、サービスアカウント、DB ユーザー、コンテナの実行ユーザー。「必要なものだけ」を各層で徹底する
minutes: 10
---
## 考え方

どんな防御も破られる前提で、**破られたときに何ができてしまうか** を小さくするのが最小権限です。「面倒だから Owner」は、侵害された瞬間にプロジェクト全体を差し出すことになります。

各層で同じ原則を適用します。

## 1. 人 (IAM ユーザー)

- 基本ロール (Owner / Editor / AdministratorAccess) は日常アカウントに付けない
- 役割ごとの **グループ** に事前定義ロールを付け、人はグループに入れる
- 強い権限が要る作業は、一時的に昇格する仕組み (時間制限付き) を使う
- 全員に多要素認証。ルート / 組織管理者は封印

## 2. プログラム (サービスアカウント / IAM ロール)

サービスごとに専用のアイデンティティを作ります。

```hcl
resource "google_service_account" "api" {
  account_id = "api-runner"
}

# 必要なものだけ
resource "google_project_iam_member" "api_secret" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}
```

- 既定のサービスアカウント (Editor 相当) をそのまま使わない
- API サーバー、バッチ、migration ジョブでアカウントを分ける。migration だけが DDL 権限を持つ
- 鍵ファイルは作らない。アタッチと OIDC で認証する
- できればプロジェクト単位でなく **リソース単位** (この secret だけ、このバケットだけ) で付ける

## 3. DB ユーザー

| ユーザー | 権限 | 使う所 |
|---|---|---|
| owner / migration 用 | DDL (CREATE / ALTER / DROP) | Alembic / migrate、seed |
| app_user | 必要なテーブルの DML (SELECT / INSERT / UPDATE / DELETE) | リクエスト処理 |
| readonly | SELECT のみ | 分析、BI、調査 |

```sql
CREATE ROLE app_user LOGIN;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

アプリが SQL インジェクションを食らっても `DROP TABLE` はできず、RLS も効きます (所有者ではないので)。

## 4. ネットワーク

- DB はプライベート IP のみ。インターネットから届かない
- セキュリティグループ / ファイアウォールは「必要な送信元から必要なポートだけ」。`0.0.0.0/0` で 22 番を開けない
- 管理アクセスは VPN、IAP、SSM Session Manager 経由

## 5. コンテナ / OS

- コンテナは非 root ユーザーで動かす (`USER` 命令)
- 読み取り専用ファイルシステムにできるならする
- サーバーの sudo は必要な人だけ、コマンドを限定

## 6. アプリの内部

- 管理機能は管理者ロールにだけ。`is_staff` の判定を忘れない
- API キーにスコープを持たせる (読み取り専用キー、特定リソースだけのキー)
- 外部サービスのキーも最小スコープで発行する (投稿だけ、読み取りだけ)

## 棚卸し

権限は増える一方で、減ることは自然には起きません。

- 誰にどのロールが付いているかを定期的に一覧化する (Terraform 管理なら差分で見える)
- 使われていない権限を検出する道具 (IAM Recommender、Access Analyzer) を使う
- 退職・異動時のチェックリストにアカウントと鍵の失効を入れる

## まとめ

- 破られる前提で、被害範囲を小さくする
- 人はグループ経由で事前定義ロール。プログラムは専用アカウントに必要なものだけ
- DB は migration 用と app 用と readonly を分ける
- 権限は堆積する。定期的に棚卸しする

## やってみる

**ゴール:** DB ユーザーを分けて、app ユーザーでは DROP できないことを見る。

1. RLS の課題の PostgreSQL コンテナで postgres として:
   ```sql
   create role migrator login password 'm'; alter table orders owner to migrator;
   create role app2 login password 'a';
   grant select, insert, update, delete on orders to app2;
   ```
2. `psql -U app2` で `drop table orders;` → 権限エラー。`alter table orders add column x int;` → エラー
3. `psql -U migrator` で `alter table orders add column x int;` → 成功
4. 手元のクラウドの IAM を開き、自分のアカウントに付いているロールを一覧し、「Owner / Editor / Admin」があればメモする

**確認:** アプリ用の権限で DDL が通らない。自分の IAM に基本ロールがあるか確認した。
