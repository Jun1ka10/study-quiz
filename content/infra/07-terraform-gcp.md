---
id: infra-07
title: Terraform で GCP を組む (import と state の運用)
summary: リモート state、ファイル分割、既存リソースの import、plan の読み方、環境の分け方。本番を安全に変更する型
minutes: 14
---
## リモート state

```hcl
terraform {
  backend "gcs" {
    bucket = "my-project-tfstate"       # 先に手で作る。バージョニング有効
    prefix = "prod"
  }
}
```

- state バケットは Terraform の外で 1 回だけ作る (鶏と卵)
- バージョニングを有効にし、壊れたら前の版に戻せるようにする
- GCS バックエンドは自動でロックする。同時 apply は失敗する
- state には秘密が入り得る。バケットの閲覧権限は絞る

## ファイルの分け方

```
infra/
├── main.tf              # terraform / provider / backend
├── variables.tf
├── outputs.tf
├── apis.tf              # google_project_service
├── network.tf           # VPC, private services access
├── iam.tf               # service_account, iam_member
├── secrets.tf
├── artifact_registry.tf
├── cloud_sql.tf
├── cloud_run_api.tf
├── cloud_run_admin.tf
├── cloud_run_jobs.tf
├── scheduler.tf
├── monitoring.tf
├── wif.tf               # Workload Identity Federation
└── envs/
    ├── dev.tfvars
    └── prod.tfvars
```

Terraform はディレクトリ内の `.tf` を全部読むので、分け方は人間の都合です。**リソースの種類ごと** に分けると探しやすい。

## 既存リソースを取り込む (import)

手で作ったものを管理下に入れる手順です。

1. `resource` ブロックを書く (属性は分かる範囲で)
2. `import` ブロックで対応付ける
   ```hcl
   import {
     to = google_cloud_run_v2_service.api
     id = "projects/my-project/locations/asia-northeast1/services/api"
   }
   ```
3. `terraform plan` → 「1 to import」と、属性の差分
4. 差分を resource に反映 (実物に合わせる) → plan が差分ゼロになるまで繰り返す
5. `terraform apply` で state に入る。import ブロックは消してよい

id の形式はリソースごとに違い、プロバイダのドキュメントの末尾 "Import" に書いてあります。

## plan の読み方

```
  + create
  ~ update in-place
  -/+ destroy and then create replacement     ← 止まる
  - destroy                                   ← 止まる
```

`# forces replacement` と付いた属性が作り直しの原因です。名前、リージョン、一部の設定は変更不可。

守り:

- `lifecycle { prevent_destroy = true }` で destroy を Terraform が拒否
- Cloud SQL の `deletion_protection = true` (API 側の保護)
- CI では `plan` を PR に貼り、人が読んでから main で apply

## 環境の分け方

| 方法 | 特徴 |
|---|---|
| ディレクトリ (`envs/dev`, `envs/prod`) + 共通モジュール | 明示的。state も別。おすすめ |
| workspace | 同じコードで state を切り替え。間違えて prod に apply しやすい |
| 変数だけ | state が 1 つなので dev の事故が prod に及ぶ。避ける |

GCP では **プロジェクトごと分ける** (dev / prod) と、IAM も課金も分離できて安全です。

## モジュール

同じ形 (Cloud Run サービス + SA + IAM) を何度も書くなら `modules/cloud_run_service/` にまとめて呼び出します。最初は必要ありません。3 回目に同じものを書いたときに切り出します。

## よくある詰まり

- **API が有効でない**: `google_project_service` を先に。`depends_on` で順序
- **権限が足りない**: Terraform を実行する SA に必要なロール。エラーメッセージに permission 名が出る
- **state のドリフト**: 手でコンソールから変えると plan に差分が出る。Terraform に戻すか、手の変更を取り込む。**手で変えない** ルールを守る
- **秘密の値**: `sensitive = true` を付けても state には平文で入る。Secret Manager の値は Terraform に書かない

## 日々の型

```bash
terraform fmt -recursive
terraform validate
terraform plan -var-file=envs/prod.tfvars -out=tfplan
# plan を読む。replace / destroy が無いか
terraform apply tfplan
```

`-out` で保存した plan を apply すると、「読んだものと違うものが適用される」事故がありません。

## まとめ

- state は GCS + バージョニング。バケットは手で 1 回
- 既存は import → 差分ゼロまで合わせる
- replace / destroy で止まる。prevent_destroy と deletion_protection
- 環境はプロジェクトと state を分ける。plan は保存して apply

## やってみる

**ゴール:** 手で作ったリソースを import して plan を差分ゼロにする。

1. `gcloud storage buckets create gs://$(gcloud config get project)-tf-demo --location=asia-northeast1` を **手で** 作る (これが「既存リソース」)
2. `tfgcp/main.tf`:
   ```hcl
   terraform { required_providers { google = { source = "hashicorp/google", version = "~> 6.0" } } }
   provider "google" { project = var.project_id  region = "asia-northeast1" }
   variable "project_id" { type = string }
   import {
     to = google_storage_bucket.demo
     id = "${var.project_id}-tf-demo"
   }
   resource "google_storage_bucket" "demo" {
     name     = "${var.project_id}-tf-demo"
     location = "ASIA-NORTHEAST1"
   }
   ```
3. `terraform init && terraform plan -var project_id=...` → `1 to import` と、属性の差分があれば表示される。差分が出たら resource の属性を実物に合わせる (例: `uniform_bucket_level_access = true`)
4. `terraform apply` → もう一度 `plan` で **No changes** になるまで合わせる
5. `terraform state list`、`terraform state show google_storage_bucket.demo`
6. `terraform destroy` で消す (import したものも管理下なので消える)

**確認:** import → 差分ゼロ → 管理下、の流れを 1 リソースで通した。
