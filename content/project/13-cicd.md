---
id: step-13
title: "GitHub Actions で CI/CD を組む (OIDC、plan は PR、apply は main)"
summary: "push でテスト → イメージ build → migration → デプロイまで自動化する。鍵ファイルは作らない"
phase: "4. 運用"
prereqs: [infra-06, gcp-06, gcp-05]
minutes: 120
---
## ゴール

- PR: lint、pytest、`terraform plan` の結果を PR にコメント
- main への push: イメージを build & push → Cloud Run Job で migration → Cloud Run Service を新イメージに更新
- 認証は Workload Identity Federation (OIDC)。サービスアカウントの鍵は **存在しない**

## 手順

1. Terraform に WIF を足す: `google_iam_workload_identity_pool`、`..._provider` (issuer は `https://token.actions.githubusercontent.com`、属性条件で **このリポジトリだけ** に絞る)、`deploy` サービスアカウントと `roles/iam.workloadIdentityUser` の binding
2. `deploy` SA に必要なロール: Artifact Registry の writer、Cloud Run の admin、Cloud SQL client、`iam.serviceAccountUser` (api-runner を「使う」権限)
3. `.github/workflows/ci.yml` (PR): `uv sync` → `ruff` → `pytest` (PostgreSQL は `services:` で立てる) → `terraform fmt -check` → `terraform plan -no-color` → `actions/github-script` で PR コメント
4. `.github/workflows/deploy.yml` (main): `google-github-actions/auth@v2` (WIF) → `docker build` (タグは `github.sha`) → push → `gcloud run jobs update migrate --image ...` + `execute --wait` → `gcloud run services update api --image ...`。migration が失敗したらデプロイしない (job のステップが失敗すれば後続は走らない)
5. `concurrency` で同じブランチの古い実行をキャンセル、`environment: production` で本番デプロイに承認ステップを付ける (任意)
6. 意図的にテストを壊した PR を作り、赤くなってマージできないことを確認 (branch protection で required check にする)

## できたか確認

- README を直す PR を作る → CI 緑 → マージ → 数分後に Cloud Run のリビジョンが増える
- `gcloud iam service-accounts keys list --iam-account=deploy@...` が空
- 壊れたテストの PR がマージできない

## ここでの学び

「main に入ったものが本番」を機械が保証する。人が `gcloud run deploy` を叩かなくなった時点で、手順書は不要になり、監査ログは Actions の履歴になる。
