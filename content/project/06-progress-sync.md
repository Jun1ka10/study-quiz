---
id: step-06
title: "回答を記録し、間隔反復をサーバー側で計算する"
summary: "POST /attempts で回答を積み、review_schedule を更新し、GET /review で今日の復習を返す。PWA のロジックを API に移す"
phase: "2. API"
prereqs: [be-06, be-09, de-01]
minutes: 90
---
## ゴール

いま PWA の `app.js` にある `record()` と `dueQuestions()` を、サーバー側の正として実装する。

- `POST /attempts` `{question_id, result: "correct" | "wrong" | "skipped"}` → attempts に 1 行、review_schedule を更新
- `GET /review` → `due_at <= now` の問題 id を期限順に最大 20 件
- `POST /lessons/{id}/result` `{rate}` → lesson_progress を更新 (8 割以上で passed_at)
- `GET /progress` → レッスン別の状態と、カテゴリ別の正答率

## 手順

1. 間隔反復のロジックを **純粋関数** として `srs.py` に切り出す: `next_schedule(streak, result, now) -> (new_streak, due_at)`。区間は `[1, 3, 7, 14, 30, 60]` 日。DB を知らない関数にしてテストを先に書く
2. `routers/attempts.py`: 1 トランザクションで attempts の INSERT と review_schedule の UPSERT (`INSERT ... ON CONFLICT DO UPDATE`) を行う。question_id が存在するかは `app.state.content` で確認し、無ければ 422
3. `GET /review` は `select(ReviewSchedule).where(user_id == me, due_at <= now).order_by(due_at).limit(20)`
4. `GET /progress` はカテゴリ別に `count(*) filter (where correct)` で集計する。SQL の集計関数を SQLAlchemy の `func` で書く
5. すべて `Depends(get_current_user)` で守り、**user_id は必ずトークンから取る** (リクエストボディに user_id を入れさせない)
6. テスト: 正解 3 回で due が 7 日後、その後 1 回不正解で 1 日後に戻る、他人の attempts が /progress に混ざらない

## できたか確認

- `/docs` で attempts を数回積むと `/review` の中身が期限どおりに変わる
- 別ユーザーで登録して `/progress` を見ると空
- `srs.py` のテストが DB 無しで走る

## ここでの学び

ロジック (srs) と永続化 (routers) を分けると、ロジックのテストが速く、仕様変更 (区間を変える) が 1 か所で済む。設計のレッスンの「疎結合」の実例。
