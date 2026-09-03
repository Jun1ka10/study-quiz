---
id: be-01
title: Web アプリの仕組みと HTTP
summary: ブラウザからサーバー、DB まで 1 リクエストがどう流れるか。Django と FastAPI の位置づけ
minutes: 10
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

Django 構成では 4 で HTML を返し、そのページ内の JS が追加で JSON API を呼びます。FastAPI + Next.js 構成では API が JSON だけを返し、画面は Next.js が組み立てます。

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

HTTP は 1 回ごとに独立していて、前のリクエストを覚えていません。「ログイン済み」を覚えるために **Cookie** にセッション ID を入れ、サーバー側で対応表を持つ (Django のセッション) か、署名付きトークン (JWT) を持たせます (API 分離型の構成で多い)。

## Django と FastAPI

| | Django | FastAPI |
|---|---|---|
| 性格 | フルスタック。ORM・管理画面・認証・テンプレート同梱 | API 特化。軽量で型 (Pydantic) が中心 |
| 画面 | テンプレートで HTML を返せる | 返さない (フロントは別) |
| DB | 自前 ORM + migrations | SQLAlchemy + Alembic を組み合わせる |
| 向いている用途 | 管理画面込みの業務アプリ | フロントを分離した API サーバー |

どちらも「パスに関数を対応させ、リクエストを受けてレスポンスを返す」という同じ仕事をしています。

## まとめ

- リクエスト = メソッド + パス + ヘッダー + ボディ。GET は副作用なし
- 4xx はクライアント、5xx はサーバー。502〜504 は LB の後ろを疑う
- ログイン状態は Cookie のセッションか JWT で持つ
- Django は全部入り、FastAPI は API 特化

## やってみる

**ゴール:** curl で HTTP の生の姿を見る。

1. 次を実行する

   ```bash
   curl -v https://httpbin.org/get 2>&1 | head -40
   curl -i https://httpbin.org/status/404
   curl -i -X POST -H "Content-Type: application/json" -d '{"a":1}' https://httpbin.org/post
   curl -I https://httpbin.org/redirect/1
   ```
2. それぞれで「メソッド・パス・ヘッダー・ステータス行」を指で追う

**確認:** リクエストとレスポンスの各部分を言葉で言える。302 の `Location` ヘッダーを見つけた。
