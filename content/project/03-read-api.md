---
id: step-03
title: "FastAPI で読み取り API を出す"
summary: "カテゴリ・レッスン・問題を返す GET API を作り、/docs で叩けるようにする。まだ DB は無し"
phase: "2. API"
prereqs: [be-01, be-06]
minutes: 60
---
## ゴール

ステップ 2 のローダーの結果を JSON で返す API。`GET /categories`、`GET /lessons?category=python`、`GET /lessons/{id}`、`GET /questions?lesson=py-01`。起動時に一度読み込んでメモリに持つ。

## 手順

1. `uv add fastapi "uvicorn[standard]"`
2. `src/study_quiz_server/main.py` に `FastAPI()` を作り、`/healthz` を置く
3. `routers/content.py` に `APIRouter` で上記 4 本を書く。レスポンスは Pydantic モデルをそのまま返す (`response_model`)。問題の `answer` と `explanation` は **この API では返さない** (フロントに正解を渡すのは次のステップで別の形にする)。`QuestionPublic` モデルを作って `response_model` に指定する
4. 存在しない id は `HTTPException(404)`
5. 読み込みは `app.state.content` に起動時 (`lifespan`) で入れ、ルーターからは `request.app.state.content` で参照する。内容ディレクトリは環境変数 `CONTENT_DIR` で指定
6. `uv run uvicorn study_quiz_server.main:app --reload` → `http://localhost:8000/docs` で全部叩く
7. `fastapi.testclient.TestClient` でテストを書く: 一覧が返る、404、`answer` が含まれていない

## できたか確認

- `/docs` に 5 本のエンドポイントが並び、実行できる
- `curl localhost:8000/questions?lesson=py-01 | grep answer` が何も返さない
- テストが通る

## ここでの学び

`response_model` で「返す形」を固定すると、内部モデルに秘密の列があっても漏れない。API は「返してよいもの」を明示する場所。
