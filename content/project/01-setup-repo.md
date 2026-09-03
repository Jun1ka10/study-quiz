---
id: step-01
title: "リポジトリと開発環境を作る"
summary: "新しいリポジトリを切り、uv・ruff・pytest・CI の土台を用意する。以後のすべてがここに積み上がる"
phase: "1. 土台"
prereqs: [dt-01, py-06, py-09]
minutes: 45
---
## ゴール

`study-quiz-server` という新しいリポジトリを作り、「テストが CI で回る空のプロジェクト」にする。中身はまだ無くてよい。**形が先、機能は後**。

## 手順

1. GitHub で新しいリポジトリ `study-quiz-server` を作る (公開でも非公開でも可。秘密情報は入れない前提)
2. ローカルで初期化する
   ```bash
   git clone <url> && cd study-quiz-server
   uv init --package .          # src/study_quiz_server/ 構成になる
   uv add --dev pytest ruff
   ```
3. `.gitignore` に `.venv/` `__pycache__/` `.env` `*.db` を書く。**最初のコミットの前に**
4. `pyproject.toml` に ruff の設定を足す (行長 120、`select = ["E", "F", "I", "B", "UP"]`)
5. 最初のテストを置く。`tests/test_smoke.py`:
   ```python
   def test_smoke():
       assert 1 + 1 == 2
   ```
6. `uv run ruff check . && uv run pytest -q` が通ることを確認してコミット
7. `.github/workflows/ci.yml` を作り、PR と main への push で `uv sync` → `ruff check` → `pytest` を回す (インフラの GitHub Actions のレッスンの形)
8. ブランチを切って README に 1 行足す PR を作り、CI が緑になるのを見てマージ

## できたか確認

- `main` に push すると Actions が走り、緑になる
- `uv run pytest` がローカルで通る
- `.env` と `.venv` が `.gitignore` にある

## ここでの学び

CI を最初に入れると「壊れたら気づく」状態が最初から手に入る。後から足すと、壊れているものを直してから入れる羽目になる。
