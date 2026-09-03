---
id: dk-02
title: Dockerfile を書く
summary: FROM / COPY / RUN / CMD の意味、キャッシュが効く順序、マルチステージビルド
minutes: 12
questions:
  - id: dk-l02-1
    difficulty: 1
    question: "`RUN` と `CMD` の違いは?"
    choices:
      - "RUN はビルド時に実行してレイヤーを作る。CMD はコンテナ起動時に実行するコマンド"
      - "同じ"
      - "CMD はビルド時、RUN は起動時"
      - "RUN は 1 回しか書けない"
    answer: 0
    explanation: "RUN は `pip install` など。CMD は `uvicorn main:app` などのメインプロセス。CMD は最後の 1 つだけ有効。"
  - id: dk-l02-2
    difficulty: 2
    question: "ビルドを速くするために、`COPY . .` より前に書くべきものは?"
    choices:
      - "何も無い。COPY は最初に書く"
      - "依存定義ファイル (requirements.txt / package.json) の COPY と install"
      - "CMD"
      - "EXPOSE"
    answer: 1
    explanation: "ソースを変えるたびに依存を入れ直さないように、依存ファイルだけ先に COPY して install する。ソース変更ではそのレイヤーのキャッシュが効く。"
  - id: dk-l02-3
    difficulty: 2
    question: "マルチステージビルドの主な目的は?"
    choices:
      - "複数のイメージを同時に作る"
      - "ビルド用ツールを最終イメージに含めず、小さく安全にする"
      - "ビルドを並列にして速くする"
      - "複数の OS に対応する"
    answer: 1
    explanation: "build ステージで npm ci / npm run build し、runtime ステージには成果物だけ COPY --from する。node_modules の開発依存やコンパイラが本番に入らない。"
  - id: dk-l02-4
    difficulty: 2
    question: "本番イメージで `USER` を非 root にする理由は?"
    choices:
      - "速くなる"
      - "コンテナから抜け出された場合の被害を小さくする"
      - "ログが見やすくなる"
      - "必須ではないので理由は無い"
    answer: 1
    explanation: "root で動くプロセスが乗っ取られるとホスト側への影響が大きくなる。専用ユーザーを作って USER で切り替える。"
---
## 最小の Dockerfile

```dockerfile
FROM python:3.13-slim            # ベースイメージ
WORKDIR /app                     # 以降のカレントディレクトリ
COPY requirements.txt .          # ホスト → イメージ
RUN pip install -r requirements.txt   # ビルド時に実行 (レイヤーになる)
COPY . .
ENV PORT=8080                    # 環境変数
EXPOSE 8080                      # ドキュメント的な宣言 (公開はしない)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]   # 起動時のコマンド
```

| 命令 | いつ実行 | 用途 |
|---|---|---|
| `FROM` | - | ベースイメージ |
| `RUN` | ビルド時 | パッケージのインストールなど。レイヤーを作る |
| `COPY` | ビルド時 | ファイルをイメージに入れる |
| `CMD` | 起動時 | メインプロセス。最後の 1 つだけ有効 |
| `ENV` | 両方 | 環境変数 |

## キャッシュが効く順番

`COPY . .` を最初に書くと、ソースを 1 文字変えただけで `pip install` からやり直しになります。**依存定義だけ先に COPY して install** し、ソースはその後に COPY します。agent-base の backend/Dockerfile もこの順です。

```dockerfile
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt
COPY backend /app/backend          # ← ここだけ毎回変わる
```

`.dockerignore` に `.git`、`node_modules`、`.venv`、`__pycache__` を書いて、不要なものを COPY しないようにします。

## マルチステージビルド

Next.js のように「ビルドには node_modules 全部が要るが、動かすには成果物だけでいい」場合に使います。agent-base の frontend/Dockerfile がこの形です。

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
ENV PORT=8080 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

- `AS 名前` でステージに名前を付け、`COPY --from=名前` で成果物だけ持ってくる
- 最終イメージにはコンパイラも開発依存も入らないので、小さく、攻撃面も小さい

## 本番イメージの作法

- **slim / alpine** のベースを使う (フルの `python:3.13` は 1GB 近い)
- **非 root ユーザー** で動かす (`USER`)
- `apt-get install` のあとに `rm -rf /var/lib/apt/lists/*` でキャッシュを消す
- `PYTHONUNBUFFERED=1` でログが即座に出るようにする (Python)
- `CMD` は JSON 配列形式 (`["uvicorn", ...]`) で書く。シェル形式だとシグナルが届かず、停止に時間がかかる

## まとめ

- RUN はビルド時、CMD は起動時
- 依存を先に、ソースを後に COPY
- ビルドと実行を分けるならマルチステージ
- slim ベース、非 root、JSON 形式の CMD
