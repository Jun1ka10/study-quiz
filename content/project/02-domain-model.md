---
id: step-02
title: "問題データのモデルと検証 CLI"
summary: "レッスンと問題を Pydantic でモデル化し、YAML を読み込んで検証するコマンドを作る。いまの build.py の再実装"
phase: "1. 土台"
prereqs: [py-05, py-07, py-08]
minutes: 60
---
## ゴール

学習アプリの中核データ (カテゴリ・レッスン・問題) を **Pydantic モデル** として定義し、YAML から読み込んで検証する CLI を作る。この PWA のリポジトリにある `content/` と `questions/` をそのまま入力にする。

## 手順

1. `uv add pydantic pyyaml`
2. `src/study_quiz_server/models.py` にモデルを書く
   ```python
   from typing import Literal
   from pydantic import BaseModel, Field, model_validator

   class Question(BaseModel):
       id: str
       category: str
       lesson: str | None = None
       difficulty: Literal[1, 2, 3] = 1
       question: str
       choices: list[str] = Field(min_length=2)
       answer: int
       explanation: str = Field(min_length=1)

       @model_validator(mode="after")
       def answer_in_range(self):
           if not 0 <= self.answer < len(self.choices):
               raise ValueError("answer out of range")
           if len(set(self.choices)) != len(self.choices):
               raise ValueError("duplicate choices")
           return self

   class Lesson(BaseModel):
       id: str
       category: str
       order: int
       title: str
       summary: str
       body_md: str
       questions: list[Question]
   ```
3. `src/study_quiz_server/loader.py` に、ディレクトリを走査して `list[Lesson]` を返す関数を書く。frontmatter の切り出しは正規表現、YAML は `yaml.safe_load`。**id の重複は例外**にする
4. `pytest` で「正しいファイルは読める」「answer が範囲外なら ValidationError」「id 重複なら例外」の 3 つを書く。テスト用の小さな YAML は `tests/fixtures/` に置く
5. CLI を足す。`uv run study-quiz validate <dir>` で件数を表示し、不正なら非 0 で終了する (`pyproject.toml` の `[project.scripts]`)
6. この PWA のリポジトリの `content/` を指して実行し、全件通ることを確認

## できたか確認

- `uv run study-quiz validate ../study-quiz/content` が「N レッスン / M 問」と出て終了コード 0
- わざと answer を壊したファイルで非 0 になる
- テストが 3 本以上通る

## ここでの学び

境界 (ファイル) から入るデータは Pydantic で検証し、内部では型の付いたオブジェクトとして扱う。以後の API も DB もこのモデルを土台にする。
