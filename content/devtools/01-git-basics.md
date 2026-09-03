---
id: dt-01
title: Git の基本
summary: コミット・ブランチ・リモート。毎日使う 10 個のコマンドと、困ったときの戻し方
minutes: 12
questions:
  - id: dt-l01-1
    difficulty: 1
    question: "変更をコミットに含めるための正しい順序は?"
    choices:
      - "git commit → git add"
      - "git add (ステージ) → git commit"
      - "git push → git commit"
      - "git add だけで記録される"
    answer: 1
    explanation: "add でステージングエリアに載せ、commit で記録する。add していない変更はコミットに入らない。"
  - id: dt-l01-2
    difficulty: 1
    question: "`git pull` は何をする?"
    choices:
      - "ローカルの変更をリモートに送る"
      - "リモートの変更を取得してローカルブランチに統合する (fetch + merge)"
      - "ブランチを作る"
      - "コミットを取り消す"
    answer: 1
    explanation: "pull = fetch (取得) + merge (統合)。送るのは push。"
  - id: dt-l01-3
    difficulty: 2
    question: "直前のコミットメッセージを書き間違えた。まだ push していない。"
    choices: ["git commit --amend", "git reset --hard", "git revert HEAD", "git push --force"]
    answer: 0
    explanation: "amend は直前のコミットを作り直す。push 済みのコミットを amend すると履歴がずれるので、その場合は新しいコミットで直す。"
  - id: dt-l01-4
    difficulty: 2
    question: "push 済みのコミットを取り消したい。安全なのは?"
    choices:
      - "git reset --hard で消して force push"
      - "git revert で「打ち消すコミット」を作って push"
      - "リポジトリを作り直す"
      - "ファイルを手で戻してコミット"
    answer: 1
    explanation: "revert は履歴を書き換えず、逆の変更を新しいコミットとして積む。共有済みの履歴を reset + force push で消すと他の人の作業と食い違う。"
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
