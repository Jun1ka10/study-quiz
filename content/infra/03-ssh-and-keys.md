---
id: infra-03
title: SSH と鍵認証
summary: 鍵ペアの作り方、authorized_keys、~/.ssh/config、ポートフォワード、踏み台と agent forwarding、鍵の管理
minutes: 12
---
## 仕組み

SSH の公開鍵認証は、**秘密鍵 (手元) と公開鍵 (サーバー)** のペアで本人確認します。

- サーバーの `~/.ssh/authorized_keys` に公開鍵を置く
- 接続時、サーバーが「この公開鍵に対応する秘密鍵を持っているか」を署名で確認する
- 秘密鍵はネットワークに流れない。パスワードと違い総当たりが効かない

パスワード認証は無効化し、鍵だけにします (`/etc/ssh/sshd_config` の `PasswordAuthentication no`)。

## 鍵を作る

```bash
ssh-keygen -t ed25519 -C "you@example.com"      # ~/.ssh/id_ed25519 (秘密) と id_ed25519.pub (公開)
```

- **ed25519** を選ぶ (短く速く安全)。RSA なら 4096
- パスフレーズを付ける。秘密鍵ファイルが盗まれても即使われない
- 秘密鍵は `600`、`.ssh` は `700`。緩いと SSH が拒否する
- 秘密鍵は **コピーしない**。マシンごとに作り、公開鍵を登録する

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@host   # 公開鍵をサーバーに登録
# または手で: cat id_ed25519.pub >> ~/.ssh/authorized_keys (サーバー側)
```

GitHub にも同じ公開鍵を登録すれば、`git push` が鍵で通ります。

## ~/.ssh/config

接続先ごとの設定を書き、`ssh claude-dev` のように短く呼べます。

```
Host claude-dev
    HostName 203.0.113.10
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519
    LocalForward 8765 localhost:8765      # 常にポートフォワード

Host prod-bastion
    HostName bastion.example.com
    User ec2-user

Host prod-app
    HostName 10.0.10.5                    # プライベート IP
    User ec2-user
    ProxyJump prod-bastion                # 踏み台経由で直接繋ぐ
```

`ProxyJump` があれば、踏み台に入ってからもう一度 ssh、をしなくて済みます。

## ポートフォワード

```bash
ssh -L 5433:db.internal:5432 prod-bastion    # 手元の 5433 → 踏み台経由で DB の 5432
psql -h localhost -p 5433 ...
ssh -L 8765:localhost:8765 claude-dev        # リモートで動く開発サーバーを手元のブラウザで
ssh -D 1080 prod-bastion                     # SOCKS プロキシ (ブラウザ全体を踏み台経由に)
```

「プライベートな DB に手元から繋ぐ」「リモートの開発サーバーを見る」はこれで足り、ポートを外に開ける必要がありません。

## 踏み台と agent forwarding

踏み台 (bastion) から先のサーバーに入るとき、秘密鍵を踏み台に **置いてはいけません**。`ssh-agent` に手元の鍵を預け、`-A` (agent forwarding) か `ProxyJump` で通します。

```bash
eval $(ssh-agent) && ssh-add ~/.ssh/id_ed25519
ssh -A prod-bastion            # 踏み台上で ssh prod-app すると手元の agent が署名する
```

`ProxyJump` の方が安全です (踏み台の root に agent を乗っ取られるリスクが無い)。

## クラウドでは SSH を減らす

- AWS: SSM Session Manager (22 番を閉じられる、操作が CloudTrail に残る)
- GCP: IAP TCP forwarding + OS Login (IAM で誰が入れるかを管理)
- コンテナ: そもそも SSH を入れない。`docker exec` / `kubectl exec` / Cloud Run はデバッグコンテナ

SSH が要るのは VM を直接運用しているときだけです。それでも「誰がいつ入ったか」を残す仕組み (SSM / IAP / 監査ログ) を選びます。

## 鍵の管理

- 退職・異動時に `authorized_keys` から消す。人ごとに鍵を分ける (共有鍵にしない)
- 秘密鍵をチャットやリポジトリに入れない。入れたら作り直す
- `known_hosts` の警告 (`REMOTE HOST IDENTIFICATION HAS CHANGED`) は、サーバー再作成ならよいが、それ以外は中間者攻撃を疑う
- サーバー側で `PermitRootLogin no`、`PasswordAuthentication no`、可能なら `AllowUsers`

## トラブルの定番

| 症状 | 原因 |
|---|---|
| `Permission denied (publickey)` | 公開鍵が登録されていない、ユーザー名違い、鍵のパーミッションが緩い |
| すぐ切れる | サーバーの `ClientAliveInterval` / 手元の `ServerAliveInterval 60` を設定 |
| `Too many authentication failures` | agent に鍵が多すぎる。`IdentitiesOnly yes` |
| ポートフォワードが繋がらない | リモート側で `localhost` が指すものが違う、SG / FW で塞がれている |

`ssh -v` で詳細ログ。

## まとめ

- ed25519 + パスフレーズ。秘密鍵はコピーしない、`600`
- `~/.ssh/config` に接続先を書き、`ProxyJump` と `LocalForward`
- 踏み台に鍵を置かない。クラウドでは SSM / IAP を優先
- 人ごとに鍵、退職時に消す、`-v` で調べる

## やってみる

**ゴール:** 鍵を作り、config を書き、ポートフォワードで手元からリモートのサービスを見る。

1. `ssh-keygen -t ed25519` でパスフレーズ付きの鍵を作り、`ls -l ~/.ssh` でパーミッションを確認
2. 公開鍵を GitHub に登録し `ssh -T git@github.com` で認証が通ることを確認
3. 手元の Linux / WSL に `sshd` があれば (無ければ Docker で `linuxserver/openssh-server`)、`ssh-copy-id` で自分に登録して `ssh localhost` (または `-p 2222`) が鍵で入れることを確認
4. `~/.ssh/config` にその接続先を `Host mybox` として書き、`ssh mybox` で入る
5. リモート側で `python3 -m http.server 8000` を動かし、`ssh -L 8000:localhost:8000 mybox` で手元のブラウザから見る
6. `ssh -v mybox 2>&1 | grep -i "offering\|accepted"` で使われた鍵を確認

**確認:** パスワード無しで鍵で入れた。ポートフォワードでリモートのサービスが手元で開いた。
