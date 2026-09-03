---
id: dk-02
title: Dockerfile を書く
summary: FROM / COPY / RUN / CMD の意味、キャッシュが効く順序、マルチステージビルド
minutes: 12
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

`COPY . .` を最初に書くと、ソースを 1 文字変えただけで `pip install` からやり直しになります。**依存定義だけ先に COPY して install** し、ソースはその後に COPY します。本番用の Dockerfile はこの順で書きます。

```dockerfile
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt
COPY backend /app/backend          # ← ここだけ毎回変わる
```

`.dockerignore` に `.git`、`node_modules`、`.venv`、`__pycache__` を書いて、不要なものを COPY しないようにします。

## マルチステージビルド

Next.js のように「ビルドには node_modules 全部が要るが、動かすには成果物だけでいい」場合に使います。Next.js の本番用 Dockerfile はこの形です。

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

## やってみる

**ゴール:** キャッシュ順の効果とマルチステージのサイズ差を見る。

1. `app.py` (`print("hi")`) と `requirements.txt` (`requests`) を作り、Dockerfile A:
   ```dockerfile
   FROM python:3.12-slim
   WORKDIR /app
   COPY . .
   RUN pip install -r requirements.txt
   CMD ["python", "app.py"]
   ```
2. `docker build -t a .` を 2 回。`app.py` を 1 文字変えて 3 回目 → pip install が再実行されるのを見る
3. `COPY requirements.txt .` → `RUN pip install` → `COPY . .` の順に直して同じ実験。install がキャッシュされる
4. `docker images` でサイズを見て、`FROM python:3.12` (slim 無し) に変えたときのサイズと比べる

**確認:** 順序だけでビルド時間が変わる。slim で数百 MB 減る。
