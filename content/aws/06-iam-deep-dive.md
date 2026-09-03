---
id: aws-06
title: IAM を深く (ポリシーの読み方・ロールの設計)
summary: ポリシー評価の順序、Condition、信頼ポリシーとアクセス許可ポリシー、クロスアカウント、Access Analyzer で使われていない権限を削る
minutes: 14
---
## ポリシーの構造をもう一度

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOwnBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-app-media/*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "ap-northeast-1" } }
    }
  ]
}
```

| 要素 | 意味 |
|---|---|
| Effect | Allow / Deny |
| Action | `サービス:操作`。`s3:Get*` のようなワイルドカード可 |
| Resource | ARN。`*` は全部 |
| Condition | 条件。IP、リージョン、タグ、MFA の有無など |
| Principal | (リソースベースポリシーのみ) 誰に対して |

## 評価の順序

1. **明示的 Deny** があれば拒否 (何があっても)
2. **明示的 Allow** があれば許可
3. どちらも無ければ **暗黙の Deny**

複数のポリシー (ユーザーに付いたもの、グループのもの、リソースのもの、SCP、Permissions Boundary) は全部合わせて評価されます。Deny はどこにあっても勝ちます。「なぜか AccessDenied」は、どこかの Deny か、境界 (SCP / Boundary) で許可されていないか、です。

## ポリシーの種類

| 種類 | 付ける先 | 例 |
|---|---|---|
| アイデンティティベース | ユーザー / グループ / ロール | 「この SA は S3 を読める」 |
| リソースベース | S3 バケット、SQS、Lambda など | 「このバケットは別アカウントの X が読める」 |
| 信頼ポリシー | ロール | 「誰がこのロールを引き受けられるか」 |
| SCP | Organizations の OU | 「このアカウント群ではこのリージョンしか使えない」 |
| Permissions Boundary | ユーザー / ロール | 「この人がどう頑張っても超えられない上限」 |

## ロール = 信頼ポリシー + アクセス許可ポリシー

```json
// 信頼ポリシー: EC2 が引き受けられる
{ "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" }

// 信頼ポリシー: 別アカウントの特定ロールが引き受けられる (クロスアカウント)
{ "Effect": "Allow", "Principal": { "AWS": "arn:aws:iam::111122223333:role/deploy" }, "Action": "sts:AssumeRole",
  "Condition": { "StringEquals": { "sts:ExternalId": "shared-secret" } } }

// 信頼ポリシー: GitHub Actions (OIDC)
{ "Effect": "Allow", "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": { "StringLike": { "token.actions.githubusercontent.com:sub": "repo:owner/repo:ref:refs/heads/main" } } }
```

「誰が引き受けられるか」と「引き受けたら何ができるか」は別のポリシーです。ロールが動かないときは両方を見ます。

## よく使う Condition

```json
"Condition": {
  "Bool":         { "aws:MultiFactorAuthPresent": "true" },          // MFA 必須
  "IpAddress":    { "aws:SourceIp": "203.0.113.0/24" },              // オフィスからのみ
  "StringEquals": { "aws:PrincipalTag/team": "platform" },           // タグで絞る
  "StringLike":   { "s3:prefix": "users/${aws:username}/*" }         // 自分のフォルダだけ
}
```

## 最小権限に近づける手順

1. まず必要そうな Action を書く (AWS 管理ポリシーの `ReadOnlyAccess` などから始めてもよい)
2. 動かす
3. **IAM Access Analyzer の「未使用のアクセス」** と **CloudTrail** で、実際に使われた Action を見る
4. 使われていないものを削る。`*` を具体名に置き換える
5. Resource を `*` から特定 ARN に絞る

「動かなくなるのが怖い」ときは、Deny ではなく **ポリシーシミュレータ** で試せます。

## 人の管理

- **IAM Identity Center (SSO)** で、社内の ID プロバイダからログインし、アカウント × 権限セットを割り当てる。IAM ユーザーを人ごとに作らない
- 権限セットは「閲覧」「開発」「管理」の 3 段階程度から
- IAM ユーザーが必要な場合 (CI など) でも、鍵は使わず OIDC を優先。作った鍵は 90 日でローテーション

## 監査

- **CloudTrail** に全 API 呼び出しが残る。「誰が S3 のバケットポリシーを変えたか」を追える
- **Access Analyzer** は「外部からアクセスできるリソース」(公開バケット、他アカウントに開いたロール) を検出する。オンにしておく
- **Credential Report** で鍵の年齢と MFA の有無を一覧

## まとめ

- Deny > Allow > 暗黙 Deny。複数ポリシーは合算
- ロールは信頼ポリシー (誰が) + 許可ポリシー (何を)
- Condition で MFA、IP、タグ、自分のフォルダ
- 使われた Action を見て削る。人は SSO、機械は OIDC

## やってみる

**ゴール:** ポリシーシミュレータとポリシーの読み書きで、Resource の絞り込みを体感する。

1. IAM → ポリシー → 作成 (JSON) で、`s3:GetObject` を `arn:aws:s3:::demo-bucket/*` に Allow するだけのポリシーを作る (`demo-bucket` は架空でよい)
2. テスト用ロールを作り、信頼ポリシーは EC2、上のポリシーを付ける
3. IAM ポリシーシミュレータ (コンソールの「アクセス許可のシミュレート」) で、そのロールに対して `s3:GetObject` を `demo-bucket/a.txt` と `other-bucket/a.txt` で試し、片方だけ Allow になるのを見る
4. `s3:ListBucket` を `demo-bucket` で試して Deny を確認。Resource を `arn:aws:s3:::demo-bucket` にした Statement を足して Allow にする
5. Access Analyzer を有効化し、自分のアカウントの検出結果を見る
6. テスト用のロールとポリシーを削除

**確認:** Resource の ARN の違いで結果が変わった。信頼ポリシーと許可ポリシーが別物だと分かった。
