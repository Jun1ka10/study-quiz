---
id: aws-01
title: AWS の全体像と IAM の最初の一歩
summary: リージョン・AZ・アカウントの構造と、ルートユーザーを封印して IAM で作業する理由
minutes: 10
exercise: |
  **ゴール:** IAM ポリシーを読み、ロールの仕組みをコンソールで確認する (課金なし)。

  1. AWS コンソール → IAM → ポリシー → `AmazonS3ReadOnlyAccess` を開き、JSON タブで Action と Resource を読む
  2. 自分のユーザー → 「アクセス許可」と「セキュリティ認証情報」。アクセスキーがあるか、MFA が有効かを確認
  3. IAM → ロール → 何か 1 つ開き、「信頼関係」タブで「誰が引き受けられるか」(`Principal`) を読む
  4. ルートユーザーの MFA が有効かを「セキュリティ認証情報」で確認

  **確認:** ポリシーの Effect / Action / Resource を指せる。ロールの信頼ポリシーとアクセス許可ポリシーの違いが分かる。
questions:
  - id: aws-l01-1
    difficulty: 1
    question: "AZ (アベイラビリティゾーン) とは?"
    choices:
      - "国単位の区分"
      - "リージョン内で物理的に分離された 1 つ以上のデータセンター群"
      - "VPC のサブネット"
      - "課金の単位"
    answer: 1
    explanation: "リージョン (例: 東京) の中に複数の AZ があり、AZ をまたいで配置すると 1 つのデータセンター障害に耐えられる。"
  - id: aws-l01-2
    difficulty: 1
    question: "ルートユーザーの扱いとして正しいのは?"
    choices:
      - "日常作業に使う"
      - "MFA を有効化し、日常作業には使わない"
      - "アクセスキーを発行して CI に使う"
      - "削除する"
    answer: 1
    explanation: "ルートは全権限を持ち制限できない。MFA を付けて封印し、作業は IAM ユーザー / IAM Identity Center で行う。"
  - id: aws-l01-3
    difficulty: 2
    question: "EC2 上のアプリから S3 にアクセスさせたい。推奨される方法は?"
    choices:
      - "IAM ユーザーのアクセスキーをコードに埋め込む"
      - "IAM ロールを作って EC2 にアタッチする"
      - "ルートユーザーのキーを環境変数に置く"
      - "S3 バケットを公開する"
    answer: 1
    explanation: "ロールは一時クレデンシャルを自動で配るので、キーの漏洩やローテーションの問題が無い。AWS 上のリソースには常にロールを使う。"
  - id: aws-l01-4
    difficulty: 2
    question: "IAM ポリシーで、明示的な Deny と Allow が両方当たるときの結果は?"
    choices: ["Allow が勝つ", "Deny が勝つ", "後に書いた方が勝つ", "エラーになる"]
    answer: 1
    explanation: "評価順は「明示的 Deny > 明示的 Allow > 暗黙の Deny」。何も書かれていなければ拒否。"
---
## 地理的な構造

- **リージョン**: 地理的な拠点。東京 (`ap-northeast-1`)、大阪、バージニア北部など。多くのリソースはリージョンに属する
- **アベイラビリティゾーン (AZ)**: リージョン内の独立したデータセンター群。`ap-northeast-1a` のように末尾の文字で区別する

可用性が要るものは **複数 AZ に置く** のが基本です。1 つの AZ が落ちてもサービスが続きます。

## アカウントとルートユーザー

AWS アカウントを作ると **ルートユーザー** ができます。全権限を持ち、権限を制限できません。だから

1. MFA (多要素認証) を必ず有効化する
2. アクセスキーは作らない
3. 日常作業には使わない

が最初の 3 つのルールです。

## IAM: 誰が何をできるか

IAM (Identity and Access Management) は AWS の権限管理の中核です。

| 要素 | 役割 |
|---|---|
| ユーザー | 人間用のアイデンティティ。パスワードやアクセスキーを持つ |
| グループ | ユーザーをまとめてポリシーを付ける |
| ロール | 「引き受ける」アイデンティティ。EC2 / Lambda / 別アカウントが一時的な権限を得る |
| ポリシー | 何を許可 / 拒否するかを JSON で書いたもの |

## ポリシーの読み方

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:ListBucket"],
    "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"]
  }]
}
```

- **Effect**: Allow か Deny
- **Action**: `サービス:操作`
- **Resource**: 対象の ARN (Amazon Resource Name)

評価ルールは「**明示的 Deny が最優先、次に Allow、何も無ければ拒否**」です。

## ロールを使う理由

アプリケーションに IAM ユーザーのアクセスキーを持たせると、漏洩とローテーションの問題がついて回ります。EC2 や Lambda には **ロールをアタッチ** すれば、一時クレデンシャルが自動で配られ、SDK はそれを勝手に使います。

- EC2 → インスタンスプロファイル (ロール)
- Lambda → 実行ロール
- 別アカウントからのアクセス → クロスアカウントロール

## 最小権限

「とりあえず AdministratorAccess」は避けます。必要な Action と Resource だけを書き、足りなければ足す。IAM Access Analyzer や CloudTrail を見れば、実際に使われた権限が分かります。

## まとめ

- 可用性はマルチ AZ
- ルートは MFA で封印して使わない
- AWS 上のリソースには常にロール。キーを埋め込まない
- 明示的 Deny > Allow > 暗黙の Deny
