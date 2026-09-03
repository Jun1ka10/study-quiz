---
id: py-06
title: モジュール・パッケージ・仮想環境
summary: import の仕組み、パッケージの作り方、venv / poetry / uv、ロックファイルで環境を再現する
minutes: 12
exercise: |
  **ゴール:** uv (無ければ venv) でプロジェクトを作り、ロックファイルを見る。

  1. `mkdir uvdemo && cd uvdemo && uv init` (uv が無ければ `python -m venv .venv && source .venv/bin/activate`)
  2. `uv add requests` して `pyproject.toml` と `uv.lock` を開き、requests 以外に何が入っているか数える
  3. `uv add --dev pytest` して dev グループに入ることを確認
  4. `uv run python -c "import requests; print(requests.__version__)"`
  5. `cat .gitignore` に `.venv` があるか確認

  **確認:** pyproject には requests だけ、lock には推移的依存 (certifi, urllib3 など) も入っている。
questions:
  - id: py-l06-1
    difficulty: 1
    question: "仮想環境を使う理由は?"
    choices:
      - "速くなる"
      - "プロジェクトごとに依存ライブラリとそのバージョンを分離し、他のプロジェクトや OS の Python を汚さない"
      - "セキュリティ"
      - "使わなくてよい"
    answer: 1
    explanation: "A では Django 4、B では Django 5、を同じマシンで共存させる。グローバルに pip install するとどちらかが壊れる。"
  - id: py-l06-2
    difficulty: 1
    question: "`pyproject.toml` と ロックファイル (`poetry.lock` / `uv.lock`) の役割の違いは?"
    choices:
      - "同じ"
      - "pyproject は「欲しいもの」の宣言 (範囲指定)、ロックは実際に解決された全パッケージの厳密なバージョン"
      - "ロックは不要"
      - "pyproject はテスト用"
    answer: 1
    explanation: "ロックファイルをコミットすると、他の人や CI でも同じバージョンが入る。ロックが無いと日によって違うものが入り「自分の環境では動く」が起きる。"
  - id: py-l06-3
    difficulty: 2
    question: "`from myapp.services import billing` が `ModuleNotFoundError` になる。最も多い原因は?"
    choices:
      - "ファイルが大きい"
      - "実行時のカレントディレクトリ / sys.path に myapp の親が無い、または仮想環境が有効になっていない"
      - "Python のバージョン"
      - "コメントの問題"
    answer: 1
    explanation: "import はカレントと sys.path から探す。`python -m myapp.main` のようにプロジェクトルートから -m で起動する、あるいは pip install -e . でパッケージとして入れる。"
  - id: py-l06-4
    difficulty: 2
    question: "本番のイメージに開発用パッケージ (pytest / ruff) を入れないための仕組みは?"
    choices:
      - "手で消す"
      - "依存をグループに分け (dev グループ)、本番では `--no-dev` / `--only main` 相当でインストールする"
      - "全部入れる"
      - "requirements.txt には書けない"
    answer: 1
    explanation: "poetry の `[tool.poetry.group.dev.dependencies]`、uv / PEP 735 の `[dependency-groups] dev`。イメージが小さくなり攻撃面も減る。"
---
## モジュールとパッケージ

- **モジュール** = 1 つの `.py` ファイル
- **パッケージ** = モジュールを入れたディレクトリ

```
myapp/
├── __init__.py          ← これがあるとパッケージ (空でよい)
├── main.py
├── models.py
└── services/
    ├── __init__.py
    └── billing.py
```

```python
from myapp.models import Invoice           # 絶対 import (推奨)
from myapp.services.billing import charge
from .models import Invoice                # 相対 import (パッケージ内から)
import myapp.services.billing as billing
```

`import` は `sys.path` (カレントディレクトリ + インストール済みパッケージ) から探します。「ローカルでは動くのに CI で見つからない」はほぼ起動方法の違いで、**プロジェクトルートから `python -m myapp.main`** のように起動すると安定します。

`if __name__ == "__main__":` は「直接実行されたときだけ」の印です。import されたときには走りません。

## 仮想環境

プロジェクトごとに独立した Python 環境を作り、依存を分離します。

```bash
python -m venv .venv            # 作る (標準)
source .venv/bin/activate       # 有効化 (プロンプトに (.venv) が付く)
pip install django
deactivate
```

`.venv/` は Git に入れません。エディタ (VS Code) にはこの中の Python を指定します。

## パッケージ管理ツール

| ツール | 特徴 |
|---|---|
| pip + requirements.txt | 標準。ロックは `pip freeze` で手動 |
| poetry | `pyproject.toml` + `poetry.lock`。仮想環境も管理。`poetry run python manage.py ...` |
| uv | Rust 製で非常に速い。`pyproject.toml` + `uv.lock`。`uv run`、`uv sync`。Python 本体の取得もできる |

どれでも考え方は同じです。

- **`pyproject.toml`**: 「欲しいもの」を範囲で宣言 (`django>=5.1,<6`)
- **ロックファイル**: 実際に解決された全パッケージ (推移的依存を含む) の厳密なバージョン。**必ずコミットする**
- `install` / `sync`: ロックのとおりに入れる。`add`: 依存を足してロックを更新

```bash
# uv
uv init && uv add fastapi && uv add --dev pytest ruff
uv sync                          # ロックどおりに .venv を作る
uv run pytest                    # 仮想環境で実行 (activate 不要)

# poetry
poetry add django && poetry add --group dev pytest
poetry install
poetry run python manage.py migrate
```

## dev 依存を分ける

```toml
[project]
dependencies = ["fastapi>=0.115", "sqlalchemy>=2.0"]

[dependency-groups]
dev = ["pytest>=8", "ruff>=0.6"]
```

本番イメージでは dev を入れません (`uv sync --no-dev`、`poetry install --only main`)。小さくなり、攻撃面も減ります。

## バージョンの指定

| 指定 | 意味 |
|---|---|
| `django==5.1.4` | ぴったり (ロックファイル向き) |
| `django>=5.1,<6` | 5.x 系。メジャー更新は取り込まない |
| `django~=5.1` | `>=5.1,<6` と同じ |

pyproject には範囲で、ロックには固定で、が原則です。

## 依存の更新

```bash
uv lock --upgrade-package django     # 1 つだけ
uv lock --upgrade                    # 全部
```

更新は小さく、テストを回して、1 コミットにします。脆弱性通知 (Dependabot / `pip-audit`) が来たら該当だけ上げます。

## まとめ

- モジュール = ファイル、パッケージ = `__init__.py` のあるディレクトリ。絶対 import、`-m` で起動
- 仮想環境で分離。`.venv` はコミットしない
- pyproject は範囲、ロックは固定。ロックは必ずコミット
- dev 依存は分けて本番に入れない
