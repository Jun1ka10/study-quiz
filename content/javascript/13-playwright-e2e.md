---
id: js-13
title: Playwright で E2E テスト
summary: ブラウザを自動操作して主要導線を守る。ロケータ、待ち方、認証状態の再利用、CI での実行、壊れにくいテストの書き方
minutes: 12
---
## 何を守るか

ユニットテストは関数を、統合テストは API を守ります。E2E は「ユーザーが実際にできること」を守ります: ログインして、問題を解いて、結果が出る。数は少なく (5〜20 本)、主要導線だけ。

## セットアップ

```bash
npm init playwright@latest        # tests/、playwright.config.ts、ブラウザのダウンロード
npx playwright test               # 実行 (ヘッドレス)
npx playwright test --ui          # 対話的に見る
npx playwright codegen http://localhost:3000    # 操作を記録してコードを生成
```

Python 版もあります (`pip install playwright`、API はほぼ同じ)。

## テストの形

```typescript
import { test, expect } from "@playwright/test";

test("ログインして最初のレッスンを開ける", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "ログイン" }).click();
  await page.getByLabel("メールアドレス").fill("test@example.com");
  await page.getByLabel("パスワード").fill("password123");
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page.getByRole("heading", { name: "コース" })).toBeVisible();
  await page.getByRole("button", { name: /Python/ }).click();
  await expect(page).toHaveURL(/courses\/python/);
});
```

## ロケータ: 壊れにくい順

| 方法 | 例 | 壊れにくさ |
|---|---|---|
| ロール + 名前 | `getByRole("button", { name: "保存" })` | 高い (ユーザーが見るもの) |
| ラベル | `getByLabel("メールアドレス")` | 高い |
| テキスト | `getByText("保存しました")` | 中 |
| test id | `getByTestId("submit")` | 中 (実装に `data-testid` を足す) |
| CSS / XPath | `.btn-primary > span` | 低い (見た目の変更で壊れる) |

ロールとラベルで書くと、アクセシビリティも同時に良くなります。

## 待ち方

Playwright は **自動で待ちます**。`click()` は要素が現れて操作可能になるまで、`expect(...).toBeVisible()` は条件を満たすまで再試行します。

- `page.waitForTimeout(3000)` (固定待ち) は **使わない**。遅いし不安定
- 「API の応答を待つ」なら `await page.waitForResponse(/\/api\/attempts/)`
- 「要素が消えるのを待つ」は `expect(locator).toBeHidden()`

## 認証状態の再利用

毎テストでログインすると遅い。1 回ログインして状態 (Cookie / localStorage) を保存し、他のテストで読み込みます。

```typescript
// auth.setup.ts
setup("login", async ({ page }) => {
  await page.goto("/login"); ...
  await page.context().storageState({ path: ".auth/user.json" });
});
// playwright.config.ts: projects に setup を依存として、use: { storageState: ".auth/user.json" }
```

## テストデータ

- テスト用の DB / ユーザーを用意し、テスト前にリセットする (API か seed スクリプト)
- 本番に対して E2E を走らせない (書き込みが本番に入る)。ステージング環境に対して
- テスト同士が同じデータを触らない (ユーザーをテストごとに作る)

## CI で回す

```yaml
- uses: actions/setup-node@v4
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npx playwright test
- uses: actions/upload-artifact@v4
  if: failure()
  with: { name: playwright-report, path: playwright-report/ }
```

- PR で主要導線 (5 本程度、数分)、夜間に全部、と分けると PR が遅くならない
- 失敗時は **トレース** (`trace: "on-first-retry"`) とスクリーンショットを成果物に。ログだけでは原因が分からない
- 不安定なテスト (flaky) は放置しない。原因の大半は固定待ちと共有データ

## 何をテストするか

- 主要導線: 登録 → ログイン → 中心機能 → 結果
- 壊れたら売上・信用に直結する所 (決済、送信)
- ユニットで守れないもの (画面の組み合わせ、ルーティング、認証の流れ)
- 細かい表示や境界値はユニットテストへ (E2E は遅い)

## まとめ

- E2E は少数の主要導線。ロールとラベルで探す
- 固定待ちを使わない。自動待機と expect
- 認証状態は保存して再利用、データはテストごとに
- CI ではトレースを残す。flaky は直す

## やってみる

**ゴール:** このアプリ (公開 URL かローカル) に対して E2E を 2 本書き、CI で動かす。

1. `npm init playwright@latest` (TypeScript、tests/、GitHub Actions workflow を Yes)
2. `playwright.config.ts` の `baseURL` をこの学習アプリの URL に
3. テスト 1: ホームに「今日の復習」と「コース」が表示される
4. テスト 2: Python のカードをタップ → コース画面 → 最初のレッスンを開く → 「確認問題を解く」ボタンが見える。ロケータはロール / テキストで
5. `npx playwright test --ui` で動かし、わざと `page.waitForTimeout(5000)` を入れて遅くなるのを見て消す
6. `npx playwright codegen <URL>` で操作を記録し、生成されたロケータを自分のものと比べる
7. 生成された workflow を push して CI で緑になるのを確認

**確認:** 固定待ち無しで安定して通る。CI でも通った。
