---
id: step-10
title: "Docker 化して compose で一発起動する"
summary: "API と管理画面の本番用 Dockerfile を書き、docker compose で PostgreSQL ごと立ち上げる"
phase: "4. 運用"
prereqs: [dk-02, dk-03]
minutes: 90
---
## ゴール

`docker compose up` だけで、PostgreSQL + migration + API + 管理画面が立ち上がる。イメージは本番にそのまま持っていける品質にする。

## 手順

1. API の `Dockerfile` (`python:3.13-slim`、依存を先に COPY、非 root、`CMD ["uvicorn", ...]`、`PYTHONUNBUFFERED=1`)。`.dockerignore` に `.venv` `.git` `tests` `.env`
2. 管理画面の `Dockerfile` はマルチステージ (`deps` → `build` → `runtime`、`output: "standalone"`)
3. `compose.yaml`:
   ```yaml
   services:
     db:
       image: postgres:16
       environment: { POSTGRES_PASSWORD: dev, POSTGRES_DB: study }
       volumes: [pgdata:/var/lib/postgresql/data]
       healthcheck: { test: ["CMD-SHELL", "pg_isready -U postgres"], interval: 2s, retries: 20 }
     migrate:
       build: ./api
       command: ["alembic", "upgrade", "head"]
       environment: { MIGRATION_DATABASE_URL: postgresql+psycopg://postgres:dev@db/study }
       depends_on: { db: { condition: service_healthy } }
     api:
       build: ./api
       environment: { DATABASE_URL: postgresql+psycopg://app_user:app@db/study, JWT_SECRET: dev-only }
       ports: ["8000:8000"]
       depends_on: { migrate: { condition: service_completed_successfully } }
     admin:
       build: ./admin
       ports: ["3000:8080"]
   volumes: { pgdata: {} }
   ```
4. `docker compose up --build` → `curl localhost:8000/healthz`、`open localhost:3000`
5. `docker compose down -v` で全部消し、もう一度 up して migration からやり直せることを確認
6. `docker images` で API イメージのサイズを見る。200MB を超えていたら原因を探す (`docker history`)

## できたか確認

- `docker compose up` 一発で全部動く
- `docker compose run --rm api id` で uid が root でない
- migration が API より先に完了する

## ここでの学び

migration を専用のコンテナ/ジョブにする形は、次の Cloud Run でもそのまま使う。「起動順」と「1 回だけ走るもの」を compose で表現しておくと本番の構成が見えてくる。
