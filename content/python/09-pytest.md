---
id: py-09
title: pytest でテストを書く
summary: テストの書き方、fixture、parametrize、モック、何をテストすべきか
minutes: 12
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

## やってみる

**ゴール:** テストを 1 つ書いて落とし、直して通す。

1. `calc.py`: `def total_with_tax(amount, rate=0.1): return int(amount * (1 + rate))`
2. `test_calc.py`:
   ```python
   import pytest
   from calc import total_with_tax
   @pytest.mark.parametrize("amount, expected", [(1000, 1100), (0, 0), (1, 1)])
   def test_total(amount, expected):
       assert total_with_tax(amount) == expected
   def test_negative():
       with pytest.raises(ValueError):
           total_with_tax(-1)
   ```
3. `uv run pytest -q` (または `pytest -q`) で 1 件落ちるのを見る
4. `calc.py` に `if amount < 0: raise ValueError` を足して全部通す

**確認:** 落ちたときの表示で、どの入力が落ちたかが読めた。
