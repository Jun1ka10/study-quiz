---
id: dt-01
title: Git の基本
summary: コミット・ブランチ・リモート。毎日使う 10 個のコマンドと、困ったときの戻し方
minutes: 12
---
## Git の 3 つの場所

```
作業ディレクトリ ──add──▶ ステージ ──commit──▶ リポジトリ (履歴) ──push──▶ リモート (GitHub)
```

- **作業ディレクトリ**: 実際に編集しているファイル
- **ステージ**: 次のコミットに入れるものを選ぶ場所
- **リポジトリ**: コミット (スナップショット) の履歴
- **リモート**: GitHub 上のコピー

## 毎日使うコマンド

```bash
git status                  # 何が変わっているか。迷ったらまずこれ
git diff                    # 変更の中身
git add -A                  # 全部ステージ (特定ファイルなら git add path)
git commit -m "メッセージ"
git log --oneline -10       # 履歴
git pull                    # リモートの変更を取り込む
git push                    # リモートへ送る
```

## ブランチ

作業は必ずブランチで行い、`main` には Pull Request 経由で入れます。

```bash
git switch -c feature/add-login   # 作って移動
git switch main                   # 移動
git branch                        # 一覧
git push -u origin feature/add-login   # 初回 push (以降は git push)
```

`main` は「いつでもデプロイできる状態」に保つのが原則です。

## 困ったときの戻し方

| 状況 | コマンド | 注意 |
|---|---|---|
| ファイルの変更をなかったことに | `git restore path` | 変更は消える |
| add を取り消す | `git restore --staged path` | ファイルはそのまま |
| 直前のコミットを直す (未 push) | `git commit --amend` | push 済みならやらない |
| push 済みのコミットを打ち消す | `git revert <hash>` | 履歴を消さず、逆の変更を積む |
| 作業を一時退避 | `git stash` / `git stash pop` | ブランチを切り替える前に |

**`reset --hard` と `push --force` は共有ブランチでは使わない**。自分だけのブランチなら可。

## コミットの粒度とメッセージ

- 1 コミット = 1 つの意味のある変更 (「ログイン画面追加」と「typo 修正」は分ける)
- メッセージは「何を・なぜ」。1 行目は 50 文字程度、詳細は空行の後
- 動かない状態でコミットしない

## .gitignore

`.venv/`、`node_modules/`、`__pycache__/`、`.env` (秘密情報!) は必ず除外します。一度コミットした秘密情報は履歴に残るので、漏れたら鍵を無効化するしかありません。

## まとめ

- add → commit → push。迷ったら `git status`
- 作業はブランチで、main は PR 経由
- 未 push は amend、push 済みは revert
- `.env` はコミットしない

## やってみる

**ゴール:** ブランチ、amend、revert を安全な場所で一通りやる。

1. `mkdir gitdemo && cd gitdemo && git init && echo a > f && git add -A && git commit -m "first"`
2. `git switch -c feature`、`echo b >> f && git commit -am "add b"`、メッセージを `git commit --amend -m "add line b"` で直して `git log --oneline`
3. `git switch main && git merge feature`
4. `echo c >> f && git commit -am "add c"` → `git revert HEAD` → `cat f` と `git log --oneline` で打ち消しコミットを見る
5. `echo tmp >> f && git stash && git status && git stash pop`

**確認:** amend は履歴を書き換え、revert は積む。stash で退避できる。
