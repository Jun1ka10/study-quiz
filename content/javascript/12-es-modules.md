---
id: js-12
title: ES モジュールとバンドル
summary: import / export、CommonJS との違い、ブラウザで直接使う、バンドラ (Vite / Next.js) が何をしているか、tree shaking
minutes: 10
---
## モジュールとは

ファイルを分けて、必要なものだけ `export` し、使う側が `import` する仕組みです。グローバル変数の汚染が無くなり、依存が明示されます。

```javascript
// lib/srs.js
export const INTERVALS = [1, 3, 7, 14, 30, 60];
export function nextDue(streak, now) { ... }
export default class Scheduler { ... }

// app.js
import Scheduler, { nextDue, INTERVALS } from "./lib/srs.js";
import * as srs from "./lib/srs.js";
```

- 名前付き export は `{ }` で、default export は名前を自由に付けて受ける
- 相対パスは `./` から。ブラウザでは拡張子 `.js` が必要 (バンドラは省略可)
- `import` はファイルの先頭で静的に解決される。条件付きで読みたいときは `await import("./heavy.js")` (動的 import)

## CommonJS との違い

Node の古い方式 `require` / `module.exports` (CommonJS) と ES モジュール (ESM) が混在しています。

| | CommonJS | ESM |
|---|---|---|
| 書き方 | `const x = require("x")` / `module.exports = ...` | `import x from "x"` / `export ...` |
| 読み込み | 実行時、同期 | 静的、非同期 |
| ブラウザ | 不可 | 可 |
| 拡張子 / 設定 | `.cjs` または既定 | `.mjs` または `package.json` に `"type": "module"` |

新しく書くなら ESM です。`"type": "module"` を付けると `.js` が ESM になります。`require` しか無いライブラリは `import x from "x"` で読めることが多い。

## ブラウザで直接使う

```html
<script type="module" src="app.js"></script>
```

- `type="module"` で import が使える。自動的に `defer` になる
- 別オリジンからの読み込みは CORS の対象
- このアプリのような小さなものは、バンドル無しでこれで足りる

## バンドラは何をしているか

Vite、webpack、Next.js の内部 (Turbopack) は次をまとめてやります。

1. **解決**: `import "react"` を `node_modules/react/...` に対応付ける
2. **変換**: TypeScript / JSX → JS、新しい構文 → 古いブラウザ向け
3. **束ねる**: 数百のファイルを少数のファイルに。HTTP の往復を減らす
4. **tree shaking**: import されていない export を削除する
5. **分割**: ページごと・動的 import ごとにファイルを分け、必要な分だけ読む
6. **最小化**: 空白と変数名を縮める
7. **ハッシュ付きファイル名**: `app.3f1a9c.js` でキャッシュを長く効かせつつ更新を確実に

開発時は変換だけして束ねない (Vite の dev server) ので速い。本番ビルドで全部やります。

## tree shaking が効く書き方

```javascript
import { debounce } from "lodash-es";     // OK: 使う関数だけ残る
import _ from "lodash";                    // NG: 全部入る
```

- 名前付き import を使う
- 副作用のあるモジュール (読み込むだけで何かする) は削れない。`package.json` の `"sideEffects": false` で宣言
- ビルド後のサイズは `npm run build` の出力や `vite-bundle-visualizer` で見る

## Node と ブラウザの両対応

ライブラリを書くなら `package.json` の `exports` で入口を宣言し、ESM を出します。アプリなら気にしなくてよい。

## まとめ

- `export` / `import`。名前付きと default。新規は ESM
- ブラウザは `type="module"`。小さければバンドル不要
- バンドラは解決・変換・束ね・tree shaking・分割・最小化・ハッシュ
- 名前付き import で tree shaking を効かせる

## やってみる

**ゴール:** バンドル無しの ESM と、Vite でのバンドルを比べる。

1. `esm/` に `lib.js` (`export const add = (a, b) => a + b; export default function hello() { return "hi"; }`) と `app.js` (`import hello, { add } from "./lib.js"; console.log(hello(), add(1, 2));`)、`index.html` に `<script type="module" src="app.js">`
2. `python3 -m http.server 8080` で開き、コンソールに出るのを確認。Network タブで 2 ファイルが別々に読まれているのを見る
3. `app.js` の `import` から `.js` を消して失敗するのを見る (ブラウザは拡張子必須)
4. `npm create vite@latest vdemo -- --template vanilla` → 同じ 2 ファイルを `src/` に置き `npm run build`。`dist/assets/*.js` が 1 ファイルでハッシュ付きになっているのを見る
5. `lib.js` に使わない `export const unused = ...` を足して再ビルドし、`dist` の中に `unused` が無いことを `grep` で確認 (tree shaking)

**確認:** ブラウザ直読みとバンドルの違い、使わない export が消えることを見た。
