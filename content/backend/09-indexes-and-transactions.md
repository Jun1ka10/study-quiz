---
id: be-09
title: "インデックスとトランザクション"
summary: "EXPLAIN で遅い理由を見る、インデックスの効く条件、トランザクションの原子性と UPSERT、ロックの基本"
minutes: 14
exercise: |
  **ゴール:** インデックスの有無で実行計画が変わるのを見て、UPSERT を書く。

  1. be-08 のコンテナで:
     ```sql
     insert into attempts(user_id, question_id, correct)
       select (random()*1+1)::int, 'q' || (random()*100)::int, random() < 0.7 from generate_series(1, 200000);
     explain analyze select count(*) from attempts where question_id = 'q7';
     create index on attempts(question_id);
     explain analyze select count(*) from attempts where question_id = 'q7';
     ```
  2. UPSERT:
     ```sql
     create table review(user_id int, question_id text, streak int, due_at timestamptz, primary key(user_id, question_id));
     insert into review values (1,'q1',1,now()) on conflict (user_id, question_id) do update set streak = review.streak + 1, due_at = now() + interval '3 days';
     ```
     を 3 回実行して `select * from review;`
  3. 2 つの psql を開き、片方で `begin; update review set streak = 99 where user_id = 1;` (commit しない)、もう片方で同じ update を打って待たされるのを見る。最初の方で `rollback;`

  **確認:** Seq Scan が Index Scan に変わり時間が桁で減った。UPSERT で 1 行のまま streak が増えた。ロック待ちを体験した。
questions:
  - id: be-l09-1
    difficulty: 1
    question: "`EXPLAIN ANALYZE` で `Seq Scan` が出た。意味は?"
    choices:
      - "インデックスを使っている"
      - "テーブル全体を先頭から読んでいる (全件走査)。件数が多いと遅い"
      - "エラー"
      - "キャッシュから読んだ"
    answer: 1
    explanation: "WHERE の列にインデックスが無いか、使えない書き方 (関数を掛けている、型が違う) をしている。小さい表なら Seq Scan が正解なこともある。"
  - id: be-l09-2
    difficulty: 2
    question: "インデックスを張っても効かないのは?"
    choices:
      - "where email = 'a@x'"
      - "where lower(email) = 'a@x' (列に関数を掛けている)"
      - "where user_id = 1"
      - "where created_at > now() - interval '1 day'"
    answer: 1
    explanation: "列に関数を掛けると素のインデックスは使えない。関数インデックス `create index on users(lower(email))` を作るか、保存時に正規化する。"
  - id: be-l09-3
    difficulty: 2
    question: "トランザクションの中で 2 つの UPDATE をした後に例外が起きた。適切な処理は?"
    choices:
      - "そのまま放置"
      - "ROLLBACK して両方なかったことにする (全部成功か全部なし)"
      - "1 つ目だけ COMMIT"
      - "再起動"
    answer: 1
    explanation: "原子性。片方だけ反映されると不整合になる。アプリでは `try: ... commit() except: rollback()`。"
  - id: be-l09-4
    difficulty: 2
    question: "`INSERT ... ON CONFLICT (key) DO UPDATE` を使う場面は?"
    choices:
      - "常に INSERT の代わりに使う"
      - "「無ければ作る、あれば更新する」を 1 文で原子的に行いたいとき (UPSERT)"
      - "削除"
      - "JOIN の代わり"
    answer: 1
    explanation: "SELECT してから INSERT/UPDATE を分けると、同時実行で重複や競合が起きる。UPSERT なら DB が排他してくれる。"
---
## インデックスとは

本の索引と同じで、「この列がこの値の行はどこか」を高速に引ける構造です (B-tree)。無ければ全行を読みます (Seq Scan)。

```sql
create index on attempts(user_id);
create index on attempts(user_id, answered_at);       -- 複合 (左の列から順に効く)
create unique index on users(lower(email));           -- 関数インデックス + 一意
create index concurrently on big_table(col);          -- 本番でロックせず作る
```

**張るべき列**: 外部キー (`user_id`)、WHERE でよく使う列、ORDER BY する列、UNIQUE にしたい列。
**張りすぎの害**: 書き込みが遅くなる、ディスクを食う。読みと書きのバランス。

## EXPLAIN で読む

```sql
explain analyze select * from attempts where user_id = 42 order by answered_at desc limit 20;
```

- `Seq Scan`: 全件走査。大きい表で出たら要注意
- `Index Scan` / `Index Only Scan`: インデックスを使っている
- `rows=` の見積もりと `actual rows=` が大きくずれていたら統計が古い (`analyze table`)
- `Sort` が出て遅いなら、ORDER BY の列を含む複合インデックス

インデックスが効かない書き方:

| 書き方 | 理由 | 直し方 |
|---|---|---|
| `where lower(email) = ...` | 列に関数 | 関数インデックス |
| `where id = '42'` (id は int) | 型が違う | 型を合わせる |
| `where name like '%abc'` | 前方一致でない | 全文検索 (pg_trgm) |
| `where user_id = 1 or question_id = 'q'` | OR | 2 本のインデックス + BitmapOr、またはクエリを分ける |

## トランザクション

「全部成功か、全部なし」を保証する単位です。

```sql
begin;
insert into attempts(...) values (...);
insert into review(...) values (...) on conflict ... do update ...;
commit;          -- ここで確定。途中で失敗したら rollback
```

アプリ側では Session が 1 トランザクションです。`commit()` までは他の接続から見えず、例外時は `rollback()`。**リクエスト 1 つ = トランザクション 1 つ** を基本にします。

## UPSERT

「無ければ INSERT、あれば UPDATE」を 1 文で。

```sql
insert into review (user_id, question_id, streak, due_at)
values (1, 'q1', 1, now() + interval '1 day')
on conflict (user_id, question_id)
do update set streak = review.streak + 1, due_at = excluded.due_at;
```

- `excluded` は「入れようとした行」
- SELECT → 分岐 → INSERT/UPDATE を分けると、同時に 2 リクエストが来たときに重複や片方が失敗する。UPSERT は DB が排他するので安全
- SQLAlchemy: `from sqlalchemy.dialects.postgresql import insert` の `on_conflict_do_update`

## ロック

同じ行を 2 つのトランザクションが更新しようとすると、後の方は先の方の commit / rollback まで **待ちます**。

- 待ちが長い = 「トランザクションを開いたまま外部 API を呼んでいる」ことが多い。トランザクションは短く
- 2 つが互いに待つとデッドロック。PostgreSQL が検出して片方をエラーにする。更新順序を揃えると防げる
- 「読んで計算して書く」は競合する。`update t set count = count + 1` のように DB 側で計算するか、`select ... for update` で行ロックを取る

## 分離レベル

既定の READ COMMITTED で大半は十分です。「同じトランザクション内で 2 回読んだ値が違う」と困る処理 (残高計算など) は REPEATABLE READ か、`for update` で行をロックします。

## N+1 の見つけ方

アプリのログで「同じ形の SQL が N 回」出ていたら N+1。ORM の `select_related` / `selectinload` で 1〜2 回にまとめます (Django / SQLAlchemy のレッスン参照)。

## まとめ

- 外部キーと WHERE の列にインデックス。EXPLAIN で Seq Scan を潰す
- 列に関数・型違い・前方以外の LIKE はインデックスが効かない
- トランザクションは短く、リクエスト 1 つに 1 つ
- 「無ければ作る」は UPSERT。読んで書くは `for update` か DB 側で計算
