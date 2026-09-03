---
id: infra-01
title: Linux の基本操作
summary: ファイル・プロセス・権限・サービス。サーバーに入って最初にやることを身につける
minutes: 12
---
## ファイルとディレクトリ

```bash
pwd                 # 今いる場所
ls -la              # 隠しファイルと詳細を含めて一覧
cd /var/log         # 移動
cat file            # 全部表示
less file           # ページ送りで表示 (q で終了)
tail -n 100 file    # 末尾 100 行
tail -f file        # 追記を追いかける
grep -r "ERROR" .   # 文字列検索
find . -name "*.log"
cp / mv / rm        # コピー / 移動 (改名) / 削除
mkdir -p a/b/c      # 途中のディレクトリも作る
```

## プロセス

```bash
ps aux              # 全プロセス
ps aux | grep nginx
top                 # リアルタイムの負荷 (q で終了)
kill <PID>          # 終了要求 (SIGTERM)
kill -9 <PID>       # 強制終了。最後の手段
```

## リソース確認

```bash
df -h               # ディスクの空き
du -sh /var/log/*   # ディレクトリごとの使用量
free -h             # メモリ
uptime              # 稼働時間とロードアベレージ
```

「ディスクが一杯で動かない」は最も多い障害の 1 つです。`df -h` → `du -sh` で犯人を探します。

## 権限

`ls -l` の先頭 `-rw-r--r--` は、所有者 / グループ / その他 の順に r (読み) w (書き) x (実行) を表します。

| 数字 | 意味 |
|---|---|
| 7 | rwx |
| 6 | rw- |
| 5 | r-x |
| 4 | r-- |

```bash
chmod 644 file      # 所有者 rw、他は r
chmod 600 ~/.ssh/id_ed25519   # 秘密鍵は所有者以外読めないように
chmod +x script.sh  # 実行権限を付ける
chown user:group file
sudo <command>      # 管理者権限で実行
```

## systemd でサービスを管理する

現代の Linux はほぼ systemd です。

```bash
systemctl status nginx      # 状態
systemctl start nginx       # 起動
systemctl stop nginx
systemctl restart nginx
systemctl enable nginx      # OS 起動時に自動起動
systemctl enable --now nginx   # 自動起動 + 今すぐ起動
journalctl -u nginx -f      # そのサービスのログを追う
```

サービスの定義は `/etc/systemd/system/*.service` にあり、書き換えたら `systemctl daemon-reload` が要ります。

## まとめ

- 迷ったら `ls -la`、`df -h`、`ps aux`、`tail -f`
- 権限は 3 桁の数字で覚える。秘密鍵は 600
- サービスは systemctl、ログは journalctl

## やってみる

**ゴール:** サーバーに入ったときの最初の 5 分を手で再現する。

1. 手元の Linux (SSH 先でも WSL でも) で:
   ```bash
   uptime; df -h; free -h; ps aux --sort=-%mem | head -5
   sudo systemctl status ssh   # 無ければ cron や docker
   journalctl -u ssh -n 20 --no-pager
   ls -la ~/.ssh; stat -c "%a %n" ~/.ssh/*
   ```
2. `touch t && chmod 600 t && ls -l t`、`chmod 644 t && ls -l t` で表示の変化を見る
3. `du -sh /var/log/* 2>/dev/null | sort -h | tail -3` で大きいログを探す

**確認:** `.ssh` の秘密鍵が 600 になっている (なっていなければ直す)。
