---
id: gcp-01
title: GCP の全体像とプロジェクト・IAM
summary: 組織 / フォルダ / プロジェクトの階層、IAM ロールの種類、サービスアカウントの使い方
minutes: 10
questions:
  - id: gcp-l01-1
    difficulty: 1
    question: "GCP でリソース (VM, バケットなど) が直接属する単位は?"
    choices: ["組織", "フォルダ", "プロジェクト", "リージョン"]
    answer: 2
    explanation: "すべてのリソースはプロジェクトに属し、課金・API 有効化・IAM もプロジェクト単位が基本。"
  - id: gcp-l01-2
    difficulty: 1
    question: "IAM ポリシーの継承として正しいのは?"
    choices:
      - "プロジェクトの権限が組織に継承される"
      - "組織 / フォルダで付けた権限は配下のプロジェクトに継承される"
      - "継承はされない"
      - "フォルダの権限だけ継承される"
    answer: 1
    explanation: "上位で付けた権限は下位に伝わる。逆は無い。上位で広い権限を付けると全プロジェクトに効くので注意。"
  - id: gcp-l01-3
    difficulty: 2
    question: "本番で避けるべき IAM ロールの種類は?"
    choices: ["事前定義ロール", "カスタムロール", "基本ロール (Owner / Editor / Viewer)", "どれも問題ない"]
    answer: 2
    explanation: "基本ロールは粗すぎて最小権限にならない。事前定義ロール (例: roles/storage.objectViewer) を探し、無ければカスタムロール。"
  - id: gcp-l01-4
    difficulty: 2
    question: "Cloud Run 上のアプリから Cloud Storage を読ませたい。推奨は?"
    choices:
      - "サービスアカウントの JSON 鍵をダウンロードしてコンテナに同梱"
      - "Cloud Run にサービスアカウントをアタッチし、そこにロールを付与する (鍵なし)"
      - "個人のユーザー認証情報を環境変数に置く"
      - "バケットを allUsers に公開する"
    answer: 1
    explanation: "GCP 上で動くものにはサービスアカウントをアタッチすれば鍵なしで認証できる。JSON 鍵は漏洩リスクが高く、GCP 外から使う場合の最後の手段。"
---
## リソース階層

```
組織 (example.com)
└── フォルダ (dev / prod など)
    └── プロジェクト
        └── リソース (VM, バケット, Cloud Run ...)
```

- **プロジェクト** が基本単位。課金アカウント、API の有効化、IAM がここに紐づく
- **フォルダ / 組織** は複数プロジェクトをまとめる。IAM ポリシーは上から下へ継承される

AWS の「アカウント」に近いのが GCP の「プロジェクト」です。環境 (dev / stg / prod) ごとにプロジェクトを分けるのが一般的です。

## IAM の考え方

「**誰が (principal)** どの **リソース** に対して **何のロール** を持つか」の組み合わせです。

| 要素 | 例 |
|---|---|
| principal | ユーザー、グループ、サービスアカウント |
| ロール | `roles/storage.objectViewer` |
| リソース | プロジェクト、バケット、個々の Cloud Run サービス |

ロールは 3 種類あります。

1. **基本ロール**: Owner / Editor / Viewer。粗すぎるので本番では避ける
2. **事前定義ロール**: サービスごとに Google が用意。まずここから探す
3. **カスタムロール**: 権限 (permission) を自分で組む

## サービスアカウント

アプリケーションや VM が API を呼ぶための、人間ではないアイデンティティです。

- Compute Engine / Cloud Run / Cloud Functions に **アタッチ** すると、その上で動くコードは鍵なしで認証される (Application Default Credentials)
- JSON 鍵ファイルは GCP 外から使うときの最後の手段。作ったら漏洩とローテーションの責任がついてくる

AWS の IAM ロールに相当します。

## gcloud の最初の設定

```bash
gcloud auth login
gcloud config set project my-project-id
gcloud services enable run.googleapis.com   # API は使う前に有効化が要る
```

「API を有効化する」という手順が AWS には無い GCP 特有の一歩です。

## まとめ

- リソースはプロジェクトに属する。環境ごとにプロジェクトを分ける
- IAM は上から下へ継承。基本ロールは避けて事前定義ロールを使う
- GCP 上のワークロードにはサービスアカウントをアタッチ。鍵は作らない
- API は使う前に有効化
