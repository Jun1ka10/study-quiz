---
id: be-01
title: Web アプリの仕組みと HTTP
summary: ブラウザからサーバー、DB まで 1 リクエストがどう流れるか。Django と FastAPI の位置づけ
minutes: 10
questions:
  - id: be-l01-1
    difficulty: 1
    question: "HTTP リクエストに含まれないものは?"
    choices: ["メソッド (GET / POST)", "パス (/api/items)", "ヘッダー", "データベースの接続情報"]
    answer: 3
    explanation: "リクエストはメソッド・パス・ヘッダー・(あれば) ボディ。DB はサーバーの内側の話でクライアントは知らない。"
  - id: be-l01-2
    difficulty: 1
    question: "「フォームを送信して保存する」処理に使う HTTP メソッドは?"
    choices: ["GET", "POST", "HEAD", "OPTIONS"]
    answer: 1
    explanation: "GET は取得で副作用なし (ブックマークや再読み込みで何度呼ばれてもよい)。状態を変える操作は POST / PUT / PATCH / DELETE。"
  - id: be-l01-3
    difficulty: 2
    question: "Django と FastAPI の違いとして最も適切なのは?"
    choices:
      - "Django は Python、FastAPI は JavaScript"
      - "Django は ORM・管理画面・認証まで同梱のフルスタック、FastAPI は API に特化した軽量フレームワーク"
      - "FastAPI は DB を使えない"
      - "Django は API を作れない"
    answer: 1
    explanation: "mokujitsu は Django (テンプレートで画面も出す)、agent-base は FastAPI (API のみ、画面は Next.js)。用途で選んでいる。"
  - id: be-l01-4
    difficulty: 2
    question: "ステータスコード 502 / 503 / 504 を見たとき、まず疑うべき場所は?"
    choices: ["ブラウザ", "DNS", "ロードバランサの後ろのアプリサーバー (落ちている / 過負荷 / 遅い)", "クライアントの送ったデータ"]
    answer: 2
    explanation: "5xx はサーバー側。502 は上流が応答しない、503 は過負荷やメンテ、504 は上流のタイムアウト。4xx ならクライアント側を疑う。"
---
## 1 リクエストの旅

```
ブラウザ ──HTTP──▶ ロードバランサ ──▶ アプリサーバー ──SQL──▶ DB
   ◀── HTML / JSON ◀──               (Django / FastAPI)    (PostgreSQL)
```

1. ブラウザが URL に対して **HTTP リクエスト** を送る
2. ロードバランサ (ALB / Cloud Run のフロント) が受けてアプリサーバーに渡す
3. アプリ (Django / FastAPI) がパスを見て処理を選び (**ルーティング**)、必要なら DB に問い合わせる
4. HTML (画面) か JSON (API) を **HTTP レスポンス** として返す

mokujitsu は 4 で HTML を返し、そのページ内の JS が追加で JSON API を呼びます。agent-base は API が JSON だけを返し、画面は Next.js が組み立てます。

## HTTP リクエスト

```
POST /api/items/ HTTP/1.1
Host: example.com
Content-Type: application/json
Cookie: sessionid=abc123

{"name": "new item"}
```

| 部分 | 意味 |
|---|---|
| メソッド | 何をしたいか。GET (取得) / POST (作成・処理) / PUT / PATCH (更新) / DELETE |
| パス | どのリソースか |
| ヘッダー | 付加情報。Content-Type、Cookie、Authorization |
| ボディ | 送るデータ (GET には無い) |

**GET は副作用を持たない** のが約束です。再読み込みやクローラで何度呼ばれても壊れないようにします。

## HTTP レスポンス

```
HTTP/1.1 200 OK
Content-Type: application/json

{"id": 1, "name": "new item"}
```

| コード | 意味 | 誰の問題 |
|---|---|---|
| 200 / 201 | 成功 / 作成した | - |
| 301 / 302 | リダイレクト | - |
| 400 | リクエストが不正 | クライアント |
| 401 / 403 | 未ログイン / 権限なし | クライアント |
| 404 | 無い | クライアント |
| 500 | アプリの例外 | サーバー |
| 502 / 503 / 504 | 上流が落ちた / 過負荷 / タイムアウト | サーバー (LB の後ろ) |

## 状態を持たない HTTP と、セッション

HTTP は 1 回ごとに独立していて、前のリクエストを覚えていません。「ログイン済み」を覚えるために **Cookie** にセッション ID を入れ、サーバー側で対応表を持つ (Django のセッション) か、署名付きトークン (JWT) を持たせます (agent-base)。

## Django と FastAPI

| | Django | FastAPI |
|---|---|---|
| 性格 | フルスタック。ORM・管理画面・認証・テンプレート同梱 | API 特化。軽量で型 (Pydantic) が中心 |
| 画面 | テンプレートで HTML を返せる | 返さない (フロントは別) |
| DB | 自前 ORM + migrations | SQLAlchemy + Alembic を組み合わせる |
| 使っている所 | mokujitsu, backsimp | agent-base |

どちらも「パスに関数を対応させ、リクエストを受けてレスポンスを返す」という同じ仕事をしています。

## まとめ

- リクエスト = メソッド + パス + ヘッダー + ボディ。GET は副作用なし
- 4xx はクライアント、5xx はサーバー。502〜504 は LB の後ろを疑う
- ログイン状態は Cookie のセッションか JWT で持つ
- Django は全部入り、FastAPI は API 特化
