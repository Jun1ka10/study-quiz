---
id: py-10
title: "logging と構造化ログ"
summary: "print をやめて logging を使う。レベル、フォーマット、JSON 出力、リクエスト ID。運用で検索できるログにする"
minutes: 10
exercise: |
  **ゴール:** JSON の構造化ログを出し、フィールドで絞れる形にする。

  1. `log.py`:
     ```python
     import json, logging, sys, time
     class JsonFormatter(logging.Formatter):
         def format(self, r):
             d = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "severity": r.levelname, "logger": r.name, "message": r.getMessage()}
             d.update(getattr(r, "extra_fields", {}))
             if r.exc_info: d["exception"] = self.formatException(r.exc_info)
             return json.dumps(d, ensure_ascii=False)
     h = logging.StreamHandler(sys.stdout); h.setFormatter(JsonFormatter())
     logging.basicConfig(level=logging.INFO, handlers=[h])
     log = logging.getLogger("app")
     log.info("request done", extra={"extra_fields": {"request_id": "abc", "user_id": 42, "latency_ms": 12}})
     try: 1 / 0
     except ZeroDivisionError: log.exception("failed")
     log.debug("not shown")
     ```
  2. `python3 log.py | jq .` (jq が無ければそのまま) で 2 行の JSON を見る
  3. `level=logging.DEBUG` に変えて 3 行になるのを確認

  **確認:** 1 行 1 JSON、severity と request_id がフィールドとして出ている。exception にスタックトレースが入った。
questions:
  - id: py-l10-1
    difficulty: 1
    question: "print ではなく logging を使う主な理由は?"
    choices:
      - "速いから"
      - "レベル (DEBUG / INFO / WARNING / ERROR) で出し分けでき、出力先と形式を設定で変えられ、モジュール名や時刻が自動で付く"
      - "print は本番で禁止されている"
      - "違いは無い"
    answer: 1
    explanation: "本番では INFO 以上だけ、開発では DEBUG も、をコードを変えずに切り替えられる。"
  - id: py-l10-2
    difficulty: 2
    question: "例外を捕まえた場所でスタックトレース付きで記録するには?"
    choices: ["log.error(str(e))", "log.exception(\"failed\")  (except 節の中で)", "print(e)", "raise"]
    answer: 1
    explanation: "`log.exception` は ERROR レベルで `exc_info` を自動で付ける。`log.error(..., exc_info=True)` と同じ。"
  - id: py-l10-3
    difficulty: 2
    question: "構造化ログ (1 行 1 JSON) にする利点は?"
    choices:
      - "人間が読みやすい"
      - "ログ基盤 (Cloud Logging など) がフィールドとして解釈し、`user_id=42` のような条件で検索・集計できる"
      - "ファイルが小さくなる"
      - "利点は無い"
    answer: 1
    explanation: "文字列に埋め込むと正規表現で探すことになる。フィールドなら request_id で 1 リクエスト分を一発で絞れる。"
  - id: py-l10-4
    difficulty: 2
    question: "ログに入れてはいけないものは?"
    choices: ["リクエスト ID", "パス と ステータス", "Authorization ヘッダー、パスワード、トークン、個人情報の本文", "レイテンシ"]
    answer: 2
    explanation: "ログは長期保存され、多くの人が読める。秘密情報は入る前にマスクするか、そもそも出さない設計にする。"
---
## logging の基本

```python
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)         # モジュールごとに取る

log.debug("詳細。開発時だけ")
log.info("通常の出来事: request done, job started")
log.warning("おかしいが続行できる: retry, deprecated")
log.error("失敗した")
log.exception("失敗した (except の中で。スタックトレース付き)")
```

| レベル | 使いどころ |
|---|---|
| DEBUG | 変数の中身など。本番では出さない |
| INFO | 起きたことの記録。リクエスト完了、ジョブ開始 |
| WARNING | 異常だが継続。リトライした、設定が既定値 |
| ERROR | 処理が失敗した。誰かが見るべき |

`print` との違いは、**レベル・出力先・形式を設定で変えられる** こと。コードは `log.info(...)` のままで、本番は JSON で Cloud Logging へ、開発はターミナルに色付き、と切り替えられます。

## 何を書くか

良いログは「後から何が起きたか再現できる」ログです。

```python
log.info("attempt recorded", extra={"extra_fields": {
    "request_id": req_id, "user_id": user.id, "question_id": q.id, "result": "correct", "latency_ms": 12,
}})
```

- **リクエスト ID**: 1 リクエストのログを全部つなぐ鍵。ミドルウェアで発行し、レスポンスヘッダーにも返す
- **誰が・何を・結果・所要時間**
- 入れないもの: パスワード、トークン、`Authorization` / `Cookie` ヘッダー、本文の個人情報

## 構造化ログ

文字列ではなく **1 行 1 JSON** で出すと、ログ基盤がフィールドとして扱えます。

```json
{"ts": "2026-09-03T08:00:00Z", "severity": "INFO", "message": "attempt recorded", "request_id": "3f1a", "user_id": 42, "latency_ms": 12}
```

Cloud Logging なら `jsonPayload.user_id = 42 AND severity >= ERROR` で検索でき、`severity` は自動で認識されます。自前の Formatter で十分ですが、`python-json-logger` や `structlog` を使うと楽です。

## Web アプリでの形

```python
# FastAPI のミドルウェア
@app.middleware("http")
async def access_log(request, call_next):
    req_id = request.headers.get("x-request-id") or uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = req_id
    log.info("request", extra={"extra_fields": {
        "request_id": req_id, "method": request.method, "path": request.url.path,
        "status": response.status_code, "latency_ms": int((time.perf_counter() - start) * 1000),
    }})
    return response
```

ハンドラ内でも同じ `req_id` を使いたいので、`contextvars.ContextVar` に入れて Formatter が自動で付ける形にします。

## 運用での使い方

- 障害時: `request_id` で 1 リクエストを追う → `user_id` でその人の直前の行動を見る
- 傾向: `severity=ERROR` の件数をメトリクスにしてアラート (GCP のレッスン)
- ログは `stdout` に出す。ファイルに書かない。コンテナ基盤が集めてくれる

## まとめ

- `logging.getLogger(__name__)`、レベルで出し分け、例外は `log.exception`
- リクエスト ID と「誰が・何を・結果・時間」。秘密は入れない
- 1 行 1 JSON で stdout へ。検索できるログが運用を楽にする
