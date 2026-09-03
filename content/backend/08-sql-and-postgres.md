---
id: be-08
title: SQL と PostgreSQL の基礎
summary: SELECT / JOIN / GROUP BY を psql で手を動かして覚える。ORM の裏で何が走っているかを読めるようになる
minutes: 14
---
## なぜ SQL を直接学ぶか

ORM は SQL を隠しますが、遅いクエリの原因、集計、マイグレーションの中身、RLS のポリシーはすべて SQL です。**ORM が出す SQL を読める** ことが目標です。

## psql の基本

```bash
psql -U postgres -d study         # 接続
\dt                               # テーブル一覧
\d attempts                       # テーブルの定義 (列・インデックス・制約)
\x                                # 縦表示の切替 (列が多いとき)
\timing                           # 実行時間を表示
\q
```

## テーブルと制約

```sql
create table users (
  id         serial primary key,
  email      text unique not null,
  created_at timestamptz not null default now()
);

create table attempts (
  id          serial primary key,
  user_id     int not null references users(id) on delete cascade,
  question_id text not null,
  correct     boolean not null,
  answered_at timestamptz not null default now()
);
```

| 制約 | 意味 |
|---|---|
| `primary key` | 一意で NULL でない。行の識別子 |
| `unique` | 重複禁止 |
| `not null` | 必須 |
| `references` | 外部キー。参照先が存在することを保証 |
| `default` | 省略時の値 |
| `check (amount >= 0)` | 任意の条件 |

制約は「アプリのバグでも壊れたデータを入れさせない」ための最後の砦です。ORM のバリデーションとは別に DB 側でも持ちます。

## SELECT の骨格

```sql
select   u.email, count(*) as total
from     attempts a
join     users u on u.id = a.user_id
where    a.answered_at >= now() - interval '7 days'
group by u.email
having   count(*) >= 5
order by total desc
limit    10;
```

実行される順番は **FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT**。WHERE は集計前、HAVING は集計後に効きます。

## JOIN

```sql
select ... from users u join attempts a on a.user_id = u.id       -- 両方にある行だけ
select ... from users u left join attempts a on a.user_id = u.id  -- users は全部残す (無ければ NULL)
select ... from users u left join attempts a on a.user_id = u.id where a.id is null   -- 回答の無いユーザー
```

## 集計

```sql
select
  u.email,
  count(*)                                   as total,
  count(*) filter (where a.correct)          as correct,
  round(100.0 * count(*) filter (where a.correct) / count(*), 1) as rate,
  max(a.answered_at)                         as last_at
from attempts a join users u on u.id = a.user_id
group by u.email;
```

`count` / `sum` / `avg` / `max` / `min`。`filter (where ...)` で条件付き集計。整数同士の割り算は切り捨てになるので `100.0 *` で小数にします。

## 書き込み

```sql
insert into users(email) values ('a@example.com') returning id;      -- 生成された id を返す
update attempts set correct = true where id = 10;
delete from attempts where answered_at < now() - interval '1 year';
```

`update` / `delete` は **WHERE を書き忘れると全行** に効きます。実行前に同じ WHERE で `select count(*)` して件数を見る癖を付けます。

## 型で覚えておくもの

| 型 | 用途 |
|---|---|
| `text` | 文字列 (長さ制限が要らなければ varchar より text) |
| `int` / `bigint` | 整数。ID は bigint が無難 |
| `numeric(12,2)` | 金額。float は使わない |
| `boolean` | 真偽 |
| `timestamptz` | タイムゾーン付き日時。`timestamp` (tz 無し) は避ける |
| `jsonb` | JSON。インデックスも張れる |
| `uuid` | UUID 主キー |

## まとめ

- psql の `\d` で定義を見る
- 制約 (unique / not null / references) は DB 側の砦
- 実行順は FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY
- 集計は `count(*) filter (where ...)`。整数割り算に注意
- update / delete は WHERE を先に select で確かめる

## やってみる

**ゴール:** psql で JOIN と集計を自分で書く。

1. `docker run -d --name pg -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:16` → `docker exec -it pg psql -U postgres`
2. 次を実行する
   ```sql
   create table users(id serial primary key, email text unique not null);
   create table attempts(id serial primary key, user_id int references users(id), question_id text, correct bool, at timestamptz default now());
   insert into users(email) values ('a@x'),('b@x');
   insert into attempts(user_id, question_id, correct) values (1,'q1',true),(1,'q2',false),(1,'q2',true),(2,'q1',false);
   select u.email, count(*) filter (where a.correct) as ok, count(*) as total
     from users u join attempts a on a.user_id = u.id group by u.email;
   select question_id, count(*) from attempts group by 1 having count(*) > 1;
   select * from users u left join attempts a on a.user_id = u.id where a.id is null;
   ```
3. `\d attempts` と `\dt` を打つ。`explain select * from attempts where user_id = 1;` を読む

**確認:** ユーザー別の正答数が出た。LEFT JOIN で「回答が無いユーザー」を出せた。
