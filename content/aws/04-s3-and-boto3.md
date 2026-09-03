---
id: aws-04
title: S3 と boto3
summary: バケットの設計、公開しない設定、署名付き URL、ライフサイクル、Django からのファイル保存 (django-storages)
minutes: 12
---
## S3 とは

オブジェクトストレージです。ファイルを「キー」(パスのような文字列) で保存し、HTTP で読み書きします。容量は無制限、耐久性は 11 ナイン。EC2 のディスクと違い、サーバーが消えてもデータは残ります。

アップロードされたファイル、帳票の PDF、バックアップ、静的サイト、ログの保管、すべての置き場になります。

## バケットを作るときの原則

| 設定 | 推奨 |
|---|---|
| パブリックアクセスブロック | **全部オン** (既定)。公開したいものは CloudFront 経由か署名付き URL |
| バージョニング | 本番は有効。誤削除・上書きから戻せる |
| 暗号化 | SSE-S3 (既定) で十分。厳しければ SSE-KMS |
| ライフサイクル | 古いものを IA / Glacier に移す、または削除 |
| リージョン | アプリと同じ |

バケット名は全世界で一意なので、`会社名-環境-用途` のように付けます。

## 「公開してしまう」事故を防ぐ

S3 のデータ漏洩はほぼ「公開設定にした」ことが原因です。

- パブリックアクセスブロックをアカウントレベルでもオン
- バケットポリシーで `Principal: "*"` を書かない
- 公開したいなら CloudFront + OAC (バケットは非公開のまま CloudFront だけが読める)
- 一時的に見せたいなら **署名付き URL** (期限付き)

## boto3

```python
import boto3

s3 = boto3.client("s3")                       # 認証は IAM ロール / 環境変数 / ~/.aws から自動

s3.upload_file("report.pdf", "my-bucket", "reports/2026/09/report.pdf")
s3.download_file("my-bucket", "reports/2026/09/report.pdf", "/tmp/report.pdf")
obj = s3.get_object(Bucket="my-bucket", Key="data.json")
body = obj["Body"].read()

s3.put_object(Bucket="my-bucket", Key="hello.txt", Body=b"hi", ContentType="text/plain")

for page in s3.get_paginator("list_objects_v2").paginate(Bucket="my-bucket", Prefix="reports/"):
    for o in page.get("Contents", []):
        print(o["Key"], o["Size"])

url = s3.generate_presigned_url("get_object", Params={"Bucket": "my-bucket", "Key": "reports/x.pdf"}, ExpiresIn=600)
```

- **認証情報をコードに書かない**。EC2 ならインスタンスのロール、ローカルなら `aws configure` か SSO
- 一覧は 1000 件で切れるのでページネータを使う
- 大きいファイルは `upload_file` がマルチパートを自動でやる

## 署名付き URL

「このキーを 10 分間だけ読める URL」を発行します。バケットは非公開のまま、ブラウザに直接ダウンロードさせられます。アップロードにも使え (`put_object` の署名付き URL)、大きなファイルをアプリサーバーを経由せずブラウザから直接 S3 に送れます。

## Django から使う (django-storages)

```python
# settings.py
STORAGES = {
    "default": {"BACKEND": "storages.backends.s3.S3Storage",
                "OPTIONS": {"bucket_name": "my-app-media", "default_acl": None, "querystring_auth": True}},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
```

`FileField` / `ImageField` の保存先が S3 になり、`instance.file.url` が署名付き URL になります。EC2 のディスクにファイルを置かないので、台を増やしても壊れません。静的ファイル (CSS / JS) は whitenoise でアプリから配る方が簡単です。

## ライフサイクルとストレージクラス

| クラス | 用途 |
|---|---|
| Standard | 普段使い |
| Standard-IA | 月 1 回未満のアクセス。取り出しに課金 |
| Glacier Instant / Flexible / Deep Archive | 保管。Deep Archive は取り出しに 12 時間、最安 |

「90 日で IA、365 日で Glacier、7 年で削除」のようなルールをバケットに付けます。ログや古い帳票の保管費が桁で下がります。

## IAM ポリシーの例 (アプリ用)

```json
{ "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::my-app-media/*" },
{ "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::my-app-media" }
```

オブジェクト操作は `bucket/*`、一覧はバケットそのもの、と Resource が違うのが覚えどころです。

## まとめ

- 非公開が既定。公開は CloudFront か署名付き URL
- boto3 は認証情報を書かない。ロールに任せる
- Django のアップロードは django-storages で S3 へ
- バージョニングとライフサイクルで、事故と費用を抑える

## やってみる

**ゴール:** バケットを作り、boto3 で書いて署名付き URL で読む。

1. `aws s3 mb s3://<自分の名前>-s3-demo-$(date +%s) --region ap-northeast-1` (名前を控える)
2. `uv add boto3` → `python3`:
   ```python
   import boto3; s3 = boto3.client("s3"); B = "<bucket>"
   s3.put_object(Bucket=B, Key="hello.txt", Body=b"hi", ContentType="text/plain")
   print([o["Key"] for o in s3.list_objects_v2(Bucket=B)["Contents"]])
   print(s3.generate_presigned_url("get_object", Params={"Bucket": B, "Key": "hello.txt"}, ExpiresIn=120))
   ```
3. 署名付き URL を curl で開く。2 分後にもう一度開いて失敗する
4. `https://<bucket>.s3.ap-northeast-1.amazonaws.com/hello.txt` を直接開いて 403 になる (非公開)
5. `aws s3 rm s3://<bucket> --recursive && aws s3 rb s3://<bucket>`

**確認:** 非公開のまま、期限付き URL でだけ読めた。
