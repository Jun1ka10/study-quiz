---
id: step-07
title: "Row Level Security で「自分の行しか見えない」を DB に強制する"
summary: "アプリの WHERE に頼らず、PostgreSQL のポリシーで他人の進捗が見えないことを保証する"
phase: "2. API"
prereqs: [sec-02, sec-06]
minutes: 60
---
## ゴール

attempts / lesson_progress / review_schedule に RLS を掛け、アプリ用の DB ロールで接続したときに `current_setting('app.user_id')` と一致する行しか見えない状態にする。

## 手順

1. Alembic のマイグレーションを手で書く (autogenerate はポリシーを扱わない)。`op.execute()` で:
   - `CREATE ROLE app_user LOGIN PASSWORD ...` (ローカル用。本番は Terraform で作る)
   - 3 テーブルに `GRANT SELECT, INSERT, UPDATE, DELETE`
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
   - `CREATE POLICY own_rows ON attempts USING (user_id = current_setting('app.user_id', true)::int) WITH CHECK (同じ)` を 3 テーブル分
   - `downgrade` でポリシーと GRANT を戻す
2. アプリの接続先を `app_user` に変える (`DATABASE_URL`)。migration は引き続き `postgres` (owner) で走らせる。**URL を 2 本持つ** (`DATABASE_URL` と `MIGRATION_DATABASE_URL`)
3. `get_db` を変更し、`get_current_user` の後に `SET LOCAL app.user_id = :uid` を実行してからセッションを渡す。依存の順序: `get_current_user` → `get_db_for_user`
4. `users` テーブルは認証前に読む必要があるので RLS の対象外にする (ログイン時はまだ誰か分からない)
5. テスト: ユーザー A の attempts を作り、ユーザー B のトークンで `/progress` → 空。さらに **アプリ側の WHERE をわざと消して** も B に A の行が見えないことを確認し、WHERE を戻す

## できたか確認

- `psql -U app_user` で `SELECT count(*) FROM attempts` が 0、`SET app.user_id = '1'` 後に A の件数
- WHERE を消したテストが通る (= RLS が効いている)
- `psql -U postgres` では全件見える (owner)

## ここでの学び

「アプリのバグでも漏れない」層を 1 つ足した。migration 用とアプリ用でロールを分ける理由が、ここで手触りとして分かる。
