---
id: py-12
title: 標準ライブラリの要点 (pathlib / datetime / json / その他)
summary: 毎日使う標準モジュールの正しい使い方。パス、日時とタイムゾーン、JSON、collections、itertools、subprocess
minutes: 12
---
## pathlib: パスはオブジェクトで

```python
from pathlib import Path

base = Path(__file__).resolve().parent          # このファイルのディレクトリ
cfg = base / "config" / "app.yaml"              # / で連結
cfg.exists(), cfg.is_file(), cfg.suffix, cfg.stem, cfg.name
text = cfg.read_text(encoding="utf-8")
(base / "out").mkdir(parents=True, exist_ok=True)
(base / "out" / "r.json").write_text(json.dumps(data), encoding="utf-8")
for p in base.glob("**/*.md"): ...
```

`os.path.join` や文字列連結より読みやすく、OS の差も吸収します。ファイルを開くときは **`encoding="utf-8"` を明示** します (Windows で化ける)。

## datetime: タイムゾーンを持つ

```python
from datetime import datetime, timedelta, timezone, date
from zoneinfo import ZoneInfo

now = datetime.now(timezone.utc)                      # 必ず tz 付き (naive を作らない)
jst = now.astimezone(ZoneInfo("Asia/Tokyo"))
due = now + timedelta(days=3)
now.isoformat()                                       # "2026-09-03T08:00:00+00:00"
datetime.fromisoformat("2026-09-03T08:00:00+00:00")
date.today(), now.date(), now.strftime("%Y-%m-%d")
```

- **naive (tz 無し) と aware (tz 付き) を混ぜない**。比較や引き算でエラーか、黙ってずれる
- 保存と API は **UTC の ISO 8601**。表示のときだけ JST に変換
- `datetime.now()` (naive) や `utcnow()` (非推奨) ではなく `datetime.now(timezone.utc)`
- 「今日」は タイムゾーン次第で日付が変わる。JST の日付が欲しいなら JST に変換してから `.date()`

## json

```python
import json
s = json.dumps(data, ensure_ascii=False, indent=2, default=str)   # 日本語をそのまま、datetime は str に
data = json.loads(s)
json.dump(data, fp) / json.load(fp)
```

- `ensure_ascii=False` を付けないと日本語が `\uXXXX` になる
- `datetime` / `Decimal` / `dataclass` はそのままでは落ちる。`default=` で変換関数を渡すか、Pydantic の `model_dump_json()`
- 外部からの JSON は `json.loads` の後に **検証** (Pydantic)。型を信用しない

## collections

```python
from collections import Counter, defaultdict, deque

Counter(words).most_common(5)                  # 出現回数
groups = defaultdict(list); groups[key].append(x)   # キーが無くても append できる
q = deque(maxlen=100); q.append(x)             # 固定長のリングバッファ、両端が速い
```

## itertools / functools

```python
from itertools import groupby, chain, islice, batched, product
from functools import lru_cache, partial

for key, items in groupby(sorted(rows, key=f), key=f): ...     # ソート済みが前提
@lru_cache(maxsize=None)
def expensive(n): ...                                            # 引数が同じなら結果を再利用
```

## subprocess: 外部コマンド

```python
import subprocess
r = subprocess.run(["git", "log", "-1", "--format=%H"], capture_output=True, text=True, check=True)
r.stdout.strip()
```

- **リストで渡す** (`shell=True` + 文字列連結はインジェクションの入口)
- `check=True` で失敗を例外に。`timeout=` を付ける

## その他、知っておくもの

| モジュール | 用途 |
|---|---|
| `re` | 正規表現。`re.compile` して使い回す |
| `secrets` | 乱数 (トークン、パスワード)。`random` は使わない |
| `hashlib` / `hmac` | ハッシュ、署名検証 (Webhook の検証) |
| `uuid` | `uuid4()` |
| `decimal` | 金額。float を使わない |
| `enum` | 状態や種類 |
| `dataclasses` / `typing` | 前のレッスン |
| `csv` | CSV の読み書き (`newline=""` を忘れない) |
| `tempfile` | 一時ファイル / ディレクトリ |
| `argparse` | CLI の引数 |
| `contextlib` | `@contextmanager` で with を自作 |

## まとめ

- パスは `Path`、`encoding="utf-8"`
- 日時は aware で UTC 保存、表示で JST。naive を作らない
- JSON は `ensure_ascii=False`、外部入力は検証
- 乱数は `secrets`、金額は `decimal`、外部コマンドはリストで

## やってみる

**ゴール:** タイムゾーンの罠と JSON の日本語、pathlib を手で確かめる。

1. `python3`:
   ```python
   from datetime import datetime, timezone; from zoneinfo import ZoneInfo
   n = datetime.now(timezone.utc); j = n.astimezone(ZoneInfo("Asia/Tokyo")); n.date(), j.date()   # 深夜なら日付が違う
   datetime.now() - n     # naive と aware で TypeError
   ```
2. `json.dumps({"名前": "加藤"})` と `ensure_ascii=False` 付きを比べる。`json.dumps({"t": n})` が落ちるのを見て `default=str` で通す
3. `Path` でカレント以下の `*.md` を数え、`out/` を作って JSON を書き込み、読み戻す
4. `subprocess.run(["ls", "-la"], capture_output=True, text=True)` の `stdout` を表示。`shell=True` にせずに引数を渡す理由を 1 文で書く
5. `Counter` で上の md ファイルのカテゴリ別件数を出す

**確認:** aware と naive を混ぜるとエラーになる。日本語 JSON が読める形で出た。
