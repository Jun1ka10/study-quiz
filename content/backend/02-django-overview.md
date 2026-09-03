---
id: be-02
title: Django の全体像
summary: プロジェクトとアプリ、settings、manage.py、リクエストが流れる順番。Django プロジェクトの構造を読めるようになる
minutes: 12
exercise: |
  **ゴール:** Django プロジェクトを 0 から起動し、管理画面を出す。

  1. `uv init djdemo && cd djdemo && uv add django && uv run django-admin startproject config . && uv run python manage.py startapp members`
  2. `config/settings.py` の `INSTALLED_APPS` に `"members"` を足す
  3. `uv run python manage.py migrate && uv run python manage.py createsuperuser`
  4. `uv run python manage.py runserver` → `http://localhost:8000/admin/` にログイン
  5. `settings.py` の `DEBUG` と `ALLOWED_HOSTS` を眺め、`SECRET_KEY` が直書きされているのを見つける

  **確認:** プロジェクト (config) とアプリ (members) の違いをディレクトリで指せる。
questions:
  - id: be-l02-1
    difficulty: 1
    question: "Django の「プロジェクト」と「アプリ」の関係は?"
    choices:
      - "同じもの"
      - "プロジェクトは設定と URL の入口を持つ全体、アプリは機能単位 (members / invoices など) の部品"
      - "アプリの中に複数のプロジェクトがある"
      - "アプリは外部ライブラリのことだけを指す"
    answer: 1
    explanation: "`config/` (settings.py, urls.py) がプロジェクト、`members/` `invoices/` `expenses/` がアプリ。アプリは INSTALLED_APPS に登録して有効化する。"
  - id: be-l02-2
    difficulty: 1
    question: "リクエストが処理される順序として正しいのは?"
    choices:
      - "テンプレート → ビュー → URL"
      - "URLconf でビューを決める → ビューが処理 (必要なら モデル / テンプレート) → レスポンス"
      - "モデル → URL → テンプレート"
      - "ビュー → URL → モデル"
    answer: 1
    explanation: "urls.py の path() がパスとビュー関数を対応付ける。ビューがモデルで DB を触り、テンプレートで HTML を作って返す (MTV)。"
  - id: be-l02-3
    difficulty: 2
    question: "settings.py に DB パスワードを直書きせず、`env(\"DATABASE_PASSWORD\")` のように読む理由は?"
    choices:
      - "速いから"
      - "秘密情報を Git に入れず、環境 (dev / staging / 本番) ごとに値を変えられるから"
      - "Django が直書きを禁止しているから"
      - "理由は無い"
    answer: 1
    explanation: "django-environ で `.env` から読む。`.env` は .gitignore に入れ、本番は環境変数や Secret Manager から渡す。"
  - id: be-l02-4
    difficulty: 2
    question: "本番で `DEBUG = True` のままにすると何が起きる?"
    choices:
      - "何も起きない"
      - "エラー画面に settings や変数の中身がそのまま表示され、情報漏洩になる"
      - "速くなる"
      - "静的ファイルが配信されなくなる"
    answer: 1
    explanation: "DEBUG=True のエラーページはソースや環境変数を表示する。本番は必ず False にし、ALLOWED_HOSTS を設定する。"
---
## プロジェクトとアプリ

```
myproject/                  ← リポジトリ
├── manage.py               ← コマンドの入口
├── config/                 ← プロジェクト (設定)
│   ├── settings.py
│   ├── urls.py             ← URL の入口
│   └── wsgi.py / asgi.py   ← サーバーとの接続点
├── members/                ← アプリ (機能単位)
│   ├── models.py
│   ├── views.py
│   ├── urls.py
│   ├── admin.py
│   └── migrations/
├── invoices/               ← アプリ
├── templates/              ← HTML テンプレート
└── static/                 ← CSS / JS / 画像
```

- **プロジェクト** は 1 つ。設定 (`settings.py`) と URL の入口 (`urls.py`) を持つ
- **アプリ** は機能ごとに分ける。`members`、`invoices`、`expenses` のように。作ったら `INSTALLED_APPS` に登録する

## MTV: 1 リクエストの流れ

```
URL (urls.py) → View (views.py) → Model (models.py) → DB
                      ↓
                 Template (templates/) → HTML
```

1. `urls.py` の `path("members/", views.member)` がパスと **ビュー関数** を対応付ける
2. ビューがリクエストを受け、**モデル** で DB を読み書きし
3. **テンプレート** に値を渡して HTML を作り、レスポンスとして返す

Rails や他のフレームワークの MVC と同じ考え方で、Django ではビューが「コントローラ」に当たります。

## manage.py

```bash
python manage.py runserver          # 開発サーバー (本番では使わない)
python manage.py makemigrations     # モデル変更からマイグレーション作成
python manage.py migrate            # DB に適用
python manage.py createsuperuser    # 管理画面のユーザー
python manage.py shell              # Django 環境入りの Python シェル
python manage.py test               # テスト
python manage.py <自作コマンド>      # management/commands/ に置いたもの。cron からはこれを呼ぶ
```

poetry で管理しているなら `poetry run python manage.py ...` です。

## settings.py で押さえる項目

| 項目 | 意味 |
|---|---|
| `INSTALLED_APPS` | 有効なアプリ一覧。自作アプリもここに |
| `MIDDLEWARE` | 全リクエストが通る処理の列 (セッション、認証、CSRF) |
| `DATABASES` | DB 接続先 |
| `TEMPLATES` | テンプレートの置き場 |
| `STATIC_URL` / `STATIC_ROOT` | 静的ファイル。本番は `collectstatic` で STATIC_ROOT に集める |
| `DEBUG` | 本番は必ず False |
| `ALLOWED_HOSTS` | 受け付けるホスト名 |

## 設定は環境変数から

パスワードや API キーを settings.py に書くと Git に残ります。**django-environ** で `.env` から読むのが定番です。

```python
import environ
env = environ.Env()
env.read_env(BASE_DIR / "env/.env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env.bool("DEBUG", default=False)
DATABASES = {"default": env.db()}    # DATABASE_URL=postgres://user:pass@host/db を解釈
```

`.env` は `.gitignore` に入れ、環境ごとに別の値を置きます。

## 管理画面

`admin.py` にモデルを登録するだけで CRUD 画面が生えます。マスタデータの手入れや調査に便利で、Django を選ぶ大きな理由の 1 つです。

```python
from django.contrib import admin
from .models import Member

admin.site.register(Member)
```

## まとめ

- プロジェクト (設定) 1 つ + アプリ (機能) 複数
- URL → View → Model / Template → レスポンス
- 操作は `manage.py`。DB 変更は makemigrations → migrate
- 秘密情報は `.env` から。DEBUG は本番 False
