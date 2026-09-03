---
id: step-14
title: "セキュリティを固める (ヘッダー、CORS、依存監査、最小権限の棚卸し)"
summary: "動いているものを攻撃者の目で見直し、穴を塞ぐ。チェックリストを Terraform とテストに落とす"
phase: "5. 仕上げ"
prereqs: [sec-07, sec-06, sec-01]
minutes: 90
---
## ゴール

「動く」から「守られている」へ。やったことは全部コードかテストに残し、二度と戻らないようにする。

## 手順

1. **ヘッダー**: API と admin のレスポンスに HSTS、`X-Content-Type-Options`、`Referrer-Policy`、admin には CSP (`script-src 'self'`) を付ける。`curl -I` で確認するテストを書く
2. **CORS**: `allow_origins` が明示リストであること、`*` が無いことをテストで固定
3. **依存監査**: `uv add --dev pip-audit` → CI に `uv run pip-audit` を足す。admin は `npm audit --audit-level=high`。Dependabot を有効化 (`.github/dependabot.yml`、週 1)
4. **IAM 棚卸し**: `gcloud projects get-iam-policy` を出力し、自分以外の Owner / Editor、既定サービスアカウントへの付与、使っていない SA を消す。Terraform 外の変更は plan で差分として見えるはず
5. **DB**: `app_user` で `DROP TABLE` が失敗することを確認。Cloud SQL の `require_ssl` を有効化
6. **秘密**: リポジトリ全体に `gitleaks` を掛け、CI にも入れる。ログに `Authorization` ヘッダーが出ていないことを Cloud Logging で確認
7. **レートリミット**: `/auth/login` を IP と email ごとに 5 回 / 分に制限 (`slowapi` など)。総当たりが止まることをテスト
8. **認可の再確認**: `GET /admin/*` を一般ユーザーのトークンで叩いて 403。他人の attempts を POST できない (RLS + user_id はトークンから)

## できたか確認

- `curl -I https://api.../healthz` に HSTS がある
- CI に pip-audit と gitleaks が入り、緑
- IAM に Owner は自分だけ、基本ロールを持つ SA が無い
- ログイン 6 回目が 429

## ここでの学び

セキュリティは一度やって終わりではなく、テストと CI に「戻らない仕組み」として残す。チェックリストは紙ではなくコードに。
