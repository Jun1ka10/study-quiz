---
id: step-04
title: "PostgreSQL と SQLAlchemy で進捗を保存する"
summary: "users・attempts (回答ログ)・lesson_progress のテーブルを設計し、Alembic でマイグレーションを作る"
phase: "2. API"
prereqs: [be-07, be-08, be-09, dk-01]
minutes: 90
---
## ゴール

進捗をサーバーに保存する土台。ローカルでは Docker の PostgreSQL を使い、SQLAlchemy 2 のモデルと Alembic のマイグレーションを整える。

## テーブル設計

| テーブル | 列 | 意味 |
|---|---|---|
| `users` | id, email (unique), password_hash, created_at | 利用者 |
| `attempts` | id, user_id (FK), question_id, correct (bool), skipped (bool), answered_at | 回答 1 回 = 1 行。**更新しない、積むだけ** |
| `lesson_progress` | id, user_id (FK), lesson_id, best_rate, passed_at, practiced_at | レッスンごとの状態 |
| `review_schedule` | user_id + question_id (複合 PK), streak, due_at | 間隔反復の次回期限 |

`attempts` を「積むだけ」にするのは、後で集計 (正答率の推移、苦手分野) を出すときに元データがあるため。`review_schedule` は attempts から導けるが、毎回計算すると重いので持つ。

## 手順

1. `docker run -d --name sq-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=study -p 5432:5432 postgres:16`
2. `uv add sqlalchemy alembic psycopg[binary]`
3. `db.py` に `create_engine(os.environ["DATABASE_URL"])`、`SessionLocal`、`get_db` (yield) を書く。`DATABASE_URL` は `.env` に (`postgresql+psycopg://postgres:dev@localhost/study`)
4. `orm.py` に上の 4 テーブルを `Mapped` 記法で書く。外部キーには `index=True`。`attempts.answered_at` にもインデックス
5. `uv run alembic init alembic`、`env.py` で `Base.metadata` を指し、`alembic.ini` の URL は環境変数から読むように書き換える
6. `uv run alembic revision --autogenerate -m "initial"` → 生成ファイルを **読む** → `uv run alembic upgrade head`
7. `docker exec -it sq-pg psql -U postgres -d study -c "\d attempts"` でテーブルを確認
8. テストは SQLite ではなく **同じ PostgreSQL** で回す。`conftest.py` でテスト用 DB (`study_test`) を作り、テストごとにトランザクションを rollback する fixture を書く

## できたか確認

- `alembic upgrade head` が通り、4 テーブルがある
- `alembic downgrade base && alembic upgrade head` が往復できる
- `pytest` が PostgreSQL に接続して通る

## ここでの学び

イベント (attempts) と状態 (lesson_progress, review_schedule) を分けると、後から状態を再計算できる。テストは本番と同じ DB で。SQLite で通って PostgreSQL で落ちる差は珍しくない。
