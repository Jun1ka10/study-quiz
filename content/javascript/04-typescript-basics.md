---
id: js-04
title: TypeScript の基本
summary: 型注釈、interface / type、ユニオン、ジェネリクス、any を避ける。Next.js のコードを読むための土台
minutes: 12
---
## TypeScript とは

JavaScript に **型** を足した言語です。コンパイル (`tsc`) すると型は消えて素の JS になるので、実行速度は変わりません。価値は書いている時にあります。

- 型の不整合をエディタが赤線で教えてくれる
- 補完が効く (プロパティ名を覚えなくてよい)
- 関数の入出力が仕様書になる

Next.js のプロジェクトは `.tsx` ファイルで書くのが標準です。

## 型注釈

```typescript
let count: number = 0;
let name: string = "Kato";
let active: boolean = true;
let tags: string[] = ["a", "b"];

function add(a: number, b: number): number {
  return a + b;
}
add(1, "2");     // エラー: string は number に代入できない
```

推論が効くところでは書かなくてよい (`let count = 0` で number)。関数の引数には書きます。

## オブジェクトの型: interface / type

```typescript
interface User {
  id: number;
  name: string;
  email?: string;          // 省略可能
  readonly createdAt: string;
}

type Status = "draft" | "published" | "archived";   // 文字列リテラルのユニオン

type Task = {
  id: number;
  title: string;
  status: Status;
};
```

`interface` と `type` はほぼ同じ用途に使えます。オブジェクトの形は interface、ユニオンや別名は type、程度の使い分けで十分です。

## ユニオンと絞り込み

```typescript
function format(value: string | number) {
  if (typeof value === "number") {
    return value.toFixed(2);       // ここでは number
  }
  return value.toUpperCase();      // ここでは string
}

function label(task: Task) {
  switch (task.status) {
    case "draft": return "下書き";
    case "published": return "公開";
    case "archived": return "保管";
  }                                // 漏れがあるとエラーにできる
}
```

`null` / `undefined` も型に含めて扱います。`user.email` が `string | undefined` なら、そのまま `.toLowerCase()` は呼べず、`user.email?.toLowerCase()` か if で絞ります。これが実行時の「undefined のプロパティを読めない」エラーを潰します。

## any と unknown

```typescript
let x: any = fetchSomething();    // 何をしても怒られない = 型チェック放棄
let y: unknown = fetchSomething();
if (typeof y === "string") y.toUpperCase();   // 絞り込んでから使う
```

`any` はエスケープハッチです。API のレスポンスなど型が分からないものは `unknown` で受け、検証してから使います。

## ジェネリクス

「型を引数にする」仕組みです。

```typescript
function first<T>(xs: T[]): T | undefined {
  return xs[0];
}
first([1, 2, 3]);        // number | undefined
first(["a", "b"]);       // string | undefined

type ApiResponse<T> = { data: T; error?: string };
const res: ApiResponse<User[]> = await fetchUsers();
```

React の `useState<User | null>(null)` もジェネリクスです。

## よく見る型

| 型 | 意味 |
|---|---|
| `string[]` / `Array<string>` | 配列 |
| `Record<string, number>` | 文字列キーの辞書 |
| `Partial<User>` | 全プロパティを省略可能に |
| `Pick<User, "id" \| "name">` | 一部だけ |
| `Promise<User>` | async 関数の戻り値 |
| `(e: Event) => void` | 関数の型 |

## まとめ

- 型は開発時のため。実行時には消える
- オブジェクトは interface / type、状態はリテラルのユニオン
- `undefined` を型に含めて絞り込む。これが一番バグを減らす
- `any` は使わない。分からないなら `unknown`
- 型を引数にするのがジェネリクス

## やってみる

**ゴール:** TypeScript のエラーを出して直す。

1. `mkdir tsdemo && cd tsdemo && npm init -y && npm i -D typescript && npx tsc --init`
2. `a.ts`:
   ```typescript
   type Status = "draft" | "published";
   interface User { id: number; name: string; email?: string }
   function label(s: Status) { return s === "draft" ? "下書き" : "公開"; }
   const u: User = { id: 1, name: "a" };
   console.log(u.email.toLowerCase());     // エラーになるはず
   label("deleted");                        // エラーになるはず
   ```
3. `npx tsc --noEmit` でエラー 2 件を読む
4. `u.email?.toLowerCase()` と `"draft"` に直して通す

**確認:** 実行前に undefined の可能性と不正な値が見つかった。
