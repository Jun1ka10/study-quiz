---
id: sec-05
title: 秘密情報の管理
summary: API キー・DB パスワード・署名鍵をどこに置き、どう配り、漏れたらどうするか。.env から Secret Manager まで
minutes: 12
questions:
  - id: sec-l05-1
    difficulty: 1
    question: "API キーを誤って Git にコミットして push してしまった。最初にすべきことは?"
    choices:
      - "コミットを消して force push する"
      - "そのキーを無効化 (ローテーション) する。履歴の削除はその後"
      - "リポジトリを private にする"
      - "何もしない"
    answer: 1
    explanation: "push した時点で漏れたとみなす。GitHub には秘密情報を探索するボットが常時いる。履歴を消しても既に取得されている前提で動く。"
  - id: sec-l05-2
    difficulty: 1
    question: "`.env` ファイルの正しい扱いは?"
    choices:
      - "Git にコミットして共有する"
      - ".gitignore に入れ、雛形は `.env.example` (値なし) として共有する"
      - "Slack に貼って共有する"
      - "コードに直書きした方が安全"
    answer: 1
    explanation: ".env は各環境のローカルにだけ置く。何のキーが要るかは値を空にした .env.example で伝える。"
  - id: sec-l05-3
    difficulty: 2
    question: "Cloud Run で DB パスワードをアプリに渡す推奨の方法は?"
    choices:
      - "Dockerfile の ENV に書く"
      - "イメージ内のファイルに置く"
      - "Secret Manager に保存し、Cloud Run の環境変数 / ボリュームとして参照させる (実行時に注入)"
      - "ソースコードに書く"
    answer: 2
    explanation: "イメージに焼くと、イメージを pull できる人全員に漏れる。実行時注入なら、誰が読めるかを IAM で制御でき、ローテーションもイメージ再ビルド無しでできる。"
  - id: sec-l05-4
    difficulty: 2
    question: "ログに秘密情報が出ないようにする対策として不適切なものは?"
    choices:
      - "リクエストヘッダーを丸ごとログに出さない (Authorization / Cookie を除外)"
      - "例外のスタックトレースに含まれる環境変数をマスクする"
      - "デバッグのために一時的に print(settings) する"
      - "秘密を持つオブジェクトの `__repr__` で値を出さない"
    answer: 2
    explanation: "「一時的」なデバッグ出力はログ基盤に残り、検索可能になる。ログは秘密が入らない前提で設計する。"
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
