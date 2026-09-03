---
id: gcp-02
title: Cloud Run でアプリを動かす
summary: コンテナを渡すだけで HTTPS 公開・自動スケールする。サーバーレスの基本形
minutes: 10
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

## やってみる

**ゴール:** Cloud Run にコンテナを 1 つデプロイし、0 台スケールと認証を見る (無料枠内)。

1. be-06 の FastAPI に `Dockerfile` (dk-02 の形、`--port 8080`) を用意
2. `gcloud run deploy demo --source . --region asia-northeast1 --allow-unauthenticated` → 出た URL に curl
3. `gcloud run services describe demo --region asia-northeast1 --format="value(spec.template.spec.containers[0].image)"` でイメージ名を見る
4. `gcloud run services update demo --region asia-northeast1 --no-allow-unauthenticated` → curl で 403。`curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" URL` で通る
5. 終わったら `gcloud run services delete demo --region asia-northeast1`

**確認:** 認証必須にすると ID トークンが要る。数分放置して初回アクセスが遅い (コールドスタート) のを体感。
