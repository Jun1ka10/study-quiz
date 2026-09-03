---
id: de-07
title: コードの匂いとリファクタリング
summary: 長い関数、重複、フラグ引数、プリミティブ執着、神クラス。匂いの見つけ方と、テストに守られた小さな直し方
minutes: 12
---
## リファクタリングとは

**振る舞いを変えずに** 構造を良くすることです。機能追加とは別のコミットにし、テストが通り続けることで「変えていない」を保証します。テストが無い場所を直すなら、先にテストを書きます (または特性テスト: 今の出力をそのまま期待値にする)。

## 代表的な匂い

| 匂い | 兆候 | 直し方 |
|---|---|---|
| 長い関数 | スクロールが要る、コメントで節が分かれている | 節ごとに関数抽出。名前がコメントの代わりになる |
| 重複 | 似たコードが 3 か所 | 共通部分を関数に。ただし「たまたま似ている」なら残す |
| フラグ引数 | `f(x, mode="email")` で中が if 分岐 | 手段ごとに関数 / クラスに分ける (OCP) |
| プリミティブ執着 | 金額を int、メールを str で持ち回る | 値オブジェクト |
| 神クラス | `Utils` `Manager` に何でも入っている | 責務ごとに分割 (SRP) |
| 深いネスト | if の中の for の中の if | 早期 return、ガード節、関数抽出 |
| 魔法の数 | `if status == 2` | 定数 / Enum に名前を付ける |
| 長い引数リスト | 引数 6 個 | dataclass にまとめる |
| コメントで補う | 「ここは〜のため」が多い | コードの名前で語る。why だけコメントに残す |
| 変更の発散 | 1 つの変更で 5 ファイル触る | 一緒に変わるものを近くに置く |

## 小さく直す手順

1. 直す範囲を決める (関数 1 つ、クラス 1 つ)
2. **テストを確認**。無ければ書く
3. 1 手だけ変える (関数抽出、改名、条件の反転)
4. テストを回す
5. コミット
6. 繰り返す

「全部きれいにしてから戻す」大改修は、途中で壊れて戻せなくなります。1 手ずつ、常に動く状態を保ちます。

## よく使う手

### 関数抽出

```python
# 前
def process(order):
    # 検証
    if not order.lines: raise ValueError
    if order.total < 0: raise ValueError
    # 割引
    discount = 0
    if order.customer.vip: discount = order.total * 0.1
    ...

# 後
def process(order):
    validate(order)
    discount = calc_discount(order)
    ...
```

### ガード節で早期 return

```python
# 前
def f(user):
    if user is not None:
        if user.active:
            return do(user)
    return None

# 後
def f(user):
    if user is None or not user.active:
        return None
    return do(user)
```

### 条件の分岐を多態に

`if kind == "email": ... elif kind == "slack": ...` → `Notifier` Protocol と実装クラス (SOLID のレッスン)。

### 引数オブジェクト

`create_invoice(client_id, amount, tax, due, note, currency)` → `create_invoice(InvoiceDraft(...))`。

## 道具

- **ruff**: 未使用の変数・import、複雑度 (`C901`) を検出。`ruff check --select C901 --config "lint.mccabe.max-complexity=10"`
- **型チェッカー**: 改名や引数変更の影響範囲を教えてくれる
- **エディタのリファクタリング機能**: 関数抽出、改名は手でやらない (漏れる)
- **カバレッジ**: 直す前にそこがテストされているか

## やらないこと

- 「いつか使う」ための抽象化 (YAGNI)
- 動いていて触らない場所の整形だけの変更 (差分が増えてレビューが辛い)
- 機能追加とリファクタリングを 1 コミットに混ぜる

## まとめ

- 振る舞いを変えずに構造を直す。テストに守られて 1 手ずつ
- 匂い: 長い関数、重複、フラグ引数、プリミティブ執着、神クラス、深いネスト
- 手: 関数抽出、ガード節、多態、引数オブジェクト
- 機能追加と分けてコミット

## やってみる

**ゴール:** 匂いのある関数を、テストに守られながら 3 手で直す。

1. `legacy.py`:
   ```python
   def calc(items, user, mode):
       t = 0
       for i in items:
           if i["type"] == 1:
               t += i["price"] * i["qty"]
           elif i["type"] == 2:
               t += i["price"] * i["qty"] * 0.9
       if user["rank"] == "gold":
           t = t * 0.95
       if mode == "tax":
           return int(t * 1.1)
       else:
           return int(t)
   ```
2. 先に特性テストを書く: 適当な入力 3 パターンで今の出力を assert に固定する
3. 手 1: `1` `2` を `ItemType` Enum に、`0.9` `0.95` `1.1` を名前付き定数に。テスト実行
4. 手 2: 明細の小計を `line_total(item)` に抽出。テスト実行
5. 手 3: `mode` のフラグ引数をやめ、`subtotal(items, user)` と `with_tax(amount)` の 2 関数に分け、呼び出し側で組み合わせる。テスト実行
6. 各手ごとにコミットする

**確認:** 3 手すべてでテストが通り続けた。関数名だけで何をしているか読めるようになった。
