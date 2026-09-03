---
id: gcp-02
title: Cloud Run でアプリを動かす
summary: コンテナを渡すだけで HTTPS 公開・自動スケールする。サーバーレスの基本形
minutes: 10
questions:
  - id: gcp-l02-1
    difficulty: 1
    question: "Cloud Run にデプロイするために必要なものは?"
    choices: ["VM のイメージ", "HTTP を待ち受けるコンテナイメージ", "Kubernetes マニフェスト", "Java の WAR ファイル"]
    answer: 1
    explanation: "コンテナが $PORT で HTTP を待ち受けていればよい。言語は問わない。"
  - id: gcp-l02-2
    difficulty: 2
    question: "Cloud Run でリクエストが無いとき、既定ではどうなる?"
    choices:
      - "インスタンスは 1 つ動き続ける"
      - "インスタンスは 0 までスケールインし、課金も止まる"
      - "エラーになる"
      - "自動で削除される"
    answer: 1
    explanation: "既定は min-instances=0 でゼロスケール。初回リクエストにコールドスタートの遅延が乗るので、気になるなら min-instances を設定する。"
  - id: gcp-l02-3
    difficulty: 2
    question: "Cloud Run のコンテナ内にファイルを書き込んで保存した。次のリクエストで読める?"
    choices:
      - "常に読める"
      - "同じインスタンスに当たれば読めるが保証されない。永続化は Cloud Storage や DB に"
      - "読めるが遅い"
      - "書き込み自体ができない"
    answer: 1
    explanation: "インスタンスは増減・破棄される。ローカルディスクは一時的 (しかもメモリ上)。状態は外部に持つ。"
  - id: gcp-l02-4
    difficulty: 2
    question: "Cloud Run サービスを社内からだけ呼べるようにしたい。最も簡単なのは?"
    choices:
      - "--allow-unauthenticated を付ける"
      - "認証を必須にし、呼び出し側に roles/run.invoker を付与する"
      - "URL を秘密にする"
      - "ポート番号を変える"
    answer: 1
    explanation: "未認証を許可しなければ IAM で保護される。呼び出す側 (人・サービスアカウント) に run.invoker を付け、ID トークンを付けて呼ぶ。"
---
## Cloud Run とは

コンテナイメージを渡すと、HTTPS の URL を発行してリクエストに応じて **0 台から自動スケール** してくれるサービスです。VM も Kubernetes も管理しません。

条件は 1 つ。コンテナが環境変数 `PORT` (既定 8080) で HTTP を待ち受けること。

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

## デプロイ

```bash
# ソースから直接 (Cloud Build がイメージを作る)
gcloud run deploy my-app --source . --region asia-northeast1

# イメージを指定
gcloud run deploy my-app --image asia-northeast1-docker.pkg.dev/PROJECT/repo/my-app:v1
```

デプロイごとに **リビジョン** が作られ、トラフィックを何 % ずつ振るかを制御できます (カナリアリリース、即ロールバック)。

## スケーリングと課金

- リクエストが無ければ **0 台** になり、課金も止まる (min-instances=0)
- 初回リクエストは起動待ち (コールドスタート) が乗る。避けたいなら `--min-instances 1`
- 1 インスタンスが同時に何リクエスト捌くかは `--concurrency` (既定 80)
- 課金は CPU / メモリの使用時間 + リクエスト数

## 状態を持たない

インスタンスはいつ増減・破棄されるか分かりません。

- ローカルファイルに書いても次のリクエストで残っている保証は無い
- セッションや一時ファイルは Cloud Storage / Firestore / Cloud SQL / Memorystore に置く

## 認証

`--allow-unauthenticated` を付けると誰でも呼べる公開 API になります。付けなければ IAM で守られ、呼び出し側に `roles/run.invoker` が必要です。サービス間の呼び出しは、呼ぶ側のサービスアカウントに invoker を付け、ID トークンを Authorization ヘッダーに載せます。

## 使いどころ

- Web API、バックエンド、Webhook 受け口
- バッチは Cloud Run **Jobs** (HTTP を待たず実行して終了する)
- 常時接続や長時間処理 (60 分超) には向かない

## まとめ

- コンテナ + `$PORT` で HTTP。それだけでデプロイできる
- 0 台までスケールイン。コールドスタートが気になれば min-instances
- 状態は外に持つ
- 公開するか IAM で守るかは `--allow-unauthenticated` の有無
