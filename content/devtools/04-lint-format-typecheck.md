---
id: dt-04
title: ruff / eslint / 型チェック
summary: フォーマッタと linter の違い、設定の置き方、pre-commit、CI で落とす、既存コードへの段階的な導入
minutes: 10
---
## 3 つの道具

| 道具 | 何をする | Python | TypeScript |
|---|---|---|---|
| フォーマッタ | 見た目を機械的に揃える (インデント、改行、クォート) | `ruff format` | `prettier` |
| linter | 怪しいコードを検出 (未使用、バグの温床、複雑すぎ) | `ruff check` | `eslint` |
| 型チェッカー | 型の不整合を検出 | `mypy` / `pyright` | `tsc --noEmit` |

フォーマットは **議論しない**。道具に任せて、レビューは中身に集中します。

## ruff (Python)

linter とフォーマッタが 1 つになっていて速い。

```toml
# pyproject.toml
[tool.ruff]
line-length = 120
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM"]   # pycodestyle, pyflakes, isort, bugbear, pyupgrade, simplify
ignore = ["E501"]                             # 行長はフォーマッタに任せる

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["S101"]                          # テストでは assert を許す
```

```bash
uv run ruff format .          # 整形
uv run ruff check . --fix     # 自動修正できるものは直す
uv run ruff check .           # CI ではこれ (直さず失敗させる)
```

`B` (bugbear) は「ミュータブルなデフォルト引数」「except の握りつぶし」など実バグを拾います。`I` で import が並びます。

## eslint + prettier (TypeScript)

```bash
npm i -D eslint prettier typescript eslint-config-next    # Next.js なら create-next-app が入れる
npx eslint .
npx prettier --check .        # CI
npx prettier --write .        # 手元
npx tsc --noEmit              # 型チェックだけ (ビルドしない)
```

- Next.js の `next lint` / `next build` は eslint と型チェックを含む
- `react-hooks/exhaustive-deps` の警告は無視しない (useEffect のレッスン)
- prettier と eslint の整形ルールが衝突するので `eslint-config-prettier` で eslint 側の整形ルールを切る

## 型チェック

- Python: `mypy` か `pyright`。まず `--ignore-missing-imports` で始め、`| None` の見落としを拾うだけでも価値がある。段階的に `strict` へ
- TypeScript: `tsconfig.json` の `"strict": true` を最初から。後から入れると数百のエラーになる

## エディタで即時に

VS Code の拡張 (Ruff、ESLint、Prettier、Pylance) を入れ、**保存時に整形** を有効化します。CI で落ちる前に手元で直るのが一番速い。

```json
// .vscode/settings.json (リポジトリにコミットしてチームで揃える)
{
  "editor.formatOnSave": true,
  "[python]": { "editor.defaultFormatter": "charliermarsh.ruff" },
  "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

## pre-commit

コミット前に自動で走らせます。

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.0
    hooks:
      - id: gitleaks
```

`uv add --dev pre-commit && uv run pre-commit install`。以後 `git commit` のたびに走り、失敗するとコミットされません。秘密の検出 (gitleaks) をここに入れると「push した時点で漏れる」を防げます。

## CI で落とす

```yaml
- run: uv run ruff format --check .
- run: uv run ruff check .
- run: uv run mypy src/
- run: npx prettier --check . && npx eslint . && npx tsc --noEmit
```

「警告」ではなく **失敗** にします。警告は誰も見ません。

## 既存コードへの導入

一度に全部直すと巨大な差分になります。

1. フォーマッタを 1 回だけ全体に掛けて **単独のコミット** にする (`git blame` で飛ばせるよう `.git-blame-ignore-revs` に登録)
2. linter は既存の違反を `ignore` か `per-file-ignores` で一旦許し、新規コードだけ厳しくする
3. 触ったファイルから順に違反を減らす。ルールを 1 つずつ有効化

## まとめ

- フォーマットは道具に任せ議論しない。linter は実バグを拾うルール (B など) を入れる
- 型チェックは `strict` を早めに。Python は `| None` の検出から
- エディタで保存時、pre-commit でコミット時、CI で最終防衛
- 既存コードはフォーマットを 1 コミットで、ルールは段階的に

## やってみる

**ゴール:** ruff が実バグを拾うのを見て、pre-commit で止まる体験をする。

1. 任意の Python プロジェクトで `bad.py`:
   ```python
   import os, sys
   def f(x, acc=[]):
       try:
           return int(x)
       except:
           pass
   ```
2. `uv run ruff check bad.py` で出る指摘 (B006 ミュータブル既定値、E722 裸の except、F401 未使用 import など) を読む。`--fix` で直るものと直らないものを見る
3. `uv run ruff format bad.py` で整形される
4. `uv add --dev pre-commit`、上の `.pre-commit-config.yaml` を置いて `uv run pre-commit install`
5. `bad.py` を `git add` してコミットしようとして止まるのを見る。直してコミット
6. `.vscode/settings.json` に formatOnSave を入れ、保存で整形されるのを確認

**確認:** linter がバグの温床を指摘した。コミット前に自動で止まった。
