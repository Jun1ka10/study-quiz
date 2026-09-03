---
id: sec-02
title: PostgreSQL の Row Level Security
summary: アプリの WHERE 句に頼らず、DB 側で「見える行」を強制する。マルチテナントの最後の砦
minutes: 14
questions:
  - id: sec-l02-1
    difficulty: 1
    question: "Row Level Security (RLS) が解く問題は?"
    choices:
      - "テーブルごとのアクセス権"
      - "同じテーブルの中で「この接続 (ユーザー / テナント) はどの行を読み書きできるか」を DB 側で強制する"
      - "通信の暗号化"
      - "バックアップ"
    answer: 1
    explanation: "アプリが WHERE org_id = ? を書き忘れても、DB が他組織の行を返さない。"
  - id: sec-l02-2
    difficulty: 2
    question: "`ALTER TABLE orders ENABLE ROW LEVEL SECURITY;` だけ実行し、ポリシーを 1 つも作らなかった。一般ユーザーから orders はどう見える?"
    choices: ["全部見える", "1 行も見えない (既定は拒否)", "エラーになる", "所有者の行だけ見える"]
    answer: 1
    explanation: "RLS を有効にするとポリシーに一致しない行は無いものとして扱われる。ポリシーを足して初めて見える。"
  - id: sec-l02-3
    difficulty: 2
    question: "RLS ポリシーの中で「今の接続はどの組織か」を参照する典型的な方法は?"
    choices:
      - "アプリが毎回 WHERE を書く"
      - "接続 (トランザクション) 開始時に `SET LOCAL app.org_id = '...'` し、ポリシーで `current_setting('app.org_id')` を使う"
      - "テーブル名に組織 ID を含める"
      - "できない"
    answer: 1
    explanation: "セッション変数にテナントを入れ、ポリシーは `USING (org_id = current_setting('app.org_id')::int)` のように書く。SET LOCAL ならトランザクション終了で消える。"
  - id: sec-l02-4
    difficulty: 2
    question: "テーブルの所有者 (owner) やスーパーユーザーで接続すると RLS は?"
    choices:
      - "常に適用される"
      - "既定では適用されない (バイパスされる)。アプリは所有者でない専用ロールで接続する"
      - "エラーになる"
      - "読み取りだけ適用される"
    answer: 1
    explanation: "owner は FORCE ROW LEVEL SECURITY を付けない限り素通りする。マイグレーション用 (owner) と アプリ用 (制限付き) でロールを分けるのが定石。"
  - id: sec-l02-5
    difficulty: 3
    question: "`USING` と `WITH CHECK` の違いは?"
    choices:
      - "同じ"
      - "USING は既存行の可視性 (SELECT / UPDATE / DELETE の対象)、WITH CHECK は新しく書く行の条件 (INSERT / UPDATE 後の値)"
      - "WITH CHECK は SELECT 用"
      - "USING は INSERT 用"
    answer: 1
    explanation: "WITH CHECK が無いと、他組織の org_id を持つ行を INSERT できてしまう (自分では見えないが作れる)。両方書く。"
---
## なぜ RLS か

複数の組織 (テナント) が同じテーブルを共有するアプリでは、すべてのクエリに `WHERE org_id = ?` が必要です。1 か所でも書き忘れると他社のデータが見えます。コードレビューだけでこれを 100% 防ぐのは無理です。

**Row Level Security** は、この条件を DB 側の **ポリシー** として定義し、アプリが忘れても DB が他の行を返さないようにする仕組みです。アプリ側の WHERE は「性能と意図の明示」、RLS は「最後の砦」という役割分担になります。

## 基本の形

```sql
-- 1. テーブルで RLS を有効化 (この時点でポリシーが無いので誰にも見えない)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 2. ポリシー: 今の接続の org_id と一致する行だけ
CREATE POLICY org_isolation ON orders
  USING      (org_id = current_setting('app.org_id')::int)   -- 読める / 触れる行
  WITH CHECK (org_id = current_setting('app.org_id')::int);  -- 書ける行
```

| 句 | 効く操作 | 意味 |
|---|---|---|
| `USING` | SELECT / UPDATE / DELETE | 既存の行のうち、対象にしてよいもの |
| `WITH CHECK` | INSERT / UPDATE | 書き込んだ後の行が満たすべき条件 |

`WITH CHECK` を忘れると、自分には見えない他組織の行を **作れて** しまいます。両方書きます。

## 「今の接続は誰か」を渡す

ポリシーから参照できる値が要ります。定番は **セッション変数** です。

```python
# リクエストごと (トランザクションの先頭で)
db.execute(text("SET LOCAL app.org_id = :org_id"), {"org_id": scope.org_id})
# 以降、このトランザクション内のクエリはポリシーで絞られる
```

- `SET LOCAL` はトランザクション終了で消える。接続プールで使い回されても次のリクエストに漏れない
- `SET` (LOCAL 無し) はセッションに残るので、プールと組み合わせると **他人の設定が残る事故** になる
- 値を渡し忘れた場合に備え、ポリシー側で `current_setting('app.org_id', true)` (missing_ok) を使い、NULL なら不一致 = 何も見えない、に倒す

FastAPI なら `get_db` 依存の中で SET LOCAL を実行し、Django なら ミドルウェアかリクエスト開始時のフックで行います。

## ロールを分ける

RLS は **テーブル所有者とスーパーユーザーには効きません** (既定)。アプリが owner で接続していると RLS は飾りです。

```sql
CREATE ROLE app_user LOGIN PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- owner は migration 用に別に持つ (alembic / migrate はこちらで)
```

| 接続 | 誰が使う | RLS |
|---|---|---|
| owner (migration 用) | Alembic / manage.py migrate、seed | 効かない (BYPASSRLS 相当) |
| app_user (アプリ用) | リクエスト処理 | 効く |

owner にも強制したいなら `ALTER TABLE orders FORCE ROW LEVEL SECURITY;`。

## 複数のポリシー

ポリシーは操作別 (`FOR SELECT` など) にも、ロール別 (`TO app_user`) にも作れます。同じ操作に複数あれば **OR** で結合されます (PERMISSIVE)。「全部満たす」にしたければ `AS RESTRICTIVE`。

```sql
CREATE POLICY read_own ON orders FOR SELECT
  USING (org_id = current_setting('app.org_id')::int);

CREATE POLICY admin_all ON orders
  TO admin_role USING (true);
```

## 動作確認

```sql
SET ROLE app_user;
SET LOCAL app.org_id = '1';
SELECT count(*) FROM orders;     -- org 1 の件数だけ
SET LOCAL app.org_id = '2';
SELECT count(*) FROM orders;     -- org 2 の件数だけ
```

テストでは「org_id を渡さずに SELECT したら 0 件」「別 org の id で INSERT したら失敗」の 2 つを必ず書きます。

## 注意点

- ポリシーは WHERE 句として結合されるので、`org_id` に **インデックス** が無いと遅くなる
- `EXPLAIN` で RLS の条件が使われているか確認できる
- アプリ側の WHERE を消してはいけない。RLS は保険で、性能と意図の明示はアプリの仕事

## まとめ

- RLS = テーブル内の行の可視性を DB が強制する。書き忘れの保険
- `USING` (読める) と `WITH CHECK` (書ける) を両方
- テナントは `SET LOCAL` のセッション変数で渡す
- owner には効かない。migration 用とアプリ用でロールを分ける
