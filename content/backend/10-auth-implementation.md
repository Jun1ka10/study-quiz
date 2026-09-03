---
id: be-10
title: 認証の実装 (Django セッション / FastAPI JWT / ソーシャルログイン)
summary: 概念は済んだので実装する。Django の auth と login_required、FastAPI の OAuth2PasswordBearer と依存、Google ログインの組み込み
minutes: 14
---
## Django: 同梱の auth を使う

自作しません。`django.contrib.auth` が ユーザー、パスワードハッシュ、セッション、ログイン画面の土台を全部持っています。

```python
# settings.py
AUTH_USER_MODEL = "accounts.User"          # 最初のマイグレーション前に決める (後から変えられない)
LOGIN_URL = "/login/"
SESSION_COOKIE_SECURE = True               # 本番
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.Argon2PasswordHasher", ...]   # argon2-cffi を入れる

# accounts/models.py
from django.contrib.auth.models import AbstractUser
class User(AbstractUser):
    company = models.ForeignKey("Company", null=True, on_delete=models.PROTECT)

# urls.py
from django.contrib.auth import views as auth_views
path("login/", auth_views.LoginView.as_view(template_name="login.html")),
path("logout/", auth_views.LogoutView.as_view()),

# views.py
@login_required
def dashboard(request):
    request.user            # ログイン中のユーザー
```

- **カスタムユーザーモデル** を最初に作る (メールでログイン、会社への所属など後で必ず要る)
- パスワードは `user.set_password()` / `check_password()`。生で保存しない
- 権限は `@permission_required` や `user.has_perm()`。組織単位の認可は自分で書く (「自分の会社のデータか」)
- パスワードリセットは `PasswordResetView` 一式が同梱。メール送信の設定だけ

## FastAPI: 自分で組む (薄く)

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import bcrypt, jwt

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")     # Authorization: Bearer を読む

def hash_password(p: str) -> str: return bcrypt.hashpw(p.encode(), bcrypt.gensalt(12)).decode()
def verify_password(p: str, h: str) -> bool: return bcrypt.checkpw(p.encode(), h.encode())

def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=settings.jwt_expire_minutes)},
                      settings.jwt_secret, algorithm="HS256")

@router.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == form.username)).scalar_one_or_none()
    ok = user is not None and verify_password(form.password, user.password_hash)
    if user is None: verify_password(form.password, DUMMY_HASH)        # タイミングを揃える
    if not ok: raise HTTPException(401, "invalid credentials")          # 理由を区別しない
    return {"access_token": create_token(user.id), "token_type": "bearer"}

def get_current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid token", headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active: raise HTTPException(401)
    return user

@router.get("/me")
def me(user: User = Depends(get_current_user)): return user
```

- `algorithms=["HS256"]` を必ず指定 (`none` を受けない)
- トークンは短命 (15〜60 分)。長く保ちたいなら **リフレッシュトークン** (DB に保存、失効できる) を別に発行
- ログアウト = クライアントがトークンを捨てる。即時無効化が要るなら短命 + リフレッシュの失効、または DB に deny リスト
- 認可は `Depends(get_current_user)` の先で「対象は自分の組織か」を毎回確認 (IDOR)

### Cookie に入れる場合

SPA からの XSS を避けるため、JWT を **HttpOnly Cookie** に入れる設計もあります。その場合は CSRF が復活するので、SameSite=Lax + CSRF トークンか、`Origin` ヘッダーの検証を入れます。

## ソーシャルログイン (Google)

自分でパスワードを持たない選択肢です。

- Django: `django-allauth` が Google / GitHub などのプロバイダとアカウント連携を同梱。設定と Google Cloud 側の OAuth クライアント ID 作成だけ
- FastAPI: `authlib` で OAuth 2.0 / OIDC のフロー (認可 URL → コールバック → ID トークン検証 → `sub` でユーザーを探すか作る → 自分の JWT を発行)

```python
# authlib (概念)
oauth.register("google", client_id=..., client_secret=..., server_metadata_url="https://accounts.google.com/.well-known/openid-configuration", client_kwargs={"scope": "openid email profile"})
@router.get("/auth/google")             # → Google へリダイレクト
@router.get("/auth/google/callback")    # ← code を受け取り token 交換、id_token を検証、sub で紐づけ
```

- 紐づけは `sub` (不変)。メールは変わる
- 初回は「アカウント作成」、2 回目以降は「ログイン」。同じメールの既存アカウントとの統合は慎重に (乗っ取りの経路になる)
- `client_secret` は Secret Manager

## 管理者と権限

- `is_staff` / `is_superuser` (Django) や `role` 列 (FastAPI) で管理者を分け、管理 API は `require_admin` 依存で守る
- 権限の判定を散らさない。「何ができるか」を関数にまとめる (`can_edit_question(user, q)`)

## テストで押さえる

- 登録 → ログイン → /me
- 間違ったパスワード / 無いユーザー / 期限切れ / 改ざん / 無効化済みユーザー → 全部 401
- 他人のリソースへの GET / PATCH → 403 か 404
- 管理 API を一般ユーザーで → 403

## まとめ

- Django は同梱の auth + カスタムユーザーモデル + Cookie の設定
- FastAPI は bcrypt + PyJWT + `Depends(get_current_user)`。短命 + リフレッシュ、`algorithms` 指定
- ソーシャルログインは allauth / authlib、紐づけは `sub`
- 認可は毎回対象の所有者を確認。テストで 401 / 403 を網羅

## やってみる

**ゴール:** FastAPI に登録 / ログイン / me を実装し、5 種類の失敗テストを通す。

1. be-06 の FastAPI に `uv add bcrypt pyjwt pydantic-settings`、`users` (dict でよい) と上のコードを組み込む
2. `/docs` の Authorize でログインして `/me` を叩く
3. `tests/test_auth.py` に: 正常系、間違ったパスワード、無いユーザー、トークン無し、改ざん (末尾 1 文字変更)、期限切れ (`exp` を過去にして発行) → 401 の 5 本
4. `settings.jwt_secret` を `.env` から読み、無いと起動時に落ちることを確認
5. 余裕があれば Django 側: `startproject` にカスタムユーザーモデルを作り、`LoginView` でログイン画面を出し、`@login_required` のビューに未ログインでアクセスしてリダイレクトを見る

**確認:** 5 種類の失敗が全部 401 で、メッセージが同じ。JWT の中身を base64 で読んで sub と exp があるのを見た。
