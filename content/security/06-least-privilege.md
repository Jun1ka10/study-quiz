---
id: sec-06
title: 最小権限
summary: IAM ロール、サービスアカウント、DB ユーザー、コンテナの実行ユーザー。「必要なものだけ」を各層で徹底する
minutes: 10
questions:
  - id: sec-l06-1
    difficulty: 1
    question: "最小権限の原則とは?"
    choices:
      - "管理者は 1 人にする"
      - "人・プログラムには、その仕事に必要な権限だけを与え、それ以上は与えない"
      - "権限は全部拒否する"
      - "パスワードを短くする"
    answer: 1
    explanation: "侵害されたときの被害範囲 (blast radius) を小さくするため。便利だから Owner / Admin、を避ける。"
  - id: sec-l06-2
    difficulty: 2
    question: "Cloud Run のサービスに既定のサービスアカウント (Editor 相当) を使い続けると何が問題か?"
    choices:
      - "問題ない"
      - "アプリが乗っ取られると、プロジェクト内のほぼ全リソースを操作できてしまう"
      - "遅くなる"
      - "課金が増える"
    answer: 1
    explanation: "サービスごとに専用のサービスアカウントを作り、必要なロール (secretAccessor、cloudsql.client など) だけ付ける。"
  - id: sec-l06-3
    difficulty: 2
    question: "アプリの DB 接続ユーザーに与える権限として適切なのは?"
    choices:
      - "スーパーユーザー"
      - "テーブル所有者"
      - "必要なテーブルへの SELECT / INSERT / UPDATE / DELETE だけ。DDL (CREATE / DROP) は migration 用の別ユーザー"
      - "全 DB への全権限"
    answer: 2
    explanation: "SQL インジェクションを食らっても DROP TABLE できない。RLS も所有者でなければ効く。"
  - id: sec-l06-4
    difficulty: 2
    question: "IAM で権限を人ではなくグループに付ける理由は?"
    choices:
      - "速いから"
      - "入退社や異動でメンバーを出し入れするだけで済み、個別付与の消し忘れ (権限の堆積) を防げる"
      - "グループの方が権限が強い"
      - "理由は無い"
    answer: 1
    explanation: "「開発者」「運用」「閲覧のみ」のようなグループに役割を付ける。個人に直接付けた権限は棚卸しで見落とされる。"
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
