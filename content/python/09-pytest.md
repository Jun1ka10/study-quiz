---
id: py-09
title: pytest でテストを書く
summary: テストの書き方、fixture、parametrize、モック、何をテストすべきか
minutes: 12
questions:
  - id: py-l09-1
    difficulty: 1
    question: "pytest がテストとして認識するものは?"
    choices:
      - "すべての関数"
      - "`test_*.py` または `*_test.py` の中の `test_` で始まる関数"
      - "main 関数"
      - "docstring のある関数"
    answer: 1
    explanation: "`assert` を書くだけでよい。unittest のような TestCase クラスや self.assertEqual は不要。"
  - id: py-l09-2
    difficulty: 2
    question: "fixture の役割は?"
    choices:
      - "テストを速くする"
      - "テストに必要な前提 (DB セッション、サンプルデータ、一時ファイル) を用意し、終わったら片付ける仕組み。引数名で受け取る"
      - "テストを並列化する"
      - "アサーションの別名"
    answer: 1
    explanation: "`@pytest.fixture` で定義し、テスト関数の引数に同名で書くと注入される。yield の後が後片付け。"
  - id: py-l09-3
    difficulty: 2
    question: "同じロジックを 5 種類の入力で検証したい。良い書き方は?"
    choices:
      - "テスト関数を 5 つコピーする"
      - "`@pytest.mark.parametrize` で入力と期待値の組を並べる"
      - "1 つの関数に assert を 5 つ書く"
      - "for で回す"
    answer: 1
    explanation: "parametrize なら 5 件が別々のテストとして報告され、どれが落ちたか一目で分かる。assert を並べると最初の失敗で止まる。"
  - id: py-l09-4
    difficulty: 2
    question: "外部 API (決済) を呼ぶ関数をテストするとき、適切なのは?"
    choices:
      - "本番の API を叩く"
      - "API クライアントを差し替え可能にしておき、テストでは偽物 (フェイク / モック) を注入して、送った内容と戻りの扱いを検証する"
      - "テストしない"
      - "テスト用の本番アカウントで課金する"
    answer: 1
    explanation: "設計の「テストしやすい設計」と同じ。依存を引数や Depends で受ける形にしておくと、テストが速く安定する。"
---
## 最小のテスト

```python
# tests/test_billing.py
from myapp.billing import total_with_tax

def test_total_with_tax():
    assert total_with_tax(1000, 0.1) == 1100

def test_zero():
    assert total_with_tax(0, 0.1) == 0
```

```bash
uv run pytest                 # tests/ 以下の test_*.py を自動収集
uv run pytest -q              # 簡潔に
uv run pytest -x              # 最初の失敗で止める
uv run pytest -k "tax"        # 名前で絞る
uv run pytest tests/test_billing.py::test_zero
```

`assert` が失敗すると、pytest は両辺の値を展開して表示します。`assert a == b` で十分で、`assertEqual` は要りません。

## 例外のテスト

```python
import pytest

def test_negative_amount_rejected():
    with pytest.raises(ValueError, match="positive"):
        deposit(-1)
```

## fixture: 前提の用意と片付け

```python
# tests/conftest.py  (同じディレクトリ以下のテストで自動的に使える)
import pytest

@pytest.fixture
def db():
    session = SessionLocal()
    yield session              # ここまでが準備、テストが走り、
    session.rollback()         # ここからが片付け
    session.close()

@pytest.fixture
def user(db):                  # fixture は fixture を使える
    u = User(name="test")
    db.add(u); db.commit()
    return u

# tests/test_users.py
def test_user_has_no_orders(db, user):     # 引数名で受け取る
    assert count_orders(db, user.id) == 0
```

- `scope="session"` を付けると全テストで 1 回だけ (DB エンジンなど重いもの)
- `tmp_path` (一時ディレクトリ)、`monkeypatch` (環境変数や属性の一時差し替え)、`capsys` (標準出力の取得) は組み込み fixture

## parametrize: 入力を並べる

```python
@pytest.mark.parametrize("amount, rate, expected", [
    (1000, 0.1, 1100),
    (1000, 0.0, 1000),
    (1, 0.1, 1),          # 切り捨て
    (0, 0.1, 0),
])
def test_total_with_tax(amount, rate, expected):
    assert total_with_tax(amount, rate) == expected
```

4 件が別々のテストとして数えられ、落ちた組だけ表示されます。境界値 (0、1、上限、空) をここに並べます。

## 外部依存の扱い

DB、時刻、乱数、外部 API は、テストで制御できる形にします。

```python
# 本体: 依存を引数で受ける
def charge(order: Order, gateway: PaymentGateway, now: datetime) -> Receipt: ...

# テスト: 偽物を渡す
class FakeGateway:
    def __init__(self): self.calls = []
    def charge(self, amount, token):
        self.calls.append((amount, token)); return "ok"

def test_charge_sends_amount():
    gw = FakeGateway()
    charge(order, gw, now=datetime(2026, 1, 1))
    assert gw.calls == [(1100, "tok")]
```

差し替えられない構造のときは `monkeypatch` や `unittest.mock.patch` で無理やり置き換えられますが、設計を直す方が長期的に楽です。FastAPI なら `app.dependency_overrides`、Django なら `settings` の上書きや `override_settings` があります。

## 何をテストするか

- **ロジックの境界**: 税計算、日付の扱い、状態遷移。ここが最も壊れやすく、最もテストしやすい
- **入出力の契約**: API が期待の JSON とステータスを返す (FastAPI の `TestClient`、Django の `Client`)
- **バグを直したとき**: 再発防止のテストを 1 つ足す
- テストしにくいと感じたら設計の匂い。依存を外に出す

100% のカバレッジは目的ではありません。壊れたら困る所から書きます。

## CI で回す

```yaml
- run: uv run pytest -q
```

PR ごとに走らせ、落ちたらマージしない。これでテストが「書いただけ」にならず効き続けます。

## まとめ

- `test_*.py` に `test_` 関数、`assert` で書く
- 前提は fixture (conftest.py)、入力の並びは parametrize
- 外部依存は差し替え可能にして偽物を注入
- 境界と契約とバグ再発を優先。CI で回す
