---
id: de-08
title: イベントと監査ログ (誰が・いつ・何を)
summary: 状態を上書きせずイベントを積む、監査ログの設計、集約をまたぐ整合性をイベントで結ぶ、後から再計算できる強さ
minutes: 12
---
## 上書きすると失われるもの

`lesson_progress.best_rate = 0.9` と上書きすると、「いつ 0.6 から 0.9 になったか」「何回挑戦したか」は消えます。「先月の正答率の推移を出したい」と言われても、もうデータがありません。

**事実 (イベント) を積み、状態はそこから導く** と、後からどんな集計でも作れます。

```
attempts (イベント):   user 42, q1, correct, 2026-09-03 08:01
                       user 42, q1, wrong,   2026-09-04 08:05
review_schedule (状態): user 42, q1, streak 0, due 2026-09-05   ← attempts から再計算できる
```

## イベントの形

| 列 | 意味 |
|---|---|
| id | 一意 |
| occurred_at | 起きた時刻 (UTC) |
| actor | 誰が (user_id、system、job 名) |
| kind | 何が (`attempt.recorded`、`invoice.issued`) |
| subject | 何に (question_id、invoice_id) |
| payload | 詳細 (JSON) |
| request_id | どのリクエストで (ログと繋ぐ) |

- **不変**。UPDATE も DELETE もしない。訂正は「訂正イベント」を積む
- `kind` は `名詞.過去形の動詞` で統一
- 個人情報や秘密を payload に入れない

## 監査ログ

「誰がいつ何をしたか」を答えるための記録です。イベントテーブルの一種ですが、目的が **説明責任** なので要件が違います。

- **対象**: 権限の変更、データの閲覧 (個人情報)、削除、設定変更、ログイン。読み取りも対象になり得る
- **改ざん耐性**: アプリの DB ユーザーに UPDATE / DELETE 権限を与えない (INSERT のみ)。別ストレージ (S3 の Object Lock、Cloud Logging) に流す
- **保持期間**: 法令や契約で決まる。ログより長い
- **取り方**: ミドルウェアで自動 (誰が・どの API を・結果) + 重要な操作はコード内で明示

```python
def issue_invoice(repo, audit: AuditLog, actor: User, invoice_id: int, now: datetime):
    inv = repo.get(invoice_id)
    inv.issue()
    repo.save(inv)
    audit.record(actor=actor.id, kind="invoice.issued", subject=invoice_id, at=now)
```

「ログ (障害調査、短期、大量)」と「監査ログ (説明責任、長期、選別)」は混ぜず、監査は別テーブル / 別ストレージにします。

## 集約をまたぐ整合性

「回答を記録したら、レッスンの合格判定も更新し、通知も送る」を 1 トランザクションに全部入れると、通知の失敗で回答まで消えます。

```
1. attempts に INSERT + attempt.recorded イベントを INSERT   ← 1 トランザクション
2. (後で) イベントを読んで 合格判定を更新、通知を送る          ← 別トランザクション、失敗したら再試行
```

**Outbox パターン**: イベントを同じ DB の outbox テーブルに同じトランザクションで書き、別プロセス (Job) が読んで処理し、処理済みにする。「書いたのに通知されない」「通知したのに書けていない」が起きません。

処理側は **冪等** に作ります (同じイベントを 2 回処理しても結果が同じ)。

## 再計算できる強さ

状態が壊れても、イベントから作り直せます。

- `review_schedule` を全部消して attempts から再構築する Job を持っておく
- 間隔反復の区間を変えたら、再構築で全員に反映できる
- 「先月時点の状態」も、その時刻までのイベントで再現できる

これがイベントソーシングの考え方です。全部をイベントで持つ必要はなく、「壊れて困る状態は、イベントから再計算できるようにしておく」だけで十分な効果があります。

## 落とし穴

- イベントテーブルは大きくなる。時刻でパーティション、古いものはアーカイブ
- 「状態を読む」クエリを毎回イベントから集計すると遅い。状態テーブルは持つ (キャッシュと割り切る)
- スキーマ変更: payload の形が変わる。`version` を持ち、古い形も読めるようにする

## まとめ

- 事実は積む、状態は導く。上書きで歴史を消さない
- イベントは不変。actor / kind / subject / at / request_id
- 監査ログは説明責任のため。INSERT のみ、別ストレージ、長期保持
- 集約をまたぐ処理は Outbox + 冪等な処理側。状態は再計算できるように

## やってみる

**ゴール:** 状態を上書きする実装を、イベント + 再計算に変える。

1. SQLite (`python3` の `sqlite3`) で `attempts(id, user_id, question_id, correct, at)` と `review(user_id, question_id, streak, due, primary key(user_id, question_id))` を作る
2. `record(user_id, qid, correct)` を「attempts に INSERT し、review を UPSERT」で書く。5 回呼ぶ
3. `rebuild_review()` を「review を全消しし、attempts を時系列に読み直して同じ結果を作る」で書く。実行前後で `select * from review` が一致することを確認
4. 区間ルールを変え (例: 正解時 +2 日)、`rebuild_review()` で全員分に反映されるのを見る
5. `audit(actor, kind, subject)` テーブルを足し、`record` の中で `attempt.recorded` を積む。app ロールに UPDATE/DELETE を与えない設計をコメントに書く

**確認:** 状態を消しても事実から復元できた。ルール変更が再計算 1 回で反映された。
