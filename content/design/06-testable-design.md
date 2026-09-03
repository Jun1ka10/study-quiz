---
id: de-06
title: テストしやすい設計
summary: 副作用を端に寄せる、時刻と乱数と I/O を注入する、純粋関数に寄せる。テストが書きにくいのは設計のサイン
minutes: 12
---
## 「テストしにくい」は設計の匂い

テストを書こうとして手が止まる典型:

- 関数の中で `datetime.now()` を呼んでいて、日付に依存する結果を固定できない
- 関数の中で DB や外部 API を直接呼んでいて、テストが遅い・不安定・課金される
- グローバル変数や環境変数を読んでいて、順序で結果が変わる
- 1 つの関数が「読んで、計算して、書いて、通知する」全部をやっている

どれも「副作用と計算が混ざっている」ことが原因です。

## 計算と副作用を分ける

```python
# 混ざっている
def close_month(db):
    rows = db.query(Invoice).filter(Invoice.month == datetime.now().month).all()
    total = sum(r.amount for r in rows if r.status == "paid")
    db.add(MonthlyReport(month=datetime.now().month, total=total))
    db.commit()
    slack.post(f"締め完了: {total}")

# 分けた
def summarize(invoices: list[Invoice]) -> int:                 # 純粋関数。テストしやすい
    return sum(i.amount for i in invoices if i.status == "paid")

def close_month(repo: InvoiceRepo, reports: ReportRepo, notifier: Notifier, now: datetime) -> None:   # 手順。薄い
    invoices = repo.for_month(now.month)
    total = summarize(invoices)
    reports.add(MonthlyReport(month=now.month, total=total))
    notifier.post(f"締め完了: {total}")
```

`summarize` は入力を渡せば結果が返るので、100 ケース書いても一瞬です。`close_month` は偽物を渡して「呼ばれたか」を確認するだけで済みます。

## 注入するもの

| 副作用 | 注入の形 |
|---|---|
| 時刻 | `now: datetime` 引数、または `Clock` Protocol |
| 乱数 / UUID | `random.Random(seed)` や `id_gen: Callable[[], str]` |
| DB | Repository (Protocol) |
| 外部 API (決済、メール、LLM) | クライアントの Protocol |
| 環境変数 / 設定 | `Settings` オブジェクトを引数で |
| ファイル | パスを引数に、`tmp_path` fixture で |

「関数の中で作る」のではなく「外から渡す」。作る場所は一番外側 (main、ルーター、Depends) に集めます。

## 偽物の作り方

```python
class FakeNotifier:
    def __init__(self): self.posts: list[str] = []
    def post(self, msg: str) -> None: self.posts.append(msg)

def test_close_month_posts_total():
    notifier = FakeNotifier()
    close_month(FakeInvoiceRepo([Invoice(100, "paid"), Invoice(50, "draft")]), FakeReportRepo(), notifier, datetime(2026, 9, 1))
    assert notifier.posts == ["締め完了: 100"]
```

- **Fake**: 動く簡易実装 (list に貯める)。読みやすく、壊れにくい
- **Mock** (`unittest.mock`): 呼び出しを記録して検証。差し替えられない構造の応急処置に。多用すると実装の細部にテストが結合する

Fake を優先し、Mock は境界 (外部 SDK) に限ります。

## 純粋関数に寄せる

「入力だけで出力が決まり、外部を変えない」関数は、テストも並列化もキャッシュも自由です。

- 間隔反復の次回期限: `next_due(streak, result, now)`
- 合格判定: `is_passed(correct, total)`
- 税計算、集計、フォーマット

ロジックの大半は純粋関数にでき、残る副作用はごく薄い層になります。

## テストの層

| 層 | 対象 | 速さ | 数 |
|---|---|---|---|
| ユニット | 純粋関数、ユースケース (Fake) | ms | 多い |
| 統合 | Repository と本物の DB、API と TestClient | 100ms〜 | 中 |
| E2E | ブラウザからの操作 (Playwright) | 秒 | 少ない |

下ほど多く、上ほど少なく (テストピラミッド)。E2E だけに頼ると遅くて壊れやすい。

## 設計のチェックリスト

- この関数、`datetime.now()` や `os.environ` を中で呼んでいないか
- DB や HTTP を、引数で受け取った抽象経由で触っているか
- 「計算」だけを取り出して純粋関数にできないか
- 副作用を起こす場所は、外側の 1 か所に集まっているか

## まとめ

- テストしにくさは設計の匂い。副作用と計算が混ざっている
- 時刻・乱数・DB・外部 API・設定は外から渡す
- Fake を優先、Mock は境界だけ
- ロジックは純粋関数に、副作用は薄い外側に

## やってみる

**ゴール:** 時刻と外部通知を注入して、テストで固定する。

1. `report.py`:
   ```python
   import datetime, requests
   def notify_due(user_due_counts: dict[int, int]) -> int:
       today = datetime.date.today()
       sent = 0
       for uid, n in user_due_counts.items():
           if n > 0 and today.weekday() < 5:
               requests.post("https://example.invalid/notify", json={"uid": uid, "n": n}); sent += 1
       return sent
   ```
   このままテストを書こうとして、何が困るか 2 つ挙げる (曜日、ネットワーク)
2. `notify_due(counts, today: date, send: Callable[[int, int], None])` に直し、`send` に Fake (list に貯める) を渡す
3. テスト: 平日で 2 人に送る / 土曜で 0 / n=0 は送らない、を `date(2026, 9, 5)` (土) などで固定して書く
4. 本番用の `send` は `requests.post` を包んだ関数として `main` 側で渡す

**確認:** テストが曜日に依存せず、ネットワーク無しで通る。
