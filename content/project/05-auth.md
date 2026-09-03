---
id: step-05
title: "メール + パスワードのログインと JWT"
summary: "bcrypt でパスワードを保存し、JWT を発行し、/me で自分を返す。認証の芯を自分で書く"
phase: "2. API"
prereqs: [sec-03, sec-04, sec-05]
minutes: 90
---
## ゴール

`POST /auth/register`、`POST /auth/login` (JWT を返す)、`GET /me` (Bearer 必須)。以後の API はすべて `get_current_user` 依存で守る。

## 手順

1. `uv add bcrypt pyjwt pydantic-settings`
2. `settings.py` に `BaseSettings` で `database_url`、`jwt_secret` (必須)、`jwt_expire_minutes = 60` を定義。`.env` に `JWT_SECRET` を **`openssl rand -hex 32`** で作って入れる
3. `security.py`: `hash_password` / `verify_password` (bcrypt, rounds 12)、`create_token(user_id)` / `decode_token(token)` (HS256、`exp` と `iat` を入れる)
4. `routers/auth.py`:
   - `register`: `UserCreate(email: EmailStr, password: str = Field(min_length=8))`。既存メールなら 409
   - `login`: メール or パスワードが違うときは **同じメッセージ** で 401。存在しないユーザーでもダミーのハッシュ照合を行い応答時間を揃える
   - 戻りは `{"access_token": ..., "token_type": "bearer"}`
5. `deps.py` に `get_current_user`: `OAuth2PasswordBearer` でヘッダーからトークンを取り、`decode_token` → DB から User。失敗は 401
6. `GET /me` を `Depends(get_current_user)` で書く
7. テスト: 登録 → ログイン → /me が通る、間違ったパスワードで 401、トークン無しで 401、改ざんしたトークンで 401、期限切れで 401 (`freezegun` か `exp` を過去にして発行)

## できたか確認

- `/docs` の Authorize ボタンでログインして `/me` が叩ける
- DB の `password_hash` が `$2b$12$` で始まる
- 5 種類の失敗テストが通る

## ここでの学び

認証は「自分で書いてみて初めて、ライブラリが何を肩代わりしているか分かる」領域。ただし本番で自作を使い続けるかは別問題で、規模が出たら IdP (OIDC) に寄せる判断も学ぶ。
