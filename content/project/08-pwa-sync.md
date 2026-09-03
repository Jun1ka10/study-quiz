---
id: step-08
title: "PWA をログインとサーバー同期に対応させる"
summary: "この学習アプリにログイン画面を足し、回答を API に送り、オフライン時はローカルに溜めて復帰時に同期する"
phase: "3. フロント"
prereqs: [js-07, js-08, js-02, sec-07]
minutes: 120
---
## ゴール

この PWA (`study-quiz` リポジトリ) を fork または clone し、`app.js` を改造する。

- 設定画面に「サーバー URL」と「ログイン」を足す
- 回答時: ローカルに記録しつつ `POST /attempts` を送る。失敗 (オフライン) なら **送信待ちキュー** に積む
- 起動時と `online` イベント時にキューを流す
- 「今日の復習」はログイン中なら `GET /review` を正とし、未ログインなら従来どおりローカル

## 手順

1. API に CORS を足す。`allow_origins` に PWA のオリジン (`http://localhost:8765` と GitHub Pages の URL) を明示。`*` にしない
2. `app.js` に `api.js` 相当のモジュールを足す: `login(email, password)`、`post("/attempts", body)`、`get("/review")`。トークンは `localStorage` に保存 (XSS 対策として `textContent` 徹底を再確認)
3. `record()` の末尾で `queue.push({question_id, result})` → `flush()`。`flush` は `navigator.onLine` のときだけ、成功した分をキューから消す。二重送信を防ぐため各項目に `client_id` (UUID) を付け、サーバー側で `ON CONFLICT (client_id) DO NOTHING`
4. サーバーの attempts に `client_id` 列を足す (Alembic)
5. ログイン画面は `tpl-login` テンプレートを追加。失敗時のメッセージは 1 種類
6. Service Worker の `fetch` ハンドラで **API へのリクエストはキャッシュしない** (`/api/` で始まる URL は素通し)
7. 動作確認: ログイン → 5 問解く → ブラウザをオフラインにして 3 問解く → オンラインに戻す → DB の attempts が 8 行

## できたか確認

- オフラインで解いた分が、復帰後に DB に入る (重複なし)
- 未ログインでも従来どおり動く
- DevTools の Network で、API 呼び出しに `Authorization` が付いている

## ここでの学び

「オフラインでも動き、つながったら同期」はキューと冪等性 (client_id) の組み合わせ。ネットワークは失敗する前提で設計する。
