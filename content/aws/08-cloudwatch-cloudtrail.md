---
id: aws-08
title: CloudWatch と CloudTrail
summary: メトリクス・ログ・アラームの CloudWatch、API 監査の CloudTrail。EC2 のログを集めてアラートを出す
minutes: 12
---
## 役割の違い

| | CloudWatch | CloudTrail |
|---|---|---|
| 問い | 今どう動いているか | 誰がいつ何の API を呼んだか |
| 中身 | メトリクス、ログ、アラーム、ダッシュボード | API 呼び出しの監査記録 |
| 例 | CPU 80%、5xx が増えた、ログに ERROR | 誰が SG を開けたか、誰がバケットを公開したか |

GCP の Cloud Monitoring / Logging と 監査ログ に対応します。

## CloudWatch メトリクス

EC2、RDS、ALB は何もしなくてもメトリクスが出ます。

- EC2: `CPUUtilization`、`NetworkIn/Out`、`StatusCheckFailed`。**メモリとディスクは出ない** (エージェントが要る)
- RDS: `CPUUtilization`、`FreeableMemory`、`FreeStorageSpace`、`DatabaseConnections`
- ALB: `HTTPCode_Target_5XX_Count`、`TargetResponseTime`、`HealthyHostCount`、`RequestCount`

## CloudWatch エージェント (EC2)

メモリ、ディスク使用率、アプリのログファイルを送るにはエージェントを入れます。

```bash
sudo dnf install -y amazon-cloudwatch-agent
# /opt/aws/amazon-cloudwatch-agent/etc/config.json に メトリクス (mem, disk) と logs (収集するファイル) を書く
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json -s
```

```json
"logs": { "logs_collected": { "files": { "collect_list": [
  { "file_path": "/home/ec2-user/app/log/app.log", "log_group_name": "/app/web", "log_stream_name": "{instance_id}" },
  { "file_path": "/home/ec2-user/app/log/tasks.log", "log_group_name": "/app/tasks", "log_stream_name": "{instance_id}" }
]}}}
```

インスタンスのロールに `CloudWatchAgentServerPolicy` が必要です。systemd のログ (journald) も送れます。

## CloudWatch Logs

- **ロググループ** (アプリ単位) と **ログストリーム** (インスタンス単位)
- **Logs Insights** で検索・集計:
  ```
  fields @timestamp, @message
  | filter @message like /ERROR/
  | sort @timestamp desc
  | limit 50
  ```
  JSON で出していれば `filter level = "ERROR" and user_id = 42` のようにフィールドで絞れる
- **保持期間** を設定する (既定は無期限で課金が増え続ける)。30〜90 日
- **メトリクスフィルタ**: 「ERROR を含む行の数」をメトリクスにしてアラームに

## アラーム

```
メトリクス + 条件 (5 分間の平均 CPU > 80% が 2 期間連続) → SNS トピック → メール / Slack / PagerDuty
```

最初に入れる 5 本:

| 対象 | 条件 |
|---|---|
| ALB 5xx | 5 分で 10 件超 |
| ALB HealthyHostCount | 1 未満 |
| EC2 StatusCheckFailed | 1 以上 |
| RDS FreeStorageSpace | 2GB 未満 |
| ログの ERROR 数 | 5 分で 10 件超 |

通知先は **SNS トピック** を 1 つ作り、メールと Slack (Chatbot か Lambda) を購読させます。「鳴ったら対応するものだけ」の原則は GCP と同じです。

## CloudTrail

アカウント内の API 呼び出し (コンソール操作も API) を全部記録します。

- 管理イベント (リソースの作成・変更・削除) は既定で 90 日分がイベント履歴で見られる
- **証跡 (Trail)** を作ると S3 に永続保存でき、全リージョン・全アカウント (Organizations) をまとめられる
- データイベント (S3 のオブジェクト操作など) は別途有効化 (量が多い)

使い方:

- 「誰が SG を変えたか」: イベント名 `AuthorizeSecurityGroupIngress` で検索
- 「このアクセスキーは何に使われているか」: ユーザー名で検索 → 使われていなければ削除
- 「深夜に誰かが入ったか」: `ConsoleLogin` イベント

CloudTrail のログを CloudWatch Logs に流し、「ルートユーザーのログイン」「IAM ポリシー変更」にアラームを付けると、セキュリティ監視の最低限になります。

## 費用

CloudWatch は カスタムメトリクス数、ログの取り込み量、保持量、アラーム数で課金。ログの保持期間設定と、DEBUG を送らないことが効きます。CloudTrail の管理イベント (1 本目の証跡) は無料。

## まとめ

- CloudWatch = 今の状態 (メトリクス / ログ / アラーム)、CloudTrail = 誰が何をしたか
- EC2 のメモリ・ディスク・アプリログはエージェントで
- 保持期間を設定、ERROR をメトリクス化、アラームは SNS へ
- CloudTrail で SG 変更・ルートログイン・IAM 変更を監視

## やってみる

**ゴール:** アラームを 1 本作って鳴らし、CloudTrail で自分の操作を見つける。

1. SNS トピックを作り、自分のメールを購読 (確認メールのリンクを踏む)
2. CloudWatch → アラーム → 作成。EC2 があれば `CPUUtilization > 1` (すぐ鳴る値)、無ければ 課金の `EstimatedCharges > 0.01`。通知先に SNS
3. 数分待ってメールが来るのを確認し、閾値を現実的な値 (CPU 80%) に直す
4. CloudTrail → イベント履歴 で、いま行った `PutMetricAlarm` と `CreateTopic` を自分のユーザー名で見つける
5. Logs にロググループがあれば保持期間を 30 日に設定する

**確認:** アラームがメールに届いた。自分の操作が CloudTrail に残っていることを見た。
