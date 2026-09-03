---
id: sec-03
title: 認証と認可
summary: 「誰か」を確かめる認証と「何をしてよいか」を決める認可。セッション・JWT・OAuth の違いと落とし穴
minutes: 14
---
## 2 つは別の問題

| | 問い | 失敗時 |
|---|---|---|
| 認証 (AuthN) | あなたは誰? | 401 Unauthorized |
| 認可 (AuthZ) | その人にこれを許す? | 403 Forbidden |

ログインは認証。ログイン後に「この請求書を編集できるか」「この組織のデータか」を判定するのが認可です。**認証を通ったユーザーがすべてを見てよいわけではない**。ここを混同すると、後述の IDOR が生まれます。

## 認証の方式

### セッション (サーバーが状態を持つ)

1. ログイン成功 → サーバーが乱数のセッション ID を発行し、対応表 (DB / Redis) に「ID → ユーザー」を保存
2. ブラウザは Cookie に ID を持ち、毎回自動で送る
3. サーバーは対応表を引いてユーザーを特定

- 長所: ログアウトや強制無効化が **即時** (対応表から消すだけ)
- 短所: 対応表を全サーバーで共有する必要がある
- Django の既定はこれ。Cookie は `HttpOnly` + `Secure` + `SameSite` を付ける

### JWT (サーバーが状態を持たない)

1. ログイン成功 → サーバーが `{sub: 42, exp: ...}` を秘密鍵で **署名** したトークンを返す
2. クライアントは `Authorization: Bearer <token>` で送る
3. サーバーは署名を検証し、中身をそのまま信じる (DB を引かない)

- 長所: サーバーをいくつ並べても状態共有が要らない。API 分離構成と相性がよい
- 短所: **有効期限まで取り消せない**。短命 (15 分など) にしてリフレッシュトークンで更新する
- 中身は Base64 で **誰でも読める**。秘密は入れない
- 受け取ったら必ず署名・`exp`・`iss` を検証する。`alg: none` は拒否

### どちらを選ぶか

画面と API が同じ Django で動くならセッション。フロントを分離して API を複数のクライアントから呼ぶなら JWT。両者を混ぜる (JWT を HttpOnly Cookie に入れる) 設計もあります。

## OAuth 2.0 と OpenID Connect

「Google でログイン」の裏側です。

- **OAuth 2.0**: ユーザーの代わりに他サービスの API を呼ぶための **委譲** の仕組み (アクセストークン)。本来は認証の規格ではない
- **OpenID Connect (OIDC)**: OAuth の上に「認証」を載せたもの。ID プロバイダが署名した **ID トークン** が返り、これを検証してユーザーを特定する

ユーザーの紐づけには ID トークンの `sub` (不変の識別子) を使います。メールアドレスは変更され得るのでキーにしません。

## 認可の実装で落ちやすい所

### IDOR (Insecure Direct Object Reference)

```python
@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: int, user: User = Depends(get_current_user), db=Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if inv is None or inv.org_id != user.org_id:     # ← これが無いと他社の請求書が見える
        raise HTTPException(404)
    return inv
```

ID を 1 つずらすだけで他人のデータが見える、最も多い認可漏れです。**オブジェクトを取るたびに所有者を確認する**。前のレッスンの RLS はこれの保険になります。

### 役割は「操作」に紐づける

`if user.is_admin` を各所に散らすと漏れます。「請求書を承認できる」のような **権限** を定義し、役割に権限を束ね、チェックは権限で行います。

### 存在を隠す

他組織のリソースに対して 403 を返すと「存在はする」と教えてしまいます。404 で統一する設計もあります。

## まとめ

- 認証 = 誰か (401)、認可 = 許すか (403)。別物
- セッションは即時無効化、JWT は状態レス。JWT は短命 + 署名検証必須
- 「Google でログイン」は OIDC の ID トークン。`sub` で紐づける
- 認可はオブジェクト単位で所有者確認。IDOR を潰す

## やってみる

**ゴール:** JWT の中身を読み、署名検証が無いと何が起きるかを見る。

1. `uv add pyjwt` → `python3`:
   ```python
   import jwt, base64, json
   t = jwt.encode({"sub": 42, "role": "member"}, "secret", algorithm="HS256")
   print(t)
   h, p, s = t.split("."); json.loads(base64.urlsafe_b64decode(p + "=="))     # 誰でも読める
   jwt.decode(t, "secret", algorithms=["HS256"])
   jwt.decode(t, "wrong", algorithms=["HS256"])                                  # 失敗
   ```
2. ペイロードの `member` を `admin` に書き換えたトークンを手で作り、`decode` が失敗することを確認
3. `exp` に過去の時刻を入れて encode し、decode で `ExpiredSignatureError` を見る

**確認:** 中身は見えるが、鍵が無いと改ざんできないことを確認した。
