---
id: gcp-04
title: Secret Manager と Artifact Registry
summary: 秘密の保管とアクセス制御、Cloud Run への注入。コンテナイメージの保管、タグ運用、脆弱性スキャン
minutes: 12
---
## Secret Manager

秘密情報の金庫です。値はバージョン管理され、誰が読めるかを IAM で制御し、読んだ記録が監査ログに残ります。

```bash
echo -n "value" | gcloud secrets create db-password --data-file=-     # 作成 (version 1)
echo -n "new" | gcloud secrets versions add db-password --data-file=-   # 更新 (version 2)
gcloud secrets versions access latest --secret=db-password              # 読む
gcloud secrets add-iam-policy-binding db-password \
  --member=serviceAccount:api-runner@PROJECT.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor                             # 読める人を足す
```

- **プロジェクト全体に secretAccessor を付けない**。秘密ごとに、必要なサービスアカウントだけ
- `echo -n` の `-n` を忘れると改行が入る (地味に多い事故)
- ローテーション: 新バージョンを追加 → アプリを再デプロイ → 古いバージョンを無効化

### Cloud Run への注入

```bash
gcloud run deploy api --set-secrets=DATABASE_PASSWORD=db-password:latest,JWT_SECRET=jwt-secret:3
```

環境変数として見えるので、アプリは普通に `os.environ` で読みます。ファイルとしてマウントすることもできます (証明書など)。

`latest` は **デプロイ時** に解決されます。値を変えても動いているリビジョンは古いまま。新リビジョンをデプロイして反映します。

### Terraform

値は Terraform に書かず、入れ物と IAM だけ管理します。

```hcl
resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-password"
  replication { auto {} }
}
resource "google_secret_manager_secret_iam_member" "api" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}
```

値は `gcloud secrets versions add` で手動 (または CI から) 投入します。state に平文が入りません。

## Artifact Registry

コンテナイメージ (と言語パッケージ) の保管庫です。Cloud Run はここからイメージを引きます。

```bash
gcloud artifacts repositories create app --repository-format=docker --location=asia-northeast1
gcloud auth configure-docker asia-northeast1-docker.pkg.dev
docker build -t asia-northeast1-docker.pkg.dev/PROJECT/app/api:abc1234 .
docker push asia-northeast1-docker.pkg.dev/PROJECT/app/api:abc1234
```

イメージ名は `リージョン-docker.pkg.dev/プロジェクト/リポジトリ/イメージ:タグ`。

### タグの運用

| 指定 | 性質 | 用途 |
|---|---|---|
| `:latest` | 動く。同じ名前で中身が変わる | 開発のみ |
| `:abc1234` (commit SHA) | 1 コミットに 1 つ | CI からの push |
| `@sha256:...` (ダイジェスト) | 中身のハッシュ。不変 | 本番のデプロイ指定、ロールバック |

CI では commit SHA でタグを付けて push し、デプロイはそのタグ (またはダイジェスト) で行います。「今本番で動いているのはどのコミットか」が常に答えられます。

### 掃除とスキャン

- クリーンアップポリシーで古いイメージを自動削除 (保存量課金)
- 脆弱性スキャンを有効にすると push 時に OS パッケージの CVE が出る。High 以上はベースイメージ更新 + 再ビルドで対処
- pull できる人も IAM (`artifactregistry.reader`)。Cloud Run のサービスアカウントに付ける

## まとめ

- 秘密は Secret Manager。秘密ごとに読める SA を絞り、`--set-secrets` で注入。値は Terraform に書かない
- イメージは Artifact Registry。タグは commit SHA、本番はダイジェスト
- スキャン結果はベースイメージ更新で対処。古いイメージは自動削除

## やってみる

**ゴール:** 秘密を Secret Manager に入れて Cloud Run から読む。イメージを Artifact Registry に push する。

1. `echo -n "s3cret-demo" | gcloud secrets create demo-secret --data-file=-`
2. `gcloud secrets versions access latest --secret=demo-secret` で読める。別のサービスアカウントで試すと読めない:
   `gcloud iam service-accounts create demo-sa` → `gcloud secrets add-iam-policy-binding demo-secret --member=serviceAccount:demo-sa@$(gcloud config get project).iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor`
3. `gcloud artifacts repositories create demo --repository-format=docker --location=asia-northeast1` → `gcloud auth configure-docker asia-northeast1-docker.pkg.dev`
4. dk-02 のイメージを `docker tag a asia-northeast1-docker.pkg.dev/$(gcloud config get project)/demo/app:v1 && docker push ...`
5. `gcloud run deploy demo --image ... --region asia-northeast1 --service-account demo-sa@... --set-secrets=SECRET=demo-secret:latest --allow-unauthenticated` (app.py は `os.environ["SECRET"]` の長さを返すように)
6. `gcloud secrets versions list demo-secret`、`gcloud artifacts docker images list ...`。終わったら service / secret / repository を削除

**確認:** 秘密がコンテナに環境変数として入り、IAM で読める人が制御されている。イメージにタグとダイジェストがある。
