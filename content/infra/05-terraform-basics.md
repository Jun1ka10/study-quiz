---
id: infra-05
title: Terraform の基本
summary: resource / variable / output、init → plan → apply、state の意味。IaC でクラウドを組む土台
minutes: 12
---
## IaC の考え方

クラウドの設定をコンソールで手作業すると、「誰が何をいつ変えたか」が残らず、同じ環境を再現できません。**Infrastructure as Code** は設定をコードに書き、Git で管理し、ツールで適用します。Terraform はその代表で、GCP も AWS も同じ書き方で扱えます。

## 最小の構成

```hcl
# main.tf
terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
  backend "gcs" {                       # state の置き場 (チーム用)
    bucket = "my-terraform-state"
    prefix = "prod"
  }
}

provider "google" {
  project = var.project_id
  region  = "asia-northeast1"
}

variable "project_id" { type = string }

resource "google_storage_bucket" "assets" {
  name     = "${var.project_id}-assets"
  location = "ASIA-NORTHEAST1"
}

output "bucket_url" {
  value = google_storage_bucket.assets.url
}
```

| ブロック | 役割 |
|---|---|
| `terraform` | バージョンと state の置き場 |
| `provider` | どのクラウドに、どの認証で |
| `variable` | 外から渡す値 |
| `resource` | 作るもの。`種類 "名前"` |
| `output` | 作った結果を表示 / 他から参照 |
| `data` | 既にあるものを参照 (作らない) |

## 作業の流れ

```bash
terraform init          # プロバイダを取得、backend を初期化。最初と設定変更時
terraform fmt           # 整形
terraform validate      # 文法チェック
terraform plan          # 差分を表示 (まだ何もしない)
terraform apply         # 差分を適用 (確認プロンプトあり)
terraform destroy       # 全部消す (本番では基本使わない)
```

**plan を読まずに apply しない** のが唯一にして最大のルールです。

```
  + create        新規作成
  ~ update in-place   その場で更新
  -/+ replace     削除して作り直し ← 要注意
  - destroy       削除 ← 要注意
```

## state

Terraform は「自分が作ったリソースの現状」を **state** (`terraform.tfstate`) に記録し、設定ファイルとの差分で plan を作ります。

- state を失うと、既存リソースを知らない扱いになり作り直そうとする
- チームでは **リモートバックエンド** (GCS / S3) に置き、同時実行をロックする
- state には秘密情報 (DB パスワードなど) が平文で入ることがある。公開しない

手で作ったリソースを管理下に入れるには `terraform import` を使います。

## リソース同士の参照

```hcl
resource "google_service_account" "app" {
  account_id = "app-runner"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "api"
  location = "asia-northeast1"
  template {
    service_account = google_service_account.app.email     # ← 参照。依存関係も自動で解決
    containers {
      image = var.image
    }
  }
}
```

`種類.名前.属性` で参照すると、作成順序も Terraform が決めます。

## 変数の渡し方

```bash
terraform apply -var="project_id=my-prod"
terraform apply -var-file="prod.tfvars"
TF_VAR_project_id=my-prod terraform apply
```

環境ごとに tfvars を分けるか、ディレクトリ (workspaces) を分けます。

## まとめ

- init → plan → apply。plan の replace / destroy を必ず見る
- state が現状の記録。リモートに置き、失わない、公開しない
- 環境差は variable。リソース間は `種類.名前.属性` で参照

## やってみる

**ゴール:** Terraform を init → plan → apply → destroy まで回す (ローカルファイルなので課金なし)。

1. `mkdir tfdemo && cd tfdemo`、`main.tf`:
   ```hcl
   terraform { required_providers { local = { source = "hashicorp/local" } } }
   variable "name" { type = string, default = "hello" }
   resource "local_file" "f" { filename = "${path.module}/${var.name}.txt", content = "hi" }
   output "path" { value = local_file.f.filename }
   ```
2. `terraform init && terraform plan && terraform apply` → `cat hello.txt`、`cat terraform.tfstate | head -30`
3. `terraform apply -var name=world` → plan に `-/+ replace` が出る理由を読む
4. `terraform destroy`

**確認:** state にリソースが記録されている。名前変更が replace になる。
