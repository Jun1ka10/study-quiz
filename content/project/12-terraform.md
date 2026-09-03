---
id: step-12
title: "手で作った本番を Terraform に写す"
summary: "前ステップの構成をコードにし、import で取り込み、plan が差分なしになるまで合わせる"
phase: "4. 運用"
prereqs: [infra-05, infra-07, sec-06]
minutes: 150
---
## ゴール

`infra/` ディレクトリに Terraform を書き、`terraform plan` が **No changes** になる状態にする。以後、本番の変更はすべて Terraform 経由。

## 手順

1. state 用の GCS バケットを作り (これだけは手で)、`backend "gcs"` を設定
2. ファイル分割: `apis.tf` (project_service)、`artifact_registry.tf`、`cloud_sql.tf`、`secrets.tf`、`iam.tf` (service_account と project_iam_member)、`cloud_run_api.tf`、`cloud_run_admin.tf`、`cloud_run_migrate_job.tf`、`variables.tf`、`outputs.tf`
3. 秘密の **値** は Terraform に書かない。`google_secret_manager_secret` (入れ物) だけ管理し、値は `gcloud secrets versions add` で入れる。state に平文が入らない
4. 既存リソースを `terraform import` で取り込む (`import` ブロックを使うと plan で確認できる)。1 リソースずつ `plan` して差分を潰す
5. `plan` で `-/+ replace` が出たら止まる。Cloud SQL の replace は DB が消える
6. 差分ゼロになったら、`variables.tf` の値を `prod.tfvars` に切り出す
7. `docs/deploy-manual.md` の内容が Terraform で全部表現できているか突き合わせ、できたら手順書は「state バケット作成」だけに縮める

## できたか確認

- `terraform plan` が `No changes`
- `terraform state list` に Cloud SQL、Cloud Run ×3、SA ×2、secret ×3 がある
- state ファイルに秘密の値が入っていない (`terraform state pull | grep -i secret` で値が無い)

## ここでの学び

import は地味だが、「コードと現実が一致している」ことを plan で証明できるのが IaC の価値。差分ゼロを一度作ると、以後の変更が怖くなくなる。
