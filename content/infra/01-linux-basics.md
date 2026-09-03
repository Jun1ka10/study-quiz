---
id: infra-01
title: Linux の基本操作
summary: ファイル・プロセス・権限・サービス。サーバーに入って最初にやることを身につける
minutes: 12
questions:
  - id: infra-l01-1
    difficulty: 1
    question: "ディスクの空き容量を確認するコマンドは?"
    choices: ["du", "df -h", "free -h", "top"]
    answer: 1
    explanation: "df はファイルシステム単位の空き容量。du はディレクトリの使用量。free はメモリ。"
  - id: infra-l01-2
    difficulty: 1
    question: "`chmod 644 file` の意味は?"
    choices:
      - "所有者: 読み書き / グループ: 読み / その他: 読み"
      - "全員: 読み書き実行"
      - "所有者のみ読み書き実行"
      - "所有者: 読み / グループ: 読み書き / その他: なし"
    answer: 0
    explanation: "r=4, w=2, x=1。6=rw-, 4=r--, 4=r--。秘密鍵は 600 (所有者だけ rw)。"
  - id: infra-l01-3
    difficulty: 2
    question: "systemd で nginx を「今すぐ起動し、OS 再起動後も自動起動する」には?"
    choices:
      - "systemctl start nginx"
      - "systemctl enable --now nginx"
      - "systemctl restart nginx"
      - "service nginx boot"
    answer: 1
    explanation: "start は今だけ、enable は起動時の自動起動。`enable --now` で両方。"
  - id: infra-l01-4
    difficulty: 2
    question: "ログファイルの末尾を追いかけながら表示するには?"
    choices: ["cat -f app.log", "tail -f app.log", "head -f app.log", "less app.log"]
    answer: 1
    explanation: "`tail -f` で追記を待ち続ける。systemd のサービスなら `journalctl -u nginx -f`。"
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
