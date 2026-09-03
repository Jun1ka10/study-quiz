---
id: dk-01
title: イメージとコンテナ
summary: Docker が解く問題、イメージとコンテナの関係、日常で使うコマンド
minutes: 10
---
## Docker が解く問題

「自分の環境では動くのに、サーバーでは動かない」。OS のバージョン、ライブラリ、環境変数、すべてを **イメージ** に閉じ込めて、どこでも同じように動かすのが Docker です。

FastAPI + Next.js 構成のアプリでは、backend も frontend も Docker イメージにして Cloud Run で動かします。

## イメージとコンテナ

| | 説明 | 例え |
|---|---|---|
| イメージ | 読み取り専用のテンプレート。OS のファイル + アプリ + 設定 | クラスの定義 / 型 |
| コンテナ | イメージから起動した実行インスタンス。書き込み可能な層が上に乗る | インスタンス |

1 つのイメージから何個でもコンテナを起動できます。コンテナの中で書き込んだファイルはコンテナを消すと一緒に消えます。

## イメージはレイヤーの積み重ね

```
python:3.13-slim        ← ベースイメージ (Debian + Python)
  + apt-get install ... ← レイヤー
  + pip install ...     ← レイヤー
  + COPY . /app         ← レイヤー
```

各行が 1 レイヤーで、変わっていないレイヤーはキャッシュされます。だから **変わりにくいものを先に、よく変わるもの (ソースコード) を後に** 書くとビルドが速くなります。

## 日常で使うコマンド

```bash
docker build -t myapp:v1 .          # カレントの Dockerfile からイメージを作る
docker images                       # 手元のイメージ一覧
docker run -p 8000:8080 myapp:v1    # 起動。ホスト 8000 → コンテナ 8080
docker run -d --name web myapp:v1   # バックグラウンド (-d) で名前付き
docker ps                           # 動いているコンテナ
docker logs -f web                  # ログを追う
docker exec -it web bash            # 中に入る
docker stop web && docker rm web    # 止めて消す
docker system prune                 # 使っていないものを掃除
```

`-p` は `ホスト:コンテナ` の順です。`-e KEY=value` で環境変数を渡せます。

## ボリューム

コンテナの外に残したいデータ (DB のファイル、開発中のソース) は **ボリューム** か **バインドマウント** を使います。

```bash
docker run -v $(pwd):/app myapp     # ホストのカレントをコンテナの /app に (開発用)
docker run -v pgdata:/var/lib/postgresql/data postgres:16   # 名前付きボリューム
```

## レジストリ

イメージは **レジストリ** に push / pull して共有します。Docker Hub が公開レジストリで、`python:3.13-slim` などはここから落ちてきます。本番用は GCP の Artifact Registry や AWS の ECR に push します。

## まとめ

- イメージ = テンプレート、コンテナ = 実行インスタンス。コンテナは使い捨て
- レイヤーはキャッシュされる。変わりにくいものを先に書く
- 残したいデータはボリュームへ
- `build` → `run -p` → `logs` → `exec` が基本の 4 つ

## やってみる

**ゴール:** コンテナの使い捨てとポート・ボリュームを体感する。

1. `docker run -d --name web -p 8080:80 nginx:alpine` → `curl localhost:8080`
2. `docker exec -it web sh` で `echo hi > /usr/share/nginx/html/index.html` → `curl localhost:8080` で hi
3. `docker rm -f web` して同じ `run` をやり直し、`curl` が元の HTML に戻るのを見る
4. `docker run -d --name web2 -p 8081:80 -v $(pwd):/usr/share/nginx/html nginx:alpine`、カレントに `index.html` を作って `curl localhost:8081`
5. `docker logs web2` と `docker ps` を見て、`docker rm -f web2`

**確認:** コンテナ内の変更は消える。マウントした方は残る。
