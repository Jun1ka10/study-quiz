---
id: infra-04
title: cron と systemd timer
summary: 定期実行の書き方、多重起動防止、ログと失敗通知、タイムゾーン、systemd timer への置き換え、クラウドのスケジューラとの使い分け
minutes: 10
---
## cron の基本

```
# crontab -e
# 分 時 日 月 曜日  コマンド
0 6 * * *       /home/app/bin/daily.sh >> /home/app/log/daily.log 2>&1
*/5 * * * *     /usr/bin/flock -n /tmp/sync.lock /home/app/bin/sync.sh >> /home/app/log/sync.log 2>&1
0 3 * * 0       /home/app/bin/weekly.sh
```

| 書き方 | 意味 |
|---|---|
| `*/5 * * * *` | 5 分ごと |
| `0 6 * * *` | 毎日 6:00 |
| `0 3 * * 0` | 毎週日曜 3:00 |
| `0 0 1 * *` | 毎月 1 日 0:00 |
| `@reboot` | 起動時 |

`crontab -l` で一覧、`crontab -e` で編集。ユーザーごとに持ちます。システム全体は `/etc/cron.d/`。

## 落とし穴と作法

| 落とし穴 | 作法 |
|---|---|
| PATH が貧弱でコマンドが見つからない | **フルパス** で書く。仮想環境の python もフルパス |
| 環境変数が無い | crontab の先頭で定義するか、スクリプト内で `.env` を読む |
| 前回が終わる前に次が始まる | `flock -n` で多重起動を防ぐ |
| 失敗しても誰も気づかない | ログを残す (`>> log 2>&1`)。終了コードで通知 |
| タイムゾーン | サーバーの TZ (`timedatectl`)。UTC なら 6 時は 15 時 JST |
| `%` は改行扱い | `\%` でエスケープ (date のフォーマットなど) |
| 出力があるとメールが飛ぶ | リダイレクトするか `MAILTO=""` |

## 失敗に気づく

cron は失敗しても静かです。ラッパーで通知します。

```bash
#!/bin/bash
# run-and-notify.sh <名前> <コマンド...>
name=$1; shift
if ! "$@"; then
  curl -s -X POST "$SLACK_WEBHOOK" -d "{\"text\":\"cron 失敗: $name on $(hostname)\"}"
  exit 1
fi
```

もう 1 段上は「成功したら外部にハートビートを送る」(healthchecks.io など)。**動かなかった** ことにも気づけます。

## systemd timer

現代の Linux では cron の代わりに systemd の timer も使えます。

```ini
# /etc/systemd/system/daily.service
[Unit]
Description=daily job
[Service]
Type=oneshot
User=app
WorkingDirectory=/home/app
EnvironmentFile=/home/app/.env
ExecStart=/home/app/.venv/bin/python manage.py daily

# /etc/systemd/system/daily.timer
[Unit]
Description=run daily job
[Timer]
OnCalendar=*-*-* 06:00:00
Persistent=true          # 停止中に過ぎた分を起動後に実行
[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now daily.timer
systemctl list-timers          # 次回実行と前回結果
journalctl -u daily.service    # ログ
```

cron に対する利点: ログが journald に残る、環境変数と実行ユーザーを service に書ける、多重起動しない (service が動いていれば timer は待つ)、`Persistent` で取りこぼしを補う、依存関係 (`After=network.target`) を書ける。

## クラウドのスケジューラとの使い分け

| 場所 | 道具 | 向き |
|---|---|---|
| VM 1 台 | cron / systemd timer | 単純。台が消えると止まる |
| VM 複数台 | どれか 1 台で動かすと単一障害点。分散ロック (DB の advisory lock) が要る | 早めに次へ |
| サーバーレス | Cloud Scheduler + Cloud Run Job、EventBridge Scheduler + Lambda / ECS | 実行履歴と失敗通知が付く。マシン不要 |

「VM の cron」は最初の一手として十分ですが、台を増やす・VM を無くす段階で、スケジューラ + Job に移します。

## ジョブの中身の作法

- **冪等** に (2 回走っても壊れない)。再実行は必ず起きる
- 対象を「未処理」で選び、処理後にマークする。1 件ずつコミット
- 長い処理は進捗をログに。途中で落ちたときに続きから
- 実行時間を計測して残す。徐々に伸びていたら早めに気づける

## まとめ

- cron はフルパス、flock、ログ、TZ。失敗と「動かない」に気づく仕組み
- systemd timer はログ・環境・多重起動の面で cron より扱いやすい
- 複数台・サーバーレスになったらクラウドのスケジューラ + Job
- ジョブは冪等に

## やってみる

**ゴール:** systemd timer で 1 分ごとのジョブを動かし、cron との違いを見る。

1. `~/job.sh` に `date >> /tmp/job.log; sleep 90` (わざと 1 分より長い) を書いて実行権限
2. まず cron: `* * * * * /home/$USER/job.sh` を登録して 3 分待ち、`ps aux | grep job.sh` で **重なって** 走っているのを見る。`flock -n /tmp/job.lock` を付けて重ならなくなるのを確認。cron から外す
3. systemd: `~/.config/systemd/user/job.service` (Type=oneshot、ExecStart=/home/$USER/job.sh) と `job.timer` (`OnCalendar=*:*:00`) を書き、`systemctl --user daemon-reload && systemctl --user enable --now job.timer`
4. `systemctl --user list-timers` と `journalctl --user -u job.service -f` で、前回が終わるまで次が始まらないことを確認
5. `timedatectl` で TZ を確認し、`OnCalendar` が何時基準かを言えるようにする
6. `systemctl --user disable --now job.timer`

**確認:** cron は多重起動し、flock か systemd で防げた。timer の次回実行とログを systemctl / journalctl で見られた。
