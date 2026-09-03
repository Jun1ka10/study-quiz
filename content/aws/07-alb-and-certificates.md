---
id: aws-07
title: ロードバランサと証明書 (ALB / ACM / Route 53)
summary: ALB で HTTPS を終端し EC2 に流す。ACM の無料証明書、Route 53 の DNS、ヘルスチェックとターゲットグループ
minutes: 12
---
## 全体像

```
ユーザー ──HTTPS──▶ Route 53 (DNS) ──▶ ALB (443, ACM 証明書で TLS 終端) ──HTTP 8000──▶ EC2 (gunicorn)
                                                                        └──▶ EC2 (2 台目)
```

- **Route 53**: `app.example.com` → ALB の DNS 名 (ALIAS レコード)
- **ACM**: 証明書を無料で発行・自動更新。ALB に付ける
- **ALB**: HTTPS を受けて、ヘルスチェックに通った EC2 に HTTP で渡す
- EC2 は 443 を持たず、ALB からの 8000 (または 80) だけ受ける

## ALB の構成要素

| 要素 | 役割 |
|---|---|
| リスナー | どのポートで受けるか (443 HTTPS、80 は 443 へリダイレクト) |
| ルール | パスやホストで振り分け (`/api/*` → API のターゲットグループ) |
| ターゲットグループ | 転送先の集合 (EC2 群) とヘルスチェックの設定 |
| ヘルスチェック | `/healthz` を数秒ごとに叩き、失敗した台には流さない |

```
リスナー 443 ──ルール──▶ ターゲットグループ web (EC2 ×2, port 8000, healthcheck /healthz)
リスナー 80  ──▶ 301 → https://
```

## セキュリティグループの組み方

| SG | インバウンド |
|---|---|
| alb-sg | 443 from 0.0.0.0/0、80 from 0.0.0.0/0 |
| web-sg | 8000 from **alb-sg** (CIDR ではなく SG を参照) |
| db-sg | 5432 from **web-sg** |

「前段の SG から」で連鎖させると、IP が変わっても壊れず、直接アクセスの経路が無くなります。

## ACM で証明書

1. ACM で `app.example.com` (ワイルドカード `*.example.com` も可) をリクエスト
2. **DNS 検証**: 指示された CNAME を Route 53 に追加 (ボタン 1 つ)
3. 発行されたら ALB のリスナーに付ける
4. 更新は自動。期限切れの心配が無くなる

ACM の証明書は ALB / CloudFront / API Gateway にしか付けられません (EC2 に直接は不可)。EC2 で終端するなら Let's Encrypt + certbot。

## Route 53

- ホストゾーンを作り、レジストラ側のネームサーバーを Route 53 のものに向ける
- `app.example.com` は **ALIAS** レコードで ALB を指す (A レコードだが AWS リソースを名前で指せる。ALB の IP は変わるので CNAME 的に扱える)
- 切り替え前に TTL を短くしておくと戻しやすい

## ヘルスチェック

- パスは軽いもの (`/healthz`。DB まで確認するかは設計次第)
- 閾値: 2 回失敗で外す、2 回成功で戻す、間隔 10〜30 秒
- アプリの起動に時間がかかるなら、登録直後の猶予 (deregistration / slow start)

「ALB が 502 を返す」= 後ろの EC2 が応答していない (プロセスが落ちた、ポートが違う、SG で届かない)。「503」= ヘルシーなターゲットが 0。

## Django 側の設定

- `ALLOWED_HOSTS = ["app.example.com"]`
- ALB が TLS を終端すると Django には HTTP で届くので、`SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` を設定して「HTTPS で来た」と認識させる。無いと `request.is_secure()` が False で、リダイレクトループやセキュア Cookie が壊れる
- クライアント IP は `X-Forwarded-For` (ALB が付ける)

## 1 台構成でも ALB を置く理由

- 証明書の管理が ACM に任せられる
- 台を増やすとき、ローリングデプロイのときに前段を変えなくて済む
- WAF (Web Application Firewall) を ALB に付けられる

小さくても最初から ALB + ACM にしておくと、後で楽です。

## まとめ

- Route 53 (ALIAS) → ALB (443, ACM) → ターゲットグループ (EC2, ヘルスチェック)
- SG は前段参照で連鎖。EC2 は ALB からだけ
- Django は `SECURE_PROXY_SSL_HEADER`
- 502 は後ろが応答していない、503 はヘルシーが 0

## やってみる

**ゴール:** 既存の構成を読む (無ければ ACM とターゲットグループの画面を見る)。

1. EC2 → ロードバランサー → 対象を開き、リスナー (443 / 80) とルール、証明書 (ACM) を確認する
2. ターゲットグループ → ヘルスチェックのパス・閾値と、各ターゲットの Healthy / Unhealthy を見る
3. SG を alb-sg → web-sg → db-sg の順にたどり、「前段からだけ」になっているか、`0.0.0.0/0` が 443/80 以外に無いかを表にする
4. Route 53 で `app.example.com` のレコードタイプ (ALIAS か) と TTL を見る
5. ACM で証明書の有効期限と「更新の適格性」を確認する
6. 構成が無い場合: ACM で自分のドメインの証明書を DNS 検証で 1 枚発行してみる (無料)、または ALB を作らずにターゲットグループのヘルスチェック設定画面だけ眺める

**確認:** 502 / 503 が出たときにどの画面を見るかを言える。
