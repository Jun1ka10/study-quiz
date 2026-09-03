---
id: gcp-06
title: Workload Identity Federation
summary: GitHub Actions から鍵ファイル無しで GCP に認証する。プール・プロバイダ・属性条件・サービスアカウントの借用
minutes: 12
---
## 問題: CI にクラウドの鍵を置きたくない

GitHub Actions から `gcloud run deploy` するには GCP の認証が要ります。サービスアカウントの JSON 鍵を secrets に置く方法は

- 鍵は長期有効で、漏れたら気づくまで使われる
- ローテーションを人が回す必要がある
- 誰が使ったか区別しにくい

## 解決: 短命トークンの交換

GitHub は workflow 実行ごとに「このリポジトリのこのブランチで実行中」という **OIDC トークン** (数分で失効) を発行できます。GCP 側でそれを信頼し、サービスアカウントの一時クレデンシャルと交換するのが Workload Identity Federation です。

```
GitHub Actions ──OIDC トークン──▶ GCP STS ──検証──▶ SA の一時トークン (1 時間) ──▶ gcloud / Terraform
```

秘密はどこにもありません。

## 構成要素

| 要素 | 役割 |
|---|---|
| Workload Identity **Pool** | 外部 ID を受け入れる入れ物 |
| **Provider** | 誰を信頼するか。issuer (GitHub) と属性のマッピング・条件 |
| **属性条件** | `assertion.repository == "owner/repo"` のように絞る。**必須** |
| サービスアカウント | 実際の権限を持つ主体 |
| `roles/iam.workloadIdentityUser` | 「このプールの principal は、この SA を借用してよい」 |

### 属性条件を書かないと

issuer は `token.actions.githubusercontent.com` で GitHub 全体に共通です。条件が無いと **世界中の誰の workflow でも** この SA を借りられます。リポジトリで絞り、本番はさらに `assertion.ref == "refs/heads/main"` で main ブランチだけにします。

## Terraform

```hcl
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == \"${var.github_repo}\""
}

resource "google_service_account" "deploy" { account_id = "deploy" }

resource "google_service_account_iam_member" "deploy_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# deploy SA の権限 (必要なものだけ)
resource "google_project_iam_member" "deploy_run" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}
resource "google_service_account_iam_member" "deploy_acts_as_api" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"           # api-runner を「使って」デプロイするため
  member             = "serviceAccount:${google_service_account.deploy.email}"
}
```

## workflow 側

```yaml
permissions:
  contents: read
  id-token: write                    # OIDC トークン発行の許可

steps:
  - uses: actions/checkout@v4
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: projects/123456/locations/global/workloadIdentityPools/github/providers/github
      service_account: deploy@my-project.iam.gserviceaccount.com
  - uses: google-github-actions/setup-gcloud@v2
  - run: gcloud run deploy api --image ... --region asia-northeast1
```

`workload_identity_provider` はプロジェクト **番号** (ID ではない) を含みます。

## 同じ考え方の適用先

- AWS: IAM の OIDC identity provider + `aws-actions/configure-aws-credentials` の `role-to-assume`
- Cloud Run 上のアプリ → 他の GCP サービス: アタッチした SA (鍵なし)
- GCP → AWS、AWS → GCP のクロスクラウドも WIF で鍵なしにできる

## 確認と監査

- `gcloud iam service-accounts keys list --iam-account=deploy@...` が **空** であること
- 監査ログに「どのリポジトリの workflow が借用したか」が `principalSet` として残る

## まとめ

- 長期の鍵を作らない。短命トークンを交換する
- Pool + Provider + 属性条件 (リポジトリ / ブランチ) + workloadIdentityUser
- 属性条件は必須。無いと全世界に開く
- workflow は `id-token: write` と `auth@v2`

## やってみる

**ゴール:** 自分のリポジトリの Actions から、鍵無しで `gcloud` が動く状態を作る。

1. 変数を決める: `PROJECT`、`REPO=owner/name`
2. ```bash
   gcloud iam workload-identity-pools create github --location=global
   gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --attribute-condition="assertion.repository == '$REPO'"
   gcloud iam service-accounts create deploy
   PN=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
   gcloud iam service-accounts add-iam-policy-binding deploy@$PROJECT.iam.gserviceaccount.com \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
   ```
3. workflow:
   ```yaml
   permissions: { contents: read, id-token: write }
   steps:
     - uses: google-github-actions/auth@v2
       with:
         workload_identity_provider: projects/<PN>/locations/global/workloadIdentityPools/github/providers/github
         service_account: deploy@<PROJECT>.iam.gserviceaccount.com
     - run: gcloud auth list && gcloud projects describe <PROJECT> --format='value(name)'
   ```
4. 別のリポジトリから同じ workflow を実行して **失敗する** ことを確認 (属性条件が効いている)

**確認:** Actions のログに deploy@ が active と出た。鍵ファイルは一切作っていない。
