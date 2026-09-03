---
id: dt-02
title: ブランチと Pull Request の運用
summary: ブランチ戦略、PR の粒度と説明の書き方、レビューの観点、CI を必須にする設定、コンフリクトの解き方
minutes: 12
---
## 基本の流れ

```
main (常にデプロイ可能)
  └── feature/add-review-api  ← 作業はここ
        ↓ Pull Request (CI が回る、レビュー)
main に squash merge → 自動デプロイ
```

1. `main` から作業ブランチを切る
2. 小さくコミットしながら進める
3. PR を作る。CI が回り、人が読む
4. 指摘を直し、緑になったらマージ
5. ブランチは削除

`main` は「いつでも本番に出せる」状態を保ちます。壊れた変更を `main` に入れない仕組みが PR + CI です。

## ブランチの名前と寿命

- `feature/xxx`、`fix/xxx`、`chore/xxx` のように種類を付ける
- **寿命は数日**。1 週間を超えるブランチは、`main` との差が開いてコンフリクトが増える。大きい機能は、動く小さな PR に分けて順に入れる (フィーチャーフラグで隠す)
- 本番のホットフィックスも同じ流れ。`main` から切って PR。直接 push しない

## PR の粒度

**1 PR = 1 つの目的、レビューで 15 分以内に読める量** (目安 300 行以下)。

- 「リファクタリング」と「機能追加」は分ける
- 「フォーマットだけ」の変更は別 PR (差分が読めなくなる)
- 大きくなりそうなら、先に「土台の PR」(モデル・マイグレーション) → 「API の PR」 → 「画面の PR」

## PR の説明に書くこと

```markdown
## 何を
回答記録 API (POST /attempts) を追加

## なぜ
PWA の進捗をサーバーに同期するため (#42)

## どうやって
- attempts テーブルと review_schedule の UPSERT を 1 トランザクションで
- 間隔反復のロジックは srs.py に純粋関数として分離

## 確認したこと
- pytest 通過 (srs の境界値 6 ケース追加)
- ローカルで PWA から 5 問解いて DB に入ることを確認

## レビューしてほしい点
- UPSERT の ON CONFLICT の条件
```

「なぜ」が一番大事です。コードは何をしているか語りますが、なぜそうしたかは書かないと残りません。

## レビューの観点

レビューする側:

- **正しさ**: 仕様を満たすか、境界 (空、0、上限、同時実行) はどうか
- **安全**: 入力検証、認可、秘密の混入、SQL の組み立て
- **設計**: 変更が局所に収まっているか、テストしやすいか
- **読みやすさ**: 名前、関数の長さ
- 好みの指摘は「nit:」と明示し、ブロックしない

レビューされる側:

- 指摘には全部返事する (直した / 直さない理由)
- 大きな設計の議論になったら、PR のコメントではなく話す
- 指摘を人格の話にしない (どちらも)

## CI を必須にする (Branch protection)

リポジトリの Settings → Branches → `main` にルール:

- Require a pull request before merging (直接 push 禁止)
- Require status checks to pass (CI の job 名を指定)
- Require branches to be up to date (古い main で通った緑を信用しない)
- 1 人開発でも「PR 必須 + CI 必須」だけは入れる。自分のミスを機械が止める

## マージの方法

| 方法 | 履歴 | 向き |
|---|---|---|
| Squash and merge | PR が 1 コミットになる。main が読みやすい | 標準。おすすめ |
| Merge commit | 全コミットとマージコミットが残る | 履歴を細かく残したいとき |
| Rebase and merge | 直線の履歴。マージコミット無し | コミットを整えている人向け |

Squash なら、作業中のコミットは雑でよく、PR タイトルがコミットメッセージになります。

## コンフリクト

`main` が進んで自分の変更とぶつかったとき。

```bash
git fetch origin
git rebase origin/main          # 自分の変更を最新 main の上に載せ直す (または git merge origin/main)
# <<<<<<< / ======= / >>>>>>> を編集して解決
git add <file> && git rebase --continue
git push --force-with-lease     # 自分のブランチだけ。main には絶対しない
```

- 小さい PR を早くマージするのが最大の予防
- 同じファイルを長期間触り続けない
- `--force-with-lease` は「自分が知らない更新があれば止まる」安全な force

## まとめ

- main は常にデプロイ可能。作業はブランチ、入れるのは PR
- 1 PR 1 目的、300 行以下、寿命は数日
- 説明は「なぜ」。レビューは正しさ・安全・設計、nit は明示
- Branch protection で PR + CI を必須に。Squash merge

## やってみる

**ゴール:** Branch protection を入れ、壊れた PR がマージできないことを確かめる。

1. 自分のリポジトリ (CI がある dt-01 / infra-06 のもの) で Settings → Branches → Add rule: `main` に「Require a pull request」「Require status checks (CI の job 名)」「Require branches to be up to date」
2. `git switch -c fix/readme` で README を 1 行変え、PR を作る。説明を「何を / なぜ / 確認したこと」の 3 見出しで書く
3. CI が緑になったら Squash and merge。マージ後にブランチが削除されることを確認 (自動削除の設定も入れる)
4. もう 1 本 `feature/broken` で わざとテストを壊した PR を作り、マージボタンが押せないことを見る。閉じる
5. `main` に直接 `git push` してみて拒否されることを確認
6. `git log --oneline -5` で squash された 1 コミットを見る

**確認:** 壊れた変更が main に入らない仕組みが動いた。PR の説明に「なぜ」を書いた。
