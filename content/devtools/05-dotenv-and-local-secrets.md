---
id: dt-05
title: .env と秘密情報の扱い (開発環境編)
summary: .env の読み込み方、.env.example、環境ごとの切り替え、direnv、設定クラスで起動時に検証。手元で秘密を安全に扱う型
minutes: 10
---
## 12-factor の「設定は環境変数に」

コードは全環境で同じ、違いは環境変数で渡す。これが基本形です。

- DB の接続先、API キー、機能フラグ、ログレベル
- コードに書かない、Git に入れない、環境ごとに変える

手元では環境変数を毎回 export するのは面倒なので `.env` ファイルに置き、ツールに読ませます。

## .env の形

```bash
# .env  (コミットしない)
DATABASE_URL=postgresql+psycopg://postgres:dev@localhost:5432/app
JWT_SECRET=0f3a...              # openssl rand -hex 32 で作る
STRIPE_API_KEY=sk_test_...
DEBUG=true
```

- `KEY=value`。値にスペースや `#` があればクォート
- **`.gitignore` に `.env`** を最初のコミットの前に
- パーミッションは `600`

## .env.example

```bash
# .env.example  (コミットする。値は空か例)
DATABASE_URL=postgresql+psycopg://postgres:dev@localhost:5432/app
JWT_SECRET=                      # openssl rand -hex 32
STRIPE_API_KEY=                  # Stripe のテストキー
DEBUG=true
```

新しく入った人は `cp .env.example .env` して埋めるだけ。「何が要るか」の一覧がコードと一緒に管理されます。

## 読み込み方

| 環境 | 方法 |
|---|---|
| Python (FastAPI) | `pydantic-settings` の `BaseSettings` + `env_file=".env"` |
| Django | `django-environ` の `env.read_env()` |
| Node / Next.js | Next.js は `.env.local` を自動で読む。素の Node は `node --env-file=.env` |
| Docker compose | `env_file: .env` |
| シェル全般 | `direnv` (ディレクトリに入ると自動で読む) |

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    stripe_api_key: str
    debug: bool = False

    model_config = {"env_file": ".env"}

settings = Settings()      # 無ければ起動時に落ちる
```

**起動時に検証** されるのが大事です。「本番で環境変数を設定し忘れて、ある画面を開いたときだけ落ちる」を防げます。

## 環境ごとの切り替え

| 環境 | 秘密の出所 |
|---|---|
| 手元 | `.env` (自分だけ) |
| テスト (pytest) | `.env.test` か conftest で固定値。本物のキーは使わない |
| CI | GitHub Secrets → 環境変数 |
| 本番 | Secret Manager → 環境変数 |

**本番では `.env` ファイルを使わない**。コンテナに入れると漏れます。実行時に注入します。

コードは常に「環境変数を読む」だけで、どこから来たかを知りません。これが切り替えを簡単にします。

## direnv

ディレクトリに入ると自動で環境変数を読み、出ると消す道具です。

```bash
# .envrc (コミットしてよい。秘密は書かない)
dotenv          # .env を読む
export PATH=$PWD/.venv/bin:$PATH
```

`direnv allow` で有効化。プロジェクトごとに違うキーを使い分けるときに便利です。

## やってはいけないこと

- `.env` をコミットする (履歴に残る → ローテーション)
- `.env` をチャットで送る (検索に残る)
- 本番の `.env` を手元にコピーして開発する (テストキーを使う)
- `NEXT_PUBLIC_` や フロントのコードに秘密を入れる
- `print(settings)` / `console.log(process.env)` (ログに残る)

## 秘密の生成

```bash
openssl rand -hex 32                 # JWT やセッションの署名鍵
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

「自分で考えたパスワード」は使いません。

## まとめ

- 設定は環境変数。手元は `.env`、本番は Secret Manager から注入
- `.env` は gitignore + 600、`.env.example` をコミット
- 設定クラスで起動時に検証
- テストは本物のキーを使わない。生成は openssl

## やってみる

**ゴール:** .env → 設定クラス → 起動時検証、の型を作る。

1. `uv add pydantic-settings`、`.env` に `DATABASE_URL` と `JWT_SECRET` (`openssl rand -hex 32`)、`.env.example` を値なしで作る。`.gitignore` に `.env`、`chmod 600 .env`
2. `settings.py` に上の `Settings` を書き、`python -c "from settings import settings; print(settings.debug)"` で読めることを確認
3. `.env` から `JWT_SECRET` の行を消して実行 → ValidationError で落ちることを確認。戻す
4. `git status` で `.env` が出ないことを確認
5. `pip install direnv` は無いので、`brew install direnv` / `apt install direnv` があれば `.envrc` に `dotenv` を書いて `direnv allow`。無ければ `set -a; source .env; set +a` で同じことをする

**確認:** 必須の環境変数が無いと起動時に落ちる。`.env` が Git に入らない。
