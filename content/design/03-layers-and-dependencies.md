---
id: de-03
title: レイヤーと依存の向き (クリーンアーキテクチャ)
summary: ドメイン・ユースケース・インフラの 3 層、依存は内向き、Repository で DB を隠す。Django と FastAPI での置き方
minutes: 14
---
## 何を分けるのか

アプリのコードは、性質の違う 3 種類が混ざっています。

| 層 | 中身 | 変わる理由 |
|---|---|---|
| **ドメイン** | 業務のルール。「請求書は発行後に金額を変えられない」「合格は 8 割以上」 | 業務が変わったとき |
| **ユースケース** | ドメインを組み合わせた手順。「回答を記録し、復習期限を更新する」 | 機能が増えたとき |
| **インフラ** | DB、HTTP、外部 API、ファイル、時刻 | 技術を変えたとき |

これらを 1 つの関数に混ぜると、DB を変えるだけでも業務ルールのコードを触ることになります。

## 依存は内向き

```
   HTTP (FastAPI / Django view)  ──▶  ユースケース  ──▶  ドメイン
   DB (SQLAlchemy / ORM)         ──▶  (抽象を実装)        ▲
                                                          │ 何にも依存しない
```

- **ドメイン** は何も import しない (標準ライブラリと dataclass くらい)
- **ユースケース** はドメインと、インフラの **抽象** (Protocol) だけを知る
- **インフラ** は抽象を実装する。外側が内側に依存し、内側は外側を知らない

SOLID の DIP をアプリ全体に適用したものです。

## Repository: DB を隠す抽象

```python
# domain/models.py  (何にも依存しない)
@dataclass
class Attempt:
    user_id: int
    question_id: str
    correct: bool
    at: datetime

# usecases/ports.py  (抽象)
class AttemptRepository(Protocol):
    def add(self, a: Attempt) -> None: ...
    def recent(self, user_id: int, limit: int) -> list[Attempt]: ...

class Clock(Protocol):
    def now(self) -> datetime: ...

# usecases/record_attempt.py
def record_attempt(repo: AttemptRepository, clock: Clock, user_id: int, question_id: str, correct: bool) -> Attempt:
    a = Attempt(user_id, question_id, correct, clock.now())
    repo.add(a)
    return a

# infra/sqlalchemy_repo.py  (抽象を実装)
class SqlAttemptRepository:
    def __init__(self, db: Session): self.db = db
    def add(self, a: Attempt) -> None:
        self.db.add(AttemptRow(user_id=a.user_id, question_id=a.question_id, correct=a.correct, answered_at=a.at))
    def recent(self, user_id, limit): ...

# api/routers/attempts.py  (一番外)
@router.post("/attempts")
def post_attempt(body: AttemptIn, db=Depends(get_db), user=Depends(get_current_user)):
    a = record_attempt(SqlAttemptRepository(db), SystemClock(), user.id, body.question_id, body.correct)
    db.commit()
    return a
```

ユースケースのテストは `FakeAttemptRepository` (list に貯めるだけ) と `FixedClock` で、DB 無しに書けます。

## どこまでやるか

小さいアプリで 4 層を律儀に切ると、ファイル数だけ増えて読みにくくなります。目安:

- **最初**: ルーター/ビューにロジックを書かない。「計算・判断」を関数に切り出す (それだけでテストできる)
- **DB 以外の外部 (決済、メール、LLM) が増えたら**: Protocol を切って注入する
- **同じユースケースを API と バッチの両方から呼ぶようになったら**: ユースケース層を作る

「層を作るのは、その境界で差し替え・テストしたいものが現れたとき」。予防的に作らない (YAGNI)。

## Django での置き方

Django はフレームワークが層を持っています (view / model / template)。それでも view にロジックが溜まるので、

- `services.py` (アプリごと) にユースケース関数を置き、view は「入力を受けて services を呼んで返す」だけにする
- モデルのメソッドにドメインルール (「発行済みなら金額変更不可」を `save()` や専用メソッドで) を置く
- ORM を Repository で隠すのは Django では過剰なことが多い。services が ORM を直接使ってよい。テストは Django のテスト DB で回す

## FastAPI での置き方

フレームワークが薄いので自分で層を作ります。

```
src/app/
├── domain/        # dataclass、純粋なルール
├── usecases/      # 手順。ports.py に Protocol
├── infra/         # sqlalchemy、外部 API クライアント、clock
└── api/           # routers、schemas (Pydantic)、deps
```

Pydantic のスキーマ (API の入出力) とドメインの dataclass は分けます。API の形は外部との契約、ドメインは内部の表現で、変わる理由が違います。

## まとめ

- ドメイン / ユースケース / インフラ。依存は内向き
- DB や外部 API は Protocol (Repository など) で抽象化し、外から注入
- 小さいうちは「ルーターにロジックを書かない」だけ。境界が要る時に層を作る
- Django は services.py、FastAPI は 4 ディレクトリ

## やってみる

**ゴール:** ルーターに書いたロジックを、ユースケース関数 + Protocol に切り出してテストする。

1. be-06 の FastAPI に、`POST /attempts` を「DB (dict) に保存して、正解なら streak +1、不正解なら 0 にする」ロジックをルーター内に直書きで作る
2. `ports.py` に `AttemptRepository(Protocol)` (`add`, `get_streak`, `set_streak`) を書き、`usecases.py` に `record_attempt(repo, ...)` を移す。ルーターは呼ぶだけにする
3. `infra.py` に dict 実装 `MemoryRepo` を書く
4. `test_usecases.py` で `MemoryRepo` を使い、「正解 3 回で streak 3、不正解で 0」をテストする (FastAPI を起動しない)
5. ルーターの行数と、テストの実行時間を切り出し前後で比べる

**確認:** ユースケースのテストが HTTP も DB も無しで走る。ルーターは 3 行程度になった。
