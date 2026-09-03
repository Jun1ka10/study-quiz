---
id: dk-03
title: "docker compose で開発環境を作る"
summary: "複数コンテナ (DB・API・フロント) を 1 ファイルで定義し、起動順・ヘルスチェック・ボリューム・環境変数を扱う"
minutes: 12
exercise: |
  **ゴール:** PostgreSQL + API (FastAPI) を compose で立て、起動順をヘルスチェックで制御する。

  1. be-06 の FastAPI に `Dockerfile` (dk-02 の形) を用意し、`compose.yaml`:
     ```yaml
     services:
       db:
         image: postgres:16
         environment: { POSTGRES_PASSWORD: dev }
         volumes: [pgdata:/var/lib/postgresql/data]
         healthcheck: { test: ["CMD-SHELL", "pg_isready -U postgres"], interval: 2s, retries: 20 }
       api:
         build: .
         ports: ["8000:8000"]
         environment: { DATABASE_URL: "postgresql+psycopg://postgres:dev@db/postgres" }
         depends_on: { db: { condition: service_healthy } }
         volumes: [.:/app]
         command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
     volumes: { pgdata: {} }
     ```
  2. `docker compose up --build` → `curl localhost:8000/docs`。`main.py` を編集して自動リロードされるのを見る
  3. `docker compose exec db psql -U postgres -c '\l'`、`docker compose logs -f api`
  4. `docker compose down` → `up` でデータが残る、`down -v` で消える、を確認

  **確認:** API が DB の準備完了を待ってから起動した。バインドマウントでホットリロードが効いた。
questions:
  - id: dk-l03-1
    difficulty: 1
    question: "compose で `api` が `db` のホスト名で PostgreSQL に繋げる理由は?"
    choices:
      - "IP を固定しているから"
      - "同じ compose ネットワーク内ではサービス名が DNS 名になるから"
      - "localhost だから"
      - "繋げない"
    answer: 1
    explanation: "`postgresql://...@db/...` のように書く。localhost はコンテナ自身を指すので DB には届かない。"
  - id: dk-l03-2
    difficulty: 2
    question: "`depends_on: [db]` だけでは API 起動時に DB 接続エラーになることがある。なぜ? 対処は?"
    choices:
      - "バグ"
      - "depends_on は「コンテナの起動順」だけで、DB が接続を受け付ける状態かは見ない。healthcheck + `condition: service_healthy` で待つ"
      - "sleep 10 を入れる"
      - "DB を先に手で起動する"
    answer: 1
    explanation: "PostgreSQL はプロセス起動から数秒後に受け付けを始める。ヘルスチェックで「準備完了」を定義して待たせる。"
  - id: dk-l03-3
    difficulty: 1
    question: "`docker compose down` と `down -v` の違いは?"
    choices: ["同じ", "-v は名前付きボリュームも消す (DB のデータが消える)", "-v は詳細表示", "-v はイメージも消す"]
    answer: 1
    explanation: "作り直したいときは -v。普段は付けない。"
  - id: dk-l03-4
    difficulty: 2
    question: "開発時に `volumes: [.:/app]` でソースをマウントする目的は?"
    choices:
      - "イメージを小さくする"
      - "ホストで編集したファイルが即コンテナに反映され、ビルドし直さずに動作確認できる (ホットリロード)"
      - "本番と同じにする"
      - "セキュリティ"
    answer: 1
    explanation: "本番イメージでは COPY で固める。開発だけマウントで上書きする、という使い分け。"
---
## compose とは

複数のコンテナと、その間のネットワーク・ボリューム・環境変数を **1 つの YAML** で定義し、`docker compose up` で全部立ち上げる道具です。「README の手順 10 個」が 1 コマンドになります。

## 基本形

```yaml
# compose.yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data          # 名前付きボリューム (データを残す)
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      retries: 20

  api:
    build: ./api                                 # Dockerfile から作る
    ports:
      - "8000:8000"                              # ホスト:コンテナ
    environment:
      DATABASE_URL: postgresql+psycopg://postgres:dev@db/app    # ホスト名は "db"
    env_file: .env                               # 秘密は .env (コミットしない)
    depends_on:
      db:
        condition: service_healthy               # DB が受け付け可能になるまで待つ
    volumes:
      - ./api:/app                               # 開発: ソースをマウントしてホットリロード

volumes:
  pgdata: {}
```

## サービス名 = ホスト名

同じ compose 内では、`db` `api` のようなサービス名が **DNS 名** になります。API から DB へは `db:5432`。`localhost` はコンテナ自身なので届きません。

ホストのブラウザからは `ports` で公開した `localhost:8000` で届きます。

## 起動順とヘルスチェック

`depends_on` だけでは「コンテナが起動した」順しか保証されず、PostgreSQL が接続を受け付ける前に API が繋ぎに行って落ちます。**healthcheck で「準備完了」を定義し、`condition: service_healthy` で待つ** のが正解です。

1 回だけ走らせたいもの (migration) は `condition: service_completed_successfully` で「終わってから」を表現します。

```yaml
  migrate:
    build: ./api
    command: ["alembic", "upgrade", "head"]
    depends_on: { db: { condition: service_healthy } }
  api:
    depends_on: { migrate: { condition: service_completed_successfully } }
```

## よく使うコマンド

```bash
docker compose up --build          # ビルドして起動 (前面)
docker compose up -d               # バックグラウンド
docker compose ps                  # 状態
docker compose logs -f api         # ログを追う
docker compose exec api bash       # 中に入る
docker compose exec db psql -U postgres
docker compose run --rm api pytest # 使い捨てコンテナでコマンド
docker compose down                # 停止・削除 (ボリュームは残る)
docker compose down -v             # ボリュームも消す (DB 初期化)
```

## 開発と本番の差

| | 開発 (compose) | 本番 (Cloud Run など) |
|---|---|---|
| ソース | バインドマウント + ホットリロード | イメージに COPY |
| 秘密 | `.env` | Secret Manager |
| DB | コンテナ | マネージド (Cloud SQL) |
| 起動順 | healthcheck | migration Job を先に実行 |

本番用 Dockerfile はそのまま、開発だけ `volumes` と `command` で上書きします。`compose.override.yaml` に開発用の差分を分けると本番用の定義を汚しません。

## まとめ

- 複数コンテナを 1 ファイルで。サービス名が DNS 名
- `depends_on` は順序だけ。healthcheck + `service_healthy` で待つ
- migration は `service_completed_successfully`
- 開発はマウントでホットリロード、`down -v` で初期化
