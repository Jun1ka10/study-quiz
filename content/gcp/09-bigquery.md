---
id: gcp-09
title: BigQuery
summary: 分析用 DWH の考え方、スキャン量課金とパーティション、Cloud SQL からのデータ連携、ダッシュボードにつなぐ
minutes: 12
---
## 何に使うか

BigQuery は **分析専用** のデータウェアハウスです。数億行の集計を数秒で返しますが、1 行を更新するような処理には向きません。

| | Cloud SQL (PostgreSQL) | BigQuery |
|---|---|---|
| 用途 | アプリの読み書き (OLTP) | 集計・分析 (OLAP) |
| 得意 | 1 行の取得・更新、トランザクション | 大量行のスキャンと集計 |
| 苦手 | 全件集計を頻繁に | 1 行ずつの更新、低レイテンシの点参照 |
| 課金 | インスタンス時間 | スキャンしたデータ量 (+ 保存量) |

「学習の傾向を分析したい」「月次レポート」「ダッシュボード」は BigQuery、「今日の復習を返す API」は Cloud SQL。

## 課金の仕組みと守り方

オンデマンド料金は **クエリがスキャンしたバイト数** で決まります (保存量は別途、安い)。

- `SELECT *` を避け、必要な列だけ (列指向なので列を絞ると読む量が減る)
- **パーティション** (日付列で分割) を切り、`WHERE date >= ...` で範囲を絞る。パーティション外は読まれない
- **クラスタリング** (よく絞る列でソート保存) でさらに減る
- クエリ実行前にエディタに出る「このクエリは N MB を処理します」を見る癖
- プロジェクト / ユーザーごとに **1 日のスキャン上限** (カスタム割り当て) を設定しておくと事故が防げる

```sql
CREATE TABLE analytics.attempts
PARTITION BY DATE(answered_at)
CLUSTER BY user_id
AS SELECT ...;

SELECT user_id, COUNTIF(correct) / COUNT(*) AS rate
FROM analytics.attempts
WHERE DATE(answered_at) BETWEEN '2026-09-01' AND '2026-09-30'    -- パーティションを絞る
GROUP BY user_id;
```

## データを入れる

| 方法 | 向き |
|---|---|
| Cloud SQL 連携クエリ (`EXTERNAL_QUERY`) | 小規模。BigQuery から Cloud SQL を直接読む |
| Datastream (CDC) | Cloud SQL の変更をほぼリアルタイムで複製 |
| 日次バッチ (Cloud Run Job で抽出 → GCS → ロード) | 単純で制御しやすい。最初はこれ |
| ストリーミング挿入 / Pub/Sub → BigQuery | イベントを即時に |
| Cloud Logging のシンク | ログをそのまま |

最初は「毎朝、前日分の attempts を CSV / Parquet で GCS に出し、`bq load`」で十分です。

```bash
bq load --source_format=PARQUET --time_partitioning_field=answered_at analytics.attempts gs://bucket/attempts/2026-09-02.parquet
```

## SQL の方言

標準 SQL とほぼ同じですが、分析向けの機能が多い。

```sql
SELECT
  DATE(answered_at, "Asia/Tokyo") AS day,                     -- タイムゾーン付きの日付
  COUNTIF(correct) AS correct, COUNT(*) AS total,
  APPROX_QUANTILES(latency_ms, 100)[OFFSET(95)] AS p95,      -- 近似パーセンタイル
  ARRAY_AGG(DISTINCT category LIMIT 5) AS categories
FROM analytics.attempts
GROUP BY day ORDER BY day;

-- ウィンドウ関数
SELECT user_id, answered_at,
  SUM(CASE WHEN correct THEN 1 ELSE 0 END) OVER (PARTITION BY user_id ORDER BY answered_at) AS running_correct
FROM analytics.attempts;
```

`STRUCT` / `ARRAY` のネストした列、`UNNEST` が特徴的です。

## ダッシュボード

Looker Studio (無料) を BigQuery につなぐと、SQL の結果をグラフにして共有できます。スキャン量を抑えるため、**集計済みのテーブル** (日次で作る) を見せる。生テーブルにダッシュボードを直結すると、開くたびに全件スキャンして課金されます。

## アクセス制御

- データセット単位で IAM (`bigquery.dataViewer`)。分析者には閲覧のみ
- 個人情報の列は **列レベルのポリシータグ** で隠すか、そもそも入れない (ユーザー ID をハッシュ化)
- クエリ履歴は監査ログに残る

## まとめ

- 分析は BigQuery、アプリは Cloud SQL。役割を混ぜない
- 課金はスキャン量。列を絞る、パーティション、上限設定
- 入れ方は日次バッチから。ダッシュボードは集計済みテーブルに
- 個人情報は入れないかタグで隠す

## やってみる

**ゴール:** パーティションの有無でスキャン量が変わるのを見る (無料枠内)。

1. `bq mk analytics` でデータセットを作る
2. 公開データセットで練習: `SELECT COUNT(*) FROM \`bigquery-public-data.samples.wikipedia\`` を **実行前に** エディタ右上のスキャン見積もり (GB) を見る。`SELECT *` に変えると見積もりがどう変わるか
3. 自分のテーブル: Python で 10 万行の疑似 attempts (user_id, question_id, correct, answered_at を 30 日に散らす) を Parquet か CSV で作り GCS に置いて `bq load --time_partitioning_field=answered_at`
4. `WHERE DATE(answered_at) = '2026-09-02'` のクエリと WHERE 無しのクエリで、実行後の「処理されたバイト数」を比べる
5. 「ユーザー別・日別の正答率」を COUNTIF で出し、Looker Studio で折れ線にする
6. `bq rm -r -f analytics`

**確認:** パーティションを絞ると処理バイト数が 1/30 程度になった。集計のクエリを書けた。
