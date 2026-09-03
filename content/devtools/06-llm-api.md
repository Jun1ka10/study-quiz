---
id: dt-06
title: LLM API を呼ぶ (Anthropic SDK)
summary: メッセージの形、システムプロンプト、ストリーミング、ツール使用の流れ、エラー処理、コストと安全の基本。アプリに LLM を組み込む最小の型
minutes: 14
---
## API の基本形

LLM の API は「これまでの会話を全部送って、次の応答を受け取る」だけです。状態はサーバーに残りません (自分で履歴を持つ)。

```python
import anthropic

client = anthropic.Anthropic()          # ANTHROPIC_API_KEY を環境変数から読む。コードに書かない

response = client.messages.create(
    model="claude-opus-5",
    max_tokens=16000,
    system="あなたは学習アプリの解説者です。簡潔に日本語で答えてください。",
    messages=[
        {"role": "user", "content": "SQL インジェクションを 3 行で説明して"},
    ],
)
for block in response.content:          # content はブロックのリスト (text / tool_use / thinking)
    if block.type == "text":
        print(block.text)
print(response.usage.input_tokens, response.usage.output_tokens)
```

| 要素 | 意味 |
|---|---|
| `model` | どのモデルか。まず `claude-opus-5` |
| `max_tokens` | 出力の上限。小さすぎると途中で切れる。非ストリーミングは 16000 程度が目安 |
| `system` | 役割と制約。毎回同じ内容にする (キャッシュが効く) |
| `messages` | `user` / `assistant` を交互に。最初は `user` |
| `response.content` | ブロックのリスト。`type` を見て取り出す |
| `usage` | 使ったトークン。ログに残して費用を追う |

現行モデルは思考 (reasoning) が既定で有効です。深さは `output_config={"effort": "low"|"medium"|"high"}` で調整し、簡単な分類は `low`、難しい推論は `high` にします。

## 会話を続ける

履歴を自分で持ち、毎回全部送ります。

```python
history = []
def ask(text: str) -> str:
    history.append({"role": "user", "content": text})
    res = client.messages.create(model="claude-opus-5", max_tokens=16000, system=SYSTEM, messages=history)
    answer = next(b.text for b in res.content if b.type == "text")
    history.append({"role": "assistant", "content": answer})
    return answer
```

長くなったら古い部分を要約するか、API の圧縮機能 (compaction) を使います。

## ストリーミング

長い出力は、届いた分から表示します (待たせない、タイムアウトを避ける)。

```python
with client.messages.stream(model="claude-opus-5", max_tokens=64000, messages=[...]) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    final = stream.get_final_message()          # usage などはここから
```

Web アプリなら FastAPI の `StreamingResponse` か SSE でブラウザへ流します。

## 構造化した出力が欲しい

「JSON で返して」とプロンプトに書くだけでは形が揺れます。**構造化出力** (`output_config` の `format`) でスキーマを指定し、SDK の `parse` 系ヘルパーでモデルに検証させます。Pydantic のモデルを渡して、返ってきた JSON を検証してから使う、が型です。詳細は SDK のドキュメントを参照します。

## ツール使用 (function calling)

モデルに「使える関数の一覧」を渡すと、必要なときに「この関数をこの引数で呼んで」と返してきます。実行するのはこちらです。

```python
tools = [{
    "name": "get_due_count",
    "description": "指定ユーザーの今日の復習問題数を返す",
    "input_schema": {"type": "object", "properties": {"user_id": {"type": "integer"}}, "required": ["user_id"]},
}]
messages = [{"role": "user", "content": "ユーザー 42 は今日何問復習すべき?"}]
res = client.messages.create(model="claude-opus-5", max_tokens=16000, tools=tools, messages=messages)

while res.stop_reason == "tool_use":
    tool_results = []
    for block in res.content:
        if block.type == "tool_use":
            result = get_due_count(**block.input)                  # 自分の関数を実行
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(result)})
    messages.append({"role": "assistant", "content": res.content})
    messages.append({"role": "user", "content": tool_results})
    res = client.messages.create(model="claude-opus-5", max_tokens=16000, tools=tools, messages=messages)
```

