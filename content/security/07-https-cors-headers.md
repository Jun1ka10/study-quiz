---
id: sec-07
title: HTTPS・CORS・セキュリティヘッダー
summary: 通信を守る HTTPS、ブラウザの同一オリジンポリシーと CORS の正しい理解、付けておくべきレスポンスヘッダー
minutes: 12
questions:
  - id: sec-l07-1
    difficulty: 1
    question: "HTTPS が守るものとして正しいのは?"
    choices:
      - "サーバー内のデータ"
      - "通信の盗聴・改ざんと、接続先が本物のサーバーであること"
      - "SQL インジェクション"
      - "パスワードの強度"
    answer: 1
    explanation: "経路上の攻撃 (盗聴・改ざん・なりすまし) を防ぐ。サーバー側の脆弱性やアプリのバグは別の話。"
  - id: sec-l07-2
    difficulty: 2
    question: "CORS エラーが出た。これは誰の判断で何を止めている?"
    choices:
      - "サーバーがリクエストを拒否している"
      - "ブラウザが、別オリジンからの JS によるレスポンスの読み取りを止めている (リクエスト自体はサーバーに届いていることが多い)"
      - "DNS の失敗"
      - "証明書の失敗"
    answer: 1
    explanation: "同一オリジンポリシーはブラウザの機能。サーバーが `Access-Control-Allow-Origin` で許可したオリジンにだけ、ブラウザが JS に結果を渡す。curl には CORS は無い。"
  - id: sec-l07-3
    difficulty: 2
    question: "`Access-Control-Allow-Origin: *` と `Access-Control-Allow-Credentials: true` を同時に返すと?"
    choices:
      - "全オリジンから Cookie 付きで呼べる"
      - "ブラウザが拒否する (仕様で禁止)。Cookie を使うなら具体的なオリジンを返す"
      - "速くなる"
      - "問題なく動く"
    answer: 1
    explanation: "認証情報付きのクロスオリジン要求を全世界に許可するのは危険なので仕様で禁止されている。許可するオリジンは明示のリストにする。"
  - id: sec-l07-4
    difficulty: 2
    question: "`Strict-Transport-Security` (HSTS) ヘッダーの効果は?"
    choices:
      - "レスポンスを圧縮する"
      - "以後このドメインにはブラウザが必ず HTTPS で接続し、http:// を書いても自動で切り替える"
      - "Cookie を暗号化する"
      - "CORS を許可する"
    answer: 1
    explanation: "最初の http アクセスを乗っ取る攻撃 (SSL stripping) を防ぐ。`max-age` を長くし、`includeSubDomains` を付ける。"
---
## HTTPS

HTTP を TLS で包んだものです。守るのは **経路** です。

- **盗聴**: 内容が暗号化される。パスワードもトークンも読めない
- **改ざん**: 途中で書き換えると検知される
- **なりすまし**: 証明書で「本物の example.com」だと確認できる

守らないもの: サーバー内のバグ、SQL インジェクション、XSS。HTTPS は「通信路が安全」なだけで、両端が安全かは別問題です。

現代では **全ページ HTTPS** が前提です。証明書は Let's Encrypt やクラウドのマネージド証明書で無料・自動更新になります。ロードバランサ (ALB / Cloud Run) で TLS を終端し、内側は HTTP、という構成が一般的です。

### HSTS

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

一度この ヘッダーを受け取ったブラウザは、以後そのドメインに必ず HTTPS で接続します。`http://` で始まる最初の 1 回を乗っ取る攻撃を防ぎます。

## 同一オリジンポリシーと CORS

**オリジン** = スキーム + ホスト + ポート。`https://app.example.com` と `https://api.example.com` は別オリジンです。

ブラウザは、あるオリジンのページの JS が **別オリジンのレスポンスを読む** ことを既定で禁止します (同一オリジンポリシー)。これが無いと、罠サイトの JS があなたのログイン済み銀行サイトの残高を fetch して読めてしまいます。

**CORS** はこの禁止を、サーバーが選んだオリジンにだけ緩める仕組みです。

```
# API サーバーのレスポンス
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
```

押さえるべき事実:

- 判断しているのは **ブラウザ**。curl や別のサーバーからの呼び出しに CORS は関係ない
- 単純でないリクエスト (JSON の POST、カスタムヘッダー) の前に、ブラウザが `OPTIONS` の **プリフライト** を送る。サーバーはこれに 200 と上記ヘッダーで答える必要がある
- `Allow-Origin: *` は「誰でも読める公開 API」の宣言。Cookie / 認証付きでは使えない (仕様で禁止)
- CORS は認可の代わりではない。サーバー側の認証・認可は別に必要

```python
# FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],     # 明示のリスト
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

フロントと API を同じドメイン配下に置いてリバースプロキシで振り分ければ、そもそも CORS は不要になります (Next.js の rewrites で `/api/*` を backend に流す構成)。

## 付けておくべきヘッダー

| ヘッダー | 効果 |
|---|---|
| `Strict-Transport-Security` | 常に HTTPS |
| `Content-Security-Policy` | 読み込んでよいスクリプト / 画像の出所を制限。XSS の被害を大きく減らす |
| `X-Content-Type-Options: nosniff` | ブラウザが Content-Type を推測して実行するのを防ぐ |
| `X-Frame-Options: DENY` / CSP `frame-ancestors` | 他サイトの iframe に埋め込ませない (クリックジャッキング防止) |
| `Referrer-Policy: strict-origin-when-cross-origin` | URL の詳細を他サイトに漏らさない |

Django は `SecurityMiddleware` と設定 (`SECURE_HSTS_SECONDS` など) で多くを付けられます。`manage.py check --deploy` が不足を指摘してくれます。

## Cookie の属性

```
Set-Cookie: sessionid=...; HttpOnly; Secure; SameSite=Lax; Path=/
```

- `HttpOnly`: JS から読めない (XSS で盗まれにくい)
- `Secure`: HTTPS でしか送らない
- `SameSite=Lax`: 他サイトからの POST に付けない (CSRF 緩和)

## まとめ

- HTTPS は経路を守る。全ページ HTTPS + HSTS
- CORS はブラウザの読み取り制限をサーバーが緩める仕組み。認可ではない。`*` と Cookie は両立しない
- CSP・nosniff・frame-ancestors・Referrer-Policy を付ける
- Cookie は HttpOnly + Secure + SameSite
