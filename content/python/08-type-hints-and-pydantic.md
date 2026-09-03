---
id: py-08
title: 型ヒントと Pydantic
summary: 型ヒントの書き方と mypy / pyright、Pydantic で外部入力を検証する、dataclass との使い分け
minutes: 12
exercise: |
  **ゴール:** Pydantic に不正データを渡してエラーを読む。

  1. `uv add pydantic` (または `pip install pydantic`)
  2. `v.py`:
     ```python
     from pydantic import BaseModel, EmailStr, Field, ValidationError
     class User(BaseModel):
         email: str
         age: int = Field(ge=0)
         role: str = "member"
     print(User(email="a@b.c", age="30"))
     try:
         User(email="x", age=-1)
     except ValidationError as e:
         print(e)
     ```
  3. `age: int | None = None` に変えて `User(email="a")` が通ることを確認
  4. 余裕があれば `uv add mypy` して `uv run mypy v.py`

  **確認:** `"30"` が int になった。エラーが 2 件まとめて出た。
questions:
  - id: py-l08-1
    difficulty: 1
    question: "Python の型ヒントは実行時に何をする?"
    choices:
      - "型が違えば実行時エラーにする"
      - "何もしない。エディタと型チェッカー (mypy / pyright) のための注釈"
      - "自動で型変換する"
      - "速くする"
    answer: 1
    explanation: "`def f(x: int)` に文字列を渡しても Python は止めない。実行時に検証したいなら Pydantic のような仕組みが要る。"
  - id: py-l08-2
    difficulty: 1
    question: "「int か None」を表す型ヒントは?"
    choices: ["int or None", "int | None", "Optional[int] のみ", "None[int]"]
    answer: 1
    explanation: "3.10 以降は `int | None`。`Optional[int]` は同じ意味の古い書き方。None を返し得る関数には必ず付ける。"
  - id: py-l08-3
    difficulty: 2
    question: "Pydantic の `BaseModel` に `age: int` と書き、`{\"age\": \"30\"}` を渡すと?"
    choices:
      - "エラー"
      - "\"30\" を int の 30 に変換して受け入れる (既定の lax モード)"
      - "文字列のまま入る"
      - "None になる"
    answer: 1
    explanation: "Pydantic は検証と同時に妥当な変換をする。`\"abc\"` なら ValidationError。厳密にしたければ strict モード。"
  - id: py-l08-4
    difficulty: 2
    question: "dataclass と Pydantic の使い分けとして適切なのは?"
    choices:
      - "常に Pydantic"
      - "内部で作るデータの入れ物は dataclass、外部入力 (API / 設定 / ファイル) の検証が要るなら Pydantic"
      - "常に dataclass"
      - "どちらも同じ"
    answer: 1
    explanation: "Pydantic は検証コストがある。信頼できる内部データには軽い dataclass、境界を越えてくるデータには Pydantic。"
---
## 型ヒント

```python
def total(prices: list[int], tax: float = 0.1) -> int:
    return int(sum(prices) * (1 + tax))

def find(users: dict[str, User], key: str) -> User | None:
    return users.get(key)
```

| 書き方 | 意味 |
|---|---|
| `int` `str` `bool` `float` | 基本型 |
| `list[int]` `dict[str, int]` `set[str]` `tuple[int, str]` | コレクション |
| `int \| None` | None もあり得る |
| `Literal["draft", "published"]` | 決まった値だけ |
| `Callable[[int], str]` | 関数 |
| `Iterable[int]` | for で回せれば何でも |
| `Any` | 何でも (型チェック放棄) |

**Python は実行時に型ヒントを検証しません**。価値は開発時にあります。

- エディタの補完と赤線
- 型チェッカー (mypy / pyright) で「None かもしれない値を使っている」を実行前に発見
- 関数の仕様がコードに残る

## 型チェッカーを回す

```bash
uv add --dev mypy
uv run mypy myapp/
```

最初は `--ignore-missing-imports` で始め、エラーを少しずつ減らします。最も価値があるのは `| None` の見落とし検出です。

```python
user = find(users, "kato")
user.name          # mypy: "None" has no attribute "name"
if user is not None:
    user.name      # OK
```

## Pydantic: 実行時に検証する

外から来るデータ (API のリクエスト、設定ファイル、環境変数、外部 API のレスポンス) は信用できません。**Pydantic** は型ヒントをそのまま検証ルールにします。

```python
from pydantic import BaseModel, EmailStr, Field, field_validator

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    age: int | None = None
    role: Literal["member", "admin"] = "member"

    @field_validator("password")
    @classmethod
    def no_spaces(cls, v: str) -> str:
        if " " in v:
            raise ValueError("password must not contain spaces")
        return v

u = UserCreate(email="a@example.com", password="secret123", age="30")
u.age                    # 30 (int に変換された)
UserCreate(email="bad", password="x")   # ValidationError: 2 つの理由をまとめて報告
u.model_dump()           # dict
u.model_dump_json()      # JSON 文字列
UserCreate.model_validate(data)         # dict から
```

- 検証と同時に妥当な変換をする (`"30"` → `30`)。厳密にしたいなら `strict=True`
- エラーは全部まとめて返る (最初の 1 つで止まらない)
- FastAPI はリクエストボディをこれで受け、失敗を 422 にする

## 設定を Pydantic で読む

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    debug: bool = False
    stripe_api_key: str

    model_config = {"env_file": ".env"}

settings = Settings()      # 環境変数 / .env から読み、無ければ起動時に落ちる
```

「本番で環境変数を設定し忘れた」が起動時に分かります。

## dataclass との使い分け

| | dataclass | Pydantic |
|---|---|---|
| 検証 | しない | する |
| 変換 | しない | する |
| コスト | 軽い | 検証分だけ重い |
| 用途 | 内部のデータの入れ物 | 境界 (API / 設定 / ファイル) |

境界で Pydantic で検証し、内部は dataclass や普通のクラスで持つ、が基本です。

## まとめ

- 型ヒントは開発時のため。`| None` を書いて mypy に見つけてもらう
- 外部入力は Pydantic で検証・変換。エラーはまとめて 422
- 設定は `BaseSettings` で起動時に検証
- 内部は dataclass、境界は Pydantic
