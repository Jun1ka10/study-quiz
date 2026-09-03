---
id: dk-04
title: イメージを小さく安全にする
summary: サイズを削る手順、非 root、読み取り専用、脆弱性スキャン、ベースイメージの選び方と更新、.dockerignore
minutes: 10
---
## なぜ小さくするか

- pull と起動が速い (Cloud Run のコールドスタート、Auto Scaling の追加台)
- 入っているものが少ない = 脆弱性が少ない = スキャンの High が減る
- 保存費とビルド時間

## サイズを削る手順

1. **ベースを slim / alpine に**: `python:3.13` (1GB 近い) → `python:3.13-slim` (150MB 程度)。alpine は更に小さいが、musl libc で一部のホイールが無く自前ビルドになる。Python は slim が無難、Node は alpine でよい
2. **マルチステージ**: ビルドに要るもの (コンパイラ、dev 依存) を最終イメージに持ち込まない
3. **レイヤーを増やさない**: `RUN apt-get update && apt-get install -y --no-install-recommends x && rm -rf /var/lib/apt/lists/*` を 1 命令で
4. **`.dockerignore`**: `.git`、`.venv`、`node_modules`、`tests`、`*.md`、`.env`
5. **dev 依存を入れない**: `uv sync --frozen --no-dev`、`npm ci --omit=dev`
6. **キャッシュを残さない**: `PIP_NO_CACHE_DIR=1`、`uv` は `--no-cache`

```bash
docker images                          # サイズ
docker history myapp:v1                # どのレイヤーが大きいか
dive myapp:v1                          # レイヤーごとの中身 (別途インストール)
```

## 非 root で動かす

コンテナのプロセスが root だと、脆弱性を突かれたときにホストへの影響が大きくなります。

```dockerfile
RUN addgroup --system app && adduser --system --ingroup app app
COPY --chown=app:app . /app
USER app
```

- ファイルの所有者も合わせる (`--chown`)
- 1024 未満のポートは非 root で bind できない → 8080 など
- Cloud Run / k8s は「非 root を強制」の設定ができる

## 読み取り専用と書き込み先

- ルートファイルシステムを読み取り専用にし (`docker run --read-only`、k8s の `readOnlyRootFilesystem`)、書くのは `/tmp` だけ (tmpfs)
- アプリが実行時にファイルを書かない設計 (ログは stdout、アップロードはオブジェクトストレージ) にしておくと、これが可能

## 脆弱性スキャン

```bash
trivy image myapp:v1                   # OS パッケージ + 言語の依存
```

- Artifact Registry / ECR の自動スキャンも有効化
- High / Critical が出たら: ベースイメージを最新に (大半はこれで消える) → 依存を更新 → 該当パッケージを使っていなければ削除
- **定期的に再ビルド** (週 1 の CI ジョブ)。コードが変わらなくてもベースの修正が入る

## ベースイメージの選び方と固定

- 公式イメージ (`python`、`node`、`postgres`) を使う。誰かの `latest-fixed-python` は使わない
- タグは **メジャー.マイナー** で固定 (`python:3.13-slim`)。`latest` は今日と明日で違う
- さらに厳密にするならダイジェスト固定 (`python:3.13-slim@sha256:...`) + Dependabot で更新 PR
- distroless (Google) や chainguard のイメージはシェルすら無く最小。デバッグしにくいので、慣れてから

## 秘密を入れない

- `ENV API_KEY=...` や `COPY .env` は `docker history` で見える
- ビルド時だけ要る秘密 (プライベートレジストリのトークン) は `RUN --mount=type=secret` で、レイヤーに残さない

## ヘルスと停止

- `CMD ["python", "-m", "app"]` の **exec 形式** (JSON 配列)。シェル形式だと PID 1 が sh になり SIGTERM が届かず、停止に 10 秒かかる
- Python は `PYTHONUNBUFFERED=1` でログが即出る
- `HEALTHCHECK` 命令は compose では効くが Cloud Run / k8s は独自の probe を使う

## チェックリスト

- [ ] slim / alpine ベース、タグ固定
- [ ] マルチステージ、dev 依存なし、.dockerignore
- [ ] 非 root、ポート 8080
- [ ] 秘密を焼かない
- [ ] exec 形式の CMD、PYTHONUNBUFFERED
- [ ] スキャンが CI にある、週次で再ビルド

## まとめ

- 小さい = 速い + 安全。slim、マルチステージ、.dockerignore、dev 依存なし
- 非 root、読み取り専用、秘密を焼かない
- スキャンと定期再ビルド。ベースはタグ固定
- CMD は exec 形式

## やってみる

**ゴール:** 同じアプリで「雑なイメージ」と「整えたイメージ」を作り、サイズ・脆弱性・ユーザーを比べる。

1. dk-02 の FastAPI アプリで Dockerfile A: `FROM python:3.13`、`COPY . .`、`RUN pip install -r requirements.txt`、`CMD uvicorn main:app --host 0.0.0.0` (シェル形式)
2. Dockerfile B: `python:3.13-slim`、依存を先に COPY、`PIP_NO_CACHE_DIR=1`、非 root ユーザー、`.dockerignore`、`CMD ["uvicorn", ...]`
3. `docker images` でサイズを比べ、`docker history` で A の最大レイヤーを見る
4. `docker run --rm A id` と `B id` で uid を比べる
5. `docker run -d A` を `docker stop` して止まるまでの秒数を測り、B と比べる (シェル形式は約 10 秒)
6. `trivy image A` と `B` で High の数を比べる (trivy が無ければ Artifact Registry に push してスキャン結果を見る)

**確認:** サイズが数分の一、非 root、停止が即時、High が減った。
