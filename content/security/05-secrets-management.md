---
id: sec-05
title: 秘密情報の管理
summary: API キー・DB パスワード・署名鍵をどこに置き、どう配り、漏れたらどうするか。.env から Secret Manager まで
minutes: 12
---
## 何が「秘密」か

DB パスワード、API キー (決済、チャット、LLM)、JWT の署名鍵、Django の `SECRET_KEY`、OAuth のクライアントシークレット、サービスアカウントの鍵ファイル、SSH の秘密鍵。**持っていれば何かができてしまうもの** すべてです。

## 原則

1. **コードと分ける**。リポジトリに入れない
2. **環境ごとに別の値**。開発の鍵で本番に入れない
3. **実行時に注入する**。イメージやビルド成果物に焼かない
4. **読める人を最小にする**。IAM で制御し、誰が読んだか記録する
5. **ローテーションできる形にする**。漏れたら即取り替えられる

## 段階別の置き場

| 段階 | 置き場 | 備考 |
|---|---|---|
| ローカル開発 | `.env` (gitignore) | 雛形は `.env.example` |
| CI (GitHub Actions) | Secrets / Environments | ログでマスクされる。クラウド認証は OIDC で鍵を持たない |
| 本番 (GCP) | Secret Manager → Cloud Run に注入 | バージョン管理とアクセス監査が付く |
| 本番 (AWS) | Secrets Manager / SSM Parameter Store | 同上 |

### .env

```bash
# .env (コミットしない)
DATABASE_URL=postgres://app:s3cret@localhost/app
STRIPE_API_KEY=sk_test_...

# .env.example (コミットする)
DATABASE_URL=
STRIPE_API_KEY=
```

`.gitignore` に `.env` を **最初のコミットの前に** 入れます。

### Secret Manager (GCP)

```bash
echo -n "s3cret" | gcloud secrets create db-password --data-file=-
gcloud secrets add-iam-policy-binding db-password \
  --member="serviceAccount:app@my-project.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
gcloud run deploy api --set-secrets="DATABASE_PASSWORD=db-password:latest"
```

アプリからは普通の環境変数として見えます。誰がいつ読んだかは監査ログに残り、値を更新すれば新バージョンになります。Terraform でも `google_secret_manager_secret` で同じことができます。

## やってはいけない置き場

- **Dockerfile の `ENV` / `COPY .env`**: イメージを pull できる人全員に見える
- **フロントエンドのコード**: `NEXT_PUBLIC_` や JS バンドルに入れたものは公開情報
- **ログ**: リクエストヘッダー丸ごと、`print(settings)`、例外に含まれる環境変数
- **チャットやチケット**: 検索可能な形で残り続ける
- **URL のクエリ**: アクセスログ、ブラウザ履歴、Referer に残る

## 漏れたとき

1. **即座に無効化・再発行** (ローテーション)。履歴削除より先
2. 影響範囲を確認。そのキーで何ができたか、不審な利用は無いか (監査ログ)
3. Git 履歴から削除 (`git filter-repo`)。ただし既に取得されている前提
4. 再発防止: pre-commit の secret 検出 (gitleaks など)、GitHub の secret scanning

「push した瞬間に漏れた」と考えます。公開リポジトリのキーは数分でボットに拾われます。

## ローテーションしやすい設計

- キーを読む場所を 1 か所 (settings) にまとめる
- 新旧 2 つのキーを同時に受け付ける期間を作れるようにする (署名鍵の検証は複数鍵に対応)
- 有効期限のある認証情報 (OIDC、一時クレデンシャル) を優先し、**そもそも長期の鍵を作らない**

## まとめ

- 秘密はコードと分け、実行時に注入し、読める人を絞る
- ローカルは .env、CI は Secrets、本番は Secret Manager
- イメージ・フロント・ログ・チャットには置かない
- 漏れたら履歴削除より先にローテーション。長期の鍵は作らない

## やってみる

**ゴール:** 秘密がどこに漏れるかを実際に見て、検出ツールを入れる。

1. 新しい git リポジトリで `.env` に `API_KEY=sk_live_dummy123` を書き、`git add -A && git commit -m x`。`git log -p | grep sk_live` で履歴に残るのを見る
2. `.gitignore` に `.env` を足しても履歴からは消えないことを `git log -p` で確認
3. `pip install gitleaks` は無いので `docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect -s /repo` で検出される
4. `.env.example` を作り、値を空にしてコミットする

**確認:** コミットした時点で漏れている、と実感した。検出ツールの出力を読んだ。