- `stop_reason == "tool_use"` の間、実行 → 結果を返す → 再度呼ぶ、を繰り返す
- 1 回の応答に複数の `tool_use` が入ることがある。全部実行して **1 つの user メッセージ** で返す
- 失敗したら `is_error: true` を付けて返す (握りつぶさない)
- SDK にはこのループを自動で回す tool runner もある

これが「エージェント」の中身です。ツールが DB や外部 API に触れるので、**権限と入力検証** は普通の API と同じ厳しさで。

## エラー処理

```python
try:
    res = client.messages.create(...)
except anthropic.RateLimitError:
    ...                     # 429。SDK は既定で 2 回リトライ済み。キューに戻す・待つ
except anthropic.APIStatusError as e:
    if e.status_code >= 500: ...   # 一時的。リトライ
    else: raise                    # 400 系は直らない。ログして落とす
except anthropic.APIConnectionError:
    ...                     # ネットワーク
```

`stop_reason` も見ます。`max_tokens` なら途中で切れている、`refusal` なら安全上の理由で拒否されています。

## コスト

- 入力トークン × 単価 + 出力トークン × 単価。`usage` をログに残し、ユーザーや機能ごとに集計する
- **プロンプトキャッシュ**: 毎回同じ長い system や資料は `cache_control` を付けると 2 回目以降が大幅に安くなる。system は固定、変わる部分 (質問、時刻) は後ろに
- 用途に応じたモデル選択。難しいものは Opus、大量で単純なものは Sonnet / Haiku。ただし「安いモデルで何度もやり直す」方が高くつくことがある
- `max_tokens` は用途に合わせる。分類なら 256 で十分

## 安全

- API キーは環境変数 / Secret Manager。フロントに埋めない (ブラウザから直接呼ばない。必ず自分のサーバー経由)
- ユーザー入力をプロンプトに混ぜるときは、**指示と data を分ける** (system に指示、user にデータ。「以下のテキストを要約」のように役割を明示)。ユーザーが「前の指示を無視して」と書いてきても、ツールの権限が最小なら被害は限定される
- 出力をそのまま HTML や SQL に流さない (XSS / SQLi)。普通の外部入力として扱う
- 個人情報を送る場合は、データの取り扱い規約と保持期間を確認する

## 評価

「良い回答か」は主観になりがちなので、代表的な入力と期待する出力の組 (eval セット) を作り、プロンプトやモデルを変えるたびに回します。10〜50 件でも「壊れた」は分かります。

## まとめ

- 履歴を全部送る。`system` は固定、`messages` は交互
- 長い出力はストリーミング。構造化出力はスキーマで
- ツール使用は「モデルが呼びたいと言う → こちらが実行 → 結果を返す」のループ
- usage をログに、キャッシュで安く、キーはサーバー側だけ

## やってみる

**ゴール:** API を 1 回呼び、ストリーミングし、ツールを 1 つ使わせる。

1. Anthropic の API キーを取得し `export ANTHROPIC_API_KEY=...` (`.env` に置くなら gitignore を確認)。`uv add anthropic`
2. `llm.py` で基本形を実行し、`usage` を表示する。`system` を変えて口調が変わるのを見る
3. ストリーミングに書き換え、`text_stream` で 1 文字ずつ出るのを見る
4. `get_due_count(user_id)` を「42 なら 7、それ以外は 0」を返す関数として書き、上のツール使用ループを実装。「ユーザー 42 は今日何問?」と「ユーザー 7 は?」で結果が変わることを確認
5. `max_tokens=20` にして `stop_reason` が `max_tokens` になるのを見る
6. 同じ長い system (2000 字程度) で 2 回呼び、`cache_control={"type": "ephemeral"}` を付けたときの `usage.cache_read_input_tokens` を比べる

**確認:** ツールの結果が回答に反映された。usage とキャッシュのトークン数を読めた。
