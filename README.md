# study-quiz

Python / 設計 / AWS / GCP / インフラを、このアプリだけでゼロから学ぶための教材アプリ。
サーバー不要の PWA なので、一度開けばスマホでオフラインでも動く。

公開 URL: https://jun1ka10.github.io/study-quiz/

## 学習の流れ

1. **レッスンを読む** (1 本 5〜12 分の教科書ページ)
2. **確認問題** を解く。8 割で合格、落ちたら読み直し
3. 合格すると次のレッスンへ
4. 解いた問題は **間隔反復** (1 → 3 → 7 → 14 → 30 → 60 日) で「今日の復習」に戻ってくる。間違えると振り出し
5. **ランダム演習** は学習済みの範囲から苦手優先で出題

学習記録 (進捗・正誤) は端末の localStorage にだけ保存される。

## 構成

```
content/categories.yaml   カテゴリの並び・説明・これから書くレッスン名 (準備中として表示)
content/<category>/NN-slug.md   レッスン。frontmatter に id/title/summary/questions、本文は Markdown
questions/<category>.yaml       レッスンに紐づかない問題プール (ランダム演習・復習用)
scripts/build.py          上記を site/data.json に変換し、site/sw.js を生成
site/                     配信する静的ファイル (index.html / app.js / style.css / manifest.json)
tests/                    レッスンと問題の整合性テスト
```

## 開発

```bash
uv sync                          # 初回のみ
uv run python scripts/build.py   # 内容を変えたら毎回
uv run python -m http.server -d site 8000
uv run pytest
uv run ruff check .
```

`main` に push すると GitHub Actions (`.github/workflows/pages.yml`) がテスト → build → GitHub Pages へデプロイする。
スマホは次回オンラインで開いたときに新しい内容に入れ替わる。

## レッスンの書き方

`content/<category>/NN-slug.md`。NN が順番。

```markdown
---
id: py-05                 # 全体で一意
title: クラスと dataclass
summary: ホームの一覧に出る 1 行
minutes: 10
questions:                # 確認問題。3 問以上
  - id: py-l05-1          # 接頭辞はカテゴリ名の先頭 2 文字
    difficulty: 2         # 1 基礎 / 2 中級 / 3 上級
    question: "..."       # ``` で囲めばコードブロック
    choices: ["A", "B", "C", "D"]
    answer: 1             # 正解の添字 (0 始まり)
    explanation: "..."    # 必須
---
## 見出しは h2 から (h1 は title が使う)

本文は Markdown。表・コードブロック・箇条書きが使える。
```

書いたら `content/categories.yaml` の `planned` から同じ名前を消す。
新しいカテゴリは `categories.yaml` に追加し、`content/<id>/` を作る。
