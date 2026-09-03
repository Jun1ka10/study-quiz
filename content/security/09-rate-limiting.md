---
id: sec-09
title: "レートリミットと総当たり対策"
summary: "ログインや API を叩きすぎから守る。固定窓・スライディング窓・トークンバケット、キーの選び方、429 の返し方"
minutes: 10
exercise: |
  **ゴール:** FastAPI のログインに 1 分 5 回の制限を付けて 6 回目で 429 を見る。

  1. be-06 の FastAPI に `uv add slowapi`
  2. ```python
     from slowapi import Limiter, _rate_limit_exceeded_handler
     from slowapi.errors import RateLimitExceeded
     from slowapi.util import get_remote_address
     limiter = Limiter(key_func=get_remote_address)
     app.state.limiter = limiter
     app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
     @app.post("/login")
     @limiter.limit("5/minute")
     def login(request: Request): return {"ok": False}
     ```
  3. `for i in $(seq 1 7); do curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8000/login; done` → 200 ×5、429 ×2
  4. `Retry-After` ヘッダーを `curl -i` で確認
  5. キーを IP からメールアドレス (リクエストボディ) に変える方法を考え、`key_func` を差し替えてみる

  **確認:** 6 回目から 429 になり、1 分後に回復する。
questions:
  - id: sec-l09-1
    difficulty: 1
    question: "ログインにレートリミットを付ける主な目的は?"
    choices:
      - "サーバー負荷"
      - "パスワードの総当たり・辞書攻撃・漏洩リストの使い回し (クレデンシャルスタッフィング) を現実的でなくする"
      - "見た目"
      - "目的は無い"
    answer: 1
    explanation: "1 分 5 回なら 1 日 7,200 回。無制限なら秒間数千回試せる。"
  - id: sec-l09-2
    difficulty: 2
    question: "ログインの制限キーを IP アドレスだけにする弱点は?"
    choices:
      - "弱点は無い"
      - "攻撃者は多数の IP を使える (分散)。逆に社内 NAT では正規ユーザーが道連れになる。IP と アカウント (メール) の両方でキーを持つ"
      - "IP は取れない"
      - "遅くなる"
    answer: 1
    explanation: "アカウント単位の制限は、そのアカウントへの総当たりを止める。IP 単位は広範囲の乱射を止める。両方。"
  - id: sec-l09-3
    difficulty: 2
    question: "制限を超えたときの適切な応答は?"
    choices:
      - "500"
      - "429 Too Many Requests と `Retry-After` ヘッダー。ログに記録し、繰り返す送信元は監視"
      - "200 で無視"
      - "接続を切る"
    answer: 1
    explanation: "クライアントが再試行のタイミングを知れる。ログ・メトリクスにすると攻撃の兆候が見える。"
  - id: sec-l09-4
    difficulty: 2
    question: "複数インスタンスで動く API でレートリミットのカウンタをどこに持つ?"
    choices:
      - "各プロセスのメモリ"
      - "Redis のような共有ストア (インスタンスが増えても合計で数える)。または LB / API Gateway / Cloud Armor 側で制限"
      - "DB のテーブル"
      - "ファイル"
    answer: 1
    explanation: "メモリだと 3 台なら実質 3 倍まで通る。Cloud Run は 0〜N 台に変動するので特に。"
---
## 何から守るか

| 脅威 | 対策の場所 |
|---|---|
| パスワード総当たり | ログイン (アカウント + IP) |
| 漏洩リストの使い回し | ログイン (アカウント) + 漏洩済みパスワードの拒否 |
| API の乱用・スクレイピング | API キー / ユーザー単位 |
| 認証前のエンドポイント叩き | IP 単位 |
| 単純な過負荷 (DoS) | LB / CDN / Cloud Armor |

## アルゴリズム

| 方式 | 動き | 特徴 |
|---|---|---|
| 固定窓 | 「毎分 0 秒でリセット、5 回まで」 | 単純。窓の境目で 2 倍通る |
| スライディング窓 | 「直近 60 秒で 5 回まで」 | 境目の問題が無い。実装は少し重い |
| トークンバケット | 「バケツに毎秒 1 個溜まり、最大 10 個。1 回で 1 個消費」 | バーストを許しつつ平均を抑える。API 向き |

ログインは固定窓かスライディング窓で十分です。

## キーの選び方

- **ログイン**: `email` (アカウント単位) と `IP` の両方。アカウント側は厳しめ (10 回 / 15 分)、IP 側は緩め (100 回 / 15 分)
- **認証済み API**: `user_id` か API キー
- **認証前の公開 API**: IP (プロキシ経由なら `X-Forwarded-For` の **信頼できる** 部分。クライアントが偽装できるヘッダーをそのまま使わない)

## 実装の置き場

| 場所 | 例 | 向き |
|---|---|---|
| アプリ | slowapi (FastAPI)、django-ratelimit | エンドポイントごとの細かい制御 |
| 共有ストア | Redis の INCR + EXPIRE | 複数インスタンスで合計を数える |
| 手前 | Cloud Armor、API Gateway、Cloudflare | アプリに届く前に落とす。大量の乱射向き |

Cloud Run のように台数が変動する環境では、**プロセスのメモリで数えると台数分甘くなる**。Redis (Memorystore) か手前で数えます。

```python
# Redis での固定窓 (概念)
key = f"rl:login:{email}:{now // 60}"
n = redis.incr(key)
if n == 1: redis.expire(key, 60)
if n > 10: raise TooMany
```

## 応答

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42
```

- 429 と `Retry-After`。本文は簡潔に
- ログ (誰が・どのキーで) とメトリクス (429 の件数) に出す。急増は攻撃の兆候
- ログイン失敗の理由は区別しない (パスワードのレッスン)

## ロックアウトとの違い

「10 回失敗したらアカウントを 30 分ロック」は、攻撃者が **狙ったユーザーをログインできなくする** (DoS) 手段にもなります。レートリミット (遅くする) を基本に、ロックは慎重に。多要素認証があればさらに安全。

## まとめ

- ログインはアカウント + IP の両方で制限。10 回 / 15 分程度
- 複数インスタンスなら Redis か手前 (Cloud Armor) で数える
- 429 + Retry-After、ログとメトリクス
- ロックアウトは DoS になり得る。制限で遅くするのが基本
