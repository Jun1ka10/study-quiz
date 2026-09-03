---
id: py-11
title: asyncio 入門
summary: async / await の仕組み、gather で並行、いつ非同期が効くか (I/O バウンド)、同期コードとの混ぜ方、FastAPI での注意
minutes: 12
---
## 何を解くか

「外部 API を 10 回呼ぶ」「DB を 3 回引く」のような **待ち時間が主体** の処理を、待っている間に他の仕事を進めることで速くします。CPU を使う計算は速くなりません (GIL とプロセスの話)。

| 処理の種類 | 効く手段 |
|---|---|
| I/O バウンド (HTTP、DB、ファイル) | asyncio、スレッド |
| CPU バウンド (画像処理、集計) | multiprocessing、別プロセス、C 拡張 |

## 基本形

```python
import asyncio
import httpx

async def fetch(client: httpx.AsyncClient, url: str) -> int:
    r = await client.get(url)          # ここで待つ間、他のタスクが動く
    return r.status_code

async def main():
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*(fetch(client, u) for u in urls))   # 並行
    print(results)

asyncio.run(main())
```

- `async def` で定義した関数はコルーチン。呼ぶだけでは動かず、`await` するかタスクにする
- `await` は「待つ間、制御を手放す」印。`await` できるのは非同期対応のライブラリ (httpx、asyncpg、aiofiles)。`requests` や `time.sleep` を中で呼ぶと全体が止まる
- `asyncio.gather` で複数を同時に走らせ、全部待つ。Python 3.11+ なら `asyncio.TaskGroup` (例外処理が堅い)

## 順次と並行

```python
# 順次: 合計 = 各時間の和
for u in urls:
    await fetch(client, u)

# 並行: 合計 ≈ 最も遅い 1 つ
await asyncio.gather(*(fetch(client, u) for u in urls))
```

JavaScript の `Promise.all` と同じ考え方です。

## 同時実行数を絞る

100 件を一斉に投げると相手を落とします。セマフォで上限を付けます。

```python
sem = asyncio.Semaphore(10)
async def limited(u):
    async with sem:
        return await fetch(client, u)
await asyncio.gather(*(limited(u) for u in urls))
```

## タイムアウトとエラー

```python
try:
    r = await asyncio.wait_for(fetch(client, u), timeout=5)
except TimeoutError:
    ...
results = await asyncio.gather(*tasks, return_exceptions=True)   # 1 つ失敗しても他を集める
```

## 同期コードを混ぜる

非同期の中で同期の重い処理 (同期ライブラリ、CPU 計算) を呼ぶと、その間イベントループが止まります。スレッドに逃がします。

```python
result = await asyncio.to_thread(blocking_function, arg)     # 別スレッドで実行して待つ
```

## FastAPI での注意

- `async def` のハンドラの中で **同期のブロッキング呼び出し** (同期 DB ドライバ、`requests`) をすると、全リクエストが止まる。同期ライブラリを使うなら `def` (同期ハンドラ) にする。FastAPI が勝手にスレッドプールで動かす
- SQLAlchemy を非同期で使うなら `asyncpg` + `AsyncSession`。同期の `psycopg` + `Session` なら同期ハンドラ
- 「全部 async にすれば速い」は誤り。I/O 待ちを並行させる場所だけ非同期にする

## デバッグ

- `await` を忘れると「coroutine was never awaited」警告。何も実行されていない
- `asyncio.run` は 1 プログラムに 1 回 (Jupyter では既にループがあるので `await` を直接)
- `PYTHONASYNCIODEBUG=1` で遅いコールバックを検出

## まとめ

- I/O 待ちを並行させる道具。CPU は速くならない
- `async def` + `await` + `gather` (または TaskGroup)。非同期対応ライブラリだけ await
- 同時実行数は Semaphore、同期処理は `to_thread`
- FastAPI では同期ライブラリなら `def` ハンドラ

## やってみる

**ゴール:** 順次と並行の時間差を測り、同期呼び出しでループが止まるのを見る。

1. `uv add httpx` → `a.py`:
   ```python
   import asyncio, time, httpx
   URLS = ["https://httpbin.org/delay/1"] * 5
   async def one(c, u): return (await c.get(u)).status_code
   async def seq(c): return [await one(c, u) for u in URLS]
   async def par(c): return await asyncio.gather(*(one(c, u) for u in URLS))
   async def main():
       async with httpx.AsyncClient() as c:
           for f in (seq, par):
               t = time.perf_counter(); await f(c); print(f.__name__, round(time.perf_counter() - t, 1))
   asyncio.run(main())
   ```
2. `seq` が約 5 秒、`par` が約 1 秒になるのを確認
3. `one` の中に `time.sleep(1)` を足して `par` が遅くなる (ループが止まる) のを見る。`await asyncio.sleep(1)` に変えて戻る
4. `Semaphore(2)` で同時実行を 2 に絞り、`par` が約 3 秒になるのを確認
5. `await` を 1 か所消して警告を読む

**確認:** 並行で速くなり、同期のブロッキングで台無しになる、を数字で見た。
