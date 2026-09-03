---
id: aws-03
title: EC2 と EBS (起動・SSH・cron で動かす)
summary: インスタンスの選び方、鍵と SSM、EBS のスナップショット、cron でバッチを回すときの作法。Django + EC2 構成の土台
minutes: 14
---
## EC2 とは

仮想サーバーです。OS を選び、サイズ (vCPU / メモリ) を決めて起動し、SSH で入って好きなものを動かします。Cloud Run のような「コンテナを渡すだけ」と違い、OS の管理 (パッチ、再起動、ディスク) は自分の仕事です。

## 起動時に決めること

| 項目 | 目安 |
|---|---|
| AMI (OS イメージ) | Amazon Linux 2023 か Ubuntu LTS |
| インスタンスタイプ | `t3.small` / `t3.medium` から。バーストで足りる Web なら t 系 |
| サブネット | Web サーバーはパブリック、それ以外はプライベート |
| セキュリティグループ | 22 は自分の IP か SSM 経由のみ、80/443 は ALB からのみ |
| IAM ロール | S3 や Secrets Manager を使うなら必ずロール (キーを置かない) |
| EBS | ルート 20〜30GB gp3。データは別ボリュームに |
| ユーザーデータ | 初回起動で実行するスクリプト (パッケージ導入など) |

## 入り方

```bash
ssh -i ~/.ssh/key.pem ec2-user@<public-ip>          # 鍵認証 (Amazon Linux は ec2-user、Ubuntu は ubuntu)
aws ssm start-session --target i-0123456789abcdef0    # SSM Session Manager (22 番を開けなくてよい)
```

SSM を使うと、セキュリティグループで 22 を閉じたまま入れて、誰がいつ入ったかが CloudTrail に残ります。新しく作るなら SSM を基本にします。

## アプリを置く定番の形

```
/home/ec2-user/app/          ← git clone
  .venv/ または poetry の環境
  .env                       ← 秘密 (600、コミットしない)
systemd: gunicorn.service    ← Web プロセスを常駐・自動再起動
nginx                        ← 80/443 を受けて gunicorn に渡す (ALB が前にいれば省略可)
crontab                      ← 定期処理
```

```ini
# /etc/systemd/system/app.service
[Unit]
After=network.target
[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/app
EnvironmentFile=/home/ec2-user/app/.env
ExecStart=/home/ec2-user/app/.venv/bin/gunicorn config.wsgi -b 127.0.0.1:8000 -w 3
Restart=always
[Install]
WantedBy=multi-user.target
```

`systemctl enable --now app` で起動と自動起動。ログは `journalctl -u app -f`。

## cron でバッチを回す

```cron
# crontab -e  (分 時 日 月 曜日)
* * * * * /usr/bin/flock -n /tmp/tasks.lock -c 'cd /home/ec2-user/app && .venv/bin/python manage.py run_scheduled_tasks >> log/tasks.log 2>&1'
0 6 * * * cd /home/ec2-user/app && .venv/bin/python manage.py daily_report >> log/daily.log 2>&1
```

作法:

- **フルパス** で書く (cron の PATH は貧弱)
- **`flock -n`** で多重起動を防ぐ (前回が終わっていないのに次が始まると壊れる)
- **ログを残す** (`>> file 2>&1`)。無いと失敗に気づけない
- タイムゾーンはサーバーの設定 (`timedatectl`)。UTC のまま 6 時と書くと 15 時 JST
- 失敗通知: 終了コードを見て Slack / メールに飛ばすラッパーを挟む。または CloudWatch Logs に送ってアラーム

EC2 が 1 台なら cron で十分ですが、複数台にすると「どの台で動かすか」問題が出ます。その段階で EventBridge Scheduler + Lambda / ECS タスクに移します。

## EBS

インスタンスに付くブロックストレージです。

- `gp3` を選ぶ (gp2 より安く速い)
- **スナップショット** を取れば復元できる。AWS Backup か Data Lifecycle Manager で日次自動化
- インスタンスを停止してもデータは残る。終了 (terminate) すると既定でルートボリュームは消える
- 容量は後から増やせる (`growpart` + `resize2fs`)。減らせない

## 落ちたときに備える

- **AMI を作っておく** (設定済みのイメージ)。同じものをすぐ立てられる
- ユーザーデータかスクリプトで構築を自動化し、手順書に頼らない
- 本当に落ちて困るなら、ALB の後ろに 2 台 + Auto Scaling。ただし DB とファイルは外 (RDS / S3) に出しておくのが前提

## まとめ

- EC2 は OS 管理が自分の仕事。SSM で入り、IAM ロールで権限
- Web は systemd で常駐、cron は flock + フルパス + ログ
- EBS は gp3、スナップショットを自動化
- 復旧は AMI と構築スクリプト。複数台にするなら状態を外へ

## やってみる

**ゴール:** EC2 を 1 台立て、SSM で入り、cron を 1 本仕込んで消す (無料枠の t3.micro なら数円)。

1. コンソールで Amazon Linux 2023、`t3.micro`、IAM ロールに `AmazonSSMManagedInstanceCore` を付けて起動 (キーペアは「なし」でよい)
2. `aws ssm start-session --target <instance-id>` で入る (22 番は開けていない)
3. `sudo dnf install -y python3.12`、`crontab -e` で `* * * * * date >> /tmp/cron.log` を登録。2 分後に `cat /tmp/cron.log`
4. `timedatectl` で TZ を見る。`sudo timedatectl set-timezone Asia/Tokyo`
5. コンソールで EBS のスナップショットを 1 つ手動で取る
6. インスタンスを終了し、スナップショットも削除する

**確認:** 22 番を開けずに入れた。cron が動きログに残った。TZ を JST にした。
