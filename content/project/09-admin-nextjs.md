---
id: step-09
title: "問題を編集する管理画面を Next.js + TypeScript で作る"
summary: "レッスン一覧と問題の追加・編集フォーム。API に書き込みエンドポイントを足し、React の state と fetch を実戦で使う"
phase: "3. フロント"
prereqs: [js-09, js-10, js-05, js-06]
minutes: 150
---
## ゴール

`admin/` ディレクトリに Next.js アプリを作り、ログインしてレッスンごとの問題を一覧・追加・編集できるようにする。YAML を手で書く代わりの UI。

## 手順

1. API 側: 問題を DB にも持てるようにする。`questions` テーブル (id, lesson_id, payload JSONB, updated_by, updated_at) を追加し、起動時読み込みの内容と **マージ** する (DB にあれば DB を優先)。`POST /admin/questions`、`PUT /admin/questions/{id}`。`users.is_admin` 列を足し、`require_admin` 依存で守る
2. `npx create-next-app@latest admin --typescript --tailwind --app`
3. `lib/api.ts` に型付きのクライアント: `Question` 型は API の Pydantic モデルと同じ形で手書きする (OpenAPI から生成してもよい: `openapi-typescript`)
4. ページ:
   - `/login`: フォーム → トークンを Cookie (HttpOnly は SSR 側で設定) か localStorage に
   - `/lessons`: サーバーコンポーネントで一覧を取得して表示
   - `/lessons/[id]`: クライアントコンポーネントで問題一覧 + 編集フォーム。`useState` で下書き、保存で `PUT`。バリデーションエラー (422) をフィールドの横に出す
5. 保存後は一覧を再取得 (`router.refresh()` か state の更新)
6. `next.config.ts` の `rewrites` で `/api/*` を API サーバーに流し、CORS を不要にする
7. 1 問追加して、PWA 側 (`GET /questions`) に反映されることを確認

## できたか確認

- ブラウザから問題を 1 問追加し、DB に行があり、PWA の出題に出る
- 選択肢を 1 つにして保存すると 422 が画面に出る
- `npm run build` が型エラーなしで通る

## ここでの学び

サーバーコンポーネントとクライアントコンポーネントの境界、型を API と共有する価値、フォームの state 管理。ここまでで「自分で使えるサービス」になる。
