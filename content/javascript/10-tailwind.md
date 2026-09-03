---
id: js-10
title: Tailwind CSS
summary: ユーティリティクラスで画面を組む。レスポンシブ、状態、ダークモード、繰り返しはコンポーネントに
minutes: 10
---
## 考え方

CSS をファイルに書いてクラス名で参照する代わりに、**小さなユーティリティクラスを HTML に並べる**。

```html
<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
  <h2 class="text-lg font-bold">タイトル</h2>
  <p class="text-sm text-gray-500">説明</p>
</div>
```

- 命名に悩まない (`.card-title-secondary` を考えない)
- 変更の影響範囲がその要素だけ
- ビルド時に使ったクラスだけ CSS になるので小さい

## よく使うクラス

| 分類 | 例 |
|---|---|
| 余白 | `p-4` (padding 1rem) `px-2` `py-1` `m-2` `mt-4` `space-y-3` (子の間) `gap-2` |
| サイズ | `w-full` `max-w-2xl` `h-10` `min-h-screen` |
| 配置 | `flex` `items-center` `justify-between` `grid grid-cols-2` `mx-auto` |
| 文字 | `text-sm` `text-lg` `font-bold` `text-gray-500` `truncate` |
| 色 | `bg-white` `bg-blue-600` `text-white` `border-gray-200` |
| 角・影 | `rounded-lg` `rounded-full` `shadow-sm` `border` |
| 表示 | `hidden` `block` `overflow-x-auto` |

数字は 4px 刻み (`p-1` = 4px、`p-4` = 16px)。色は `gray-50`〜`gray-950` の段階。

## レスポンシブ

モバイルファーストで、プレフィックス無しが最小幅、`md:` などで広い画面を上書きします。

```html
<div class="flex flex-col md:flex-row gap-4">   <!-- スマホは縦、768px 以上は横 -->
<button class="w-full md:w-auto">
```

`sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280。

## 状態とダークモード

```html
<button class="bg-blue-600 hover:bg-blue-700 focus:ring-2 disabled:opacity-50">
<div class="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
<li class="odd:bg-gray-50">
<input class="peer"> <p class="hidden peer-invalid:block">不正です</p>
```

`dark:` は既定で OS 設定 (`prefers-color-scheme`) に従います。クラスで切り替える設定にもできます。

## 繰り返しの扱い

同じクラス列が 3 回出てきたらコンポーネントにします。

```tsx
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base = "rounded-lg px-4 py-2 font-medium disabled:opacity-50";
  const styles = { primary: "bg-blue-600 text-white hover:bg-blue-700", ghost: "border border-gray-300 hover:bg-gray-50" };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}
```

CSS 側の `@apply` でまとめる手もありますが、多用すると結局 CSS を管理することになるので、まずコンポーネント化です。

## 落とし穴

- **動的なクラス名は生成されない**: `bg-${color}-500` は走査で見つからない。`{ red: "bg-red-500", blue: "bg-blue-500" }[color]` のように完全な文字列を書く
- クラスの順序は関係ない (後勝ちではない)。同じプロパティを 2 つ書いたら競合するので `clsx` / `tailwind-merge` で整理
- 長いクラス列はエディタの Tailwind 拡張で並び替え・補完が効く。Prettier のプラグインで自動整列

## Django テンプレートで使う

Node が無いサーバーでも、Tailwind CLI で `static/css/tailwind.css` → `tailwind-built.css` をビルドしてコミット、テンプレートから読み込む形で使えます (`content` にテンプレートのパスを指定)。

## まとめ

- クラス名でスタイル。4px 刻み、色は段階
- モバイルファースト。`md:` で上書き
- `hover:` `disabled:` `dark:` で状態
- 繰り返しはコンポーネント。動的なクラス名は書かない

## やってみる

**ゴール:** Tailwind でカードとボタンを組み、レスポンシブとダークモードを見る。

1. Next.js の課題のプロジェクト (Tailwind 同梱) で `src/app/page.tsx` を置き換え:
   ```tsx
   export default function Page() {
     return (
       <main className="mx-auto max-w-2xl p-4 space-y-3">
         <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
           <h2 className="text-lg font-bold">今日の復習</h2>
           <p className="text-sm text-gray-500">12 問</p>
           <button className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 md:w-auto">始める</button>
         </div>
       </main>
     );
   }
   ```
2. ウィンドウ幅を変え、`md:w-auto` でボタン幅が変わるのを見る
3. OS をダークモードにして (または DevTools の Rendering → prefers-color-scheme) 色が変わるのを見る
4. `disabled` を付けて opacity が効くのを確認

**確認:** クラス名だけで見た目・レスポンシブ・状態・ダークモードが決まった。
