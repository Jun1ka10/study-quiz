---
id: dk-05
title: コンテナのデバッグ (logs / exec / inspect)
summary: 起動しない・すぐ落ちる・繋がらない・遅い、を切り分ける手順。ローカルと Cloud Run での見方
minutes: 10
---
## 症状別の入口

| 症状 | 最初に見る |
|---|---|
| 起動しない / すぐ落ちる | `docker logs <c>`、終了コード (`docker inspect -f '{{.State.ExitCode}}'`) |
| 動いているが応答しない | ポート (`-p`、`--host 0.0.0.0`)、`docker exec` で中から curl |
| 他のコンテナに繋がらない | 同じネットワークか、ホスト名 (サービス名)、`localhost` の誤用 |
| 遅い / メモリで落ちる | `docker stats`、OOMKilled、`resources` |
| ビルドが失敗する | `--progress=plain` で該当 RUN の出力、キャッシュを疑うなら `--no-cache` |
| 手元では動くのに本番で落ちない | 環境変数、ボリューム、ユーザー、アーキテクチャ (arm / amd64) |

## ログ

```bash
docker logs -f --tail 100 web           # 追いかける
docker compose logs -f api              # compose
docker logs web 2>&1 | grep -i error
```

- アプリは **stdout / stderr** に出す。ファイルに書くと `logs` に出ず、コンテナと一緒に消える
- Python は `PYTHONUNBUFFERED=1`。無いとバッファされて「落ちたのにログが無い」になる
- 何も出ないなら CMD が間違っている (即終了) か、起動前に落ちている (`docker inspect` の State)

## 中に入る

```bash
docker exec -it web sh                   # (bash が無いイメージは sh)
docker exec web env                      # 環境変数
docker exec web ls -la /app              # ファイルは COPY されているか
docker exec web curl -s localhost:8080/healthz    # 中からは繋がるか
docker exec -u root web sh               # 非 root イメージで root が要るとき
```

止まったコンテナには exec できません。`docker run -it --entrypoint sh image` で CMD を上書きして入り、手で起動してエラーを見ます。

## inspect と stats

```bash
docker inspect web | jq '.[0].State'            # ExitCode, OOMKilled, Error
docker inspect web | jq '.[0].NetworkSettings.Ports'
docker inspect web | jq '.[0].Config.Env'
docker stats                                     # CPU / メモリのリアルタイム
docker events --since 10m                        # 何が起きたか (die, oom, restart)
```

- `ExitCode 137` = SIGKILL、多くは OOM。`OOMKilled: true` を確認してメモリ上限を上げるかアプリを直す
- `ExitCode 139` = セグフォ (ネイティブ拡張の不一致など)
- `ExitCode 1` = アプリの例外。logs を見る

## ネットワーク

- コンテナの中の `localhost` はそのコンテナ自身。ホストの DB には `host.docker.internal`、別コンテナには **サービス名**
- アプリは `0.0.0.0` で待ち受ける。`127.0.0.1` だと外 (ホストの `-p`) から届かない
- `docker network ls` / `docker network inspect <net>` で同じネットワークにいるか
- `docker run --rm --network <net> nicolaka/netshoot` でネットワーク調査用のコンテナを立てて `dig` / `curl` / `nc`

## ビルドのデバッグ

```bash
docker build --progress=plain --no-cache -t x . 2>&1 | tee build.log
docker build --target build -t x-build .          # マルチステージの途中まで
docker run -it x-build sh                          # その段階の中身を見る
```

- `COPY` が「not found」→ `.dockerignore` で除外されている、パスがビルドコンテキスト外
- `pip install` が遅い / 落ちる → ネットワーク、`--no-install-recommends`、ホイールが無い (alpine)
- arm の Mac で作って amd64 の本番で動かない → `--platform linux/amd64` でビルド

## Cloud Run での見方

- ログ: Cloud Logging で `resource.type="cloud_run_revision"`。起動失敗は「コンテナが PORT でリッスンしなかった」がほぼ全て (ポート違い、起動前の例外)
- 中に入る: 本番コンテナには基本入れない (入れない設計が正しい)。同じイメージをローカルで `docker run` して再現する
- メモリ: リビジョンのメトリクスで使用率、「Memory limit exceeded」のログ
- 環境変数と Secret: リビジョンの詳細画面。`--set-env-vars` の typo は多い

## 再現の型

1. 本番と同じイメージ (ダイジェスト) を pull
2. 本番と同じ環境変数を `.env` に (秘密はダミー)
3. `docker run --env-file .env -p 8080:8080 image` で手元で再現
4. 直して、同じコマンドで確認して、push

## まとめ

- logs → inspect (ExitCode / OOM) → exec で中から確認、の順
- stdout に出す、`0.0.0.0` で待つ、`localhost` はコンテナ自身
- 137 は OOM、139 はセグフォ、1 はアプリ例外
- 本番には入らず、同じイメージを手元で再現する

## やってみる

**ゴール:** わざと壊した 4 パターンを切り分ける。

1. dk-02 の FastAPI イメージで:
   - a. `CMD ["uvicorn", "main:app", "--host", "127.0.0.1"]` にして `docker run -p 8000:8000` → ホストから繋がらない。`docker exec` で中から `curl localhost:8000` は通ることを確認し、原因を言う
   - b. `main.py` の先頭で `raise RuntimeError("boom")` → `docker logs` と `docker inspect` の ExitCode
   - c. `docker run -m 32m` でメモリを絞り、起動時に `bytearray(100_000_000)` を確保 → `OOMKilled: true` と ExitCode 137
   - d. `.dockerignore` に `main.py` を書いてビルド → `COPY` は通るが起動で ModuleNotFoundError。`docker run --entrypoint sh` で中を見て原因を特定
2. それぞれで「最初に打つコマンド」を 1 行ずつメモにする

**確認:** 4 つの症状を、logs / inspect / exec のどれで見抜けるかを言える。
