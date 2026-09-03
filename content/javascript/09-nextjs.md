---
id: js-09
title: "Next.js (App Router)"
summary: "ファイルベースのルーティング、サーバーコンポーネントとクライアントコンポーネント、データ取得、rewrites で API をつなぐ"
minutes: 14
exercise: |
  **ゴール:** Next.js でサーバー / クライアントの境界を体感する。

  1. `npx create-next-app@latest nxdemo --typescript --app --tailwind --eslint --src-dir` → `cd nxdemo && npm run dev`
  2. `src/app/lessons/page.tsx` (サーバーコンポーネント):
     ```tsx
     export default async function Page() {
       const res = await fetch("https://jun1ka10.github.io/study-quiz/data.json", { cache: "no-store" });
       const data = await res.json();
       return <ul>{data.lessons.map((l: { id: string; title: string }) => <li key={l.id}>{l.title}</li>)}</ul>;
     }
     ```
     `http://localhost:3000/lessons` を開く。ブラウザの Network に data.json への要求が **無い** (サーバーで取った) ことを確認
  3. `src/app/lessons/Counter.tsx` を `"use client"` で作り `useState` のボタンを置く。`page.tsx` から `<Counter />` を使う
  4. `Counter.tsx` の `"use client"` を消してエラーを読む

  **確認:** サーバーコンポーネントでは fetch がブラウザに出ない。hooks を使うには "use client" が要る。
questions:
  - id: js-l09-1
    difficulty: 1
    question: "App Router で `/lessons/py-01` に対応するファイルは?"
    choices: ["pages/lessons.tsx", "app/lessons/[id]/page.tsx", "routes/lessons.ts", "app/lessons.tsx"]
    answer: 1
    explanation: "`app/` 以下のディレクトリがそのまま URL。`[id]` が動的セグメントで、`params.id` で受け取る。`layout.tsx` は共通の枠。"
  - id: js-l09-2
    difficulty: 2
    question: "サーバーコンポーネントとクライアントコンポーネントの違いは?"
    choices:
      - "同じ"
      - "サーバーコンポーネントはサーバーで描画され、DB や秘密に直接触れるが hooks やイベントは使えない。クライアントコンポーネント (\"use client\") はブラウザで動き、state とイベントを持てる"
      - "クライアントコンポーネントは SEO に強い"
      - "サーバーコンポーネントは useState が使える"
    answer: 1
    explanation: "既定はサーバー。対話が要る部分だけ \"use client\" で切り出す。境界を小さくするほど JS が減る。"
  - id: js-l09-3
    difficulty: 2
    question: "ブラウザから `/api/*` を叩くと別ドメインの API に転送したい。CORS を避ける Next.js の方法は?"
    choices:
      - "できない"
      - "`next.config` の `rewrites` で `/api/:path*` → `${API_URL}/:path*` に書き換え、同一オリジンとして扱わせる"
      - "CORS を `*` にする"
      - "iframe を使う"
    answer: 1
    explanation: "ブラウザから見ると同じオリジンなので CORS が発生しない。API_URL は実行時の環境変数で切り替えられる。"
  - id: js-l09-4
    difficulty: 2
    question: "`NEXT_PUBLIC_` で始まる環境変数の扱いは?"
    choices:
      - "サーバーだけで使える"
      - "ビルド時にクライアントの JS に埋め込まれ、誰でも見える。秘密を入れてはいけない"
      - "暗号化される"
      - "無視される"
    answer: 1
    explanation: "API キーなど秘密はサーバーコンポーネントや Route Handler で使い、プレフィックス無しの環境変数から読む。"
---
## Next.js とは

React でアプリを作るためのフレームワークです。ルーティング、サーバー側での描画、ビルド、画像最適化などが揃っています。管理画面やフロントを「React で 0 から組む」より、ここに乗る方が速く安全です。

## ファイルベースのルーティング (App Router)

```
src/app/
├── layout.tsx            ← 全ページ共通の枠 (html / body / ナビ)
├── page.tsx              ← /
├── lessons/
│   ├── page.tsx          ← /lessons
│   └── [id]/
│       └── page.tsx      ← /lessons/py-01  (params.id = "py-01")
├── login/page.tsx        ← /login
└── api/health/route.ts   ← /api/health (Route Handler = サーバーの API)
```

```tsx
// src/app/lessons/[id]/page.tsx
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await getLesson(id);
  return <article><h1>{lesson.title}</h1></article>;
}
```

## サーバーコンポーネントとクライアントコンポーネント

**既定はサーバーコンポーネント** です。サーバーで描画され、HTML がブラウザに届きます。

| | サーバー (既定) | クライアント (`"use client"`) |
|---|---|---|
| 動く場所 | サーバー | ブラウザ (サーバーで初期描画もされる) |
| できる | `async` でデータ取得、DB や秘密に直接アクセス | `useState` / `useEffect`、`onClick` |
| できない | hooks、イベントハンドラ | サーバーの秘密に触る |
| JS の量 | 送られない | 送られる |

```tsx
// page.tsx (サーバー): データを取ってクライアント部品に渡す
import { QuestionEditor } from "./QuestionEditor";
export default async function Page({ params }) {
  const questions = await fetchQuestions((await params).id);   // サーバーで実行
  return <QuestionEditor initial={questions} />;
}

// QuestionEditor.tsx (クライアント): 対話だけ
"use client";
import { useState } from "react";
export function QuestionEditor({ initial }: { initial: Question[] }) {
  const [qs, setQs] = useState(initial);
  ...
}
```

原則: **対話が要る最小の部分だけ "use client"**。ページ全体を client にすると Next.js を使う意味が薄れます。

## データ取得

- サーバーコンポーネント: `await fetch(...)` をそのまま書く。`cache: "no-store"` で毎回取得、既定はキャッシュされ得る
- クライアント: `useEffect` + fetch、または SWR / TanStack Query
- 書き込み: Route Handler (`app/api/.../route.ts`) か Server Actions (`"use server"` の関数をフォームから呼ぶ)

## API サーバーとつなぐ

別プロセスの FastAPI に繋ぐとき、ブラウザから直接叩くと CORS が要ります。`rewrites` で同一オリジンに見せると不要になります。

```ts
// next.config.ts
export default {
  output: "standalone",                       // Docker 用に自己完結の成果物
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL}/:path*` }];
  },
};
```

`API_URL` は **実行時** の環境変数なので、同じイメージを dev / prod で使い回せます。

## 環境変数

- `NEXT_PUBLIC_XXX`: ビルド時にブラウザの JS に埋め込まれる。**公開情報**
- それ以外: サーバー側だけ。秘密はこちら

## 認証の置き場

トークンを `localStorage` に置くとクライアントコンポーネントからしか使えず XSS に弱い。**HttpOnly Cookie** に入れ、サーバーコンポーネントや Route Handler で `cookies()` から読んで API に付け直す形が堅いです。`middleware.ts` で未ログインを `/login` へリダイレクトできます。

## ビルドと配信

```bash
npm run build        # 型チェック + 最適化。エラーがあれば止まる
npm start            # 本番サーバー
```

`output: "standalone"` にすると `.next/standalone` に必要最小限が出て、Docker のマルチステージでそこだけコピーします。

## まとめ

- `app/` のディレクトリ = URL。`[id]` が動的
- 既定はサーバーコンポーネント。対話部分だけ "use client"
- API は rewrites で同一オリジンに。`NEXT_PUBLIC_` は公開
- 認証は HttpOnly Cookie + middleware
