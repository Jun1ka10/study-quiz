---
id: py-13
title: requests と外部 API を呼ぶ
summary: HTTP クライアントの作法、認証ヘッダー、タイムアウトとリトライ、レートリミット、Webhook の受け方と署名検証、クライアントの切り出し
minutes: 12
---
## 基本

```python
import requests

r = requests.get("https://api.example.com/items", params={"limit": 50}, headers={"Authorization": f"Bearer {token}"}, timeout=10)
r.raise_for_status()                      # 4xx / 5xx を例外に
data = r.json()

r = requests.post(url, json={"name": "x"}, timeout=10)      # json= で Content-Type も付く
```

- **`timeout` を必ず付ける**。無いと相手が黙ったとき永遠に待つ
- `raise_for_status()` で失敗を見逃さない
- `r.json()` の結果は検証する (Pydantic)。相手の仕様変更で形が変わる

## Session で使い回す

```python
session = requests.Session()
session.headers.update({"Authorization": f"Bearer {token}", "User-Agent": "study-quiz/1.0"})
session.get(url, timeout=10)
```

接続を再利用して速く、ヘッダーを一度書けば済みます。`httpx` は同じ API で非同期にも対応します。

## リトライ

一時的な失敗 (429、5xx、接続エラー) は待って再試行、恒久的な失敗 (400、401、404) は再試行しない。

```python
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504], allowed_methods=["GET", "POST"])
session.mount("https://", HTTPAdapter(max_retries=retry))
```

- 指数バックオフ (1, 2, 4 秒) + ジッター。全員が同時に再試行して相手を潰さない
- POST の再試行は **冪等キー** があるときだけ (二重送信になる)
- `Retry-After` ヘッダーがあれば従う

## レートリミットを守る

- 相手の制限 (1 秒 10 回など) を読み、こちらで間隔を空ける (`time.sleep`、トークンバケット)
- 429 が来たら `Retry-After` 秒待つ
- 大量なら Batch API があるか確認 (多くの SDK にある)

## 外部サービスのクライアントを切り出す

```python
class ChatClient:
    def __init__(self, session: requests.Session, base_url: str):
        self.s, self.base = session, base_url

    def post_message(self, channel: str, text: str) -> str:
        r = self.s.post(f"{self.base}/chat.postMessage", json={"channel": channel, "text": text}, timeout=10)
        r.raise_for_status()
        body = r.json()
        if not body.get("ok"):
            raise ChatError(body.get("error"))           # 200 なのに失敗、という API もある
        return body["ts"]
```

- 呼ぶ側は `ChatClient` の Protocol だけを知り、テストでは Fake
- 相手固有のエラー表現 (200 で `ok: false`) をここで例外に変換する
- 公式 SDK (slack-sdk、stripe など) があればそれを使い、この薄い層で包む

## Webhook を受ける

外部サービスから自分のアプリへの HTTP (決済完了、メッセージ受信) です。

1. **署名を検証する**。`X-Signature` ヘッダーと秘密で HMAC を計算し、`hmac.compare_digest` で比較。検証しないと誰でも「決済完了」を送れる
2. **すぐ 200 を返す**。処理はキューやジョブに回す (相手はタイムアウトすると再送する)
3. **冪等に**。同じイベントが複数回来る前提で、イベント ID で重複を捨てる
4. 受け取った内容をそのまま信用しない。ID だけ取って自分で API で取り直す (決済の金額など)

```python
import hmac, hashlib
expected = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
if not hmac.compare_digest(expected, request.headers["X-Signature"]):
    return HttpResponse(status=401)
```

## 秘密と認証

- API キー / トークンは環境変数 (Secret Manager) から。ログに出さない
- OAuth のアクセストークンは期限がある。リフレッシュトークンで更新する処理を持つ
- Google API のようにサービスアカウントで認証するものは、鍵ファイルではなく Workload Identity や ADC を使う

## まとめ

- timeout、raise_for_status、レスポンスの検証
- Session で使い回し、リトライは一時的な失敗だけ、POST は冪等キー
- 外部サービスは薄いクライアントに包み、Fake で差し替え
- Webhook は署名検証 → 即 200 → 冪等に処理 → 内容は取り直す

## やってみる

**ゴール:** タイムアウトとリトライを体験し、Webhook の署名検証を書く。

1. `python3` で `requests.get("https://httpbin.org/delay/5", timeout=2)` が `ReadTimeout` になるのを見る
2. Retry 付きの Session を作り、`https://httpbin.org/status/503` を取得して、3 回再試行してから失敗するのを (時間で) 確認
3. 署名検証:
   ```python
   import hmac, hashlib, json
   secret = b"whsec"; body = json.dumps({"event": "paid", "id": "evt_1"}).encode()
   sig = hmac.new(secret, body, hashlib.sha256).hexdigest()        # 送信側
   hmac.compare_digest(hmac.new(secret, body, hashlib.sha256).hexdigest(), sig)   # 受信側 → True
   hmac.compare_digest(hmac.new(secret, body + b"x", hashlib.sha256).hexdigest(), sig)   # 改ざん → False
   ```
4. be-06 の FastAPI に `POST /webhook` を足し、署名が合わなければ 401、合えば `event_id` を set に入れて重複なら 200 で無視、を実装。curl で 2 回送って 1 回だけ処理されることを確認

**確認:** timeout 無しの危険が分かった。署名検証と冪等な受け口が動いた。
