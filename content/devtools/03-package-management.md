---
id: dt-03
title: パッケージ管理 (poetry / uv / npm) とロックファイル
summary: 3 つのエコシステムに共通する考え方、npm の基本、更新の方針、CI と本番で「同じものを入れる」コマンド
minutes: 10
---
## 共通の 3 層

どのエコシステムでも同じ 3 つがあります。

| 層 | Python (uv / poetry) | Node (npm) | 役割 |
|---|---|---|---|
| 宣言 | `pyproject.toml` | `package.json` | 「欲しいもの」を範囲で |
| ロック | `uv.lock` / `poetry.lock` | `package-lock.json` | 解決結果を厳密に固定。**コミットする** |
| 実体 | `.venv/` | `node_modules/` | 入れたもの。**コミットしない** |

ロックが無いと「日によって違うものが入る」が起き、CI と本番と手元がずれます。

## コマンドの対応

| やりたいこと | uv | poetry | npm |
|---|---|---|---|
| 初期化 | `uv init` | `poetry init` | `npm init -y` |
| 依存を足す | `uv add fastapi` | `poetry add fastapi` | `npm install react` |
| 開発依存を足す | `uv add --dev pytest` | `poetry add --group dev pytest` | `npm install -D eslint` |
| ロック通りに入れる | `uv sync --frozen` | `poetry install --sync` | `npm ci` |
| 実行 | `uv run pytest` | `poetry run pytest` | `npm run test` / `npx eslint` |
| 更新 | `uv lock --upgrade-package x` | `poetry update x` | `npm update x` / `npm install x@latest` |
| 監査 | `pip-audit` | `pip-audit` | `npm audit` |

**CI と本番では「ロック通りに入れる」コマンド** (`--frozen` / `npm ci`) を使います。`npm install` はロックを書き換えることがあります。

## npm の基本

```json
{
  "name": "admin",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": { "next": "15.1.0", "react": "^19.0.0" },
  "devDependencies": { "typescript": "^5.6.0", "eslint": "^9.0.0" }
}
```

- `scripts` がタスクランナー。`npm run build`。README の手順はここに集約する
- `dependencies` は本番で必要、`devDependencies` は開発時だけ (ビルドツール、lint、テスト)。本番イメージでは `npm ci --omit=dev` (Next.js の standalone ビルドなら不要)
- `npx <cmd>` はプロジェクト内のバイナリを実行 (`npx eslint .`)
- `package-lock.json` をコミット、`node_modules/` は `.gitignore`

## バージョン範囲の記法

| 記法 | 意味 |
|---|---|
| `^1.2.3` | 1.x.x (メジャー固定)。npm の既定 |
| `~1.2.3` | 1.2.x |
| `1.2.3` | 固定 |
| `>=1.2,<2` | Python の書き方 |

セマンティックバージョニング (`major.minor.patch`) で、メジャーが上がると互換性が壊れ得る、が約束です (守られていないこともある)。

## 更新の方針

- **セキュリティ更新**: 即。Dependabot / `npm audit` / `pip-audit`
- **パッチ・マイナー**: 週次でまとめて。CI が緑ならマージ
- **メジャー**: 変更点を読み、影響を見て 1 つずつ。フレームワーク (Django / Next.js) は移行ガイドに従う
- 更新は **1 コミットに 1 パッケージ群**。壊れたときに戻せる

## モノレポと複数プロジェクト

`api/` (Python) と `admin/` (Node) が同居する場合、それぞれのディレクトリに宣言とロックを置きます。ルートに共通の `Makefile` か `justfile` で `make test` が両方を回すようにすると迷いません。

## トラブルの定番

- 「手元では動く」→ ロック通りに入れ直す (`rm -rf node_modules && npm ci`、`uv sync --frozen`)
- Node のバージョン違い → `.nvmrc` / `.node-version` にバージョンを書き、CI の `setup-node` にも同じ値
- Python のバージョン違い → `pyproject.toml` の `requires-python`、`.python-version`、uv なら `uv python pin 3.13`
- グローバルに `pip install` / `npm install -g` した → プロジェクトの仮想環境に入れ直す

## まとめ

- 宣言 / ロック / 実体。ロックはコミット、実体はしない
- CI と本番は `--frozen` / `npm ci`
- dev 依存は分けて本番に入れない
- 更新はセキュリティ即・小さく頻繁・メジャーは 1 つずつ

## やってみる

**ゴール:** npm でロックの役割を確かめ、CI 用コマンドを使い分ける。

1. `mkdir npmdemo && cd npmdemo && npm init -y && npm install -D eslint@9`
2. `package.json` と `package-lock.json` を開き、eslint 以外に何個のパッケージがロックされているか数える (`grep -c '"node_modules/' package-lock.json`)
3. `rm -rf node_modules && npm ci` で同じものが入る。`npm ls --depth=0`
4. `package.json` の `"eslint": "^9.0.0"` はそのまま、`package-lock.json` を消して `npm install` → ロックのバージョンが変わり得ることを確認 (最新の 9.x が入る)
5. `.nvmrc` に `22` を書き、`node -v` と比べる
6. `npm audit` を実行し、出力の読み方 (severity、影響パッケージ、fix 可否) を確認

**確認:** ロックがあれば同じものが入り、無ければ範囲内で変わる。CI では `npm ci` を使う理由が言える。
