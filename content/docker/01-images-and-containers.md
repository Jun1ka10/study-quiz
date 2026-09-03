---
id: dk-01
title: イメージとコンテナ
summary: Docker が解く問題、イメージとコンテナの関係、日常で使うコマンド
minutes: 10
questions:
  - id: dk-l01-1
    difficulty: 1
    question: "Docker イメージとコンテナの関係として正しいのは?"
    choices:
      - "イメージは実行中のプロセス、コンテナはその設計図"
      - "イメージは読み取り専用のテンプレート、コンテナはそこから起動した実行インスタンス"
      - "同じもの"
      - "コンテナを保存したものがイメージで、1 対 1"
    answer: 1
    explanation: "1 つのイメージから何個でもコンテナを起動できる。コンテナは上に書き込み可能なレイヤーを持つ。"
  - id: dk-l01-2
    difficulty: 1
    question: "コンテナの中でファイルを書き換えた。`docker rm` で消したあと、そのファイルは?"
    choices: ["イメージに残る", "消える", "ホストに残る", "次のコンテナに引き継がれる"]
    answer: 1
    explanation: "コンテナの書き込みレイヤーはコンテナと一緒に消える。残したいものはボリュームか外部ストレージに置く。"
  - id: dk-l01-3
    difficulty: 1
    question: "ホストの 8000 番をコンテナの 8080 番につなぐオプションは?"
    choices: ["-p 8080:8000", "-p 8000:8080", "--port 8000", "-e PORT=8000"]
    answer: 1
    explanation: "`-p ホスト:コンテナ`。左がホスト側。"
  - id: dk-l01-4
    difficulty: 2
    question: "動いているコンテナの中に入ってシェルを使いたい。"
    choices: ["docker run -it app bash", "docker exec -it <container> bash", "docker attach app", "docker shell app"]
    answer: 1
    explanation: "exec は実行中のコンテナで追加のプロセスを起動する。run は新しいコンテナを作ってしまう。"
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
