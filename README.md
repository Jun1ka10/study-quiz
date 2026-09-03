# study-quiz

Python / 設計 / AWS / GCP / インフラを問題形式で学ぶクイズアプリ。
サーバー不要の PWA なので、一度開けばスマホでオフラインでも動く。

## 構成

```
questions/      問題の正 (YAML, カテゴリごとに 1 ファイル)
scripts/build.py  YAML → site/questions.json と site/sw.js を生成
site/           配信する静的ファイル (index.html / app.js / style.css / manifest.json)
tests/          問題ファイルの整合性テスト
```

- 正誤履歴は端末の localStorage に保存される (サーバーには送らない)
- 「苦手優先」を ON にすると 未出題 → 前回不正解 → 正答率が低い の順に出題する
- 選択肢は毎回シャッフルされる

## 使い方

```bash
uv sync                      # 初回のみ
uv run python scripts/build.py   # 問題を変えたら毎回
uv run python -m http.server -d site 8000
# → http://localhost:8000 を開く
```

スマホで使うには、どこかの静的ホスティング (GitHub Pages / Cloud Storage / S3 など) に `site/` を置き、
ブラウザで開いて「ホーム画面に追加」する。以降はオフラインでも起動できる。
問題を更新したら build して再デプロイすれば、次回オンライン時に自動でキャッシュが更新される。

## 問題の追加

`questions/<category>.yaml` に追記する。

```yaml
  - id: py-013          # カテゴリ内で一意。接頭辞はカテゴリ名の先頭 2 文字
    difficulty: 2       # 1 基礎 / 2 中級 / 3 上級
    question: "..."     # ``` で囲めばコードブロック、` で囲めばインラインコード
    choices: ["A", "B", "C", "D"]
    answer: 1           # 正解の添字 (0 始まり)
    explanation: "..."  # 必須
```

新カテゴリは `questions/<name>.yaml` を作り `category:` と `title:` を書く。

```bash
uv run pytest            # 整合性チェック
uv run ruff check .
```
