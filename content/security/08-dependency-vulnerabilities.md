---
id: sec-08
title: 依存ライブラリの脆弱性と更新
summary: pip-audit / npm audit / Dependabot、ロックファイルと更新の習慣、サプライチェーン攻撃への基本的な備え
minutes: 10
---
## 依存は攻撃面

自分で書いたコードより、依存しているコードの方がはるかに多い。既知の脆弱性 (CVE) は公開されているので、攻撃者は「そのバージョンを使っているサイト」を探します。

## 監査ツール

| エコシステム | コマンド |
|---|---|
| Python | `pip-audit` (ロックや環境を CVE DB と照合) |
| Node | `npm audit` / `pnpm audit` |
| コンテナ | Artifact Registry / ECR のスキャン、`trivy image` |
| GitHub | Dependabot alerts (リポジトリの Security タブ) |

CI に入れて、High 以上で失敗させます。

```yaml
- run: uv run pip-audit
- run: npm audit --audit-level=high
```

## 更新の習慣

**小さく、頻繁に。** 半年放置してから上げると、何が壊れたか分からず、上げられなくなります。

- Dependabot / Renovate で週 1 回 PR を作らせる
- パッチ / マイナー: CI が緑ならまとめてマージ
- メジャー: CHANGELOG を読み、影響箇所を確認してから
- セキュリティ更新: 最優先。当日中
- ベースイメージ (`python:3.13-slim`) も定期的に再ビルド。OS パッケージの修正が入る

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/"
    schedule: { interval: "weekly" }
    groups:
      minor-and-patch: { update-types: ["minor", "patch"] }
  - package-ecosystem: "npm"
    directory: "/admin"
    schedule: { interval: "weekly" }
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
  - package-ecosystem: "docker"
    directory: "/api"
    schedule: { interval: "weekly" }
```

## ロックファイルとハッシュ

`uv.lock` / `package-lock.json` は全依存 (推移的なものも) のバージョンと **ハッシュ** を固定します。

- CI と本番で「同じもの」が入る
- レジストリ側で差し替えられたパッケージはハッシュ不一致で止まる
- 監査の対象が明確になる

ロックを必ずコミットし、`uv sync --frozen` / `npm ci` のようにロックどおりに入れるコマンドを CI で使います。

## サプライチェーン攻撃

パッケージそのものが悪意を持つケースです。

- **乗っ取り**: メンテナのアカウントが盗まれ、悪意ある版が公開される
- **タイポスクワッティング**: `requests` に似た `requessts` のような名前
- **依存の依存**: 直接使っていない深い所に混ざる

備え:

- 依存を増やしすぎない。「1 関数のために 1 パッケージ」を避ける
- 名前とダウンロード数、リポジトリを確認してから入れる
- GitHub Actions は `@v4` ではなく **commit SHA** で固定 (`actions/checkout@<sha>`)。タグは動かせる
- 自分がパッケージを公開する側なら 2FA と Trusted Publishing
- ビルドは CI で (手元の環境からの push を減らす)

## 脆弱性が出たときの判断

- 該当コードパスを本当に使っているか (使っていなくても上げるのが無難)
- 修正版があるか。無ければ回避策 (設定で無効化、入力制限)
- 公開サービスなら「悪用されているか」をログで確認

## まとめ

- 監査を CI に入れる (pip-audit / npm audit / イメージスキャン)
- 小さく頻繁に更新。Dependabot に PR を作らせる
- ロックとハッシュで固定し、ロックどおりに入れる
- 依存を減らし、名前を確認し、Actions は SHA 固定

## やってみる

**ゴール:** 自分のプロジェクトを監査し、Dependabot を有効にする。

1. Python: `uv add --dev pip-audit && uv run pip-audit` (uv なら `uv pip audit` 相当は無いので pip-audit を使う)。出た CVE の内容を 1 つ読む
2. Node (あれば): `npm audit` → `npm audit --audit-level=high` で終了コードが変わるのを見る
3. `.github/dependabot.yml`:
   ```yaml
   version: 2
   updates:
     - package-ecosystem: "pip"
       directory: "/"
       schedule: { interval: "weekly" }
     - package-ecosystem: "github-actions"
       directory: "/"
       schedule: { interval: "weekly" }
   ```
   をコミットし、Security タブで Dependabot alerts を有効化
4. CI に `uv run pip-audit` のステップを足す
5. わざと古いバージョン (`requests==2.25.0`) を入れて pip-audit が非 0 になるのを見て、戻す

**確認:** 監査コマンドが CI で走り、Dependabot の PR が来る状態になった。
