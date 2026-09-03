---
id: infra-06
title: GitHub Actions
summary: workflow の構造、トリガー、secrets、CI (lint / test) と CD (デプロイ) の型
minutes: 12
questions:
  - id: infra-l06-1
    difficulty: 1
    question: "workflow ファイルを置く場所は?"
    choices: [".github/workflows/*.yml", "actions/*.yml", "ルートの workflow.yml", ".ci/"]
    answer: 0
    explanation: "リポジトリの `.github/workflows/` 以下の YAML が自動で認識される。1 ファイル 1 workflow。"
  - id: infra-l06-2
    difficulty: 1
    question: "`on: pull_request` と `on: push: branches: [main]` の使い分けは?"
    choices:
      - "同じ"
      - "pull_request は PR ごとの検証 (lint / test)、push to main はマージ後のデプロイ"
      - "push は使わない"
      - "pull_request はデプロイ用"
    answer: 1
    explanation: "CI は PR で回して壊れた変更を main に入れない。CD は main に入ってから動かす。"
  - id: infra-l06-3
    difficulty: 2
    question: "API キーを workflow で使いたい。正しい方法は?"
    choices:
      - "YAML に直書き"
      - "リポジトリの Settings → Secrets に登録し `${{ secrets.API_KEY }}` で参照"
      - "コミットした .env を読む"
      - "echo で表示して確認"
    answer: 1
    explanation: "secrets はログでマスクされる。直書きや .env のコミットは公開リポジトリでは即漏洩。"
  - id: infra-l06-4
    difficulty: 2
    question: "GitHub Actions から GCP / AWS に鍵ファイル無しで認証する仕組みは?"
    choices:
      - "できない"
      - "OIDC (Workload Identity Federation / IAM OIDC provider)。GitHub が発行する短命トークンをクラウド側が信頼する"
      - "パスワード認証"
      - "SSH"
    answer: 1
    explanation: "サービスアカウントの JSON 鍵やアクセスキーを secrets に置く方法は漏洩とローテーションの問題がある。OIDC なら鍵が存在しない。"
---
## workflow の構造

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - run: pip install -r requirements-dev.txt
      - run: ruff check .
      - run: pytest
```

| 要素 | 意味 |
|---|---|
| `on` | いつ動くか (トリガー) |
| `jobs` | 並列に走る単位。それぞれ新しい仮想マシン |
| `runs-on` | OS |
| `steps` | 順番に実行。`uses` は公開アクション、`run` はシェル |
| `with` | アクションへの入力 |

## トリガーの使い分け

```yaml
on:
  pull_request:                 # PR が開かれた / 更新された → CI
  push:
    branches: [main]            # main に入った → デプロイ
  schedule:
    - cron: "0 0 * * *"         # 毎日 0:00 UTC → 定期ジョブ
  workflow_dispatch:            # 手動実行ボタン
```

CI は PR で回し、壊れた変更を main に入れない。CD は main に入ってから、が基本の型です。

## secrets と環境変数

```yaml
env:
  REGION: asia-northeast1                   # 秘密でないもの
steps:
  - run: ./deploy.sh
    env:
      API_KEY: ${{ secrets.API_KEY }}       # Settings → Secrets に登録したもの
```

- secrets はログで `***` にマスクされる
- YAML への直書き、`.env` のコミットは公開リポジトリでは即漏洩
- 本番 / ステージングで値を分けるなら **Environments** に secrets を持たせ、`environment: production` で使う (承認ステップも付けられる)

## クラウドへの認証は OIDC

```yaml
permissions:
  contents: read
  id-token: write                            # OIDC トークンの発行を許可

steps:
  - uses: google-github-actions/auth@v2
    with:
      workload_identity_provider: projects/123/locations/global/workloadIdentityPools/github/providers/github
      service_account: deploy@my-project.iam.gserviceaccount.com
```

GitHub が「このリポジトリのこのブランチから実行中」という短命トークンを発行し、クラウド側 (GCP の Workload Identity Federation、AWS の IAM OIDC provider) がそれを信頼して一時クレデンシャルを返します。**鍵ファイルが存在しない** ので漏洩もローテーションもありません。

## デプロイ workflow の型

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with: { workload_identity_provider: ..., service_account: ... }
      - run: gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet
      - run: docker build -t $IMAGE . && docker push $IMAGE
      - run: gcloud run deploy api --image $IMAGE --region asia-northeast1
```

ビルド → レジストリへ push → デプロイ。Terraform を回すなら `terraform plan` を PR で、`apply` を main で、と分けます。

## 便利な機能

- **キャッシュ**: `actions/cache` や `setup-python` の `cache: pip` で依存取得を短縮
- **matrix**: 複数バージョンで同じ job を回す
- **concurrency**: 同じブランチの古い実行を自動キャンセル
- **`if:`**: `if: github.event_name == 'push'` のように step を条件付きに

## まとめ

- `.github/workflows/*.yml`。on / jobs / steps
- PR で CI、main で CD、schedule で定期
- 秘密は secrets。クラウド認証は OIDC で鍵を持たない
- ビルド → push → デプロイの 3 段が CD の型
