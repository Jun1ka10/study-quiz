---
id: gcp-08
title: Cloud Storage
summary: バケットの設計、公開しない設定、署名付き URL、ライフサイクル、Cloud Run からの読み書き、静的サイトの配信
minutes: 10
---
## Cloud Storage とは

GCP のオブジェクトストレージで、AWS の S3 に相当します。ファイルを「オブジェクト」としてバケットに置き、HTTP で読み書きします。用途も S3 と同じ: アップロードファイル、帳票、バックアップ、静的サイト、ログの保管。

## バケットを作るときの原則

| 設定 | 推奨 |
|---|---|
| ロケーション | アプリと同じリージョン (asia-northeast1)。可用性重視ならマルチリージョン |
| ストレージクラス | Standard。アクセスが減るものはライフサイクルで Nearline / Coldline / Archive へ |
| 公開アクセス防止 | **有効** (組織ポリシーでも強制できる) |
| 均一なバケットレベルアクセス | **有効** (ACL を使わず IAM だけで制御) |
| バージョニング | 本番は有効。誤削除から戻せる |
| 保持ポリシー / Object Lock | 監査ログや法定保存に |

名前は全世界で一意。`プロジェクト-環境-用途`。

## アクセス制御は IAM で

```bash
gcloud storage buckets add-iam-policy-binding gs://my-app-media \
  --member=serviceAccount:api@PROJECT.iam.gserviceaccount.com --role=roles/storage.objectUser
```

| ロール | できること |
|---|---|
| `storage.objectViewer` | 読む |
| `storage.objectCreator` | 書く (上書き不可) |
| `storage.objectUser` | 読み書き削除 |
| `storage.objectAdmin` | 上記 + メタデータ |

`allUsers` に objectViewer を付けると公開バケットになります。公開したいものは Cloud CDN / ロードバランサ経由か署名付き URL にします。

## Python から使う

```python
from google.cloud import storage

client = storage.Client()                        # 認証は ADC (Cloud Run の SA、ローカルは gcloud auth application-default login)
bucket = client.bucket("my-app-media")

blob = bucket.blob("reports/2026/09/r.pdf")
blob.upload_from_filename("/tmp/r.pdf", content_type="application/pdf")
blob.download_to_filename("/tmp/r2.pdf")
data = bucket.blob("data.json").download_as_bytes()

for b in client.list_blobs("my-app-media", prefix="reports/"):
    print(b.name, b.size)

url = blob.generate_signed_url(version="v4", expiration=timedelta(minutes=10), method="GET")
```

- 鍵ファイルを使わない。Cloud Run ならアタッチした SA、ローカルは ADC
- Cloud Run 上で `generate_signed_url` するには SA に `roles/iam.serviceAccountTokenCreator` を自分自身に付ける (鍵なしで署名するため)
- 大きなファイルは再開可能アップロード (ライブラリが自動)

Django なら `django-storages` の `GoogleCloudStorage` バックエンドで `FileField` の保存先にできます。

## 署名付き URL

「このオブジェクトを 10 分だけ読める / 書ける URL」。バケットは非公開のまま、ブラウザに直接ダウンロード・アップロードさせられます。アップロード用 (`method="PUT"`) を発行すれば、大きなファイルがアプリサーバーを経由しません。

## ライフサイクル

```json
{ "rule": [
  { "action": { "type": "SetStorageClass", "storageClass": "NEARLINE" }, "condition": { "age": 30 } },
  { "action": { "type": "Delete" }, "condition": { "age": 365 } },
  { "action": { "type": "Delete" }, "condition": { "numNewerVersions": 3 } }
]}
```

`gcloud storage buckets update gs://bucket --lifecycle-file=lifecycle.json`。古い帳票やログの保管費を桁で減らします。

## 静的サイトの配信

このアプリのような静的ファイルは Cloud Storage に置き、ロードバランサ + Cloud CDN で HTTPS 配信できます (バケット単独では HTTPS のカスタムドメインが使えない)。小規模なら GitHub Pages や Cloud Run で静的配信の方が手軽です。

## Terraform

```hcl
resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-media"
  location                    = "ASIA-NORTHEAST1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning { enabled = true }
  lifecycle_rule {
    condition { age = 365 }
    action { type = "Delete" }
  }
}
```

## まとめ

- 公開アクセス防止 + 均一なバケットレベルアクセス。IAM で SA に objectUser
- 鍵なし (ADC)。署名付き URL で期限付き配布・直接アップロード
- バージョニングとライフサイクル
- 静的配信は LB + CDN、小規模なら別の手段

## やってみる

**ゴール:** バケットを作り、Python で書いて署名付き URL で読む。

1. `gcloud storage buckets create gs://$(gcloud config get project)-gcs-demo --location=asia-northeast1 --uniform-bucket-level-access --public-access-prevention`
2. `uv add google-cloud-storage`、`gcloud auth application-default login`
3. Python で `hello.txt` をアップロードし、一覧し、`generate_signed_url` (10 分) を発行して curl で読む
4. `https://storage.googleapis.com/<bucket>/hello.txt` を直接開いて 403 (非公開) を確認
5. ライフサイクル (age 1 で削除) を JSON で当て、`gcloud storage buckets describe` で確認
6. `gcloud storage rm -r gs://<bucket>`

**確認:** 非公開のまま署名付き URL でだけ読めた。鍵ファイルを一切作っていない。
