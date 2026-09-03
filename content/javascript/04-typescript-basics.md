---
id: js-04
title: TypeScript の基本
summary: 型注釈、interface / type、ユニオン、ジェネリクス、any を避ける。Next.js のコードを読むための土台
minutes: 12
questions:
  - id: js-l04-1
    difficulty: 1
    question: "TypeScript を使う主な理由は?"
    choices:
      - "実行が速くなる"
      - "型の不整合をコンパイル時 (書いている時) に見つけられ、補完が効く"
      - "ブラウザが直接実行できる"
      - "JavaScript より短く書ける"
    answer: 1
    explanation: "TS はコンパイルすると素の JS になる。実行時の速さは変わらず、開発時のミス検出と補完が価値。"
  - id: js-l04-2
    difficulty: 1
    question: "`function f(user: { name: string; age?: number })` の `age?` の意味は?"
    choices: ["age は必須", "age は省略可能 (undefined でもよい)", "age は null", "文法エラー"]
    answer: 1
    explanation: "`?` で省略可能なプロパティ。値の型は `number | undefined` になる。"
  - id: js-l04-3
    difficulty: 2
    question: "`type Status = \"draft\" | \"published\"` に対して `const s: Status = \"deleted\"` は?"
    choices: ["通る", "コンパイルエラー", "実行時エラー", "警告のみ"]
    answer: 1
    explanation: "文字列リテラルのユニオン型。列挙した値以外は入れられないので、状態の取り違えを防げる。"
  - id: js-l04-4
    difficulty: 2
    question: "`any` を使うと何が起きる?"
    choices:
      - "何でも入るが、その値に対する型チェックが全部消える"
      - "速くなる"
      - "null が入らなくなる"
      - "エラーになる"
    answer: 0
    explanation: "any は「型チェックをやめる」宣言。型が分からないなら `unknown` にして、使う前に絞り込む。"
  - id: js-l04-5
    difficulty: 3
    question: "`function first<T>(xs: T[]): T | undefined` の `<T>` は?"
    choices:
      - "HTML タグ"
      - "ジェネリクス。呼び出し時の配列の要素型に合わせて戻り値の型が決まる"
      - "型を無視する指定"
      - "テンプレート文字列"
    answer: 1
    explanation: "`first([1, 2])` は number | undefined、`first([\"a\"])` は string | undefined。同じ関数を型を保ったまま使い回せる。"
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
